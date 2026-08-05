/**
 * Shared symbol-search matching, used by both the breadth/sector list modal
 * and the header's all-symbols search bar -- same matching rules everywhere
 * a user searches for a stock by symbol or company name.
 */

// Words that don't contribute a letter to a company's common short-form --
// e.g. "State Bank OF India" -> S,B,I -> "SBI", not "SBOI".
const NAME_STOPWORDS = new Set([
  "OF", "THE", "AND", "LTD", "LIMITED", "CO", "CORP", "CORPORATION",
  "PVT", "PRIVATE", "INC", "PLC", "&",
]);

/** First letter of each significant word in the company name, e.g.
 * "State Bank of India" -> "SBI" -- lets a search for "SBI" find a symbol
 * whose name never literally contains those three letters together. */
export function acronym(name: string): string {
  return name
    .toUpperCase()
    .split(/[\s.,]+/)
    .filter((w) => w && !NAME_STOPWORDS.has(w))
    .map((w) => w[0])
    .join("");
}

export function matchesSymbolSearch(
  row: { symbol: string; name: string | null },
  query: string,
): boolean {
  if (!query) return true;
  if (row.symbol.toUpperCase().includes(query)) return true;
  const name = (row.name ?? "").toUpperCase();
  if (name.includes(query)) return true;
  if (row.name && acronym(row.name).includes(query)) return true;
  return false;
}
