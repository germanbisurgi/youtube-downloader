/* global Jedison command */
window.addEventListener('DOMContentLoaded', () => {
  const logs = document.querySelector('#logs')
  const abort = document.querySelector('#abort')
  const explore = document.querySelector('#explore')
  abort.disabled = true
  const download = document.querySelector('#download')
  download.disabled = true
  const formContainer = document.querySelector('#form-container')

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
      badge.classList.add('bg-info')
      badge.textContent = status.progressText || 'installing...'
      button.disabled = true
      spinner.classList.remove('d-none')
      return
    }

    spinner.classList.add('d-none')
    button.disabled = anyDependencyInstalling()

    if (!status.installed) {
      badge.classList.add('bg-danger')
      badge.textContent = 'not installed'
      label.textContent = 'Install'
    } else if (status.updateAvailable) {
      badge.classList.add('bg-warning')
      badge.textContent = `update available (${status.version} → ${status.latestVersion})`
      label.textContent = 'Update'
    } else {
      badge.classList.add('bg-success')
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

  const jedisonForm = new Jedison.Create({
    container: formContainer,
    theme: new Jedison.ThemeBootstrap5(),
    iconLib: 'bootstrap-icons',
    data: window.storage.loadLastConfig() || undefined,
    schema: {
      type: 'object',
      additionalProperties: false,
      title: 'Youtube Downloader',
      properties: {
        url: {
          type: 'string',
          title: 'URL',
          minLength: 1,
          default: 'https://www.youtube.com/watch?v=wpJYQf5uJ4w&list=PLUhYAiEwD-whqQ2Ak4wBJxO6WnS15l8AN'
        },
        media: {
          type: 'string',
          title: 'Media',
          enum: ['none', 'video', 'audio'],
          'x-enumTitles': ['None (Captions/Comments Only)', 'Video', 'Audio Only'],
          default: 'none'
        },
        includeCaptions: {
          type: 'boolean',
          title: 'Captions',
          'x-format': 'checkbox',
          default: false
        },
        includeComments: {
          type: 'boolean',
          title: 'Comments',
          'x-format': 'checkbox',
          default: false
        },
        minLikes: {
          type: 'integer',
          title: 'Minimum Likes (comments)',
          minimum: 0,
          default: 0
        },
        minTextLength: {
          type: 'integer',
          title: 'Minimum Text Length (comments)',
          minimum: 0,
          default: 0
        },
        cookiesFromBrowser: {
          type: 'string',
          title: 'Cookies From Browser (fixes "Sign in to confirm you\'re not a bot")',
          enum: ['none', 'firefox', 'chrome', 'safari', 'edge', 'brave'],
          'x-enumTitles': ['None', 'Firefox', 'Chrome', 'Safari', 'Edge', 'Brave'],
          default: 'none'
        }
      },
      required: ['url', 'media', 'includeCaptions', 'includeComments', 'minLikes', 'minTextLength', 'cookiesFromBrowser']
    }
  })

  jedisonForm.on('change', () => {
    window.storage.saveLastConfig(jedisonForm.getValue())
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
    const errors = jedisonForm.getErrors()
    if (errors.length) {
      alert('Please check the form data')
    } else {
      download.disabled = true
      abort.disabled = false
      window.api.send('download', jedisonForm.getValue())
    }
  })

  abort.addEventListener('click', () => {
    window.api.send('abort')
  })

  explore.addEventListener('click', () => {
    window.api.send('explore')
  })
})
