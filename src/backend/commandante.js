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

// Wraps an arg in quotes for the human-readable prompt log only, if it contains
// whitespace — purely cosmetic, has no bearing on how the child process is spawned.
const displayArg = (arg) => (/\s/.test(arg) ? `"${arg}"` : arg)

Comandante.prototype.command = function (binary, args = [], options = {}) {
  // no `env` override here — omitting it lets spawn() inherit the full parent
  // environment (HOME, PATH, etc.) by default. A previous version set
  // `env: process.env.PATH` (a string, not an object), which corrupted the
  // child's environment: HOME came out empty, breaking anything that depends
  // on it (nvm-managed `node` on PATH, shell rc files, ...).
  const defaultOptions = {}
  const mergedOptions = deepmerge(defaultOptions, options)

  // spawn(binary, argsArray) — no shell involved, so args (e.g. a URL) are passed
  // to the child verbatim and can't be interpreted as shell syntax. Previously this
  // ran `spawn('bash', ['-c', command])` with a hand-built, only partially quoted
  // command string, which was vulnerable to shell injection via any unescaped arg.
  this.process = spawn(binary, args, mergedOptions)

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
  this.log('prompt', user + ':' + folder + ' ' + [binary, ...args].map(displayArg).join(' '))
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
