// file: /api/comments/[param].js  (or run locally as a .js file)
const axios = require('axios');
const cheerio = require('cheerio');

async function fetchAndExtract(targetUrl, axiosConfig = {}) {
  const resp = await axios.get(targetUrl, axiosConfig);
  const html = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
  return { status: resp.status, headers: resp.headers, html };
}

module.exports = async (req, res) => {
  try {
    // get param from query or from dynamic route
    let param = req.query.param;
    if (!param && req.url) {
      const m = req.url.match(/comments\/?([^/?&]+)/);
      if (m && m[1]) param = decodeURIComponent(m[1]);
    }
    if (!param) return res.status(400).json({ error: 'Missing param' });

    // build target (if your param already encoded/contains arabic adjust accordingly)
    const targetUrl = `https://khamsat.com/community/requests/${encodeURIComponent(param)}`;

    // axios headers that mimic a real browser
    const axiosConfig = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://khamsat.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400 // still accept 3xx to inspect redirects
    };

    // 1) Try direct fetch
    let attempt = 1;
    let fetched;
    try {
      fetched = await fetchAndExtract(targetUrl, axiosConfig);
    } catch (e) {
      // print error and try fallback below
      console.error('Direct fetch error:', e.message || e.toString());
    }

    // If direct fetch didn't return HTML or returned 202/empty, try AllOrigins proxy as fallback
    if (!fetched || !fetched.html || fetched.status === 202 || fetched.html.length < 100) {
      attempt = 2;
      const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl);
      try {
        fetched = await fetchAndExtract(proxyUrl, {
          headers: {
            'User-Agent': axiosConfig.headers['User-Agent'],
            'Accept-Language': axiosConfig.headers['Accept-Language'],
          },
          timeout: 20000,
        });
      } catch (e) {
        console.error('Proxy fetch error:', e.message || e.toString());
      }
    }

    if (!fetched || !fetched.html) {
      return res.status(500).json({ error: 'Failed to fetch HTML', attempt, details: 'No HTML in response' });
    }

    // Debug: return status and a preview of html (first 1000 chars)
    const htmlPreview = fetched.html.substring(0, 1000);

    // Load into cheerio and try to select the header
    const $ = cheerio.load(fetched.html);
    const headerEl = $('div.card-header.bg-white h3').filter(function() {
      return $(this).text().trim().startsWith('التعليقات');
    }).first();

    if (headerEl.length === 0) {
      // Not found — return only commentsCount: null
      return res.status(200).json({ commentsCount: null });
    }

    // Found: extract comments count from header text
    const headerText = headerEl.text().trim();
    let commentsCount = null;
    const match = headerText.match(/التعليقات\s*\((\d+)\)/);
    if (match && match[1]) {
      commentsCount = parseInt(match[1], 10);
    }
    return res.status(200).json({ commentsCount });

  } catch (err) {
    console.error('Unexpected error', err);
    return res.status(500).json({ error: 'Unexpected error', details: err.message || err.toString() });
  }
};
