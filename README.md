# youtube-downloader

This repository contains an Electron application that serves as a user interface (UI) for [yt-dlp](https://github.com/yt-dlp/yt-dlp), offering various features for downloading videos and playlists, as well as extracting audio (mp3) from both single videos and playlists.

## Installation and Development Setup

You can get started with the development of this application using either NPM or Yarn. Here are the steps:

Using NPM:
```bash
npm install
npm run electron
```

Using Yarn:
```bash
yarn install
yarn electron
```

On first launch, click **Install** next to `yt-dlp` and `ffmpeg` in the Dependencies panel at the top of the window — the Download button stays disabled until both finish installing.

## Building the Application

This project utilizes [electron-builder](https://www.electron.build/) to package and create distributable versions of the Electron app for macOS, Windows, and Linux.

The configuration schema for electron-builder can be found in the `package.json` file under the `"build"` key.

To trigger the build process, you can use the following scripts:

Using NPM:
```bash
npm run build-linux
npm run build-mac
npm run build-win
```

Using Yarn:
```bash
yarn build-linux
yarn build-mac
yarn build-win
```

**Important Note:** According to the electron-builder documentation, you cannot expect to build an app for all platforms on just one platform. If your app has native dependencies, it can only be compiled on the target platform where it is intended to run.

### The `build` Folder

This folder serves as a lookup location for icons used by electron-builder during the build process.

### Managed dependencies (yt-dlp / ffmpeg)

This app does not bundle `yt-dlp` or `ffmpeg`. Instead, a "Dependencies" panel in the UI lets you install them on demand: it downloads the official upstream build for your OS (yt-dlp from its GitHub releases; ffmpeg from a platform-appropriate static build) into the app's own data directory, so no admin rights or system package manager are required. The same panel checks for and installs updates.

### The `dist` Folder

This directory is where electron-builder stores the packaged and compiled versions of the application for distribution.
