/**
 * BM25 scoring over a precomputed index (data/bm25.json, built by
 * scripts/5-bm25.ts). Standard Okapi BM25 with the usual smoothing
 * constants — nothing exotic. A few hundred documents means the whole
 * scoring pass is well under a millisecond; no need for an inverted index,
 * a flat per-document scan is simplest and fast enough.
 */

import { tokenize } from "./tokenize";

const K1 = 1.2;
const B = 0.75;

export interface BM25Doc {
  id: string;
  length: number;
  termFreq: Record<string, number>;
}

export interface BM25Index {
  N: number;
  avgDocLength: number;
  docFreq: Record<string, number>;
  docs: BM25Doc[];
}

/** idf with the "+1" smoothing that keeps it non-negative even for terms
 *  appearing in more than half the corpus (standard BM25+ / Lucene variant). */
function idf(index: BM25Index, term: string): number {
  const df = index.docFreq[term] ?? 0;
  return Math.log(1 + (index.N - df + 0.5) / (df + 0.5));
}

export interface ScoredDoc {
  id: string;
  score: number;
}

/**
 * Score every document against a query string, sorted best-first. `boost`
 * lets callers weight specific doc ids higher (used for heading-path
 * matches — see lib/search/expand.ts) without re-tokenizing or rescanning.
 */
export function search(
  index: BM25Index,
  query: string,
  options: { topK?: number; boost?: (docId: string) => number } = {}
): ScoredDoc[] {
  const queryTerms = [...new Set(tokenize(query))];
  const boost = options.boost ?? (() => 1);

  const scored: ScoredDoc[] = index.docs.map((doc) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.termFreq[term];
      if (!tf) continue;
      const termIdf = idf(index, term);
      const denom = tf + K1 * (1 - B + (B * doc.length) / index.avgDocLength);
      score += termIdf * ((tf * (K1 + 1)) / denom);
    }
    return { id: doc.id, score: score * boost(doc.id) };
  });

  scored.sort((a, b) => b.score - a.score);
  const topK = options.topK ?? scored.length;
  return scored.slice(0, topK).filter((d) => d.score > 0);
}
