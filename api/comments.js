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
    res.status(400).json({ error: 'Missing param' });
    return;
  }
  const targetUrl = `https://khamsat.com/community/requests/${param}`;
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
    }).parent();
    if (commentsHeader.length === 0) {
      return res.status(404).json({ error: 'Comments section not found' });
    }
    // Try to find the closest parent that contains the header and all comments (usually .comments or .card or .box or .comments-list)
    let commentsBlock = commentsHeader.closest('.comments, .card, .box, .comments-list');
    if (!commentsBlock.length) {
      // fallback: get the direct parent
      commentsBlock = commentsHeader.parent();
    }
    res.status(200).json({
      html: commentsBlock.html(),
      outer: $.html(commentsBlock),
      header: commentsHeader.html(),
      headerOuter: $.html(commentsHeader)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
