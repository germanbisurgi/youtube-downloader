# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An Electron desktop app that wraps `yt-dlp` (and `ffmpeg`, needed for stream merging as well as audio extraction) with a simple UI to download YouTube videos/playlists or extract audio as MP3. The app ships no binaries — yt-dlp/ffmpeg are downloaded on demand via a "Dependencies" panel in the UI.

## Commands

```bash
yarn install          # install deps (postinstall runs electron-builder install-app-deps)
yarn dev              # = yarn electron: launch the app
yarn eslint           # lint + autofix ./src/frontend (backend is not linted)
yarn build-mac        # package for macOS (dmg)
yarn build-linux      # package for Linux (deb)
yarn build-win        # package for Windows (nsis)
yarn build-all        # build for all platforms (electron-builder -mwl)
```

There is no test suite. electron-builder cannot cross-compile native deps — build a platform's target only on that platform.

## Architecture

Plain Electron main/renderer split, no bundler/framework — `src/frontend` is loaded directly as static HTML/CSS/JS.

- `src/backend/index.js` — main process entry point. Creates the `BrowserWindow` (context isolation on, node integration off), ensures the `~/youtube-downloader` output directory exists, and wires `ipcMain` handlers: `download`, `abort`, `explore` (opens the output folder in the OS file manager), plus the `dependencies:*` handlers described below.
- `src/backend/preload.js` — the only bridge between renderer and main. Exposes `window.api.on(channel, fn)` / `window.api.send(channel, data)` / `window.api.invoke(channel, data)` via `contextBridge`. Any new IPC channel must be added here to be reachable from the frontend.
- `src/backend/commandante.js` — thin wrapper around `child_process.spawn` for running the `yt-dlp`/`ffmpeg` shell command, streaming stdout/stderr back via `onLogs`/`onExit` callbacks, and killing the process tree (`tree-kill`) on abort.
- `src/backend/utils.js` — platform detection (`isLinux`/`isMac`/`isWin`), used to pick download URLs/binary filenames, plus `createFolderIfNotExists`.
- `src/backend/dependencies.js` — resolves/installs/updates the managed yt-dlp and ffmpeg binaries (see below).
- `src/backend/comments.js` — `writeReducedComments(infoJsonPath, outputPath, minLikes, minTextLength)` strips a yt-dlp `.info.json` down to just `{author, text, like_count}` per comment, drops any comment below `minLikes` and/or shorter than `minTextLength`, and sorts by `like_count` descending (the raw file also carries the full video metadata plus per-comment noise like `author_thumbnail` URLs — routinely ~3-4x larger than the fields anyone actually wants).
- `src/backend/captions.js` — `writeCleanCaptionsFromDir(subsDir, outputDir)` turns a converted `.srt` into a single flowing text file: YouTube's auto-captions "roll up" (each cue repeats the previous cue's text plus one new line), so it drops any line identical to the last one kept. If more than one English track was fetched for the same video id (e.g. a translated `en` alongside the original-language `en-orig`), it picks `en` over the rest rather than writing duplicate output files.
- `src/frontend/js/client.js` — renderer logic. Renders a JSON Schema form via `@json-editor/json-editor` (`url`, `extractAudio`, `includeCaptions`, `includeComments`, `minLikes`, `minTextLength`), sends the form value over `download`, streams `logs`/`exit` events into a `<textarea>`, and drives the Dependencies panel (status badges + Install/Update buttons) via `dependencies:*` IPC.

### Managed dependencies (`dependencies.js`)

No binaries are bundled or committed. `dependencies.js` downloads yt-dlp/ffmpeg on demand into `app.getPath('userData')/bin` — the same path in dev and packaged builds, so there's no dev-vs-packaged branching anywhere in the codebase:
- `getBinaryPath(name)` / `isInstalled(name)` / `getInstalledVersion(name)` / `getStatus()` — path resolution and install-state checks.
- `install(name, onProgress)` — downloads yt-dlp's single-file executable directly, or ffmpeg's platform-specific static-build archive (zip on mac/Windows, `.tar.xz` on Linux) and extracts it via the system `tar` (auto-detects both formats — the `extract-zip` npm package was tried first and dropped after it was found to hang indefinitely on real archives); reports `{phase, percent}` progress.
- `checkForUpdate(name)` — yt-dlp compares against GitHub's `releases/latest` tag (reliable); ffmpeg does a best-effort per-platform version probe and defaults to "no update" rather than risk a false positive, since static-build hosts don't expose a clean version API.
- IPC: `dependencies:status` / `dependencies:check-update` / `dependencies:install` (all `invoke`/`handle`), `dependencies:progress` (main → renderer `send`/`on`, streamed during an install).

The `download` handler in `index.js` gets both binary paths from `dependencies.getBinaryPath(...)` and refuses (logs + `exit`) if either isn't installed — the UI is expected to keep the Download button disabled until both are, but this is a defensive backstop. Command construction is string concatenation (not an argv array) executed via `bash -c` in `commandante.js` — any path spliced in (e.g. from `dependencies.getBinaryPath()`, which lives under `userData` and routinely contains spaces like "Application Support") must be quoted, or `bash -c` silently word-splits it. Flags added conditionally: `--yes-playlist` + playlist output template when the URL contains `&list=`, `--extract-audio --audio-format mp3` when `extractAudio` is checked, `--write-subs --write-auto-subs --sub-langs "en.*,-live_chat" --convert-subs srt` when `includeCaptions` is checked. ffmpeg is always required (yt-dlp needs it to merge separately-served video+audio streams, not just for audio extraction).

Both `includeComments` and `includeCaptions` follow the same pattern: route yt-dlp's raw output to a per-run scratch dir via a type-specific `--output` template (`infojson:<tmpDir>/%(id)s` / `subtitle:<tmpDir>/%(id)s.%(ext)s`) instead of the real output folder, then in `commandante.onExit` run the corresponding module (`comments.writeReducedComments` / `captions.writeCleanCaptionsFromDir`) to write the cleaned-up file into `outputDir`, and delete the scratch dir either way (success or failure, via try/finally).

When `minLikes > 0`, `--extractor-args "youtube:comment_sort=top;max_comments=1000,200,1000,100"` is also added, sorting by relevance and capping the fetch — this is a real speedup for videos with huge comment sections, but YouTube has no actual "N+ likes" filter, so it's an approximation (top-sorted ≠ strictly likes-descending, and comments outside the cap are never seen). `comments.writeReducedComments` still applies the exact `minLikes` cutoff afterward, so correctness of the final file doesn't depend on the cap. `minTextLength` has no yt-dlp-side equivalent (nothing to fetch faster on) — it's applied only in `writeReducedComments`, alongside `minLikes`.

### `build/`

`build/icons/` holds the app icons consumed by electron-builder; `dist/` (build output, gitignored) is where electron-builder writes packaged apps.
