const { spawn } = require('child_process')
const kill = require('tree-kill')
const path = require('path')
const os = require("os")
const { app } = require('electron')
const merge = require('deepmerge')

const Commandante = function () {
  this.process = null
}

Commandante.prototype.log = function (type, message) {
  this.onLogs({
    type: type,
    message: message,
  })
}

Commandante.prototype.command = function (command, options = {}) {
  const defaultOptions = { env: process.env.PATH }
  const mergedOptions = merge(defaultOptions, options)

  console.log('-------------', command, mergedOptions)

  this.process = spawn('bash', ['-c', command], mergedOptions)

  this.process.stdout.on('data', (data) => {
    this.log('output', `${data}`)
  })

  this.process.stderr.on('data', (data) => {
    this.log('output', `${data}`)
  })

  this.process.on('error', (error) => {
    this.log('output', `error: ${error.message}`)
  })

  this.process.on('exit', (code, signal) => {
    if (code) this.log('output', `Process exit with code: ${code}`)
    if (signal) this.log('output', `Process killed with signal: ${signal}`)
    this.onExit()
    this.log('output', 'done')
  })

  const user = os.userInfo().username
  const folder = process.cwd().split('/').slice(-1)[0]
  this.log('prompt', user + ':' + folder + ' ' + command)
}

Commandante.prototype.kill = function () {
  if (this.process) {
    kill(this.process.pid, 'SIGTERM', function (err) {
      console.log('Killed process')
      if (err) {
        console.log(err)
      }
    })
  }
}

Commandante.prototype.onLogs = function () {}
Commandante.prototype.onClear = function () {}
Commandante.prototype.onExit = function () {}
Commandante.prototype.onError = function () {}

const commandante = new Commandante()

module.exports = commandante
