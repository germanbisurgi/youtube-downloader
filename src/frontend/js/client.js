/* global JSONEditor command */
window.addEventListener('DOMContentLoaded', () => {
  const logs = document.querySelector('#logs')
  const abort = document.querySelector('#abort')
  const explore = document.querySelector('#explore')
  abort.disabled = true
  const download = document.querySelector('#download')
  download.disabled = true
  const editorContainer = document.querySelector('#editor-container')

  const depsState = {}
  const dependencyRows = document.querySelectorAll('[data-dependency]')

  const updateDownloadButtonState = () => {
    const allInstalled = Object.values(depsState).every((status) => status && status.installed)
    download.disabled = !allInstalled || !abort.disabled
  }

  // dependencies.install() writes both binaries through one shared scratch dir
  // (binDir/.tmp) and wipes it at the start of every install — running two installs
  // at once would let the second one delete the first one's in-flight download.
  const anyDependencyInstalling = () => Object.values(depsState).some((status) => status && status.installing)

  const renderDependency = (name, status) => {
    const row = document.querySelector(`[data-dependency="${name}"]`)
    const badge = row.querySelector('[data-role="badge"]')
    const button = row.querySelector('[data-role="install-btn"]')
    const spinner = row.querySelector('[data-role="spinner"]')
    const label = row.querySelector('[data-role="btn-label"]')

    badge.className = 'badge'

    if (status.installing) {
      badge.classList.add('badge-info')
      badge.textContent = status.progressText || 'installing...'
      button.disabled = true
      spinner.classList.remove('d-none')
      return
    }

    spinner.classList.add('d-none')
    button.disabled = anyDependencyInstalling()

    if (!status.installed) {
      badge.classList.add('badge-danger')
      badge.textContent = 'not installed'
      label.textContent = 'Install'
    } else if (status.updateAvailable) {
      badge.classList.add('badge-warning')
      badge.textContent = `update available (${status.version} → ${status.latestVersion})`
      label.textContent = 'Update'
    } else {
      badge.classList.add('badge-success')
      badge.textContent = status.version ? `installed v${status.version}` : 'installed (checking version...)'
      label.textContent = 'Install'
      // already installed and no update known — nothing for a click to do
      button.disabled = true
    }
  }

  const refreshStatus = async () => {
    // fast path (just a file-existence check): unlocks Download immediately, without
    // waiting on the slow version lookup below — yt-dlp's standalone binary can take
    // several seconds just to report `--version`
    const installedFlags = await window.api.invoke('dependencies:installed')
    for (const name of Object.keys(installedFlags)) {
      depsState[name] = { ...depsState[name], ...installedFlags[name] }
      renderDependency(name, depsState[name])
    }
    updateDownloadButtonState()

    // slow path: version + update info are purely informational and never gate Download
    const status = await window.api.invoke('dependencies:status')
    for (const name of Object.keys(status)) {
      depsState[name] = { ...depsState[name], ...status[name] }
      renderDependency(name, depsState[name])

      if (status[name].installed) {
        window.api.invoke('dependencies:check-update', { name, installedVersion: status[name].version }).then((update) => {
          depsState[name] = { ...depsState[name], ...update }
          renderDependency(name, depsState[name])
        })
      }
    }
  }

  const renderAllDependencies = () => {
    Object.keys(depsState).forEach((name) => renderDependency(name, depsState[name]))
  }

  dependencyRows.forEach((row) => {
    const name = row.dataset.dependency
    const button = row.querySelector('[data-role="install-btn"]')

    button.addEventListener('click', async () => {
      depsState[name] = { ...depsState[name], installing: true, progressText: 'installing...' }
      // re-render every row, not just this one — the sibling's button needs to disable too
      renderAllDependencies()

      try {
        await window.api.invoke('dependencies:install', { name })
      } catch (error) {
        alert(`Failed to install ${name}: ${error.message}`)
      } finally {
        depsState[name] = { ...depsState[name], installing: false }
        await refreshStatus()
      }
    })
  })

  window.api.on('dependencies:progress', (event, { name, phase, percent }) => {
    const progressText = percent === null || percent === undefined ? `${phase}...` : `${phase}... ${percent}%`
    depsState[name] = { ...depsState[name], installing: true, progressText }
    renderAllDependencies()
  })

  refreshStatus()

  const editor = new JSONEditor(editorContainer, {
    disable_edit_json: true,
    disable_properties: true,
    disable_collapse: true,
    show_opt_in: true,
    show_errors: 'always',
    theme: 'bootstrap4',
    startval: window.storage.loadLastConfig() || undefined,
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
          default: 'https://www.youtube.com/watch?v=wpJYQf5uJ4w&list=PLUhYAiEwD-whqQ2Ak4wBJxO6WnS15l8AN'
        },
        media: {
          required: true,
          type: 'string',
          title: 'Media',
          enum: ['none', 'video', 'audio'],
          options: {
            enum_titles: ['None (Captions/Comments Only)', 'Video', 'Audio Only']
          },
          default: 'none'
        },
        includeCaptions: {
          required: true,
          type: 'boolean',
          title: 'Captions',
          format: 'checkbox',
          default: false
        },
        includeComments: {
          required: true,
          type: 'boolean',
          title: 'Comments',
          format: 'checkbox',
          default: false
        },
        minLikes: {
          required: true,
          type: 'integer',
          title: 'Minimum Likes (comments)',
          minimum: 0,
          default: 0
        },
        minTextLength: {
          required: true,
          type: 'integer',
          title: 'Minimum Text Length (comments)',
          minimum: 0,
          default: 0
        },
        cookiesFromBrowser: {
          required: true,
          type: 'string',
          title: 'Cookies From Browser (fixes "Sign in to confirm you\'re not a bot")',
          enum: ['none', 'firefox', 'chrome', 'safari', 'edge', 'brave'],
          options: {
            enum_titles: ['None', 'Firefox', 'Chrome', 'Safari', 'Edge', 'Brave']
          },
          default: 'none'
        }
      }
    }
  })

  editor.on('change', () => {
    window.storage.saveLastConfig(editor.getValue())
  })

  window.api.on('command', (event, message) => {
    command.value = message
  })

  window.api.on('logs', (event, message) => {
    logs.value += message.message + '\n'
    logs.scrollTop = logs.scrollHeight
  })

  window.api.on('exit', () => {
    abort.disabled = true
    updateDownloadButtonState()
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
