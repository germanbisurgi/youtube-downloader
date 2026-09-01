# youtube-downloader

An Electron app for downloading YouTube videos/playlists or extracting audio (mp3) via [yt-dlp](https://github.com/yt-dlp/yt-dlp), plus an MCP server exposing the same functionality to an MCP client (Claude Desktop/Code).

## Quick start

```bash
make dev
```

On first launch, click **Install** next to `yt-dlp` and `ffmpeg` in the Dependencies panel — the Download button stays disabled until both finish. No bundled binaries, no admin rights needed; they're downloaded into the app's own data directory and can be updated from the same panel.

If a download fails with `Sign in to confirm you're not a bot`, set **Cookies From Browser** in the form to a browser you're logged into YouTube with (Firefox works out of the box; Chrome/Safari may prompt for Keychain/Full Disk Access).

## Commands

```bash
make help
```

| command | what it does |
|---|---|
| `make dev` | install deps, launch the app |
| `make mcp` | install deps, launch the MCP server (stdio) |
| `make lint` | lint + autofix `./src/frontend` |
| `make build-mac` / `build-linux` / `build-win` / `build-all` | package with electron-builder |
| `make clean` | remove `node_modules`/`dist` |

## MCP server

`src/mcp/server.js` shares the same output folder and yt-dlp/ffmpeg install as the GUI — install the dependencies from the GUI's Dependencies panel first (the MCP server only checks for them via `check_dependencies`, it doesn't install them).

```json
{
  "mcpServers": {
    "youtube-downloader": {
      "command": "node",
      "args": ["/absolute/path/to/youtube-downloader/src/mcp/server.js"]
    }
  }
}
```

Tools: `check_dependencies` (read-only status) and `download_media` (downloads video/audio, optionally captions/comments; blocks until yt-dlp exits and returns its log).

## Building

electron-builder cannot cross-compile native deps — build a platform's target only on that platform. Config is in `package.json` under `"build"`; icons live in `build/`, output goes to `dist/`.
