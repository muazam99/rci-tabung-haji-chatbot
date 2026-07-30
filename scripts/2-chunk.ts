/**
 * Stage 1, step 2 — report.md -> chunks.json + paragraphs.json
 *
 * (data/glossary.json is produced separately by scripts/1-extract.ts, which
 * needs a different pdftotext mode — `-table` — to read the glossary's
 * two-column layout correctly; see that script for why.)
 *
 * Parses the structured markdown from scripts/1-extract.ts into:
 *
 *   - data/chunks.json      — retrieval units, 500-1000 "tokens" each (rough
 *                             chars/4 estimate — good enough for chunk sizing,
 *                             not meant for billing precision), split on
 *                             heading boundaries first, never mid-paragraph.
 *   - data/paragraphs.json  — flat {paraId -> {page, headingPath}} lookup for
 *                             every citable unit. This is the server-side
 *                             hallucination guard: any [¶N.N.N] a model cites
 *                             must resolve here or it gets stripped.
 *
 * Citable unit granularity:
 *   - Chapters 1-3 use the report's native 3-level numbering (N.M.K), anchored
 *     in report.md as <a id="p-N-M-K">.
 *   - Chapter 4 ("Rumusan") numbers its top-level paragraphs directly as
 *     bare N.M (4.1..4.6) — no third level except §4.4, which itself breaks
 *     into 4.4.1-4.4.25 (the 25 recommendations). Both are anchored in
 *     report.md as <a id="p-N-M"> / <a id="p-N-M-K">; this script treats them
 *     uniformly, keyed by whatever id actually appears.
 *   - The three front-matter sections (Penghargaan, Ringkasan Eksekutif,
 *     Senarai Definisi dan Singkatan) have no natural sub-anchors at all —
 *     the source PDF simply doesn't number them. They're chunked by size
 *     with paraIds: [] and are still fully covered (verbatim) by core.md,
 *     so retrieval isn't the only path to them.
 *
 * A chunk NEVER spans a heading boundary (H1 for front matter/Bab 4, H1+H2
 * for chapters 1-3) and NEVER splits a single paragraph's text — if one
 * paragraph alone exceeds the token ceiling, the chunk is simply larger than
 * the target rather than being cut mid-sentence.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_PATH = join(process.cwd(), "data", "report.md");
const CHUNKS_PATH = join(process.cwd(), "data", "chunks.json");
const PARAGRAPHS_PATH = join(process.cwd(), "data", "paragraphs.json");

const MIN_CHUNK_TOKENS = 500;
const MAX_CHUNK_TOKENS = 1000;

/** Rough chars/4 estimate — fine for chunk-sizing decisions, not billing. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Unit {
  id: string; // e.g. "3.6.6" or "4.1" — matches the report's own numbering
  page: number; // page label at the START of this unit; string labels (roman) coerced to NaN, handled below
  pageLabel: string;
  pageEndLabel: string;
  headingPath: string;
  lines: string[];
}

interface AnonBlock {
  headingPath: string;
  page: string;
  pageEnd: string;
  text: string; // one giant block of prose for sections with no native numbering
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

function parseReport() {
  const raw = readFileSync(REPORT_PATH, "utf-8");
  const lines = raw.split("\n");

  const units: Unit[] = [];
  const anonBlocks: AnonBlock[] = [];

  let currentPage = "";
  let currentH1 = "";
  let currentH2: string | null = null;

  let openUnit: Unit | null = null;
  let openAnon: AnonBlock | null = null;

  const flushUnit = () => {
    if (openUnit) {
      units.push(openUnit);
      openUnit = null;
    }
  };
  const flushAnon = () => {
    if (openAnon && openAnon.text.trim() !== "") {
      anonBlocks.push(openAnon);
    }
    openAnon = null;
  };
  const headingPath = () =>
    currentH2 ? `${currentH1} › ${currentH2}` : currentH1;

  for (const raw of lines) {
    const pageMatch = raw.match(/^<!-- page:(.+) -->$/);
    if (pageMatch) {
      // Deliberately NOT touching openUnit/openAnon's end-page here. A page
      // marker only means "this page exists in the source", not "this
      // section's content continues here" — the next lines might turn out
      // to be a heading that closes the section with no real content on
      // this page at all (e.g. the glossary's last roman-numeral page
      // followed immediately by Bab 1's page marker before its own
      // heading). Only the content-append branches below, which run when a
      // line is actually attributed to the open unit/block, update its end
      // page — that's what keeps a section's page range from bleeding into
      // pages it never actually had content on.
      currentPage = pageMatch[1];
      continue;
    }

    const h1Match = raw.match(/^# (.+)$/);
    if (h1Match) {
      flushUnit();
      flushAnon();
      currentH1 = h1Match[1].trim();
      currentH2 = null;
      continue;
    }

    const h2Match = raw.match(/^## (.+)$/);
    if (h2Match) {
      flushUnit();
      currentH2 = h2Match[1].trim();
      continue;
    }

    const anchorMatch = raw.match(/^<a id="p-([\d-]+)"><\/a>(.*)$/);
    if (anchorMatch) {
      flushUnit();
      const id = anchorMatch[1].split("-").join(".");
      openUnit = {
        id,
        page: Number(currentPage) || NaN,
        pageLabel: currentPage,
        pageEndLabel: currentPage,
        headingPath: headingPath(),
        lines: [anchorMatch[2]],
      };
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed === "") continue;

    if (openUnit) {
      openUnit.lines.push(trimmed);
      openUnit.pageEndLabel = currentPage;
      continue;
    }

    // No open numbered unit — front-matter prose (Penghargaan, Ringkasan
    // Eksekutif, Senarai Definisi dan Singkatan). Accumulate as one running
    // block per H1 section; sentence-boundary splitting happens later.
    if (!openAnon || openAnon.headingPath !== headingPath()) {
      flushAnon();
      openAnon = { headingPath: headingPath(), page: currentPage, pageEnd: currentPage, text: "" };
    }
    openAnon.text += (openAnon.text ? " " : "") + trimmed;
    openAnon.pageEnd = currentPage;
  }
  flushUnit();
  flushAnon();

  return { units, anonBlocks };
}

interface Chunk {
  id: string;
  headingPath: string;
  pages: string;
  paraIds: string[];
  content: string;
}

function pagesRange(start: string, end: string): string {
  return start === end || !end ? start : `${start}-${end}`;
}

/** Pack a run of same-heading units into 500-1000 token chunks, never
 *  splitting a single unit's text. */
function packUnits(units: Unit[], idPrefix: string): Chunk[] {
  const chunks: Chunk[] = [];
  let seq = 1;
  let bucket: Unit[] = [];
  let bucketTokens = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    // u.lines already starts with the inline "N.M.K  text..." exactly as
    // the report itself writes it (captured whole from the anchor line in
    // report.md) — don't re-prepend u.id or it prints twice.
    const content = bucket.map((u) => u.lines.join(" ")).join("\n\n");
    chunks.push({
      id: `${idPrefix}-${String(seq).padStart(3, "0")}`,
      headingPath: bucket[0].headingPath,
      pages: pagesRange(bucket[0].pageLabel, bucket[bucket.length - 1].pageEndLabel),
      paraIds: bucket.map((u) => u.id),
      content,
    });
    seq++;
    bucket = [];
    bucketTokens = 0;
  };

  for (const unit of units) {
    const unitText = unit.lines.join(" ");
    const unitTokens = estimateTokens(unitText);
    // Flush first if adding this unit would overflow an already-reasonably-
    // sized bucket, OR if this single unit is already oversized on its own
    // (a few paragraphs run 5000+ tokens, e.g. §3.14.6) — in the latter
    // case it always gets its own isolated chunk rather than blending into
    // whatever small paragraphs happened to precede it.
    const wouldOverflow = bucketTokens + unitTokens > MAX_CHUNK_TOKENS && bucketTokens >= MIN_CHUNK_TOKENS;
    const unitAloneIsOversized = unitTokens > MAX_CHUNK_TOKENS;
    if (bucket.length > 0 && (wouldOverflow || unitAloneIsOversized)) {
      flush();
    }
    bucket.push(unit);
    bucketTokens += unitTokens;
  }
  flush();
  return chunks;
}

/** Split a large un-anchored prose block on sentence boundaries into
 *  500-1000 token chunks. Used only for the 3 front-matter sections, which
 *  have no native numbering to chunk by. */
function packAnonBlock(block: AnonBlock, idPrefix: string): Chunk[] {
  const sentences = block.text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [block.text];
  const chunks: Chunk[] = [];
  let seq = 1;
  let bucket: string[] = [];
  let bucketTokens = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    chunks.push({
      id: `${idPrefix}-${String(seq).padStart(3, "0")}`,
      headingPath: block.headingPath,
      pages: pagesRange(block.page, block.pageEnd),
      paraIds: [],
      content: bucket.join("").trim(),
    });
    seq++;
    bucket = [];
    bucketTokens = 0;
  };

  for (const sentence of sentences) {
    const t = estimateTokens(sentence);
    if (bucket.length > 0 && bucketTokens + t > MAX_CHUNK_TOKENS && bucketTokens >= MIN_CHUNK_TOKENS) {
      flush();
    }
    bucket.push(sentence);
    bucketTokens += t;
  }
  flush();
  return chunks;
}

function main() {
  const { units, anonBlocks } = parseReport();
  // "Anon" blocks aren't only front matter — several Bab 1/3 sections (e.g.
  // 1.2 Objektif, 1.3 Skop) have no N.M.K-numbered body at all, just plain
  // prose directly under the heading, and correctly fall back to the same
  // un-numbered accumulation path as Penghargaan/Ringkasan Eksekutif.
  console.log(`Parsed ${units.length} numbered paragraph units, ${anonBlocks.length} un-numbered prose blocks.`);

  // Group numbered units into contiguous runs sharing the same headingPath —
  // this is what "split on heading boundaries first" means in practice.
  const runs: Unit[][] = [];
  for (const unit of units) {
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun[0].headingPath === unit.headingPath) {
      lastRun.push(unit);
    } else {
      runs.push([unit]);
    }
  }

  const chunks: Chunk[] = [];
  for (const run of runs) {
    const first = run[0];
    const chapterMatch = first.headingPath.match(/^Bab (\d)/);
    const sectionMatch = first.headingPath.match(/› (\d)\.(\d{1,2}) /);
    // Bab 4 has no numbered (N.M) headings, but it does have a plain-text
    // "## Penutup" sub-heading after §4.4's recommendations — that run
    // shares "Bab 4" but not a numeric section, so falling back to a flat
    // "ch4-00" for every non-numbered Bab-4 run would collide two distinct
    // runs onto the same id prefix (both restarting their sequence at 001).
    // Disambiguate using whatever follows "› " when there's no N.M match.
    const afterArrow = first.headingPath.split("› ")[1];
    const idPrefix = chapterMatch
      ? sectionMatch
        ? `ch${chapterMatch[1]}-${sectionMatch[2].padStart(2, "0")}`
        : `ch${chapterMatch[1]}-${afterArrow ? slugify(afterArrow) : "00"}`
      : `fm-${slugify(first.headingPath)}`;
    chunks.push(...packUnits(run, idPrefix));
  }

  for (const block of anonBlocks) {
    chunks.push(...packAnonBlock(block, `fm-${slugify(block.headingPath)}`));
  }

  const idCounts = new Map<string, number>();
  for (const c of chunks) idCounts.set(c.id, (idCounts.get(c.id) ?? 0) + 1);
  const dupes = [...idCounts.entries()].filter(([, n]) => n > 1);
  if (dupes.length > 0) {
    throw new Error(
      `Duplicate chunk ids (two different heading runs produced the same id prefix): ` +
        dupes.map(([id, n]) => `${id} (x${n})`).join(", ")
    );
  }

  writeFileSync(CHUNKS_PATH, JSON.stringify(chunks, null, 2), "utf-8");
  console.log(`Wrote ${CHUNKS_PATH} (${chunks.length} chunks)`);

  const tokenSizes = chunks.filter((c) => c.paraIds.length > 0).map((c) => estimateTokens(c.content));
  const over = tokenSizes.filter((t) => t > MAX_CHUNK_TOKENS * 1.5).length;
  console.log(
    `Numbered-paragraph chunk sizes: min ${Math.min(...tokenSizes)}, max ${Math.max(...tokenSizes)}, ` +
      `avg ${Math.round(tokenSizes.reduce((a, b) => a + b, 0) / tokenSizes.length)} tokens. ` +
      `${over} chunks exceed 1.5x the ceiling (expected for a few unusually long paragraphs).`
  );

  const paragraphs: Record<string, { page: string; headingPath: string }> = {};
  for (const unit of units) {
    paragraphs[unit.id] = { page: unit.pageLabel, headingPath: unit.headingPath };
  }
  writeFileSync(PARAGRAPHS_PATH, JSON.stringify(paragraphs, null, 2), "utf-8");
  console.log(`Wrote ${PARAGRAPHS_PATH} (${Object.keys(paragraphs).length} citable paragraphs)`);

  if (!("4.4.1" in paragraphs) || !("4.4.25" in paragraphs)) {
    throw new Error("Expected §4.4.1-§4.4.25 (the 25 recommendations) to all resolve — they don't.");
  }
}

main();
