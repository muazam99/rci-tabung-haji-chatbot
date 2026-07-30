/**
 * GET /api/search?q=... — raw BM25 search results for the "Cari" tab, as
 * opposed to /api/chat which uses the same retrieval to ground an LLM
 * answer. No rate limiting/caching here: this is a cheap in-memory scan
 * (see lib/search/bm25.ts), not a paid API call.
 */

import { NextRequest } from "next/server";
import { retrieveChunks } from "@/lib/search/retrieve";

export const runtime = "nodejs";

const TOP_K_RESULTS = 20;
const SNIPPET_LENGTH = 220;
const MAX_QUERY_LENGTH = 200;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return Response.json({ results: [] });

  const results = retrieveChunks(q, TOP_K_RESULTS).map((c) => ({
    id: c.id,
    headingPath: c.headingPath,
    pages: c.pages,
    snippet: c.content.length > SNIPPET_LENGTH ? c.content.slice(0, SNIPPET_LENGTH) + "…" : c.content,
  }));

  return Response.json({ results });
}
