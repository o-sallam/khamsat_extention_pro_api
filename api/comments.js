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
      country_code: 'sa', // Changed to Saudi Arabia for better Arabic content handling
      wait: '2000' // Wait 2 seconds for dynamic content
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
    const services = ['scrapingbee'];
    let html = null;
    let usedService = null;
    let lastError = null;

    for (const service of services) {
      try {
        console.log(`Trying ${service} for URL: ${targetUrl}`);
        html = await scrapeWithService(targetUrl, service);
        
        // Validate we got real content, not an error page
        if (html && html.length > 5000 && !html.includes('awsWafCookieDomainList')) {
          usedService = service;
          break;
        } else {
          throw new Error('Received invalid or incomplete content');
        }
      } catch (error) {
        console.error(`${service} failed:`, error.message);
        lastError = error;
        continue;
      }
    }

    if (!html) {
      return res.status(500).json({
        error: 'ScrapingBee request failed',
        message: 'Unable to fetch content using ScrapingBee',
        lastError: lastError ? lastError.message : 'Unknown error',
        targetUrl,
        suggestion: 'Check your ScrapingBee API key and account credits',
        timestamp: new Date().toISOString()
      });
    }

    // Parse with cheerio
    const $ = cheerio.load(html);
    
    let commentsCount = null;
    let selectorUsed = '';
    let headerText = '';

    // Strategy 1: Direct regex search
    const htmlRegexMatch = html.match(/التعليقات\s*\((\d+)\)/);
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
    const commentElements = $('.discussion-item.comment');
    if (commentElements.length > 0) {
      actualCommentsCount = commentElements.length;
    }

    return res.status(200).json({
      commentsCount,
      actualCommentsCount,
      targetUrl,
      found: commentsCount !== null,
      method: 'scrapingbee',
      selectorUsed,
      headerText,
      htmlLength: html.length,
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