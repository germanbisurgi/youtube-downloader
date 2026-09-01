/* global window */
window.storage = (() => {
  const KEY = 'youtube-downloader:lastConfig'

  const loadLastConfig = () => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? JSON.parse(raw) : null
    } catch (error) {
      return null
    }
  }

  const saveLastConfig = (config) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(config))
    } catch (error) {
      // ignore storage errors (e.g. quota exceeded, disabled storage)
    }
  }

  return { loadLastConfig, saveLastConfig }
})()
