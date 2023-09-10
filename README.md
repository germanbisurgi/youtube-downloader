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

### The `bin` Folder

The `bin` directory contains precompiled binaries required by the application. These binaries will be copied into the native app during the distribution build process. This approach ensures that the application works seamlessly without requiring users to manually download dependencies. Please note that the paths to these binaries may change between development and production.

### The `dist` Folder

This directory is where electron-builder stores the packaged and compiled versions of the application for distribution.
