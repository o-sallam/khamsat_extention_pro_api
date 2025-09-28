// This file is for Vercel serverless deployment.
// Place this file in /api/comments.js or /api/comments/[param].js as per Vercel's convention.
const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // Support both /api/comments/[param] and query param
  let param = req.query.param;
  if (!param && req.url) {
    // Vercel dynamic route: /api/comments/[param]
    const matches = req.url.match(/comments\/?([^/?&]+)/);
    if (matches && matches[1]) param = matches[1];
  }
  if (!param) {
    return res.status(400).json({ error: 'Missing param', param });
  }
  // Handle Arabic and URL encoding
  try {
    param = decodeURIComponent(param);
  } catch (e) {
    // ignore, use as is
  }
  const targetUrl = `https://khamsat.com/community/requests/${encodeURIComponent(param)}`;
  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)'
      }
    });
    const html = response.data;
    const $ = cheerio.load(html);
    // Find the comments section header
    const commentsHeader = $('div.card-header.bg-white h3').filter(function() {
      return $(this).text().trim().startsWith('التعليقات');
    });
    let commentsCount = null;
    if (commentsHeader.length > 0) {
      // Extract number from: التعليقات (7)
      const text = commentsHeader.text();
      const match = text.match(/التعليقات\s*\((\d+)\)/);
      if (match && match[1]) {
        commentsCount = parseInt(match[1], 10);
      }
    }
    const commentsHeaderDiv = commentsHeader.parent();
    if (commentsHeaderDiv.length === 0) {
      return res.status(404).json({ error: 'Comments section not found', param });
    }
    // Try to find the closest parent that contains the header and all comments (usually .comments or .card or .box or .comments-list)
    let commentsBlock = commentsHeaderDiv.closest('.comments, .card, .box, .comments-list');
    if (!commentsBlock.length) {
      // fallback: get the direct parent
      commentsBlock = commentsHeaderDiv.parent();
    }
    res.status(200).json({
      commentsCount,
      html: commentsBlock.html(),
      outer: $.html(commentsBlock),
      header: commentsHeaderDiv.html(),
      headerOuter: $.html(commentsHeaderDiv)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch or parse comments', details: err.message, param });
  }
};
