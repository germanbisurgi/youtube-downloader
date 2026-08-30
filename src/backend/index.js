const commandante = require('./commandante')
const utils = require('./utils')
const dependencies = require('./dependencies')
const comments = require('./comments')
const captions = require('./captions')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app, BrowserWindow, ipcMain, shell, screen } = require('electron')

let mainWindow
let commentsTmpDir = null
let commentsMinLikes = 0
let commentsMinTextLength = 0
let captionsTmpDir = null
const outputDir = path.join(app.getPath('home'), 'youtube-downloader')

const createWindow = () => {
  const display = screen.getPrimaryDisplay()
  const width = display.bounds.width
  const height = display.bounds.height
  mainWindow = new BrowserWindow({
    height: height,
    width: 600,
    x: width - 600,
    y: 0,
    icon: path.join(__dirname, '../assets/icons/png/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })
  mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  utils.createFolderIfNotExists(outputDir)
  mainWindow.setMenuBarVisibility(false);
})

ipcMain.on('explore', () => {
  utils.createFolderIfNotExists(outputDir)
  shell.openPath(outputDir)
})

ipcMain.on('abort', () => {
  commandante.kill()
})

ipcMain.handle('dependencies:status', () => dependencies.getStatus())

ipcMain.handle('dependencies:check-update', (event, { name }) => dependencies.checkForUpdate(name))

ipcMain.handle('dependencies:install', (event, { name }) => {
  return dependencies.install(name, (progress) => {
    event.sender.send('dependencies:progress', { name, ...progress })
  })
})

ipcMain.on('download', (event, config) => {
  console.log('download', config)

  if (!dependencies.isInstalled('yt-dlp') || !dependencies.isInstalled('ffmpeg')) {
    commandante.onLogs({ type: 'output', message: 'Error: yt-dlp/ffmpeg not installed. Install them from the Dependencies panel first.' })
    commandante.onExit()
    return
  }

  const ffmpeg = dependencies.getBinaryPath('ffmpeg')
  let command = '"' + dependencies.getBinaryPath('yt-dlp') + '"'

  command += ' --no-check-certificate'
  command += ' --no-part'
  command += ' --ffmpeg-location "' + ffmpeg + '"'

  if (config.url.includes('&list=')) {
    command += ' --yes-playlist'
    command += ' --output "%(playlist_title)s/%(playlist_index)s_%(title)s.%(ext)s"'
  }

  if (config.extractAudio) {
    command += ' --extract-audio'
    command += ' --audio-format mp3'
  }

  captionsTmpDir = null
  if (config.includeCaptions) {
    // auto-captions repeat text across cues, and yt-dlp may fetch more than one English
    // track for the same video — writing to a scratch dir and cleaning up in
    // commandante.onExit below avoids leaving that raw duplication in the output folder.
    captionsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-downloader-captions-'))
    command += ' --write-subs'
    command += ' --write-auto-subs'
    command += ' --sub-langs "en.*,-live_chat"'
    command += ' --convert-subs srt'
    command += ' --output "subtitle:' + captionsTmpDir + '/%(id)s.%(ext)s"'
  }

  commentsTmpDir = null
  commentsMinLikes = 0
  commentsMinTextLength = 0
  if (config.includeComments) {
    // comments can only be written into the .info.json — there is no standalone comments
    // file — so it's fetched into a scratch dir and reduced to just the useful fields
    // afterward (see commandante.onExit below), instead of leaving the huge raw file behind.
    commentsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-downloader-comments-'))
    commentsMinLikes = Number(config.minLikes) || 0
    commentsMinTextLength = Number(config.minTextLength) || 0
    command += ' --write-info-json'
    command += ' --write-comments'
    command += ' --output "infojson:' + commentsTmpDir + '/%(id)s"'

    if (commentsMinLikes > 0) {
      // YouTube has no "only comments with N+ likes" filter, so this can't be exact — but
      // sorting by "top" and capping the fetch is a real speedup for videos with huge comment
      // sections, and comments.js still applies the exact minLikes cutoff afterward.
      command += ' --extractor-args "youtube:comment_sort=top;max_comments=1000,200,1000,100"'
    }
  }

  command += ' '
  command += '"' + config.url + '"'

  const options = {
    cwd: outputDir
  }

  commandante.command(command, options)
})

commandante.onLogs = (log) => {
  console.log('...', log)
  mainWindow.webContents.send('logs', log)
}

commandante.onExit = () => {
  if (commentsTmpDir) {
    try {
      const files = fs.readdirSync(commentsTmpDir).filter((file) => file.endsWith('.info.json'))
      for (const file of files) {
        const id = file.replace(/\.info\.json$/, '')
        comments.writeReducedComments(path.join(commentsTmpDir, file), path.join(outputDir, id + '.comments.json'), commentsMinLikes, commentsMinTextLength)
      }
    } catch (error) {
      commandante.onLogs({ type: 'output', message: 'Warning: failed to extract comments: ' + error.message })
    } finally {
      fs.rmSync(commentsTmpDir, { recursive: true, force: true })
      commentsTmpDir = null
    }
  }

  if (captionsTmpDir) {
    try {
      captions.writeCleanCaptionsFromDir(captionsTmpDir, outputDir)
    } catch (error) {
      commandante.onLogs({ type: 'output', message: 'Warning: failed to extract captions: ' + error.message })
    } finally {
      fs.rmSync(captionsTmpDir, { recursive: true, force: true })
      captionsTmpDir = null
    }
  }

  mainWindow.webContents.send('exit')
}
