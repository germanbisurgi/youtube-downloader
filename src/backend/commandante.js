const { spawn } = require('child_process')
const kill = require('tree-kill')
const os = require('os')
const deepmerge = require('deepmerge')

const Comandante = function () {
  this.process = null
}

Comandante.prototype.log = function (type, message) {
  this.onLogs({
    type: type,
    message: message
  })
}

Comandante.prototype.command = function (command, options = {}) {
  const defaultOptions = { env: process.env.PATH }
  const mergedOptions = deepmerge(defaultOptions, options)

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

Comandante.prototype.kill = function () {
  if (this.process) {
    kill(this.process.pid, 'SIGTERM', function (err) {
      console.log('Killed process')
      if (err) {
        console.log(err)
      }
    })
  }
}

Comandante.prototype.onLogs = function () {}
Comandante.prototype.onExit = function () {}
Comandante.prototype.onError = function () {}

const comandante = new Comandante()

module.exports = comandante
