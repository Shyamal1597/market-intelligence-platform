/**
 * GIFT NIFTY quote, scraped from giftnifty.org.
 *
 * Yahoo Finance does not carry GIFT NIFTY, and NSE's own site is behind
 * Akamai bot protection and unreliable to scrape headlessly (confirmed
 * 2026-07-16). giftnifty.org is a small, plain server-rendered page with
 * the same figure and scrapes cleanly -- shared by the live Macro Command
 * Centre dashboard and the EOD export so both read the same source.
 */
import type { QuoteData } from "@/lib/yahoo-finance";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchGiftNifty(): Promise<QuoteData | null> {
  try {
    const res = await fetch("https://giftnifty.org/", { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();

    const priceMatch = html.match(/class="font-number">([\d,]+)(?:<small>(\.\d+)<\/small>)?/);
    if (!priceMatch) return null;
    const price = parseFloat(priceMatch[1].replace(/,/g, "") + (priceMatch[2] ?? ""));

    const pctBlockMatch = html.match(/class="percent"><div class="(positive|negative)">([\s\S]*?)<\/div><\/div>/);
    if (!pctBlockMatch) return null;
    const sign = pctBlockMatch[1] === "positive" ? 1 : -1;
    const nums = pctBlockMatch[2].replace(/<[^>]+>/g, " ").match(/[\d.]+/g);
    if (!nums || nums.length < 2) return null;

    const changePercent = sign * parseFloat(nums[0]);
    const change = sign * parseFloat(nums[1]);

    return {
      symbol: "GIFT_NIFTY",
      label: "GIFT NIFTY",
      price,
      change,
      changePercent,
      previousClose: price - change,
      history: [],
    };
  } catch {
    return null;
  }
}
