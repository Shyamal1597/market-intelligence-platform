// lib/market-status.ts
export type MarketStatus = "open" | "pre-open" | "closed";

export function getMarketStatus(): MarketStatus {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0=Sun, 6=Sat
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Weekends: closed
  if (day === 0 || day === 6) return "closed";

  // Pre-open: 9:00 AM - 9:15 AM IST
  if (totalMinutes >= 540 && totalMinutes < 555) return "pre-open";

  // Regular session: 9:15 AM - 3:30 PM IST
  if (totalMinutes >= 555 && totalMinutes <= 930) return "open";

  return "closed";
}

export function getMarketStatusLabel(status: MarketStatus): string {
  switch (status) {
    case "open": return "Market Open";
    case "pre-open": return "Pre-Open";
    case "closed": return "Market Closed";
  }
}

export function getMarketStatusColor(status: MarketStatus): string {
  switch (status) {
    case "open": return "#00C9A7";
    case "pre-open": return "#E8A020";
    case "closed": return "#E84040";
  }
}
