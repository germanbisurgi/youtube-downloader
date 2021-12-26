const electron = require('electron')
const { ipcRenderer } = electron

window.addEventListener('DOMContentLoaded', () => {
  const logs = document.querySelector('#logs')
  const clear = document.querySelector('#clear')
  const abort = document.querySelector('#abort')
  const explore = document.querySelector('#explore')
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
      "title": "Youtube-Downloader",
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
          "options": {
            "hidden": true
          }
        },
        "url": {
          "required": true,
          "type": "string",
          "title": "URL",
          "default": "https://www.youtube.com/watch?v=lVdIGHZ-I28&list=PL7B04A852ACF0F7CE"
        },
        "extractAudio": {
          "required": true,
          "type": "boolean",
          "title": "Audio Only",
          "format": "checkbox",
          "default": false
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

  explore.addEventListener('click', () => {
    ipcRenderer.send('explore')
  })

  clear.addEventListener('click', () => {
    logs.value = ''
  })
})