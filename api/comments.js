// file: /api/comments/[param].js (for Vercel/Next.js dynamic routing)
// OR: /api/comments.js (for query-based routing)

const axios = require('axios');
const cheerio = require('cheerio');

async function fetchAndExtract(targetUrl, axiosConfig = {}) {
  try {
    const resp = await axios.get(targetUrl, axiosConfig);
    const html = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    return { status: resp.status, headers: resp.headers, html };
  } catch (error) {
    // Re-throw with more context
    throw new Error(`Fetch failed: ${error.message}`);
  }
}

module.exports = async (req, res) => {
  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    // Get param from query or from dynamic route
    let param = req.query.param;
    
    // For dynamic routing: /api/comments/[param].js
    if (!param && req.query && Object.keys(req.query).length > 0) {
      // In dynamic routing, the param will be in req.query.param
      param = req.query.param;
    }
    
    // Fallback: parse from URL path
    if (!param && req.url) {
      const urlMatch = req.url.match(/\/api\/comments\/?([^/?&]+)/);
      if (urlMatch && urlMatch[1]) {
        param = decodeURIComponent(urlMatch[1]);
      }
    }

    if (!param) {
      return res.status(400).json({ 
        error: 'Missing param', 
        usage: 'Use /api/comments/[param] or /api/comments?param=[value]' 
      });
    }

    // Validate param (basic sanitization)
    if (typeof param !== 'string' || param.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid param format' });
    }

    param = param.trim();

    // Build target URL
    const targetUrl = `https://khamsat.com/community/requests/${encodeURIComponent(param)}`;

    // Enhanced axios config with better browser mimicking
    const axiosConfig = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Referer': 'https://khamsat.com/',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 25000,
      maxRedirects: 3,
      validateStatus: status => status >= 200 && status < 400,
      // Handle compressed responses
      decompress: true,
    };

    let fetched = null;
    let lastError = null;

    // Attempt 1: Direct fetch
    try {
      console.log(`Attempting direct fetch: ${targetUrl}`);
      fetched = await fetchAndExtract(targetUrl, axiosConfig);
      
      // Validate response
      if (!fetched.html || fetched.html.length < 100) {
        throw new Error('Response too short or empty');
      }
      
    } catch (error) {
      console.error('Direct fetch failed:', error.message);
      lastError = error;
    }

    // Attempt 2: Proxy fallback if direct fetch failed
    if (!fetched || !fetched.html || fetched.html.length < 100) {
      try {
        console.log('Trying proxy fallback...');
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        
        const proxyConfig = {
          headers: {
            'User-Agent': axiosConfig.headers['User-Agent'],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          },
          timeout: 25000,
          maxRedirects: 2,
        };
        
        fetched = await fetchAndExtract(proxyUrl, proxyConfig);
        
        if (!fetched.html || fetched.html.length < 100) {
          throw new Error('Proxy response too short or empty');
        }
        
      } catch (proxyError) {
        console.error('Proxy fetch failed:', proxyError.message);
        lastError = proxyError;
      }
    }

    // If both attempts failed
    if (!fetched || !fetched.html) {
      return res.status(500).json({ 
        error: 'Failed to fetch content from target URL',
        targetUrl,
        lastError: lastError ? lastError.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }

    // Load HTML into cheerio for parsing
    const $ = cheerio.load(fetched.html);
    
    // Look for the comments header element
    const headerEl = $('div.card-header.bg-white h3').filter(function() {
      const text = $(this).text().trim();
      return text.includes('التعليقات') || text.includes('تعليق');
    }).first();

    // Default response
    let commentsCount = null;

    if (headerEl.length > 0) {
      const headerText = headerEl.text().trim();
      console.log('Found header text:', headerText);
      
      // Try multiple regex patterns for Arabic comments
      const patterns = [
        /التعليقات\s*\((\d+)\)/,
        /تعليق\s*\((\d+)\)/,
        /التعليقات\s*:\s*(\d+)/,
        /(\d+)\s*تعليق/,
        /\((\d+)\)/
      ];
      
      for (const pattern of patterns) {
        const match = headerText.match(pattern);
        if (match && match[1]) {
          commentsCount = parseInt(match[1], 10);
          break;
        }
      }
    }

    // Success response
    return res.status(200).json({ 
      commentsCount,
      targetUrl,
      found: headerEl.length > 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || error.toString(),
      timestamp: new Date().toISOString()
    });
  }
};