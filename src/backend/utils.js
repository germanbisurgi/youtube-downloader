const fs = require('fs')
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

module.exports = new Utils()
