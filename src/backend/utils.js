const fs = require('fs')
const os = require('os')
const path = require('path')
const { platform } = require('os')

const Utils = function () {}

Utils.prototype.createFolderIfNotExists = function (path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path)
  }
}

Utils.prototype.isLinux = function () {
  return ['aix', 'freebsd', 'linux', 'openbsd', 'android'].includes(platform())
}

Utils.prototype.isMac = function () {
  return ['darwin', 'sunos'].includes(platform())
}

Utils.prototype.isWin = function () {
  return ['win32'].includes(platform())
}

// Reimplements Electron's own `app.getPath('userData')` resolution without depending on
// the `electron` module, so plain-Node processes (e.g. the MCP server) and the Electron
// app agree on the same directory — one shared yt-dlp/ffmpeg install either way.
Utils.prototype.getUserDataDir = function (appName) {
  if (this.isWin()) {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName)
  }
  if (this.isMac()) {
    return path.join(os.homedir(), 'Library', 'Application Support', appName)
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), appName)
}

module.exports = new Utils()
