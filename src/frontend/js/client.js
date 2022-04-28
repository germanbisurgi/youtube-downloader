/* global JSONEditor command */
window.addEventListener('DOMContentLoaded', () => {
  const logs = document.querySelector('#logs')
  const abort = document.querySelector('#abort')
  const explore = document.querySelector('#explore')
  abort.disabled = true
  const download = document.querySelector('#download')
  const editorContainer = document.querySelector('#editor-container')
  const editor = new JSONEditor(editorContainer, {
    disable_edit_json: true,
    disable_properties: true,
    disable_collapse: true,
    show_opt_in: true,
    show_errors: 'always',
    theme: 'bootstrap4',
    schema: {
      required: true,
      type: 'object',
      title: 'Youtube Downloader',
      properties: {
        url: {
          required: true,
          type: 'string',
          title: 'URL',
          minLength: 1,
          default: 'https://www.youtube.com/watch?v=5NehOiCz4LE'
        },
        extractAudio: {
          required: true,
          type: 'boolean',
          title: 'Audio Only',
          format: 'checkbox',
          default: false
        }
      }
    }
  })

  window.api.on('command', (event, message) => {
    command.value = message
  })

  window.api.on('logs', (event, message) => {
    logs.value += message.message
    logs.scrollTop = logs.scrollHeight
  })

  window.api.on('exit', () => {
    download.disabled = false
    abort.disabled = true
  })

  download.addEventListener('click', () => {
    const errors = editor.validate()
    if (errors.length) {
      alert('Please check the form data')
    } else {
      download.disabled = true
      abort.disabled = false
      window.api.send('download', editor.getValue())
    }
  })

  abort.addEventListener('click', () => {
    window.api.send('abort')
  })

  explore.addEventListener('click', () => {
    window.api.send('explore')
  })
})
