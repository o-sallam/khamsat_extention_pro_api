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
    // Proxy support (set HTTP_PROXY or HTTPS_PROXY env vars if needed)
    const axiosConfig = {
      headers: {
        // Full browser-like headers
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://khamsat.com/',
        // Optional: add a valid cookie string if needed
        // 'Cookie': 'your_cookie_here'
      }
    };
    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    if (httpProxy || httpsProxy) {
      // Use 'https-proxy-agent' for proxying axios requests
      const HttpsProxyAgent = require('https-proxy-agent');
      axiosConfig.httpsAgent = new HttpsProxyAgent(httpsProxy || httpProxy);
      axiosConfig.proxy = false; // disable axios default proxy handling
    }
    const response = await axios.get(targetUrl, axiosConfig);
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
