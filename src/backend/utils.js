const fs = require('fs')
const { isPackaged } = require('electron-is-packaged')
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

Utils.prototype.isPackaged = function () {
  return isPackaged
}

module.exports = new Utils()
