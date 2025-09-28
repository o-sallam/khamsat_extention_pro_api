// file: /api/comments.js
// Endpoint: /api/comments?param=YOUR_PARAM
// Uses ScrapingBee to bypass AWS WAF protection

const axios = require('axios');
const cheerio = require('cheerio');

// Configure ScrapingBee service
const SCRAPING_SERVICES = {
  scrapingbee: {
    baseUrl: 'https://app.scrapingbee.com/api/v1/',
    apiKey: process.env.SCRAPINGBEE_API_KEY || '3IIK67N8AYAM5ZKSJEE9ZHHKKIT26BVJZ6LJFGFEKJHZ5C1VAAG2955LNDIAO8453L3V7NRJMWGYFA0F',
    params: {
      render_js: 'true',
      premium_proxy: 'true',
      wait: '500',
      block_resources: 'false', // ScrapingBee recommended this
      stealth_proxy: 'true'
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
  // Simplified alternative settings
  const config = SCRAPING_SERVICES.scrapingbee; // استخدم نفس الإعدادات الأساسية
  
  const alternativeParams = {
    api_key: config.apiKey, // تأكد من إرسال API key
    url: targetUrl,
    render_js: 'true',
    wait: '500' // Just wait longer
  };

  const requestConfig = {
    params: alternativeParams,
    timeout: 60000,
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  };

  try {
    console.log('Trying simplified ScrapingBee configuration...');
    console.log('API Key present:', config.apiKey ? 'Yes' : 'No');
    const response = await axios.get(config.baseUrl, requestConfig);
    
    if (response.status === 200 && response.data) {
      console.log(`Simplified ScrapingBee success. HTML length: ${response.data.length}`);
      return response.data;
    } else {
      throw new Error(`Simplified ScrapingBee returned status ${response.status}`);
    }
  } catch (error) {
    if (error.response) {
      console.error('Simplified ScrapingBee API error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      throw new Error(`Simplified ScrapingBee API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      throw new Error(`Simplified ScrapingBee request failed: ${error.message}`);
    }
  }
}

async function scrapeWithService(targetUrl, service = 'scrapingbee') {
  const config = SCRAPING_SERVICES[service];
  if (!config || !config.apiKey) {
    throw new Error(`${service} API key not configured`);
  }

  console.log(`Using ScrapingBee to scrape: ${targetUrl}`);
  console.log(`API Key present: ${config.apiKey ? 'Yes' : 'No'}`);
  
  const requestParams = {
    api_key: config.apiKey,
    url: targetUrl,
    ...config.params
  };

  const requestConfig = {
    params: requestParams,
    timeout: 2000,
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  };

  try {
    const response = await axios.get(config.baseUrl, requestConfig);
    
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

    // Strategy 3: CSS selectors بالترتيب الصحيح
    if (commentsCount === null) {
      // البحث المحدد: div.card-header.bg-white h3 بالضبط
      let headerEl = $('div.card-header.bg-white h3').filter(function() {
        const text = $(this).text().trim();
        return text.includes('التعليقات') && text.match(/\(\d+\)/);
      });
      
      // إذا لم نجد، جرب بدون bg-white
      if (headerEl.length === 0) {
        headerEl = $('div.card-header h3').filter(function() {
          const text = $(this).text().trim();
          return text.includes('التعليقات') && text.match(/\(\d+\)/);
        });
      }
      
      // إذا لم نجد، جرب أي h3
      if (headerEl.length === 0) {
        headerEl = $('h3').filter(function() {
          const text = $(this).text().trim();
          return text.includes('التعليقات') && text.match(/\(\d+\)/);
        });
      }

      if (headerEl.length > 0) {
        headerText = headerEl.first().text().trim();
        selectorUsed = 'CSS selector: ' + (headerEl.is('div.card-header.bg-white h3') ? 'div.card-header.bg-white h3' : 
                                          headerEl.is('div.card-header h3') ? 'div.card-header h3' : 'h3');
        
        const match = headerText.match(/التعليقات\s*\((\d+)\)/);
        if (match && match[1]) {
          commentsCount = parseInt(match[1], 10);
        }
        
        // إضافة معلومات debug للعنصر الموجود
        debugInfo.cssSelector = {
          found: true,
          elementTag: headerEl[0].tagName,
          elementClasses: headerEl.attr('class'),
          parentClasses: headerEl.parent().attr('class'),
          fullText: headerText
        };
      } else {
        debugInfo.cssSelector = {
          found: false,
          cardHeadersFound: $('div.card-header').length,
          cardHeadersBgWhiteFound: $('div.card-header.bg-white').length,
          h3ElementsFound: $('h3').length,
          h3WithCommentsFound: $('h3:contains("التعليقات")').length
        };
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

    // Fallback: Count actual comment elements (البحث عن عناصر التعليقات الفعلية)
    let actualCommentsCount = null;
    const commentElements = $('.discussion-item.comment, .comment[data-id], [data-commentable-id]');
    if (commentElements.length > 0) {
      actualCommentsCount = commentElements.length;
      debugInfo.actualCommentElements = commentElements.length;
      
      // إذا لم نجد العدد في الهيدر، استخدم العدد الفعلي
      if (commentsCount === null && actualCommentsCount > 0) {
        commentsCount = actualCommentsCount;
        selectorUsed = 'counted actual comment elements';
        headerText = `تم عد ${actualCommentsCount} تعليق`;
      }
    }
    
    // معلومات إضافية للتصحيح
    debugInfo.elementCounts = {
      cardHeaders: $('div.card-header').length,
      cardHeadersBgWhite: $('div.card-header.bg-white').length,
      h3Elements: $('h3').length,
      commentElements: commentElements.length,
      commentsTextOccurrences: debugInfo.commentsTextPositions.length
    };

    return res.status(200).json({ commentsCount });

  } catch (error) {
    console.error('Scraping service error:', error);
    return res.status(500).json({
      error: 'Scraping failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};