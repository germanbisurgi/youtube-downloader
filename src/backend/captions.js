const fs = require('fs')
const path = require('path')

// A cue's index/timestamp lines are matched by content rather than assumed to always be
// the block's first two lines — some converted .srt files insert stray blank lines that
// shift that position, which used to let a timestamp line slip through as caption text.
const isCueIndexLine = (line) => /^\d+$/.test(line)
const isTimestampLine = (line) => /^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(line)

// YouTube's auto-generated captions "roll up": each cue repeats the previous cue's text
// plus one new line, so naively reading the .srt is full of duplicated lines. Dropping any
// line identical to the last kept one reconstructs the original flowing transcript.
const writeCleanCaptions = (srtPath, outputPath) => {
  const content = fs.readFileSync(srtPath, 'utf8')

  const lines = []
  let lastLine = null
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || isCueIndexLine(line) || isTimestampLine(line) || line === lastLine) continue
    lines.push(line)
    lastLine = line
  }

  fs.writeFileSync(outputPath, lines.join(' ') + '\n')
}

// yt-dlp can surface more than one English track per video (e.g. a translated "en"
// alongside the original-language "en-orig" auto-caption) — this picks one per video id
// so a video doesn't end up with two near-identical caption files.
const writeCleanCaptionsFromDir = (subsDir, outputDir) => {
  const files = fs.readdirSync(subsDir).filter((file) => file.endsWith('.srt'))
  const byId = {}
  for (const file of files) {
    const id = file.split('.')[0]
    byId[id] = byId[id] || []
    byId[id].push(file)
  }

  for (const [id, candidates] of Object.entries(byId)) {
    const chosen = candidates.find((file) => file === id + '.en.srt') || candidates[0]
    writeCleanCaptions(path.join(subsDir, chosen), path.join(outputDir, id + '.captions.md'))
  }
}

module.exports = { writeCleanCaptionsFromDir }
