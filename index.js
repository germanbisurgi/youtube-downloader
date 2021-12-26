const commandante = require('./commandante')
const { app, BrowserWindow, ipcMain} = require('electron')
const path = require('path')
// require('electron-reloader')(module)

let win

const createWindow = () => {
  win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // preload: path.join(__dirname, 'renderer.js')
    }
  })
  win.webContents.openDevTools()
  win.loadFile(path.join(__dirname, 'static', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
})

ipcMain.on('abort', () => {
  commandante.kill()
})

ipcMain.on('change', () => {
  const command = commandante.getCommand()
  win.webContents.send('command', command)
})

ipcMain.on('submit', (event, payload) => {
  console.log('submit', payload)
  
  let optionsWithValues = []
  for (let key in payload.options) {
    const stringOption = key + ' ' + payload.options[key]
    optionsWithValues.push(stringOption)
  }

  let command = payload.command

  const args = [
    ...payload.flags,
    ...optionsWithValues,
    '-o %(playlist_title)s/%(playlist_index)s_%(title)s.%(ext)s',
    payload.url
  ]

  const options = {
    cwd: path.join(__dirname, 'output'),
  }

  let commandString = command + ' ' + args.join(' ')
  console.log(commandString)
  win.webContents.send('command', commandString)

  commandante.command(payload.command, args, options)
})

commandante.onLogs = (log) => {
  console.log(log)
  win.webContents.send('logs', log)
}

commandante.onExit = () => {
  win.webContents.send('exit')
}