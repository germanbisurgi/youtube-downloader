const electron = require('electron')
const { ipcRenderer } = electron

window.addEventListener('DOMContentLoaded', () => {
  const logs = document.querySelector('#logs')
  const clear = document.querySelector('#clear')
  const abort = document.querySelector('#abort')
  abort.disabled = true
  const submit = document.querySelector('#submit')
  const editorContainer = document.querySelector('#editor-container')
  const editor = new JSONEditor(editorContainer, {
    disable_edit_json: true,
    disable_properties: true,
    disable_collapse: true,
    show_opt_in: true,
    theme: 'bootstrap4',
    schema: {
      "required": true,
      "type": "object",
      "title": "Configurator",
      "properties": {
        "command": {
          "required": true,
          "type": "string",
          "title": "Command",
          "enum": [
            "youtube-dl",
            "yt-dlp"
          ],
          "default": "yt-dlp",
        },
        "url": {
          "required": true,
          "type": "string",
          "title": "url",
          "default": "https://www.youtube.com/watch?v=lVdIGHZ-I28&list=PL7B04A852ACF0F7CE"
        },
        "flags": {
          "required": true,
          "type": "array",
          "title": "Flags",
          "uniqueItems": true,
          "default": [
            "--ignore-errors"
          ],
          "items": {
            "type": "string",
              "enum": [
                "--ignore-errors",
                "--extract-audio"
              ],
              "options": {
                "enum_titles": [
                  "--ignore-errors",
                  "--extract-audio"
                ]
            }
          }
        }
      }
    }
  })

  ipcRenderer.on('command', (event, message) => {
    command.value = message
  })

  ipcRenderer.on('logs', (event, message) => {
    logs.value += message
    logs.scrollTop = logs.scrollHeight;
  })

  ipcRenderer.on('exit', () => {
    submit.disabled = false
    abort.disabled = true
  })

  submit.addEventListener('click', () => {
    submit.disabled = true
    abort.disabled = false
    ipcRenderer.send('submit', editor.getValue())
  })

  abort.addEventListener('click', () => {
    ipcRenderer.send('abort')
  })

  clear.addEventListener('click', () => {
    logs.value = ''
  })
})