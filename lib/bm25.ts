// BM25 Okapi implementation -- pure TypeScript, no deps
// k1=1.5, b=0.75 (standard defaults)

export interface BM25Doc {
  id: string;
  text: string;
  [key: string]: unknown;
}

interface Index {
  docs: BM25Doc[];
  tf: Map<string, Map<string, number>>; // docId -> term -> frequency
  df: Map<string, number>;              // term -> doc frequency
  avgLen: number;
  k1: number;
  b: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s₹]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function buildIndex(docs: BM25Doc[], k1 = 1.5, b = 0.75): Index {
  const tf = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  let totalLen = 0;

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    totalLen += tokens.length;
    const termFreq = new Map<string, number>();
    for (const t of tokens) {
      termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    }
    tf.set(doc.id, termFreq);
    for (const t of termFreq.keys()) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }

  return { docs, tf, df, avgLen: totalLen / (docs.length || 1), k1, b };
}

export function search(index: Index, query: string, topK = 6): BM25Doc[] {
  const { docs, tf, df, avgLen, k1, b } = index;
  const N = docs.length;
  const queryTerms = tokenize(query);
  const scores = new Map<string, number>();

  for (const doc of docs) {
    let score = 0;
    const docTf = tf.get(doc.id)!;
    const docLen = Array.from(docTf.values()).reduce((a, v) => a + v, 0);

    for (const term of queryTerms) {
      const termTf = docTf.get(term) ?? 0;
      if (termTf === 0) continue;
      const docFreq = df.get(term) ?? 0;
      const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
      const tfNorm = (termTf * (k1 + 1)) / (termTf + k1 * (1 - b + b * (docLen / avgLen)));
      score += idf * tfNorm;
    }

    if (score > 0) scores.set(doc.id, score);
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => docs.find((d) => d.id === id)!);
}
