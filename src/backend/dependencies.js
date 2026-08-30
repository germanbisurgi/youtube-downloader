const fs = require('fs')
const path = require('path')
const https = require('https')
const { execFile } = require('child_process')
const { app } = require('electron')
const utils = require('./utils')

const GITHUB_API_HEADERS = { 'User-Agent': 'youtube-downloader' }

// yt-dlp's macOS/Windows standalone builds unpack a bundled Python runtime on every
// launch, which can take several seconds even just for `--version` — a short timeout
// here would misreport a perfectly installed binary as unversioned/broken.
const VERSION_CHECK_TIMEOUT = 20000

const getBinDir = () => path.join(app.getPath('userData'), 'bin')

const getBinaryPath = (name) => {
  const ext = utils.isWin() ? '.exe' : ''
  return path.join(getBinDir(), name + ext)
}

const isInstalled = (name) => fs.existsSync(getBinaryPath(name))

const getInstalledVersion = (name) => {
  return new Promise((resolve) => {
    const flag = name === 'ffmpeg' ? '-version' : '--version'
    execFile(getBinaryPath(name), [flag], { timeout: VERSION_CHECK_TIMEOUT }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      resolve(name === 'ffmpeg' ? stdout.split('\n')[0].split(' ')[2] : stdout.trim())
    })
  })
}

const getStatus = async () => {
  const status = {}
  for (const name of ['yt-dlp', 'ffmpeg']) {
    const installed = isInstalled(name)
    status[name] = {
      installed,
      version: installed ? await getInstalledVersion(name) : null,
      path: getBinaryPath(name)
    }
  }
  return status
}

const getYtdlpDownloadUrl = () => {
  if (utils.isWin()) return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  if (utils.isMac()) return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
  return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
}

const getFfmpegDownloadUrl = () => {
  if (utils.isWin()) return 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
  if (utils.isMac()) return 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip'
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  return `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${arch}-static.tar.xz`
}

const getDownloadUrl = (name) => (name === 'ffmpeg' ? getFfmpegDownloadUrl() : getYtdlpDownloadUrl())

// yt-dlp URLs are always plain executables; ffmpeg's are always an archive, in a format
// that's fixed per platform (not always inferrable from the URL, e.g. evermeet.cx's URL
// has no file extension at all).
const getArchiveKind = (name) => {
  if (name !== 'ffmpeg') return null
  return utils.isLinux() ? 'tar.xz' : 'zip'
}

const downloadFile = (url, destPath, onProgress, redirects = 0) => {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects while downloading ' + url))
      return
    }

    https.get(url, { headers: GITHUB_API_HEADERS }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        downloadFile(response.headers.location, destPath, onProgress, redirects + 1).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode} for ${url}`))
        return
      }

      const total = parseInt(response.headers['content-length'], 10) || null
      let received = 0
      const file = fs.createWriteStream(destPath)

      response.on('data', (chunk) => {
        received += chunk.length
        onProgress(total ? Math.round((received / total) * 100) : null)
      })

      response.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
      response.on('error', reject)
    }).on('error', reject)
  })
}

const findFileRecursive = (dir, fileName) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFileRecursive(entryPath, fileName)
      if (found) return found
    } else if (entry.name === fileName) {
      return entryPath
    }
  }
  return null
}

// Extraction is delegated to the system `tar` for both zip and tar.xz archives (modern
// tar/bsdtar on macOS, Linux, and Windows 10+ auto-detects the format from content) rather
// than an npm zip library — `extract-zip` was tried first and found to hang indefinitely
// on real-world archives (files were fully written to disk, but its promise never settled).
const extractArchive = (archivePath, destDir) => {
  return new Promise((resolve, reject) => {
    execFile('tar', ['-xf', archivePath, '-C', destDir], (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

const install = async (name, onProgress = () => {}) => {
  const binDir = getBinDir()
  const tmpDir = path.join(binDir, '.tmp')
  fs.mkdirSync(binDir, { recursive: true })
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.mkdirSync(tmpDir, { recursive: true })

  try {
    const url = getDownloadUrl(name)
    const kind = getArchiveKind(name)

    if (!kind) {
      const destPath = getBinaryPath(name)
      const tmpPath = path.join(tmpDir, path.basename(destPath))
      await downloadFile(url, tmpPath, (percent) => onProgress({ phase: 'downloading', percent }))
      fs.renameSync(tmpPath, destPath)
      if (!utils.isWin()) fs.chmodSync(destPath, 0o755)
      onProgress({ phase: 'installing', percent: 100 })
      return { version: await getInstalledVersion(name) }
    }

    const archivePath = path.join(tmpDir, 'archive.' + (kind === 'zip' ? 'zip' : 'tar.xz'))
    await downloadFile(url, archivePath, (percent) => onProgress({ phase: 'downloading', percent }))

    onProgress({ phase: 'extracting', percent: null })
    const extractDir = path.join(tmpDir, 'extracted')
    fs.mkdirSync(extractDir, { recursive: true })
    await extractArchive(archivePath, extractDir)

    const binaryName = path.basename(getBinaryPath(name))
    const extractedBinary = findFileRecursive(extractDir, binaryName)
    if (!extractedBinary) {
      throw new Error(`Could not locate ${binaryName} inside the downloaded archive`)
    }

    const destPath = getBinaryPath(name)
    fs.copyFileSync(extractedBinary, destPath)
    if (!utils.isWin()) fs.chmodSync(destPath, 0o755)

    onProgress({ phase: 'installing', percent: 100 })
    return { version: await getInstalledVersion(name) }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

const fetchJson = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: GITHUB_API_HEADERS }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Request failed with status ${response.statusCode} for ${url}`))
        return
      }
      let body = ''
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
      response.on('error', reject)
    }).on('error', reject)
  })
}

const fetchText = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: GITHUB_API_HEADERS }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Request failed with status ${response.statusCode} for ${url}`))
        return
      }
      let body = ''
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve(body))
      response.on('error', reject)
    }).on('error', reject)
  })
}

const checkYtdlpUpdate = async () => {
  const release = await fetchJson('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')
  const latestVersion = release.tag_name
  const installedVersion = await getInstalledVersion('yt-dlp')
  const updateAvailable = !!latestVersion && !!installedVersion && latestVersion !== installedVersion
  return { updateAvailable, latestVersion }
}

// ffmpeg's own `-version` output embeds extra build metadata (e.g. "6.1-full_build-www.gyan.dev")
// that never matches a plain upstream version string exactly, so this uses a substring check and
// only ever reports "no update" (never a false positive) when either side can't be determined.
const checkFfmpegUpdate = async () => {
  try {
    let latestVersion = null

    if (utils.isMac()) {
      const info = await fetchJson('https://evermeet.cx/ffmpeg/info/ffmpeg/release')
      latestVersion = info.version
    } else if (utils.isWin()) {
      latestVersion = (await fetchText('https://www.gyan.dev/ffmpeg/builds/release-version')).trim()
    } else {
      return { updateAvailable: false, latestVersion: null }
    }

    const installedVersion = await getInstalledVersion('ffmpeg')
    const updateAvailable = !!latestVersion && !!installedVersion && !installedVersion.includes(latestVersion)
    return { updateAvailable, latestVersion }
  } catch (error) {
    return { updateAvailable: false, latestVersion: null }
  }
}

const checkForUpdate = (name) => (name === 'ffmpeg' ? checkFfmpegUpdate() : checkYtdlpUpdate())

module.exports = {
  getBinDir,
  getBinaryPath,
  isInstalled,
  getInstalledVersion,
  getStatus,
  getDownloadUrl,
  install,
  checkForUpdate
}
