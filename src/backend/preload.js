const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld(
  'api', {
    on: (channel, func) => ipcRenderer.on(channel, func),
    send: (channel, data) => ipcRenderer.send(channel, data)
  }
)
