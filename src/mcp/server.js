const fs = require('fs')
const os = require('os')
const path = require('path')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')
const utils = require('../backend/utils')
const dependencies = require('../backend/dependencies')
const download = require('../backend/download')

// Same output folder the Electron app uses (app.getPath('home') === os.homedir()), and the
// same yt-dlp/ffmpeg install (see utils.getUserDataDir) — the GUI and this server share both.
const outputDir = path.join(os.homedir(), 'youtube-downloader')
utils.createFolderIfNotExists(outputDir)

// yt-dlp's own progress/status lines can run to thousands of lines on a large playlist —
// cap what gets sent back so one tool call can't blow up the calling model's context.
const MAX_LOG_CHARS = 20000

// Pulls the final media file path(s) out of yt-dlp's log instead of re-deriving yt-dlp's own
// output-template logic here — yt-dlp already prints exactly which file it produced, and this
// saves the caller from having to grep the log or list outputDir to find what to pass to a
// downstream tool (e.g. mcp-whisper's transcribe). Checked in most-final-stage-first order:
// audio extraction and merging both post-process an initial `[download] Destination:` file,
// so when either ran, the pre-processed path they consumed is not the one to return.
const extractMediaPaths = (log) => {
  const matchAll = (pattern) => Array.from(log.matchAll(pattern), (match) => match[1].trim())
  const extracted = matchAll(/\[ExtractAudio\] Destination: (.+)$/gm)
  if (extracted.length) return extracted
  const merged = matchAll(/\[Merger\] Merging formats into "(.+)"$/gm)
  if (merged.length) return merged
  return matchAll(/\[download\] Destination: (.+)$/gm)
}

const server = new McpServer({ name: 'youtube-downloader', version: '1.0.0' })

server.registerTool(
  'check_dependencies',
  {
    title: 'Check yt-dlp/ffmpeg status',
    description: 'Reports whether yt-dlp and ffmpeg are installed and where. download_media refuses to run until both are — this tool does not install them (use the app\'s Dependencies panel for that).'
  },
  async () => {
    const flags = dependencies.getInstalledFlags()
    return { content: [{ type: 'text', text: JSON.stringify(flags, null, 2) }] }
  }
)

server.registerTool(
  'download_media',
  {
    title: 'Download a YouTube video/playlist',
    description: 'Downloads video or extracts MP3 audio from a YouTube URL via yt-dlp, saving into ~/youtube-downloader. Requires yt-dlp and ffmpeg to already be installed (see check_dependencies). Blocks until the download finishes and returns JSON with mediaPaths (the downloaded file(s), ready to pass to another tool), captions (path + the transcript text itself, when includeCaptions was set), commentPaths, and the yt-dlp log. If YouTube demands bot verification, automatically retries once with Firefox cookies before giving up.',
    inputSchema: {
      url: z.string().describe('YouTube video or playlist URL'),
      media: z.enum(['none', 'video', 'audio']).default('none').describe('"video" downloads the video, "audio" extracts MP3, "none" skips the media file (useful with includeCaptions/includeComments only)'),
      includeCaptions: z.boolean().default(false).describe('Also save an English transcript as markdown'),
      includeComments: z.boolean().default(false).describe('Also save top comments as JSON'),
      minLikes: z.number().int().min(0).default(0).describe('Minimum like count for a comment to be kept (only applies when includeComments is true)'),
      minTextLength: z.number().int().min(0).default(0).describe('Minimum character length for a comment to be kept (only applies when includeComments is true)'),
      cookiesFromBrowser: z.enum(['none', 'firefox', 'chrome', 'safari', 'edge', 'brave']).default('none').describe('Reuse cookies from a locally logged-in browser, to work around YouTube\'s "Sign in to confirm you\'re not a bot" check')
    }
  },
  async (config) => {
    const logs = []
    const { captionPaths, commentPaths } = await new Promise((resolve) => {
      download.run(config, outputDir, {
        onLog: (log) => logs.push(log.message),
        onExit: resolve
      })
    })

    const fullLog = logs.join('')
    const mediaPaths = extractMediaPaths(fullLog)

    let log = fullLog
    if (log.length > MAX_LOG_CHARS) {
      log = '...[truncated]...\n' + log.slice(-MAX_LOG_CHARS)
    }

    // Captions are already a small, clean transcript (see captions.js) — inline the text
    // directly so the caller doesn't need a second tool call just to read it back, and
    // doesn't have to guess the path (it's not derivable from yt-dlp's own log lines).
    const captions = captionPaths.map((captionPath) => {
      let text = null
      try {
        text = fs.readFileSync(captionPath, 'utf8')
        if (text.length > MAX_LOG_CHARS) text = text.slice(0, MAX_LOG_CHARS) + '...[truncated]'
      } catch (error) {
        text = null
      }
      return { path: captionPath, text }
    })

    return { content: [{ type: 'text', text: JSON.stringify({ mediaPaths, captions, commentPaths, outputDir, log: log || '(no output)' }, null, 2) }] }
  }
)

const transport = new StdioServerTransport()
server.connect(transport)
