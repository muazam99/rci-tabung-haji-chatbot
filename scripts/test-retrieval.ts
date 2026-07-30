/**
 * Retrieval eval harness — run BEFORE wiring the model (app/api/chat/route.ts).
 *
 * A fixed bilingual question set, each asserting the expected chunk/section
 * appears in the top-12 BM25 results. This is the real test of whether the
 * Malay stemmer + glossary expansion actually earn their place: paraphrased
 * conceptual questions ("kenapa TH rugi?") are the hard case literal
 * keyword questions ("hibah 2014") don't test at all.
 *
 * Usage: npm run test:retrieval
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { search, type BM25Index } from "../lib/search/bm25";
import { buildGlossaryIndex, expandQuery, headingBoost } from "../lib/search/expand";
import { tokenize } from "../lib/search/tokenize";

const bm25Index: BM25Index = JSON.parse(
  readFileSync(join(process.cwd(), "data", "bm25.json"), "utf-8")
);
const chunks: { id: string; headingPath: string }[] = JSON.parse(
  readFileSync(join(process.cwd(), "data", "chunks.json"), "utf-8")
);
const glossary: Record<string, string> = JSON.parse(
  readFileSync(join(process.cwd(), "data", "glossary.json"), "utf-8")
);
const glossaryIndex = buildGlossaryIndex(glossary);
const headingById = new Map(chunks.map((c) => [c.id, c.headingPath]));

const TOP_K = 12;

interface TestCase {
  question: string;
  /** Chunk id prefix expected somewhere in the top-K (e.g. "ch3-14" matches
   *  ch3-14-001, ch3-14-002, ...). */
  expectIdPrefix?: string;
  /** Set instead of expectIdPrefix when the answer lives in core.md (always
   *  in context) rather than needing retrieval to succeed at all. */
  coveredByCore?: boolean;
}

const TEST_CASES: TestCase[] = [
  { question: "kenapa TH rugi?", expectIdPrefix: "ch3-14" },
  { question: "hibah 2014", expectIdPrefix: "ch3-09" },
  { question: "apa itu UJSB?", expectIdPrefix: "ch3-13" },
  { question: "what did BNM do about Tabung Haji?", expectIdPrefix: "ch3-06" },
  { question: "senarai syor suruhanjaya", coveredByCore: true },
  { question: "siapa pengerusi RCI?", expectIdPrefix: "ch1-04" },
  { question: "bonus TH Properties", expectIdPrefix: "ch3-12" },
  { question: "police report", expectIdPrefix: "ch3-15" },
];

function runQuery(question: string) {
  const expanded = expandQuery(question, glossaryIndex);
  const queryTokens = [...new Set(tokenize(expanded))];
  const results = search(bm25Index, expanded, {
    topK: TOP_K,
    boost: (id) => headingBoost(headingById.get(id) ?? "", queryTokens),
  });
  return results;
}

function main() {
  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const results = runQuery(tc.question);

    if (tc.coveredByCore) {
      console.log(`✓ "${tc.question}" — covered by core.md (always in context), retrieval not required`);
      passed++;
      continue;
    }

    const hit = results.find((r) => r.id.startsWith(tc.expectIdPrefix!));
    const rank = hit ? results.indexOf(hit) + 1 : -1;

    if (hit) {
      console.log(`✓ "${tc.question}" — found ${hit.id} at rank ${rank}/${results.length}`);
      passed++;
    } else {
      console.log(`✗ "${tc.question}" — expected prefix "${tc.expectIdPrefix}" NOT in top ${TOP_K}`);
      console.log(`  top 5 instead: ${results.slice(0, 5).map((r) => `${r.id} (${r.score.toFixed(2)})`).join(", ")}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${passed + failed} passed.`);
  if (failed > 0) {
    console.log(
      "Failures here are exactly what the plan's designated upgrade path (precomputed " +
        "embeddings + cosine similarity) exists to fix, if the stemmer/glossary approach " +
        "proves insufficient — see the build plan's 'known weakness' section."
    );
    process.exitCode = 1;
  }
}

main();
