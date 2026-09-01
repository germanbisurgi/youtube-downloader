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
  const likesFilterActive = minLikes > 0
  const comments = (data.comments || [])
    .map(reduceComment)
    .filter((comment) => {
      if (comment.like_count < minLikes) return false
      // a comment that clears an active minLikes threshold is exempt from minTextLength
      return likesFilterActive || comment.text.length >= minTextLength
    })
    .sort((a, b) => b.like_count - a.like_count)
  fs.writeFileSync(outputPath, JSON.stringify(comments, null, 2))
}

module.exports = { writeReducedComments }
