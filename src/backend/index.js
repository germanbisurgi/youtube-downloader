const commandante = require('./commandante')
const utils = require('./utils')
const path = require('path')
const { app, BrowserWindow, ipcMain, shell, screen } = require('electron')
const { rootPath } = require('electron-root-path')

let mainWindow
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

  let command

  if (utils.isPackaged()) {
    if (utils.isLinux()) {
      command = path.join(process.resourcesPath, 'bin', 'yt-dlp')
    }
    if (utils.isMac()) {
      command = path.join(process.resourcesPath, 'bin', 'yt-dlp')
    }
    if (utils.isWin()) {
      command = path.join(process.resourcesPath, 'bin', 'yt-dlp.exe')
    }
  } else {
    if (utils.isLinux()) {
      command = path.join(rootPath, 'bin', 'linux', 'yt-dlp')
    }

    if (utils.isMac()) {
      command = path.join(rootPath, 'bin', 'mac', 'yt-dlp')
    }

    if (utils.isWin()) {
      command = path.join(rootPath, 'bin', 'win', 'yt-dlp.exe')
    }
  }

  commandante.command(command, args, options)
})

commandante.onLogs = (log) => {
  console.log('...', log)
  mainWindow.webContents.send('logs', log)
}

commandante.onExit = () => {
  mainWindow.webContents.send('exit')
}
