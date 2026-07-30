/**
 * Shared BM25 retrieval over data/chunks.json, used by both /api/chat
 * (grounding the model's answer) and /api/search (the "Cari" tab's raw
 * search results). Owns its own data imports and glossary index so callers
 * don't have to wire that up themselves.
 */

import chunksData from "@/data/chunks.json";
import bm25Data from "@/data/bm25.json";
import glossaryData from "@/data/glossary.json";

import { search, type BM25Index } from "@/lib/search/bm25";
import { buildGlossaryIndex, expandQuery, headingBoost } from "@/lib/search/expand";
import { tokenize } from "@/lib/search/tokenize";

export interface Chunk {
  id: string;
  headingPath: string;
  pages: string;
  paraIds: string[];
  content: string;
}

const chunks = chunksData as Chunk[];
const chunksById = new Map(chunks.map((c) => [c.id, c]));
const headingById = new Map(chunks.map((c) => [c.id, c.headingPath]));
const glossaryIndex = buildGlossaryIndex(glossaryData as Record<string, string>);

export function retrieveChunks(question: string, topK: number): Chunk[] {
  const expanded = expandQuery(question, glossaryIndex);
  const queryTokens = [...new Set(tokenize(expanded))];
  const results = search(bm25Data as unknown as BM25Index, expanded, {
    topK,
    boost: (id) => headingBoost(headingById.get(id) ?? "", queryTokens),
  });
  return results.map((r) => chunksById.get(r.id)).filter((c): c is Chunk => Boolean(c));
}
