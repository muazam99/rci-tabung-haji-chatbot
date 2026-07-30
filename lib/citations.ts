/**
 * Shared citation format: the model is instructed (see lib/system-prompt.ts)
 * to cite paragraphs as `[¶N.M.K]` or the 2-level `[¶N.M]` form Bab 4 uses
 * for its non-anchored top-level paragraphs (4.1-4.6). This one regex/shape
 * is used both server-side (app/api/chat/route.ts, to log invalid
 * citations as a hallucination signal) and client-side (citation-chip
 * component, to render "Bab 3 › Hibah, m.s. 74" and deep-link into the
 * report reader) — single-sourcing it keeps the two from drifting apart.
 */

export interface ParagraphInfo {
  page: string;
  headingPath: string;
}

export interface ParsedCitation {
  /** The exact substring matched, e.g. "[¶3.6.6]" — useful for find/replace
   *  in rendered text. */
  raw: string;
  id: string;
  valid: boolean;
  page?: string;
  headingPath?: string;
}

// Deliberately lenient — matches "¶N.M.K" wherever it appears, not just
// inside a well-formed "[¶N.M.K]" bracket. The system prompt instructs one
// citation per bracket, but model output isn't guaranteed to follow that
// exactly (e.g. an occasional combined range like "[¶3.13.1–¶3.13.2]");
// "¶" is distinctive enough that it never appears in this report's prose
// for any other reason, so matching on it directly is safe.
const CITATION_RE = /¶([\d]+(?:\.[\d]+){1,2})/g;

export function extractCitations(
  text: string,
  paragraphs: Record<string, ParagraphInfo>
): ParsedCitation[] {
  return [...text.matchAll(CITATION_RE)].map((m) => {
    const id = m[1];
    const info = paragraphs[id];
    return {
      raw: m[0],
      id,
      valid: Boolean(info),
      page: info?.page,
      headingPath: info?.headingPath,
    };
  });
}

/** Chapter number parsed from a paragraph id, for building report-reader
 *  deep links (/laporan/bab-N#p-N-M-K). */
export function chapterOf(paragraphId: string): number | null {
  const n = Number(paragraphId.split(".")[0]);
  return Number.isFinite(n) ? n : null;
}

export function paragraphIdToAnchor(paragraphId: string): string {
  return `p-${paragraphId.split(".").join("-")}`;
}
