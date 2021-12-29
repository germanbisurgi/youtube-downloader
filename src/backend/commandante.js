const { spawn } = require('child_process')
const kill = require('tree-kill')

const Commandante = function () {
  this.child = null
}

Commandante.prototype.command = function (command, args, options) {
  this.child = spawn(command, args, options)

  this.child.stdout.on('data', (data) => {
    this.onLogs(`${data}`)
  })

  this.child.stderr.on('data', (data) => {
    this.onLogs(`${data}`)
  })

  this.child.on('error', (error) => {
    this.onLogs(`error: ${error.message}`)
  })

  this.child.on('exit', (code, signal) => {
    if (code) this.onLogs(`Process exit with code: ${code} \n`)
    if (signal) this.onLogs(`Process killed with signal: ${signal} \n`)
    this.onLogs('Done ✅ \n')
    this.onExit()
  })
}

Commandante.prototype.kill = function () {
  if (this.child) {
    kill(this.child.pid, 'SIGTERM', function (err) {
      console.log('Killed process \n', err)
    })
  }
}

Commandante.prototype.onLogs = function () {}
Commandante.prototype.onExit = function () {}
Commandante.prototype.onError = function () {}

const commandante = new Commandante()

module.exports = commandante
