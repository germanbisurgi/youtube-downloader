const fs = require('fs')

// yt-dlp can only place comments inside its full .info.json (video formats, thumbnails,
// etc. included), and each raw comment itself carries fields (author_thumbnail URLs,
// author_url, ids, ...) nobody asked for. This keeps only what's useful to read.
const reduceComment = (comment) => ({
  author: comment.author,
  text: comment.text,
  like_count: comment.like_count
})

const writeReducedComments = (infoJsonPath, outputPath, minLikes = 0, minTextLength = 0) => {
  const data = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'))
  const comments = (data.comments || [])
    .map(reduceComment)
    .filter((comment) => comment.like_count >= minLikes && comment.text.length >= minTextLength)
    .sort((a, b) => b.like_count - a.like_count)
  fs.writeFileSync(outputPath, JSON.stringify(comments, null, 2))
}

module.exports = { writeReducedComments }
