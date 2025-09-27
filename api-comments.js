const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // Support both /api/comments/[param] and query param
  const param = req.query.param || (req.url.split('/').pop());
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
    res.status(200).json({
      html: commentsHeader.html(),
      outer: $.html(commentsHeader)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
