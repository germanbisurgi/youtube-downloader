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
    description: 'Downloads video or extracts MP3 audio from a YouTube URL via yt-dlp, saving into ~/youtube-downloader. Requires yt-dlp and ffmpeg to already be installed (see check_dependencies). Blocks until the download finishes and returns the yt-dlp log.',
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
    await new Promise((resolve) => {
      download.run(config, outputDir, {
        onLog: (log) => logs.push(log.message),
        onExit: resolve
      })
    })

    let text = logs.join('')
    if (text.length > MAX_LOG_CHARS) {
      text = '...[truncated]...\n' + text.slice(-MAX_LOG_CHARS)
    }

    return { content: [{ type: 'text', text: text || '(no output)' }] }
  }
)

const transport = new StdioServerTransport()
server.connect(transport)
