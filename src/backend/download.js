const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const commandante = require('./commandante')
const dependencies = require('./dependencies')
const comments = require('./comments')
const captions = require('./captions')

// yt-dlp's own metadata extraction (webpage/player-config only, no subtitle content fetch —
// doesn't touch the caption-serving endpoint that's been observed rate-limiting subtitle
// downloads) — used to find out which of the two known-duplicate English auto-caption tags
// ("en" translated vs "en-orig" original-language transcript) a video actually has, so the
// real download requests only that one instead of both and discarding whichever it doesn't
// need (captions.js used to dedupe this after the fact; this avoids fetching the extra one
// at all). Falls back to the old broad pattern on any lookup failure, so a captions request
// never silently comes back empty just because this pre-flight check itself failed.
const CAPTION_LOOKUP_TIMEOUT = 30000
const FALLBACK_SUB_LANGS = 'en$,en-orig$,-live_chat'

const resolveCaptionLang = (ytdlpPath, config) => {
  return new Promise((resolve) => {
    const args = ['--skip-download', '--no-warnings', '-j']
    if (config.cookiesFromBrowser && config.cookiesFromBrowser !== 'none') {
      args.push('--cookies-from-browser', config.cookiesFromBrowser)
    }
    args.push(config.url)

    execFile(ytdlpPath, args, { timeout: CAPTION_LOOKUP_TIMEOUT, maxBuffer: 1024 * 1024 * 20 }, (error, stdout) => {
      if (error) {
        resolve({ subLangs: FALLBACK_SUB_LANGS, available: true })
        return
      }
      try {
        const info = JSON.parse(stdout)
        const hasEn = !!((info.subtitles && info.subtitles.en) || (info.automatic_captions && info.automatic_captions.en))
        const hasEnOrig = !!((info.subtitles && info.subtitles['en-orig']) || (info.automatic_captions && info.automatic_captions['en-orig']))
        if (hasEn) resolve({ subLangs: 'en$', available: true })
        else if (hasEnOrig) resolve({ subLangs: 'en-orig$', available: true })
        else resolve({ subLangs: null, available: false })
      } catch (parseError) {
        resolve({ subLangs: FALLBACK_SUB_LANGS, available: true })
      }
    })
  })
}

// Builds the yt-dlp argv (everything except the trailing URL) from a form config, plus
// whatever scratch-dir/threshold state the exit-time cleanup (see cleanup() below) needs.
// Shared by the Electron IPC handler and the MCP tool so the flag logic exists in one place.
const buildArgs = async (config, { ffmpegPath, ytdlpPath }) => {
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
  args.push('--sleep-requests', '3')
  args.push('--sleep-subtitles', '3')
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

  let captionsSkipped = false
  if (config.includeCaptions) {
    const captionInfo = await resolveCaptionLang(ytdlpPath, config)
    if (!captionInfo.available) {
      // neither English tag exists for this video — skip the subtitle flags entirely rather
      // than issue a request guaranteed to come back empty
      captionsSkipped = true
    } else {
      // auto-captions repeat text across cues — writing to a scratch dir and cleaning up in
      // cleanup() below avoids leaving that raw duplication in the output folder.
      captionsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-downloader-captions-'))
      args.push('--write-subs')
      args.push('--write-auto-subs')
      args.push('--sub-langs', captionInfo.subLangs)
      args.push('--convert-subs', 'srt')
      args.push('--output', 'subtitle:' + captionsTmpDir + '/%(id)s.%(ext)s')
    }
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

  return { args, captionsTmpDir, captionsSkipped, commentsTmpDir, commentsMinLikes, commentsMinTextLength }
}

// Runs after the yt-dlp process exits: reduces the raw comments/captions scratch output
// into the real output folder, then removes the scratch dirs either way (success or failure).
// Returns the final paths written, so run() can hand them back to its caller (the MCP
// download_media tool needs these — it has no other way to know where captions/comments
// actually ended up, since they're not part of yt-dlp's own [download]/[Merger] log lines).
const cleanup = (state, outputDir, onWarning) => {
  const commentPaths = []
  let captionPaths = []

  if (state.commentsTmpDir) {
    try {
      const files = fs.readdirSync(state.commentsTmpDir).filter((file) => file.endsWith('.info.json'))
      for (const file of files) {
        const id = file.replace(/\.info\.json$/, '')
        const outputPath = path.join(outputDir, id + '.comments.json')
        comments.writeReducedComments(path.join(state.commentsTmpDir, file), outputPath, state.commentsMinLikes, state.commentsMinTextLength)
        commentPaths.push(outputPath)
      }
    } catch (error) {
      onWarning('Warning: failed to extract comments: ' + error.message)
    } finally {
      fs.rmSync(state.commentsTmpDir, { recursive: true, force: true })
    }
  }

  if (state.captionsTmpDir) {
    try {
      captionPaths = captions.writeCleanCaptionsFromDir(state.captionsTmpDir, outputDir)
    } catch (error) {
      onWarning('Warning: failed to extract captions: ' + error.message)
    } finally {
      fs.rmSync(state.captionsTmpDir, { recursive: true, force: true })
    }
  }

  return { captionPaths, commentPaths }
}

// yt-dlp's own message when YouTube demands bot verification — used to detect the failure
// so run() can retry once with browser cookies instead of the caller having to notice the
// log text and retry manually with cookiesFromBrowser set.
const BOT_CHECK_MARKER = 'Sign in to confirm you'

// Runs one yt-dlp attempt end to end (build args, spawn, cleanup) and resolves true if the
// bot-check marker showed up in its output. Split out of run() so run() can retry once with
// cookies if the first, cookie-less attempt hits YouTube's bot check.
const runOnce = async (config, outputDir, { ffmpegPath, ytdlpPath }, onLog) => {
  if (config.includeCaptions) {
    onLog({ type: 'output', message: 'Checking available captions...' })
  }

  const state = await buildArgs(config, { ffmpegPath, ytdlpPath })
  if (state.captionsSkipped) {
    onLog({ type: 'output', message: 'No English captions available for this video — skipping captions.' })
  }
  const args = [...state.args, config.url]

  return new Promise((resolve) => {
    let sawBotCheck = false
    commandante.onLogs = (log) => {
      if (log.message.includes(BOT_CHECK_MARKER)) sawBotCheck = true
      onLog(log)
    }
    commandante.onExit = () => {
      const paths = cleanup(state, outputDir, (message) => onLog({ type: 'output', message }))
      resolve({ sawBotCheck, ...paths })
    }

    commandante.command(ytdlpPath, args, { cwd: outputDir })
  })
}

// Kicks off a download for the given form config, streaming logs via onLog and signalling
// completion via onExit(paths). Used identically by the Electron `download` IPC handler and
// the MCP `download_media` tool — neither one duplicates the yt-dlp flag/cleanup logic.
const run = async (config, outputDir, { onLog, onExit }) => {
  if (!dependencies.isInstalled('yt-dlp') || !dependencies.isInstalled('ffmpeg')) {
    onLog({ type: 'output', message: 'Error: yt-dlp/ffmpeg not installed. Install them from the Dependencies panel first.' })
    onExit({ captionPaths: [], commentPaths: [] })
    return
  }

  const ffmpegPath = dependencies.getBinaryPath('ffmpeg')
  const ytdlpPath = dependencies.getBinaryPath('yt-dlp')
  const paths = { ffmpegPath, ytdlpPath }

  const first = await runOnce(config, outputDir, paths, onLog)
  let { captionPaths, commentPaths } = first

  // Only retry when the caller didn't already ask for cookies — if they did and still hit
  // the bot check, retrying with the same cookies would just fail the same way again.
  if (first.sawBotCheck && (!config.cookiesFromBrowser || config.cookiesFromBrowser === 'none')) {
    onLog({ type: 'output', message: 'YouTube requested bot verification — retrying once with Firefox cookies (--cookies-from-browser firefox)...' })
    const retry = await runOnce({ ...config, cookiesFromBrowser: 'firefox' }, outputDir, paths, onLog)
    captionPaths = retry.captionPaths
    commentPaths = retry.commentPaths
  }

  onExit({ captionPaths, commentPaths })
}

module.exports = { buildArgs, cleanup, run }
