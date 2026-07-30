/**
 * Stage 1, step 5 — chunks.json -> bm25.json
 *
 * Precomputes everything BM25 scoring needs at request time: per-chunk term
 * frequencies, document lengths, and corpus-wide document frequency per
 * term. Runtime (lib/search/bm25.ts) only tokenizes the user's query and
 * does arithmetic over this — no re-tokenizing the corpus on every request.
 *
 * Only chunk `content` is indexed here, not `headingPath` — heading-path
 * relevance is scored as a separate multiplicative boost at query time (see
 * lib/search/expand.ts's headingBoost), not folded into the term stats, so
 * the two signals stay independently tunable.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tokenize } from "../lib/search/tokenize";

const CHUNKS_PATH = join(process.cwd(), "data", "chunks.json");
const BM25_PATH = join(process.cwd(), "data", "bm25.json");

interface Chunk {
  id: string;
  content: string;
}

function main() {
  const chunks: Chunk[] = JSON.parse(readFileSync(CHUNKS_PATH, "utf-8"));

  const docFreq: Record<string, number> = {};
  const docs = chunks.map((c) => {
    const tokens = tokenize(c.content);
    const termFreq: Record<string, number> = {};
    for (const t of tokens) termFreq[t] = (termFreq[t] ?? 0) + 1;
    for (const t of Object.keys(termFreq)) docFreq[t] = (docFreq[t] ?? 0) + 1;
    return { id: c.id, length: tokens.length, termFreq };
  });

  const avgDocLength = docs.reduce((sum, d) => sum + d.length, 0) / docs.length;
  const index = { N: docs.length, avgDocLength, docFreq, docs };

  // Machine-only artifact — not hand-edited, so no pretty-printing.
  const json = JSON.stringify(index);
  writeFileSync(BM25_PATH, json, "utf-8");
  console.log(
    `Wrote ${BM25_PATH} (${docs.length} docs, ${Object.keys(docFreq).length} distinct terms, ` +
      `${(json.length / 1024).toFixed(0)} KB)`
  );
}

main();
