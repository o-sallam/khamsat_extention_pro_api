const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

// GET /comments/:param
app.get('/comments/:param', async (req, res) => {
  const { param } = req.params;
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

    // You can return the header itself, or the parent comments block if needed
    res.json({
      html: commentsHeader.html(),
      outer: $.html(commentsHeader)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
