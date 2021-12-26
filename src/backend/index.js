const commandante = require('./commandante')
const { app, BrowserWindow, ipcMain, shell} = require('electron')
const path = require('path')
const fs = require('fs');
//require('electron-reloader')(module)
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

let win
const outputDir = path.join(app.getPath('home'), 'youtube-downloader')


const createOutputFolder = () => {
  if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
  }
}

const createWindow = () => {
  win = new BrowserWindow({
    height: 900,
    width: 600,
    icon: path.join(__dirname, '../assets/icons/png/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile(path.join(__dirname, '..', 'frontend', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  createOutputFolder()
})

ipcMain.on('explore', () => {
  createOutputFolder()
  shell.openPath(outputDir)
})

ipcMain.on('abort', () => {
  commandante.kill()
})

ipcMain.on('submit', (event, config) => {
  console.log('submit', config)
  
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

  win.webContents.send('command', config.command + ' ' + args.join(' '))

  commandante.command(config.command, args, options)
})

commandante.onLogs = (log) => {
  console.log(log)
  win.webContents.send('logs', log)
}

commandante.onExit = () => {
  win.webContents.send('exit')
}