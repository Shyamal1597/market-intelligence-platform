import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import { promises as fs } from "fs";
import path from "path";
import * as cheerio from "cheerio";

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "media"],
      ["enclosure", "enclosure"],
      ["media:thumbnail", "thumbnail"],
    ],
  },
});

const RSS_FEEDS = [
  // --- Livemint ---
  "https://www.livemint.com/rss/companies",
  "https://www.livemint.com/rss/markets",
  "https://www.livemint.com/rss/industry",
  // --- Economic Times ---
  "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
  "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
  // --- Moneycontrol ---
  "https://www.moneycontrol.com/rss/marketreports.xml",
  "https://www.moneycontrol.com/rss/business.xml",
  // --- NDTV Profit ---
  "https://www.ndtv.com/business/rss",
  // --- BQ Prime (Bloomberg India) ---
  "https://www.bqprime.com/feeds/rss",
  // --- Business Standard ---
  "https://www.business-standard.com/rss/latest.rss",
  // --- The Hindu / Times of India ---
  "http://www.thehindu.com/business/?service=rss",
  "http://timesofindia.indiatimes.com/rssfeeds/1898055.cms",
  // --- Global ---
  "https://www.marketwatch.com/rss/topstories",
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://www.ft.com/markets",
  "https://www.ft.com/companies",
];

const SITEMAP_FEEDS = [
  "https://www.reuters.com/arc/outboundfeeds/news-sitemap-index/?outputType=xml",
];

const MAX_NEWS_ITEMS = 200;
const MAX_ITEMS_PER_FEED = 15; // Increased from 5 to get more articles per feed

// Market News Filter - Filters out non-market related news
function isMarketNews(title: string, content: string, link: string): boolean {
  const fullText = (title + ' ' + content).toLowerCase();
  const lowerLink = (link || '').toLowerCase();

  // 1. URL TOPIC BLOCKLIST (Strongest Signal)
  const blockedUrlPatterns = [
    '/sports/', '/sport/', '/entertainment/', '/life/', '/lifestyle/',
    '/politics/', '/world/', '/science/', '/travel/', '/food/',
    '/health/', '/living/', '/arts/', '/culture/', '/style/'
  ];

  if (blockedUrlPatterns.some(pattern => lowerLink.includes(pattern))) {
    return false;
  }

  // STRICT EXCLUSIONS - Must filter these out first
  const strictExclusionKeywords = [
    // Entertainment & Celebrity
    'actor', 'actress', 'celebrity', 'bollywood', 'hollywood',
    'movie star', 'film star', 'musician', 'singer', 'performer',
    // Sports & Athletes - EXPANDED
    'cricket', 'football', 'tennis', 'golf', 'basketball', 'baseball',
    'soccer', 'athlete', 'player', 'tournament', 'championship',
    'world cup', 'olympics', 'sports match', 'sporting event',
    'tennis star', 'cricket star', 'football star', 'hockey', 'badminton',
    'wrestling', 'boxing', 'formula 1', 'f1', 'race', 'racing',
    'league', 'premier league', 'ipl', 'nfl', 'nba', 'mlb', 'nhl',
    'score', 'vs', 'versus', 'playoff', 'semi-final',
    'quarter-final', 'medal', 'trophy', 'stadium',
    // Real Estate (Celebrity/Personal)
    'celebrity home', 'actor home', 'actress home', 'star\'s home',
    'luxury mansion', 'beverly hills home', 'malibu home', 'l.a. home',
    // Entertainment Business
    'movie', 'film', 'music concert', 'album', 'grammy', 'oscar',
    'box office', 'streaming show', 'tv series', 'netflix show',
    // Non-Market Content
    'weather', 'fashion show', 'fashion week', 'festival',
    'murder', 'crime scene', 'arrest', 'wedding', 'divorce',
    // Sports Leagues
    'pickleball', 'ipl auction'
  ];

  const hasStrictExclusions = strictExclusionKeywords.some(keyword => {
    // Check key phrases with surrounding spaces to avoid partial matches on common words
    // e.g. "vs" in "vs."
    const commonWords = ['score', 'vs', 'versus', 'medal'];
    if (commonWords.includes(keyword)) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(fullText);
    }
    return fullText.includes(keyword);
  });

  // Reject immediately if strict exclusions found
  if (hasStrictExclusions) {
    return false;
  }

  // Check for Indian market context
  const indianMarketIndicators = [
    'nifty', 'sensex', 'nse', 'bse', 'sebi', 'rbi',
    'rupee', 'indian stock', 'mumbai stock', 'dalal street',
    'fii', 'dii', 'foreign investor', 'domestic investor',
    'indian market', 'india stock', 'indian economy'
  ];

  // Check for Global market impact
  const globalMarketIndicators = [
    // Global Indices
    'dow jones', 'dow', 's&p 500', 's&p', 'nasdaq', 'wall street',
    'ftse', 'dax', 'nikkei', 'hang seng',
    // Commodities
    'crude oil', 'brent', 'wti', 'gold price', 'oil price',
    'silver price', 'copper price', 'commodity market',
    // Central Banks
    'fed rate', 'federal reserve', 'fomc', 'ecb', 'boj',
    'jerome powell', 'interest rate hike', 'rate cut',
    'monetary policy', 'central bank',
    // Currencies
    'dollar index', 'dxy', 'usd-inr', 'dollar-rupee',
    'forex market', 'currency market',
    // Economic Data
    'us gdp', 'us inflation', 'china gdp', 'global recession',
    'economic growth', 'inflation data', 'trade deficit'
  ];

  const hasIndianContext = indianMarketIndicators.some(indicator =>
    fullText.includes(indicator)
  );

  const hasGlobalContext = globalMarketIndicators.some(indicator =>
    fullText.includes(indicator)
  );

  // Must have at least TWO financial keywords (relaxed from 3)
  const financialKeywords = [
    'stock', 'share', 'equity', 'stock market', 'share price',
    'ipo', 'listing', 'profit', 'revenue', 'earnings', 'dividend',
    'quarterly result', 'annual result', 'financial result',
    'rally', 'surge', 'fall', 'crash', 'selloff', 'buying',
    'inflation', 'interest rate', 'bond yield', 'treasury',
    'mutual fund', 'portfolio', 'valuation', 'market cap',
    'pe ratio', 'eps', 'brokerage', 'analyst', 'recommendation',
    // Additional common market terms
    'budget', 'bank', 'sector', 'industry', 'quarterly',
    'q1', 'q2', 'q3', 'q4', 'yoy', 'growth', 'investment',
    'trading', 'investor', 'market', 'financial', 'economic',
    'business', 'company', 'corporate', 'fiscal',
    // VC/PE/Startup terms (for VCCircle)
    'funding', 'capital', 'venture', 'startup', 'private equity',
    'acquisition', 'merger', 'deal', 'crore', 'billion', 'million',
    'fund', 'lp', 'gp', 'limited partner', 'general partner',
    'series a', 'series b', 'series c', 'seed round', 'fundraise',
    'valuation', 'exit', 'ipo', 'secondary', 'stake', 'portfolio firm',
    'backed', 'investor', 'management buyout', 'buyout'
  ];

  let financialKeywordCount = 0;
  financialKeywords.forEach(keyword => {
    if (fullText.includes(keyword)) financialKeywordCount++;
  });

  // Accept if: (Indian OR Global context) OR (2+ financial keywords)
  // More permissive: context OR keywords, not requiring both
  const isRelevant = (hasIndianContext || hasGlobalContext) ||
    financialKeywordCount >= 2;

  return isRelevant;
}

// Language Filter - Detects non-English content
function isEnglish(title: string, link: string): boolean {
  const lowerTitle = (title || '').toLowerCase();
  const lowerLink = (link || '').toLowerCase();

  // 1. Check URL patterns for language codes
  // e.g., /es/, /fr/, /de/, /br/, /it/
  // also subdomain like es.reuters.com
  const foreignUrlPatterns = [
    '/es/', '/fr/', '/de/', '/pt/', '/it/', '/br/', '/mx/', '/ru/', '/cn/', '/jp/',
    'es.', 'fr.', 'de.', 'pt.', 'it.', 'br.', 'mx.', 'ru.', 'cn.', 'jp.'
  ];

  if (foreignUrlPatterns.some(pattern => lowerLink.includes(pattern))) {
    return false;
  }

  // 2. Check for Foreign Stop Words in Title
  // Must be surrounded by spaces to avoid partial matches (e.g., "und" in "under")
  const foreignStopWords = [
    // Spanish
    ' y ', ' en ', ' el ', ' la ', ' los ', ' las ', ' por ', ' para ', ' con ', ' del ', ' una ',
    // French
    ' et ', ' le ', ' la ', ' les ', ' des ', ' du ', ' pour ', ' dans ', ' une ', ' aux ',
    // German
    ' und ', ' der ', ' die ', ' das ', ' mit ', ' fuer ', ' von ', ' im ', ' auf ',
    // Portuguese
    ' e ', ' o ', ' a ', ' os ', ' as ', ' do ', ' da ', ' dos ', ' das ', ' um ', ' uma ',
    // Italian
    ' e ', ' il ', ' lo ', ' la ', ' i ', ' gli ', ' le ', ' di ', ' da ', ' in ',
  ];

  if (foreignStopWords.some(word => lowerTitle.includes(word))) {
    return false;
  }

  return true;
}

function detectSource(link: string): string {
  try {
    const url = new URL(link);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes("reuters.com")) return "Reuters";
    if (hostname.includes("livemint.com")) return "Mint";
    if (hostname.includes("economictimes.")) return "Economic Times";
    if (hostname.includes("thehindu.com")) return "The Hindu";
    if (hostname.includes("timesofindia.") || hostname.includes("indiatimes.com"))
      return "Times of India";
    if (hostname.includes("marketwatch.com")) return "MarketWatch";
    if (hostname.includes("cnbc.com")) return "CNBC";
    if (hostname.includes("ft.com")) return "Financial Times";
    if (hostname.includes("business-standard.com")) return "Business Standard";
    if (hostname.includes("vccircle.com")) return "VCCircle";
    if (hostname.includes("moneycontrol.com")) return "Moneycontrol";
    if (hostname.includes("ndtv.com")) return "NDTV Profit";
    if (hostname.includes("bqprime.com")) return "BQ Prime";
    if (hostname.includes("business-standard.com")) return "Business Standard";

    return "Unknown";
  } catch {
    return "Unknown";
  }
}

function normalizeLink(link: string): string {
  try {
    const url = new URL(link);
    // Remove query params to avoid duplicates with different tracking codes
    // But keep the link intact if it seems to depend on query params (unlikely for news sites)
    return url.origin + url.pathname;
  } catch {
    return link;
  }
}

async function extractImageFromArticle(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try Open Graph image first
    let image = $('meta[property="og:image"]').attr("content");
    if (image && image.startsWith("http")) return image;

    // Try Twitter card image
    image = $('meta[name="twitter:image"]').attr("content");
    if (image && image.startsWith("http")) return image;

    // Try article image
    image = $('meta[property="og:image:secure_url"]').attr("content");
    if (image && image.startsWith("http")) return image;

    // Try to find first article image
    image = $("article img").first().attr("src");
    if (image && image.startsWith("http")) return image;

    return null;
  } catch (error) {
    console.error(`Error extracting image from ${url}:`, error);
    return null;
  }
}

function extractImageFromRSSItem(item: any): string | null {
  try {
    // Check enclosure (common in RSS)
    if (item.enclosure && item.enclosure.url) {
      return item.enclosure.url;
    }

    // Check media:content
    if (item.media && item.media.$) {
      return item.media.$.url;
    }

    // Check media:thumbnail
    if (item.thumbnail && item.thumbnail.$) {
      return item.thumbnail.$.url;
    }

    // Check content for images
    if (item.content) {
      const $ = cheerio.load(item.content);
      const img = $("img").first().attr("src");
      if (img && img.startsWith("http")) return img;
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchFromSitemap(url: string, limit: number = 20): Promise<any[]> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: any[] = [];

    // Check if it's a sitemap index
    const sitemaps = $("sitemaploc, loc"); // selector might need adjustment based on chemo xml
    // Cheerio XML mode uses standard selectors. Sitemaps often use <sitemap><loc>...</loc></sitemap>

    // Check for sitemap index items
    const sitemapLocs: string[] = [];
    $("sitemap > loc").each((i, el) => {
      if (sitemapLocs.length < 3) { // Only check first few sitemaps to avoid overload
        sitemapLocs.push($(el).text());
      }
    });

    if (sitemapLocs.length > 0) {
      // It is an index, recurse (shallowly)
      for (const loc of sitemapLocs) {
        const returnedItems = await fetchFromSitemap(loc, limit);
        items.push(...returnedItems);
        if (items.length >= limit) break;
      }
      return items;
    }

    // Attempt to parse standard UrlSet
    $("url").each((i, el) => {
      if (items.length >= limit) return false; // break loop

      const loc = $(el).find("loc").first().text();
      const lastmod = $(el).find("lastmod").first().text();

      // Google News extension fields
      const newsTitle = $(el).find("news\\:title").text() || $(el).find("title").text(); // try namespaced
      const newsPubDate = $(el).find("news\\:publication_date").text();

      // Image Google extension
      const imageLoc = $(el).find("image\\:loc").text();
      const imageCaption = $(el).find("image\\:caption").text();

      if (loc && newsTitle) {
        items.push({
          title: newsTitle,
          link: loc,
          pubDate: newsPubDate || lastmod || new Date().toISOString(),
          content: imageCaption || "", // Use image caption as snippet if available
          image: imageLoc || null
        });
      }
    });

    return items;

  } catch (error) {
    console.error(`Error parsing sitemap ${url}:`, error);
    return [];
  }
}

// Custom scraper for VCCircle (RSS is broken server-side)
async function fetchFromVCCircle(limit: number = 15): Promise<any[]> {
  try {
    const response = await fetch('https://www.vccircle.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.error(`VCCircle fetch failed: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const items: any[] = [];
    const seen = new Set<string>();

    // VCCircle article URLs are slugs like /kkr-set-to-inject-capital-...
    // They have no category path prefix, just /<slug> with 4+ hyphen-separated words
    $('a[href]').each((i, el) => {
      if (items.length >= limit) return false;

      const href = $(el).attr('href') || '';
      const title = $(el).text().trim();

      // Must be a slug-style article URL (4+ hyphen-separated words) with meaningful title
      const isArticleSlug = href.match(/(?:vccircle\.com\/|^\/)[a-z0-9]+(-[a-z0-9]+){3,}/);
      if (!isArticleSlug || title.length < 20) return;

      const link = href.startsWith('http') ? href : `https://www.vccircle.com${href}`;
      if (!link.includes('vccircle.com')) return;
      if (seen.has(link)) return;
      seen.add(link);

      // Try to find an image near this link
      const parentEl = $(el).closest('div, li, section');
      const imgSrc = parentEl.find('img').first().attr('src') ||
        parentEl.find('img').first().attr('data-src') || null;

      items.push({
        title,
        link,
        content: '',
        pubDate: new Date().toISOString(),
        image: imgSrc && imgSrc.startsWith('http') ? imgSrc : null,
      });
    });

    console.log(`VCCircle scraper found ${items.length} articles`);
    return items;
  } catch (error) {
    console.error('Error scraping VCCircle:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const dataFile = path.join(process.cwd(), "data", "market-news.json");

    // Read existing news
    let newsData: { news: any[] } = { news: [] };
    try {
      const fileContent = await fs.readFile(dataFile, "utf-8");
      newsData = JSON.parse(fileContent);
    } catch (error) {
      // File doesn't exist yet, will create it
    }

    const allNewItems: any[] = [];
    const seenLinks = new Set(newsData.news.map(n => n.link)); // Track existing links (exact)
    const seenNormalizedLinks = new Set(newsData.news.map(n => normalizeLink(n.link))); // Track normalized links
    const seenTitles = new Set(newsData.news.map(n => n.title?.toLowerCase().trim())); // Track existing titles
    let successCount = 0;
    let errorCount = 0;
    let filteredCount = 0; // Track filtered items
    let duplicateCount = 0; // Track duplicates
    const feedStats: any = {};

    // Fetch from all RSS feeds with limited items per feed
    for (const feedUrl of RSS_FEEDS) {
      try {
        const feed = await parser.parseURL(feedUrl);
        let itemsFromThisFeed = 0;

        for (const item of feed.items) {
          if (!item.link) continue;
          if (itemsFromThisFeed >= MAX_ITEMS_PER_FEED) break; // Limit per feed

          // Skip duplicates using link OR title comparison
          const normalizedTitle = (item.title || '').toLowerCase().trim();
          const normalizedLink = normalizeLink(item.link);

          if (seenLinks.has(item.link) || seenNormalizedLinks.has(normalizedLink) || seenTitles.has(normalizedTitle)) {
            console.log('Skipping duplicate:', item.title?.substring(0, 50));
            duplicateCount++;
            continue;
          }

          // 🔍 FILTER: Check if market-related news
          const title = item.title || '';
          const content = item.contentSnippet || item.content || '';

          // 1. Language Filter
          if (!isEnglish(title, item.link)) {
            console.log('❌ Filtered (non-English):', title.substring(0, 60));
            filteredCount++;
            continue;
          }

          // 2. Topic Filter
          if (!isMarketNews(title, content, item.link)) {
            console.log('❌ Filtered (non-market):', title.substring(0, 60));
            filteredCount++;
            continue;
          }

          // Create unique ID from link using full base64 (no truncation)
          const id = Buffer.from(item.link)
            .toString("base64")
            .replace(/[/+=]/g, '_'); // Replace unsafe characters for IDs

          // Detect source
          const source = detectSource(item.link);

          // Extract image from RSS item first (faster)
          let image = extractImageFromRSSItem(item);

          // If no image in RSS, try to extract from article (slower, but optional)
          // We'll skip this for performance - only use RSS images

          const newsItem = {
            id,
            title: item.title || "Untitled",
            link: item.link,
            content: item.contentSnippet || item.content || "",
            pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
            isoDate: item.isoDate || item.pubDate || new Date().toISOString(),
            source,
            image: image || null,
            receivedAt: new Date().toISOString(),
          };

          allNewItems.push(newsItem);
          seenLinks.add(item.link); // Track this link
          seenNormalizedLinks.add(normalizedLink); // Track normalized
          seenTitles.add(normalizedTitle); // Track this title
          itemsFromThisFeed++;
          feedStats[source] = (feedStats[source] || 0) + 1;
        }

        successCount++;
      } catch (error) {
        console.error(`Error fetching feed ${feedUrl}:`, error);
        errorCount++;
      }
    }

    // 🗺️  Fetch from SITEMAPS (e.g. Reuters)
    for (const sitemapUrl of SITEMAP_FEEDS) {
      try {
        console.log(`Fetching sitemap: ${sitemapUrl}`);
        const items = await fetchFromSitemap(sitemapUrl, MAX_ITEMS_PER_FEED);
        let itemsFromThisFeed = 0;

        for (const item of items) {
          // Deduplication
          const normalizedLink = normalizeLink(item.link);
          const normalizedTitle = (item.title || '').toLowerCase().trim();

          if (seenLinks.has(item.link) || seenNormalizedLinks.has(normalizedLink) || seenTitles.has(normalizedTitle)) {
            duplicateCount++;
            continue;
          }

          // Filtering (Reuse same function)
          // 1. Language Filter
          if (!isEnglish(item.title || '', item.link)) {
            console.log('❌ Filtered (non-English):', (item.title || '').substring(0, 60));
            filteredCount++;
            continue;
          }

          // 2. Topic Filter
          if (!isMarketNews(item.title, item.content, item.link)) {
            filteredCount++;
            continue;
          }

          const id = Buffer.from(item.link).toString("base64").replace(/[/+=]/g, '_');

          // Add to list
          const newsItem = {
            id,
            title: item.title,
            link: item.link,
            content: item.content,
            pubDate: item.pubDate,
            isoDate: item.pubDate,
            source: detectSource(item.link),
            image: item.image,
            receivedAt: new Date().toISOString()
          };

          allNewItems.push(newsItem);
          seenLinks.add(item.link);
          seenNormalizedLinks.add(normalizedLink);
          seenTitles.add(normalizedTitle);

          const source = newsItem.source;
          feedStats[source] = (feedStats[source] || 0) + 1;
          itemsFromThisFeed++;
        }
        console.log(`Fetched ${itemsFromThisFeed} items from sitemap ${sitemapUrl}`);
        successCount++;
      } catch (error) {
        console.error(`Error fetching sitemap ${sitemapUrl}:`, error);
        errorCount++;
      }
    }

    // 🕷️  Fetch from VCCircle (custom scraper, RSS broken)
    try {
      console.log('Fetching VCCircle articles...');
      const vcItems = await fetchFromVCCircle(MAX_ITEMS_PER_FEED);
      let itemsFromVCCircle = 0;

      for (const item of vcItems) {
        const normalizedLink = normalizeLink(item.link);
        const normalizedTitle = (item.title || '').toLowerCase().trim();

        if (seenLinks.has(item.link) || seenNormalizedLinks.has(normalizedLink) || seenTitles.has(normalizedTitle)) {
          duplicateCount++;
          continue;
        }

        if (!isEnglish(item.title || '', item.link)) {
          filteredCount++;
          continue;
        }

        if (!isMarketNews(item.title, item.content, item.link)) {
          filteredCount++;
          continue;
        }

        const id = Buffer.from(item.link).toString('base64').replace(/[/+=]/g, '_');
        const newsItem = {
          id,
          title: item.title,
          link: item.link,
          content: item.content,
          pubDate: item.pubDate,
          isoDate: item.pubDate,
          source: 'VCCircle',
          image: item.image,
          receivedAt: new Date().toISOString(),
        };

        allNewItems.push(newsItem);
        seenLinks.add(item.link);
        seenNormalizedLinks.add(normalizedLink);
        seenTitles.add(normalizedTitle);
        feedStats['VCCircle'] = (feedStats['VCCircle'] || 0) + 1;
        itemsFromVCCircle++;
      }

      console.log(`Added ${itemsFromVCCircle} articles from VCCircle`);
      successCount++;
    } catch (error) {
      console.error('Error fetching VCCircle:', error);
      errorCount++;
    }

    // Sort new items by publication date (newest first)
    allNewItems.sort((a, b) => {
      const dateA = new Date(a.isoDate || a.pubDate).getTime();
      const dateB = new Date(b.isoDate || b.pubDate).getTime();
      return dateB - dateA; // Newest first
    });

    // Add new items to the beginning
    newsData.news.unshift(...allNewItems);

    // Sort all news by publication date (newest first)
    newsData.news.sort((a, b) => {
      const dateA = new Date(a.isoDate || a.pubDate).getTime();
      const dateB = new Date(b.isoDate || b.pubDate).getTime();
      return dateB - dateA; // Newest first
    });

    // Keep only the latest MAX_NEWS_ITEMS
    if (newsData.news.length > MAX_NEWS_ITEMS) {
      newsData.news = newsData.news.slice(0, MAX_NEWS_ITEMS);
    }

    // Save to file
    await fs.writeFile(dataFile, JSON.stringify(newsData, null, 2), "utf-8");

    // Log filtering statistics
    console.log('\n📊 MARKET NEWS FILTER STATISTICS:');
    console.log(`✅ Accepted: ${allNewItems.length} news items`);
    console.log(`❌ Filtered: ${filteredCount} news items`);
    console.log(`🔄 Duplicates: ${duplicateCount} news items`);
    console.log(`📈 Acceptance Rate: ${Math.round((allNewItems.length / (filteredCount + allNewItems.length || 1)) * 100)}%`);
    console.log(`🗂️  Total News in DB: ${newsData.news.length}\n`);

    return NextResponse.json({
      success: true,
      message: `Fetched news from ${successCount} feeds`,
      newItems: allNewItems.length,
      totalNews: newsData.news.length,
      successFeeds: successCount,
      errorFeeds: errorCount,
      filteredOut: filteredCount,
      duplicates: duplicateCount,
      sourceDistribution: feedStats,
      filterStats: {
        filtered: filteredCount,
        duplicates: duplicateCount,
        accepted: allNewItems.length,
        total: filteredCount + allNewItems.length,
        acceptanceRate: `${Math.round((allNewItems.length / (filteredCount + allNewItems.length)) * 100)}%`
      }
    });
  } catch (error: any) {
    console.error("Error fetching market news:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
