import { NextRequest } from "next/server";
import {
  buildMarketPrompt,
  buildSymbolPrompt,
  getCached,
  setCached,
  getRecentFiiDii,
  getMarketNews,
  getStockNews,
  type MarketStreamData,
  type SymbolStreamData,
  type CachedSignal,
} from "@/lib/smart-money";
import { fetchDeals } from "@/lib/nse-deals";
import { fetchNSEFilings } from "@/lib/nse-filings";
import type { InsiderDisclosure } from "@/app/api/insider/[symbol]/route";

export const dynamic = "force-dynamic";

// -- Market-mode helpers --------------------------------------------------------

async function buildMarketData(): Promise<MarketStreamData> {
  const fiiDii = getRecentFiiDii(7);
  const newsHeadlines = getMarketNews(15);

  // Key filings: live RSS, top 10
  const keyFilings = await fetchNSEFilings(10)
    .then(filings => filings.slice(0, 10).map(f => ({
      date: f.submittedAt ?? "",
      company: f.company ?? f.scripCode ?? "",
      title: f.filingType ?? "",   // description = company name (RSS limitation); use filing type
    })))
    .catch(() => []);

  // Aggregate today's bulk/block deals market-wide
  const dealFlow = await fetchDeals()
    .then(({ deals }) => {
      let totalBuyCr = 0, totalSellCr = 0, totalDeals = 0;
      for (const d of deals) {
        totalDeals++;
        if (d.side === "BUY") totalBuyCr += d.valueCr;
        else if (d.side === "SELL") totalSellCr += d.valueCr;
      }
      // fetchDeals() returns pre-sorted by valueCr desc -- slice gives top 10 by value
      const topDeals = deals.slice(0, 10).map(d => ({
        institution: d.client,
        side: d.side,
        symbol: d.symbol,
        valueCr: d.valueCr,
      }));
      return { totalDeals, totalBuyCr, totalSellCr, netCr: totalBuyCr - totalSellCr, topDeals };
    })
    .catch(() => ({ totalDeals: 0, totalBuyCr: 0, totalSellCr: 0, netCr: 0, topDeals: [] }));

  return { mode: "market", fiiDii, newsHeadlines, keyFilings, dealFlow };
}

// -- Symbol-mode helpers --------------------------------------------------------

async function buildSymbolData(symbol: string): Promise<SymbolStreamData> {
  const [dealsResult, filingsResult, insidersResult] = await Promise.allSettled([
    fetchDeals().then(({ deals }) =>
      deals
        .filter(d => d.symbol?.toUpperCase() === symbol)
        .slice(0, 5)
        .map(d => ({ date: d.date, client: d.client, side: d.side, quantity: d.quantity, valueCr: d.valueCr }))
    ),
    fetchNSEFilings(500).then(filings =>
      filings
        .filter(f => f.scripCode?.toUpperCase() === symbol)
        .slice(0, 5)
        .map(f => ({ date: f.submittedAt ?? "", title: f.description ?? f.filingType ?? "" }))
    ),
    (async (): Promise<InsiderDisclosure[]> => {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";
      const res = await fetch(`${baseUrl}/api/insider/${encodeURIComponent(symbol)}`, {
        next: { revalidate: 0 },
      });
      if (!res.ok) return [];
      const json = await res.json() as { disclosures: InsiderDisclosure[] };
      return json.disclosures ?? [];
    })(),
  ]);

  return {
    mode: "symbol",
    symbol,
    bulkBlockDeals: dealsResult.status === "fulfilled" ? dealsResult.value : [],
    announcements: filingsResult.status === "fulfilled" ? filingsResult.value : [],
    fiiDii: getRecentFiiDii(7),
    insiders: insidersResult.status === "fulfilled" ? insidersResult.value : [],
    stockNews: getStockNews(symbol),
  };
}

// -- Ollama streaming -----------------------------------------------------------

function streamOllama(
  prompt: string,
  symbol: string,
  rawData: MarketStreamData | SymbolStreamData,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController
) {
  return fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.1:8b",
      prompt,
      stream: true,
      options: { temperature: 0.45 },
    }),
  }).then(async ollamaRes => {
    if (!ollamaRes.ok || !ollamaRes.body) {
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: "error", message: "Ollama unavailable" })}\n\n`
      ));
      return;
    }

    const reader = ollamaRes.body.getReader();
    const dec = new TextDecoder();
    let fullNarrative = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = dec.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const chunk = JSON.parse(line) as { response: string; done: boolean };
          if (chunk.response) {
            fullNarrative += chunk.response;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: "token", token: chunk.response })}\n\n`
            ));
          }
          if (chunk.done) {
            const signal: CachedSignal = {
              symbol,
              rawData,
              narrative: fullNarrative,
              generatedAt: new Date().toISOString(),
            };
            setCached(signal);
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: "done", signal })}\n\n`
            ));
          }
        } catch { /* malformed chunk */ }
      }
    }
  }).catch(() => {
    controller.enqueue(encoder.encode(
      `data: ${JSON.stringify({ type: "error", message: "Failed to connect to Ollama" })}\n\n`
    ));
  });
}

// -- Route ----------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  const force = req.nextUrl.searchParams.get("force") === "1";

  // Serve from cache if fresh
  if (!force) {
    const cached = getCached(upper);
    if (cached) {
      return new Response(JSON.stringify({ cached: true, signal: cached }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const isMarket = upper === "MARKET";
  const rawData = isMarket ? await buildMarketData() : await buildSymbolData(upper);

  // For symbol mode: refuse to generate if no symbol-specific data exists.
  // FII/DII is market-wide -- it cannot produce valid stock-specific insights.
  if (!isMarket) {
    const sd = rawData as SymbolStreamData;
    const hasData = sd.insiders.length > 0 || sd.bulkBlockDeals.length > 0 || sd.announcements.length > 0 || sd.stockNews.length > 0;
    if (!hasData) {
      return new Response(
        JSON.stringify({ noData: true, symbol: upper }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const prompt = isMarket
    ? buildMarketPrompt(rawData as MarketStreamData)
    : buildSymbolPrompt(rawData as SymbolStreamData);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send raw data immediately so client can render scorecard
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: "raw", data: rawData })}\n\n`
      ));

      await streamOllama(prompt, upper, rawData, encoder, controller);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
