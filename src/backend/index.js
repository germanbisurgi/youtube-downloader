const commandante = require('./commandante')
const utils = require('./utils')
const dependencies = require('./dependencies')
const download = require('./download')
const path = require('path')
const { app, BrowserWindow, ipcMain, shell, screen } = require('electron')

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

ipcMain.handle('dependencies:installed', () => dependencies.getInstalledFlags())

ipcMain.handle('dependencies:status', () => dependencies.getStatus())

ipcMain.handle('dependencies:check-update', (event, { name, installedVersion }) => dependencies.checkForUpdate(name, installedVersion))

ipcMain.handle('dependencies:install', (event, { name }) => {
  return dependencies.install(name, (progress) => {
    event.sender.send('dependencies:progress', { name, ...progress })
  })
})

ipcMain.on('download', (event, config) => {
  console.log('download', config)

  download.run(config, outputDir, {
    onLog: (log) => {
      console.log('...', log)
      mainWindow.webContents.send('logs', log)
    },
    onExit: () => mainWindow.webContents.send('exit')
  })
})
