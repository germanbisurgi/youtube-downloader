const fs = require('fs')
const os = require('os')
const path = require('path')
const commandante = require('./commandante')
const dependencies = require('./dependencies')
const comments = require('./comments')
const captions = require('./captions')

// Builds the yt-dlp argv (everything except the trailing URL) from a form config, plus
// whatever scratch-dir/threshold state the exit-time cleanup (see cleanup() below) needs.
// Shared by the Electron IPC handler and the MCP tool so the flag logic exists in one place.
const buildArgs = (config, { ffmpegPath }) => {
  const args = []
  let captionsTmpDir = null
  let commentsTmpDir = null
  let commentsMinLikes = 0
  let commentsMinTextLength = 0

  args.push('--no-check-certificate')
  args.push('--no-part')
  args.push('--ffmpeg-location', ffmpegPath)
  // enables solving YouTube's "n" signature challenge when a system Node.js is available —
  // harmless no-op otherwise (yt-dlp just falls back to its prior behavior, same warning as before)
  args.push('--js-runtimes', 'node')
  // spaces out extraction requests (webpage/player-config/API calls) and, separately, subtitle
  // downloads — YouTube's caption endpoint in particular has been observed 429-ing a request
  // fired right after those extraction calls with no built-in yt-dlp retry for that error class.
  args.push('--sleep-requests', '1')
  args.push('--sleep-subtitles', '1')
  // without this, a subtitle-only failure (e.g. the 429 above) aborts the whole run before
  // yt-dlp even attempts the actual video/audio — --ignore-errors lets that still happen.
  // Tradeoff: yt-dlp's exit code becomes a weaker success signal, since it now also swallows
  // other per-item failures instead of surfacing them as a nonzero exit.
  args.push('--ignore-errors')

  if (config.cookiesFromBrowser && config.cookiesFromBrowser !== 'none') {
    // works around YouTube's "Sign in to confirm you're not a bot" bot-check by reusing the
    // user's own logged-in browser session (Chrome/Safari may prompt for Keychain/Full Disk
    // Access on macOS to decrypt their cookie store — that's an OS-level restriction, not a bug here)
    args.push('--cookies-from-browser', config.cookiesFromBrowser)
  }

  if (config.url.includes('&list=')) {
    args.push('--yes-playlist')
    args.push('--output', '%(playlist_title)s/%(playlist_index)s_%(title)s.%(ext)s')
  }

  if (config.media === 'audio') {
    args.push('--extract-audio')
    args.push('--audio-format', 'mp3')
  } else if (config.media !== 'video') {
    args.push('--skip-download')
  }

  if (config.includeCaptions) {
    // auto-captions repeat text across cues, and yt-dlp may fetch more than one English
    // track for the same video — writing to a scratch dir and cleaning up in cleanup()
    // below avoids leaving that raw duplication in the output folder.
    captionsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-downloader-captions-'))
    args.push('--write-subs')
    args.push('--write-auto-subs')
    // "en.*" is matched as regex by yt-dlp, so "." (any char) + "*" (repeat) actually matches
    // "en" followed by ANYTHING — pulling in every auto-translated "en-<lang>" track a video
    // offers (en-ar, en-zh, ...), which can be dozens and triggers YouTube rate-limiting.
    // Anchoring with "$" restricts it to exactly "en" or "en-orig".
    args.push('--sub-langs', 'en$,en-orig$,-live_chat')
    args.push('--convert-subs', 'srt')
    args.push('--output', 'subtitle:' + captionsTmpDir + '/%(id)s.%(ext)s')
  }

  if (config.includeComments) {
    // comments can only be written into the .info.json — there is no standalone comments
    // file — so it's fetched into a scratch dir and reduced to just the useful fields
    // afterward (see cleanup() below), instead of leaving the huge raw file behind.
    commentsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-downloader-comments-'))
    commentsMinLikes = Number(config.minLikes) || 0
    commentsMinTextLength = Number(config.minTextLength) || 0
    args.push('--write-info-json')
    args.push('--write-comments')
    args.push('--output', 'infojson:' + commentsTmpDir + '/%(id)s')

    if (commentsMinLikes > 0) {
      // YouTube has no "only comments with N+ likes" filter, so this can't be exact — but
      // sorting by "top" and capping the fetch is a real speedup for videos with huge comment
      // sections, and comments.js still applies the exact minLikes cutoff afterward.
      args.push('--extractor-args', 'youtube:comment_sort=top;max_comments=1000,200,1000,100')
    }
  }

  return { args, captionsTmpDir, commentsTmpDir, commentsMinLikes, commentsMinTextLength }
}

// Runs after the yt-dlp process exits: reduces the raw comments/captions scratch output
// into the real output folder, then removes the scratch dirs either way (success or failure).
const cleanup = (state, outputDir, onWarning) => {
  if (state.commentsTmpDir) {
    try {
      const files = fs.readdirSync(state.commentsTmpDir).filter((file) => file.endsWith('.info.json'))
      for (const file of files) {
        const id = file.replace(/\.info\.json$/, '')
        comments.writeReducedComments(path.join(state.commentsTmpDir, file), path.join(outputDir, id + '.comments.json'), state.commentsMinLikes, state.commentsMinTextLength)
      }
    } catch (error) {
      onWarning('Warning: failed to extract comments: ' + error.message)
    } finally {
      fs.rmSync(state.commentsTmpDir, { recursive: true, force: true })
    }
  }

  if (state.captionsTmpDir) {
    try {
      captions.writeCleanCaptionsFromDir(state.captionsTmpDir, outputDir)
    } catch (error) {
      onWarning('Warning: failed to extract captions: ' + error.message)
    } finally {
      fs.rmSync(state.captionsTmpDir, { recursive: true, force: true })
    }
  }
}

// Kicks off a download for the given form config, streaming logs via onLog and signalling
// completion via onExit. Used identically by the Electron `download` IPC handler and the
// MCP `download_media` tool — neither one duplicates the yt-dlp flag/cleanup logic.
const run = (config, outputDir, { onLog, onExit }) => {
  if (!dependencies.isInstalled('yt-dlp') || !dependencies.isInstalled('ffmpeg')) {
    onLog({ type: 'output', message: 'Error: yt-dlp/ffmpeg not installed. Install them from the Dependencies panel first.' })
    onExit()
    return
  }

  const ffmpegPath = dependencies.getBinaryPath('ffmpeg')
  const ytdlpPath = dependencies.getBinaryPath('yt-dlp')
  const state = buildArgs(config, { ffmpegPath })
  const args = [...state.args, config.url]

  commandante.onLogs = onLog
  commandante.onExit = () => {
    cleanup(state, outputDir, (message) => onLog({ type: 'output', message }))
    onExit()
  }

  commandante.command(ytdlpPath, args, { cwd: outputDir })
}

module.exports = { buildArgs, cleanup, run }
