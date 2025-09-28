// file: /api/comments.js
// Endpoint: /api/comments?param=YOUR_PARAM
// Uses ScrapingBee to bypass AWS WAF protection

const axios = require('axios');
const cheerio = require('cheerio');

// Configure ScrapingBee service
const SCRAPING_SERVICES = {
  scrapingbee: {
    baseUrl: 'https://app.scrapingbee.com/api/v1/',
    // For security, set SCRAPINGBEE_API_KEY in environment variables
    // If not set, fallback to the provided key (not recommended for production)
    apiKey: process.env.SCRAPINGBEE_API_KEY || '3IIK67N8AYAM5ZKSJEE9ZHHKKIT26BVJZ6LJFGFEKJHZ5C1VAAG2955LNDIAO8453L3V7NRJMWGYFA0F',
    params: {
      render_js: 'true',
      premium_proxy: 'true',
      country_code: 'sa', // Saudi Arabia for better Arabic content handling
      wait: '5000', // Wait 5 seconds for dynamic content
      wait_for: '.card-header', // Wait for comments section to load
      block_resources: 'false', // Don't block any resources
      custom_google: 'false', // Use regular proxies
      stealth_proxy: 'true', // Use stealth mode
      session_id: Math.random().toString(36).substring(7) // Random session
    }
  },
  scraperapi: {
    baseUrl: 'https://api.scraperapi.com/',
    apiKey: process.env.SCRAPERAPI_KEY,
    params: {
      render: 'true',
      country_code: 'us'
    }
  },
  zenrows: {
    baseUrl: 'https://api.zenrows.com/v1/',
    apiKey: process.env.ZENROWS_API_KEY,
    params: {
      js_render: 'true',
      premium_proxy: 'true'
    }
  }
};

async function scrapeWithServiceAlternative(targetUrl) {
  // Alternative ScrapingBee settings for stubborn websites
  const alternativeConfig = {
    baseUrl: 'https://app.scrapingbee.com/api/v1/',
    apiKey: process.env.SCRAPINGBEE_API_KEY || '3IIK67N8AYAM5ZKSJEE9ZHHKKIT26BVJZ6LJFGFEKJHZ5C1VAAG2955LNDIAO8453L3V7NRJMWGYFA0F',
    params: {
      render_js: 'true',
      premium_proxy: 'true',
      country_code: 'ae', // Try UAE instead
      wait: '10000', // Wait 10 seconds
      window_width: '1920',
      window_height: '1080',
      extract_rules: JSON.stringify({
        'comments_section': '.card-header h3',
        'full_page': 'body'
      }),
      custom_google: 'false',
      stealth_proxy: 'true',
      session_id: 'khamsat_' + Date.now()
    }
  };

  const requestConfig = {
    params: alternativeConfig.params,
    timeout: 90000, // 90 seconds timeout
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  };

  try {
    console.log('Trying alternative ScrapingBee configuration...');
    const response = await axios.get(alternativeConfig.baseUrl, requestConfig);
    
    if (response.status === 200 && response.data) {
      console.log(`Alternative ScrapingBee success. HTML length: ${response.data.length}`);
      return response.data;
    } else {
      throw new Error(`Alternative ScrapingBee returned status ${response.status}`);
    }
  } catch (error) {
    if (error.response) {
      console.error('Alternative ScrapingBee API error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      throw new Error(`Alternative ScrapingBee API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      throw new Error(`Alternative ScrapingBee request failed: ${error.message}`);
    }
  }
}

async function scrapeWithService(targetUrl, service = 'scrapingbee') {
  const config = SCRAPING_SERVICES[service];
  if (!config || !config.apiKey) {
    throw new Error(`${service} API key not configured`);
  }

  console.log(`Using ScrapingBee to scrape: ${targetUrl}`);
  
  const requestUrl = config.baseUrl;
  const requestConfig = {
    params: {
      api_key: config.apiKey,
      url: targetUrl,
      ...config.params
    },
    timeout: 60000,
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  };

  try {
    const response = await axios.get(requestUrl, requestConfig);
    
    // Check if we got a successful response
    if (response.status === 200 && response.data) {
      console.log(`ScrapingBee success. HTML length: ${response.data.length}`);
      return response.data;
    } else {
      throw new Error(`ScrapingBee returned status ${response.status}`);
    }
  } catch (error) {
    if (error.response) {
      // ScrapingBee returned an error response
      console.error('ScrapingBee API error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      throw new Error(`ScrapingBee API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      // Network or other error
      throw new Error(`ScrapingBee request failed: ${error.message}`);
    }
  }
}

module.exports = async (req, res) => {
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
    // Get param from query string only (Vercel serverless style)
    const param = req.query.param;

    if (!param) {
      return res.status(400).json({ 
        error: 'Missing param',
        usage: 'Use /api/comments?param=YOUR_PARAM_HERE',
        example: '/api/comments?param=769858-%D8%B7%D9%84%D8%A8-%D9%85%D8%B5%D9%85%D9%85-%D9%84%D9%88%D9%82%D9%88'
      });
    }

    if (typeof param !== 'string' || param.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid param format' });
    }

    const targetUrl = `https://khamsat.com/community/requests/${encodeURIComponent(param.trim())}`;

    // Try ScrapingBee first (since you have the API key)
    let html = null;
    let usedService = null;
    let lastError = null;

    try {
      console.log(`Trying ScrapingBee for URL: ${targetUrl}`);
      html = await scrapeWithService(targetUrl, 'scrapingbee');
      
      // Check if we got real content
      if (html && html.length > 50000) { // توقع على الأقل 50KB للصفحة الكاملة
        console.log(`ScrapingBee success. HTML length: ${html.length}`);
        usedService = 'scrapingbee';
      } else {
        console.log(`ScrapingBee returned small content: ${html ? html.length : 0} chars`);
        // Try again with different settings
        console.log('Retrying with different ScrapingBee settings...');
        html = await scrapeWithServiceAlternative(targetUrl);
        if (html && html.length > 50000) {
          usedService = 'scrapingbee-alternative';
        } else {
          throw new Error(`Received incomplete content. HTML length: ${html ? html.length : 0}. Expected: >50KB`);
        }
      }
    } catch (error) {
      console.error('ScrapingBee failed:', error.message);
      lastError = error;
    }

    if (!html || html.length < 50000) { // توقع على الأقل 50KB للصفحة الكاملة
      return res.status(500).json({
        error: 'ScrapingBee returned incomplete content',
        message: 'The scraped content is too short, likely blocked or incomplete',
        htmlLength: html ? html.length : 0,
        expectedMinLength: 50000,
        lastError: lastError ? lastError.message : 'Content too short',
        targetUrl,
        suggestion: 'The website might be detecting and blocking the scraper',
        timestamp: new Date().toISOString()
      });
    }

    // Parse with cheerio
    const $ = cheerio.load(html);
    
    let commentsCount = null;
    let selectorUsed = '';
    let headerText = '';
    let debugInfo = {
      htmlLength: html.length,
      containsCommentsText: html.includes('التعليقات'),
      commentsTextPositions: [] // مواضع كلمة التعليقات في النص
    };

    // البحث عن مواضع كلمة "التعليقات" في النص
    let searchIndex = 0;
    while ((searchIndex = html.indexOf('التعليقات', searchIndex)) !== -1) {
      debugInfo.commentsTextPositions.push(searchIndex);
      searchIndex += 'التعليقات'.length;
    }

    // Strategy 1: البحث المباشر في النص بـ regex في النطاق المتوقع
    // البحث في النصف الثاني من الصفحة حيث عادة تكون التعليقات
    const startSearchFrom = Math.max(0, Math.floor(html.length * 0.4)); // من 40% من بداية الصفحة
    const searchRange = html.substring(startSearchFrom);
    
    const htmlRegexMatch = searchRange.match(/التعليقات\s*\((\d+)\)/);
    if (htmlRegexMatch && htmlRegexMatch[1]) {
      commentsCount = parseInt(htmlRegexMatch[1], 10);
      selectorUsed = 'regex on HTML range (40%-100%)';
      headerText = htmlRegexMatch[0];
      debugInfo.foundAt = startSearchFrom + searchRange.indexOf(htmlRegexMatch[0]);
    }

    // Strategy 2: البحث في كامل النص إذا لم نجد في النطاق المحدد
    if (commentsCount === null) {
      const fullHtmlMatch = html.match(/التعليقات\s*\((\d+)\)/);
      if (fullHtmlMatch && fullHtmlMatch[1]) {
        commentsCount = parseInt(fullHtmlMatch[1], 10);
        selectorUsed = 'regex on full HTML';
        headerText = fullHtmlMatch[0];
        debugInfo.foundAt = html.indexOf(fullHtmlMatch[0]);
      }
    }

    // Strategy 3: CSS selectors
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

    // Strategy 4: البحث الأكثر مرونة بأنماط مختلفة
    if (commentsCount === null && html.includes('التعليقات')) {
      const patterns = [
        /التعليقات[^\d]*(\d+)[^\d]/,
        /(\d+)[^\d]*تعليق/,
        /comment[^\d]*(\d+)/i,
        /replies?[^\d]*(\d+)/i
      ];
      
      for (const pattern of patterns) {
        const match = searchRange.match(pattern) || html.match(pattern);
        if (match && match[1] && parseInt(match[1]) > 0 && parseInt(match[1]) < 1000) { // تحقق من أن الرقم منطقي
          commentsCount = parseInt(match[1], 10);
          selectorUsed = `flexible pattern: ${pattern.toString()}`;
          headerText = match[0];
          break;
        }
      }
    }

    // Fallback: Count actual comment elements
    let actualCommentsCount = null;
    const commentElements = $('.discussion-item.comment, .comment[data-id], [data-id^="973"]');
    if (commentElements.length > 0) {
      actualCommentsCount = commentElements.length;
      debugInfo.actualCommentElements = commentElements.length;
    }

    return res.status(200).json({
      commentsCount,
      actualCommentsCount,
      targetUrl,
      found: commentsCount !== null,
      method: usedService,
      selectorUsed,
      headerText,
      htmlLength: html.length,
      debug: debugInfo,
      success: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Scraping service error:', error);
    return res.status(500).json({
      error: 'Scraping failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};