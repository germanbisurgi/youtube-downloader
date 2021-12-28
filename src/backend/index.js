const commandante = require('./commandante')
const utils = require('./utils')
const path = require('path')
const { app, BrowserWindow, ipcMain, shell, screen } = require('electron')
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

let win
const outputDir = path.join(app.getPath('home'), 'youtube-downloader')

const createWindow = () => {
  let display = screen.getPrimaryDisplay();
  let width = display.bounds.width;
  let height = display.bounds.height;
  win = new BrowserWindow({
    height: height,
    width: 600,
    x: width - 600,
    y: 0,
    icon: path.join(__dirname, '../assets/icons/png/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js")
    }
  })
  win.loadFile(path.join(__dirname, '..', 'frontend', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  utils.createFolderIfNotExists(outputDir)
})

ipcMain.on('explore', () => {
  utils.createFolderIfNotExists(outputDir)
  shell.openPath(outputDir)
})

ipcMain.on('abort', () => {
  commandante.kill()
})

ipcMain.on('download', (event, config) => {
  console.log('download', config)
  
  const args = [
    config.url
  ]

  if (config.url.includes('&list=')) {
    args.unshift('-o %(playlist_title)s/%(playlist_index)s_%(title)s.%(ext)s')
  }

  if (config.extractAudio) {
    args.unshift('--extract-audio')
  }

  const options = {
    cwd: outputDir
  }

  let command = 'yt-dlp'

  if (utils.isPackaged()) {
    if (utils.isLinux() || utils.isMac()) {
      command = path.join(process.resourcesPath, 'bin', 'yt-dlp')
    }

    if (utils.isWin()) {
      command = path.join(process.resourcesPath, 'bin', 'yt-dlp.exe')
    }
  }

  console.log('command', command)

  commandante.command(command, args, options)
})

commandante.onLogs = (log) => {
  console.log(log)
  win.webContents.send('logs', log)
}

commandante.onExit = () => {
  win.webContents.send('exit')
}