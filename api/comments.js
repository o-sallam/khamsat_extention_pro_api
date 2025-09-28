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
    throw new Error(`Fetch failed: ${error.message}`);
  }
}

async function tryMultipleProxies(targetUrl, originalConfig) {
  const proxies = [
    // Proxy 1: AllOrigins
    {
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      config: {
        headers: originalConfig.headers,
        timeout: 30000,
      }
    },
    // Proxy 2: CORS Anywhere alternative
    {
      url: `https://cors-anywhere.herokuapp.com/${targetUrl}`,
      config: {
        headers: {
          ...originalConfig.headers,
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 30000,
      }
    },
    // Proxy 3: Another CORS proxy
    {
      url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
      config: {
        headers: {
          'User-Agent': originalConfig.headers['User-Agent'],
        },
        timeout: 30000,
      }
    }
  ];

  for (const proxy of proxies) {
    try {
      console.log(`Trying proxy: ${proxy.url.split('?')[0]}`);
      const result = await fetchAndExtract(proxy.url, proxy.config);
      
      // Check if we got the actual content (not a challenge page)
      if (result.html && 
          result.html.length > 5000 && 
          !result.html.includes('awsWafCookieDomainList') &&
          !result.html.includes('challenge-container')) {
        return result;
      }
    } catch (error) {
      console.error(`Proxy failed: ${error.message}`);
      continue;
    }
  }
  
  return null;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    // Get param from query or from dynamic route
    let param = req.query.param;
    
    if (!param && req.query && Object.keys(req.query).length > 0) {
      param = req.query.param;
    }
    
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

    if (typeof param !== 'string' || param.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid param format' });
    }

    param = param.trim();
    const targetUrl = `https://khamsat.com/community/requests/${encodeURIComponent(param)}`;

    // Enhanced browser-like config to avoid WAF detection
    const axiosConfig = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Referer': 'https://khamsat.com/',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        // Add session-like headers
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
      decompress: true,
    };

    let fetched = null;
    let lastError = null;
    let method = '';

    // Attempt 1: Direct fetch with enhanced headers
    try {
      console.log(`Direct fetch attempt: ${targetUrl}`);
      fetched = await fetchAndExtract(targetUrl, axiosConfig);
      
      // Check if we got AWS WAF challenge
      if (fetched.html && (fetched.html.includes('awsWafCookieDomainList') || 
                          fetched.html.includes('challenge-container') ||
                          fetched.html.length < 5000)) {
        console.log('AWS WAF challenge detected, trying proxies...');
        fetched = null;
      } else {
        method = 'direct';
      }
      
    } catch (error) {
      console.error('Direct fetch failed:', error.message);
      lastError = error;
    }

    // Attempt 2: Try multiple proxy services
    if (!fetched) {
      try {
        fetched = await tryMultipleProxies(targetUrl, axiosConfig);
        if (fetched) method = 'proxy';
      } catch (proxyError) {
        console.error('All proxies failed:', proxyError.message);
        lastError = proxyError;
      }
    }

    // If all attempts failed
    if (!fetched || !fetched.html) {
      return res.status(500).json({ 
        error: 'Unable to bypass WAF protection',
        message: 'The target website is protected by AWS WAF and all proxy attempts failed',
        targetUrl,
        suggestion: 'Try using a browser automation service like Puppeteer or Playwright',
        lastError: lastError ? lastError.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }

    // Parse the HTML
    const $ = cheerio.load(fetched.html);
    
    let commentsCount = null;
    let selectorUsed = '';
    let headerText = '';

    // Strategy 1: Direct regex search on raw HTML
    const htmlRegexMatch = fetched.html.match(/التعليقات\s*\((\d+)\)/);
    if (htmlRegexMatch && htmlRegexMatch[1]) {
      commentsCount = parseInt(htmlRegexMatch[1], 10);
      selectorUsed = 'regex on raw HTML';
      headerText = htmlRegexMatch[0];
    }

    // Strategy 2: CSS selectors
    if (commentsCount === null) {
      const headerEl = $('div.card-header.bg-white h3, div.card-header h3, h3').filter(function() {
        const text = $(this).text().trim();
        return text.includes('التعليقات') && text.match(/\(\d+\)/);
      }).first();

      if (headerEl.length > 0) {
        headerText = headerEl.text().trim();
        selectorUsed = 'CSS selector';
        
        const match = headerText.match(/التعليقات\s*\((\d+)\)/);
        if (match && match[1]) {
          commentsCount = parseInt(match[1], 10);
        }
      }
    }

    // Fallback: Count actual comment elements
    let actualCommentsCount = null;
    const commentElements = $('.discussion-item.comment, .comment, [data-id^="973"]');
    if (commentElements.length > 0) {
      actualCommentsCount = commentElements.length;
    }

    // Success response
    return res.status(200).json({ 
      commentsCount,
      actualCommentsCount,
      targetUrl,
      found: commentsCount !== null,
      method,
      selectorUsed,
      headerText,
      htmlLength: fetched.html.length,
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