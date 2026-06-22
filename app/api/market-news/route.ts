import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

function normalizeLink(link: string): string {
  try {
    const url = new URL(link);
    return url.origin + url.pathname;
  } catch {
    return link;
  }
}

const NEWS_FILE = path.join(process.cwd(), "data", "market-news.json");
const MAX_NEWS_ITEMS = 200; // Keep last 200 news items

interface NewsItem {
  id: string;
  title: string;
  link: string;
  content?: string;
  pubDate: string;
  isoDate?: string;
  source?: string;
  receivedAt: string;
}

interface NewsData {
  news: NewsItem[];
}

async function getNews(): Promise<NewsData> {
  try {
    if (!existsSync(NEWS_FILE)) {
      return { news: [] };
    }
    const data = await readFile(NEWS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading news file:", error);
    return { news: [] };
  }
}

async function saveNews(newsData: NewsData): Promise<void> {
  await writeFile(NEWS_FILE, JSON.stringify(newsData, null, 2), "utf-8");
}

// POST - Receive news from n8n webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle single news item or array of news items
    const newsItems = Array.isArray(body) ? body : [body];

    const newsData = await getNews();

    // Process each news item
    for (const item of newsItems) {
      // Skip if required fields are missing
      if (!item.title || !item.link) {
        console.warn("Skipping news item - missing required fields:", item);
        continue;
      }

      // Only accept http/https links to prevent javascript: URI injection
      try {
        const parsed = new URL(item.link);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          console.warn("Skipping news item - invalid link protocol:", item.link);
          continue;
        }
      } catch {
        console.warn("Skipping news item - unparseable link:", item.link);
        continue;
      }

      // Create unique ID from link using full base64 (no truncation)
      const id = Buffer.from(item.link).toString("base64").replace(/[/+=]/g, '_');

      // Check if news already exists by ID, Title, or Normalized Link
      const normalizedTitle = item.title.toLowerCase().trim();
      const normalizedLink = normalizeLink(item.link);

      const exists = newsData.news.some((n) => {
        if (n.id === id) return true;
        if (n.title.toLowerCase().trim() === normalizedTitle) return true;
        if (normalizeLink(n.link) === normalizedLink) return true;
        return false;
      });

      if (exists) {
        console.log("News item already exists, skipping:", item.title);
        continue;
      }

      // Extract source from link
      let source = "Unknown";
      try {
        const url = new URL(item.link);
        const hostname = url.hostname.replace("www.", "");
        if (hostname.includes("livemint.com")) source = "Mint";
        else if (hostname.includes("economictimes.")) source = "Economic Times";
        else if (hostname.includes("thehindu.com")) source = "The Hindu";
        else if (hostname.includes("timesofindia.")) source = "Times of India";
        else if (hostname.includes("marketwatch.com")) source = "MarketWatch";
        else if (hostname.includes("cnbc.com")) source = "CNBC";
        else if (hostname.includes("ft.com")) source = "Financial Times";
        else source = hostname;
      } catch (e) {
        console.error("Error parsing URL:", e);
      }

      // Add new news item
      const newsItem: NewsItem = {
        id,
        title: item.title,
        link: item.link,
        content: item.content || item.contentSnippet || item.description || "",
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
        isoDate: item.isoDate || item.pubDate,
        source,
        receivedAt: new Date().toISOString(),
      };

      newsData.news.unshift(newsItem); // Add to beginning
    }

    // Keep only the latest MAX_NEWS_ITEMS
    if (newsData.news.length > MAX_NEWS_ITEMS) {
      newsData.news = newsData.news.slice(0, MAX_NEWS_ITEMS);
    }

    await saveNews(newsData);

    return NextResponse.json({
      success: true,
      message: `Processed ${newsItems.length} news items`,
      totalNews: newsData.news.length,
    });
  } catch (error) {
    console.error("Error processing news:", error);
    return NextResponse.json(
      { error: "Failed to process news" },
      { status: 500 }
    );
  }
}

// GET - Retrieve news for display
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const source = searchParams.get("source");

    const newsData = await getNews();

    // Auto-refresh if store is stale (>10 min) or nearly empty -- fire-and-forget
    let shouldRefresh = newsData.news.length < 50;
    if (!shouldRefresh) {
      try {
        const { stat } = await import("fs/promises");
        const s = await stat(NEWS_FILE);
        shouldRefresh = Date.now() - s.mtimeMs > 10 * 60 * 1000;
      } catch {}
    }
    if (shouldRefresh) {
      fetch(`${request.nextUrl.origin}/api/fetch-market-news`).catch(() => {});
    }

    let news = newsData.news;

    // Filter by source if specified
    if (source && source !== "all") {
      news = news.filter((item) => item.source === source);
    }

    // Apply limit
    news = news.slice(0, limit);

    // Get available sources
    const sources = Array.from(new Set(newsData.news.map((n) => n.source)));

    return NextResponse.json({
      news,
      total: newsData.news.length,
      sources,
    });
  } catch (error) {
    console.error("Error fetching news:", error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
