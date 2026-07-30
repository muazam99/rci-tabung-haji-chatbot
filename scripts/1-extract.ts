/**
 * Stage 1, step 1 — PDF -> report.md
 *
 * Shells out to `pdftotext -layout` (poppler-utils; must be installed on the
 * machine running this script — it is a build-time-only dependency, never
 * shipped to the app) and turns the raw per-page text into a single
 * structured markdown file: report.md. That file is the source of truth for
 * every later stage — read it, hand-correct it if something looks off, and
 * re-run downstream scripts. Never hand-edit chunks.json/index.json/core.md
 * directly; edit report.md and regenerate.
 *
 * Page-number scheme (reverse-engineered from the actual PDF):
 *   - PDF pages 1-10:   cover / title / TOC — no printed page number.
 *   - PDF pages 11-38:  front matter, printed as roman numerals ix..xxxvi,
 *                       1:1 sequential with PDF page (pdfPage 11 -> "ix").
 *   - PDF pages 39-249: body, printed as Arabic 1..211 via `pdfPage - 38`.
 *                       Confirmed exact at every page where the footer
 *                       banner carries a visible number (98 sample points
 *                       spanning the whole range); the formula is used
 *                       directly rather than depending on that banner regex
 *                       succeeding, because chapter-opening pages suppress
 *                       the running header entirely.
 *   - PDF pages 250-253: trailing colophon/blank pages, no citable content.
 *
 * Known defects in the raw extraction, all handled here:
 *   - Every page footer carries TWO numbers: a decoy per-chapter counter
 *     that resets at each "BAB", and the real printed page number attached
 *     to the running-header banner line (prefix on even pages, suffix on
 *     odd). Both are stripped; only the real number is kept, via -38.
 *   - The PDF's chapter/section title pages use a faux-bold effect (title
 *     printed twice at a tiny offset). For short titles ("BAB DUA") this
 *     lands as simple adjacent character-doubling ("BBAABB DDUUAA"), fixed
 *     by collapsing repeated adjacent characters. For longer titles (a
 *     chapter's subtitle, "Ringkasan Eksekutif", "Senarai Definisi dan
 *     Singkatan") the two copies land INTERLEAVED rather than adjacent —
 *     simple collapsing produces different-but-still-wrong garbage. These
 *     titles are corrected by outright replacement with a hardcoded
 *     canonical string, since there are only a handful of them and their
 *     correct text is already known from the table of contents. This is a
 *     structural fix, not a heuristic one: it does not depend on detecting
 *     *how* a title got garbled, only on knowing *which* page it's on.
 *   - Each chapter's opening divider spans 2-3 near-blank PDF pages that
 *     repeat "BAB N" (and, on some chapters, the garbled subtitle) with no
 *     other content. These are collapsed into a single clean H1 line; the
 *     repeated/garbled fluff between the first "BAB N" sighting and the
 *     first real heading or paragraph is discarded outright.
 *   - Bab 4 ("Rumusan") numbers its top-level paragraphs directly as N.M
 *     (4.1, 4.2, 4.3, 4.4) rather than the three-level N.M.K scheme used
 *     everywhere else in the report — confirmed against the table of
 *     contents, which lists no N.M-level headings under Bab 4 at all. A
 *     generic "N.M followed by a capital letter" heading regex would
 *     misclassify these as section headings; instead, headings are only
 *     recognized against a whitelist of (chapter, section) numbers taken
 *     directly from the table of contents, which has no entries for
 *     chapter 4. The same whitelist also kills a table-fragment false
 *     positive ("2.0 Khas)" from a wrapped bonus-rate table cell).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pdfPageToPrintedLabel } from "../lib/pdf-pages";

const PDF_PATH = join(
  process.cwd(),
  "public",
  "laporan-rci-tabung-haji.pdf"
);
const OUT_PATH = join(process.cwd(), "data", "report.md");
const GLOSSARY_PATH = join(process.cwd(), "data", "glossary.json");

const BANNER = "LAPORAN SURUHANJAYA SIASATAN DIRAJA TABUNG HAJI";

const CHAPTER_TITLES: Record<number, string> = {
  1: "Pengenalan",
  2: "Latar Belakang Pengurusan dan Operasi Lembaga Tabung Haji",
  3: "Penemuan dan Cadangan",
  4: "Rumusan",
};
const CHAPTER_NUMBER_BY_WORD: Record<string, number> = {
  SATU: 1,
  DUA: 2,
  TIGA: 3,
  EMPAT: 4,
};

/** (chapter, section) numbers that are real section headings, per the TOC.
 *  Chapter 4 has none — its 4.1-4.4 are plain numbered paragraphs, not headings. */
const VALID_SECTIONS: Record<number, number[]> = {
  1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  2: [1, 2],
  3: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  4: [],
};

/** Front-matter titles known to render garbled (interleaved faux-bold) —
 *  corrected by outright replacement of the first content line on that page. */
const FRONT_MATTER_TITLES: Record<string, string> = {
  ix: "Penghargaan",
  xi: "Ringkasan Eksekutif",
  xxxiii: "Senarai Definisi dan Singkatan",
};

// On Windows, poppler often arrives bundled with Git for Windows at
// C:\Program Files\Git\mingw64\bin\pdftotext.exe — visible from Git Bash's
// own PATH construction, but not from the plain Windows PATH a directly
// spawned Node process inherits. Try the bare command first, then this.
const POPPLER_FALLBACKS = [
  "C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe",
  "C:\\msys64\\mingw64\\bin\\pdftotext.exe",
];

let resolvedPdftotext: string | null = null;

/**
 * Probe with `-v`, not because we care about its output, but because it's
 * the cheapest command that exercises PATH/file resolution. Note: poppler's
 * `pdftotext -v` prints version info to stdout but exits with status 99 by
 * design — that is NOT a failure. The only failure signal that matters here
 * is the binary not being found at all (ENOENT), which spawnSync surfaces
 * as `result.error`, distinct from a non-zero exit code.
 */
function canRun(candidate: string): boolean {
  const result = spawnSync(candidate, ["-v"], { stdio: "pipe" });
  return !result.error;
}

function resolvePoppler(): string {
  if (resolvedPdftotext) return resolvedPdftotext;
  for (const candidate of ["pdftotext", ...POPPLER_FALLBACKS]) {
    if (canRun(candidate)) {
      resolvedPdftotext = candidate;
      return candidate;
    }
  }
  throw new Error(
    "pdftotext not found. Install poppler-utils (e.g. `choco install poppler`, or download " +
      "poppler for Windows and add its bin/ to PATH) — this is a build-time-only dependency, " +
      "not needed by the deployed app."
  );
}

function extractRawText(): string {
  const bin = resolvePoppler();
  const args = ["-layout", "-enc", "UTF-8", PDF_PATH, "-"];
  const buf = execFileSync(bin, args, {
    maxBuffer: 1024 * 1024 * 50,
  });
  return buf.toString("utf-8");
}

// The glossary ("Senarai Definisi dan Singkatan") is a two-column
// definition list. `-layout` mode — used for the rest of the document
// because it correctly handles running headers over normal prose — instead
// scrambles this specific layout: it linearizes column 1's terms against
// column 2's definitions out of order, so e.g. "BNM" ends up paired with
// someone else's definition entirely. `-table` mode, which is tuned for
// exactly this kind of tabular content, reads it correctly. So the glossary
// gets pulled with a second, separate pdftotext invocation on just its page
// range (printed pages xxxiii-xxxvi = PDF pages 35-38).
const GLOSSARY_START_PDF_PAGE = 35;
const GLOSSARY_END_PDF_PAGE = 38;

function extractGlossary(): Record<string, string> {
  const bin = resolvePoppler();
  const args = [
    "-table",
    "-enc", "UTF-8",
    "-f", String(GLOSSARY_START_PDF_PAGE),
    "-l", String(GLOSSARY_END_PDF_PAGE),
    PDF_PATH, "-",
  ];
  const buf = execFileSync(bin, args, { maxBuffer: 1024 * 1024 * 10 });
  const rawLines = buf.toString("utf-8").split("\n");

  const glossary: Record<string, string> = {};
  let currentKey: string | null = null;

  const isJunk = (line: string) =>
    line.includes(BANNER) ||
    /^SENARAI DEFIN/i.test(line) ||
    /^Dalam laporan ini/.test(line) ||
    /^perkataan\s+dan\s+ungkapan/.test(line) ||
    /^mempunyai makna berikut/.test(line) ||
    /^\s*[ivxlcdm]+\s*$/i.test(line) || // standalone roman-numeral page number
    /^\s*\d+\s*$/.test(line); // standalone Arabic footnote/reference number

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (trimmed === "" || isJunk(trimmed)) continue;

    const entryMatch = trimmed.match(/^(\S.*?)\s{2,}:\s+(.+)$/);
    if (entryMatch) {
      currentKey = entryMatch[1].trim();
      glossary[currentKey] = entryMatch[2].trim();
      continue;
    }
    // Continuation of a wrapped definition (e.g. FRSIC's "Implementation
    // Committee" on its own line, or Ordinan's bracketed citation).
    if (currentKey) {
      glossary[currentKey] = `${glossary[currentKey]} ${trimmed}`.replace(/\s+/g, " ");
    }
  }
  return glossary;
}

/** Collapse simple adjacent character-doubling, e.g. "BBAABB SSAATTUU" -> "BAB SATU".
 *  Only reliable for SHORT titles ("BAB DUA") — longer garbled titles are true
 *  interleaves and are handled separately via canonical replacement. */
function deDouble(line: string): string {
  return line.replace(/(.)\1/g, "$1");
}

/** Roman numerals ix..xxxvi as used by the front matter footers. */
const ROMAN_SEQ = [
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
  "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx",
  "xxi", "xxii", "xxiii", "xxiv", "xxv", "xxvi", "xxvii", "xxviii", "xxix", "xxx",
  "xxxi", "xxxii", "xxxiii", "xxxiv", "xxxv", "xxxvi",
];

interface PageLabel {
  pdfPage: number;
  /** Printed page label as it appears in the report: "3", "xii", or null (no printed number). */
  label: string | null;
}

function pageLabelFor(pdfPage: number): PageLabel {
  if (pdfPage >= 11 && pdfPage <= 38) {
    return { pdfPage, label: ROMAN_SEQ[pdfPage - 11 + 8] ?? null }; // pdfPage 11 -> ix (index 8)
  }
  if (pdfPage >= 39 && pdfPage <= 249) {
    return { pdfPage, label: String(pdfPage - 38) };
  }
  return { pdfPage, label: null };
}

/**
 * Strip footer noise from a page's lines: the running-header banner (with or
 * without an attached real page number) and the standalone decoy counter
 * line that sits immediately next to it. Operates on the tail of the page
 * only, since that's where the footer lives.
 */
function stripFooter(lines: string[]): string[] {
  const out = [...lines];
  for (let i = out.length - 1; i >= Math.max(0, out.length - 4); i--) {
    if (out[i].includes(BANNER)) {
      const before = out[i - 1] ?? "";
      const after = out[i + 1] ?? "";
      const isLoneNumber = (s: string) => /^\s*\d+\s*$/.test(s);
      const toRemove = [i];
      if (isLoneNumber(before)) toRemove.push(i - 1);
      if (isLoneNumber(after)) toRemove.push(i + 1);
      toRemove.sort((a, b) => b - a).forEach((idx) => out.splice(idx, 1));
      break;
    }
  }
  // Front-matter pages (Penghargaan, Ringkasan Eksekutif, Senarai Definisi)
  // print their footer as a BARE roman numeral with no banner text at all —
  // unlike body chapters, which always pair the number with the running
  // header. A standalone line that's purely roman-numeral letters at the
  // tail of a page is unambiguous footer noise (this report never uses
  // bare roman numerals as a word in running prose), so strip it too.
  for (let i = out.length - 1; i >= Math.max(0, out.length - 3); i--) {
    if (/^\s*[ivxlcdm]+\s*$/i.test(out[i]) && out[i].trim() !== "") {
      out.splice(i, 1);
      break;
    }
  }
  return out;
}

interface ParsedPage {
  pdfPage: number;
  label: string | null;
  lines: string[];
}

function parsePages(raw: string): ParsedPage[] {
  const rawPages = raw.split("\f");
  return rawPages.map((pageText, idx) => {
    const pdfPage = idx + 1;
    const { label } = pageLabelFor(pdfPage);
    const lines = stripFooter(pageText.split("\n"));
    return { pdfPage, label, lines };
  });
}

const BODY_END_PDF_PAGE = 249;

function buildMarkdown(pages: ParsedPage[]): string {
  const out: string[] = [];
  let currentLabel: string | null = null;
  const seenChapters = new Set<number>();
  const seenFrontMatterTitles = new Set<string>();
  /** Non-null while swallowing a chapter divider's repeated/garbled fluff. */
  let inDivider: number | null = null;

  const emitPageMarker = (label: string | null) => {
    if (label !== null && label !== currentLabel) {
      out.push(`<!-- page:${label} -->`);
      currentLabel = label;
    }
  };

  for (const page of pages) {
    // Skip cover/TOC pages (1-10) and trailing colophon (250+) — no citable content.
    if (page.pdfPage < 11 || page.pdfPage > BODY_END_PDF_PAGE) continue;

    emitPageMarker(page.label);

    for (const rawLine of page.lines) {
      const trimmed = rawLine.trim();
      if (trimmed === "") continue;

      // Any all-caps line gets the cheap de-doubling pass; harmless no-op
      // for lines that aren't actually doubled.
      const candidate =
        trimmed === trimmed.toUpperCase() ? deDouble(trimmed) : trimmed;

      // "BAB SATU" / "BAB DUA" / etc (possibly still-garbled — de-double
      // reliably fixes this specific short banner even when it can't fix
      // the longer subtitle that follows it).
      const babMatch = candidate.match(/^BAB\s+(SATU|DUA|TIGA|EMPAT)$/i);
      if (babMatch) {
        const n = CHAPTER_NUMBER_BY_WORD[babMatch[1].toUpperCase()];
        if (!seenChapters.has(n)) {
          seenChapters.add(n);
          out.push(`\n# Bab ${n} — ${CHAPTER_TITLES[n]}\n`);
        }
        // Enter (or remain in) divider-swallow mode: discard the repeated
        // banner and whatever garbled subtitle fluff follows, until the
        // first real heading/paragraph for this chapter appears.
        inDivider = n;
        continue;
      }

      if (inDivider !== null) {
        // Still inside the divider span for the current chapter — discard
        // fluff until a real structural marker shows up below.
        const looksLikeRealContent =
          /^(\d)\.(\d{1,2})\.(\d{1,3})\s+/.test(candidate) || // N.M.K paragraph
          /^(\d)\.(\d{1,2})\s+[A-Z]/.test(candidate); // N.M section or bare Bab-4 paragraph
        if (!looksLikeRealContent) continue;
        inDivider = null;
        // fall through and process this line normally below
      }

      // Known-garbled front-matter titles (Penghargaan, Ringkasan
      // Eksekutif, Senarai Definisi dan Singkatan) — replace outright, once
      // per page, regardless of how badly the source text is mangled.
      if (
        page.label &&
        FRONT_MATTER_TITLES[page.label] &&
        !seenFrontMatterTitles.has(page.label)
      ) {
        seenFrontMatterTitles.add(page.label);
        out.push(`\n# ${FRONT_MATTER_TITLES[page.label]}\n`);
        continue;
      }

      // "Penutup" (closing remarks) appears twice in the source — once as a
      // subsection inside Ringkasan Eksekutif, once inside Bab 4 — and
      // "Senarai Ekshibit" (exhibit index) is its own top-level section after
      // Bab 4. Neither is part of any chapter's N.M numbering, but both need
      // an explicit heading marker: without one, whatever numbered paragraph
      // was still open (e.g. Bab 4's §4.6) keeps absorbing every line after
      // it as "continuation" text — which is exactly how the entire Senarai
      // Ekshibit exhibit list (hundreds of lines) ended up glued onto §4.6
      // before this fix.
      if (candidate === "Penutup") {
        out.push(`\n## Penutup\n`);
        continue;
      }
      if (candidate === "SENARAI EKSHIBIT") {
        out.push(`\n# Senarai Ekshibit\n`);
        continue;
      }

      // "N.M Title" section heading — only recognized against the TOC-derived
      // whitelist, so table fragments and Bab 4's bare N.M paragraphs never
      // get misclassified as headings.
      const sectionMatch = candidate.match(/^(\d{1})\.(\d{1,2})\s+([A-Z][^\n]*)$/);
      if (sectionMatch) {
        const chapter = Number(sectionMatch[1]);
        const section = Number(sectionMatch[2]);
        if (VALID_SECTIONS[chapter]?.includes(section)) {
          out.push(`\n## ${chapter}.${section} ${sectionMatch[3].trim()}\n`);
          continue;
        }
        // Not a whitelisted heading. Chapter 4 ("Rumusan") genuinely numbers
        // its top-level paragraphs as bare N.M (confirmed via the TOC, which
        // lists no N.M headings under Bab 4 at all) — anchor these as
        // 2-level citable paragraphs so §4.1-§4.4 stay quotable, same as
        // every 3-level N.M.K paragraph elsewhere. For any other chapter,
        // a non-whitelisted N.M match is stray table noise (e.g. "2.0
        // Khas)") and is deliberately left as plain body text.
        if (chapter === 4) {
          const anchor = `p-${chapter}-${section}`;
          out.push(`<a id="${anchor}"></a>${chapter}.${section}  ${sectionMatch[3].trim()}`);
          continue;
        }
        // fall through as body text
      }

      // "N.M.K  text..." numbered paragraph — anchor + inline number,
      // preserved verbatim since the numbering is part of the report's own
      // prose ("1.1.1 Parlimen Keempat Belas...").
      const paraMatch = candidate.match(/^(\d{1})\.(\d{1,2})\.(\d{1,3})\s+(.*)$/);
      if (paraMatch) {
        const [, a, b, c, rest] = paraMatch;
        const anchor = `p-${a}-${b}-${c}`;
        out.push(`<a id="${anchor}"></a>${a}.${b}.${c}  ${rest}`);
        continue;
      }

      out.push(candidate);
    }
  }

  // Merge wrapped two-line section headings, e.g. "## 3.4 Ketua Pegawai
  // Eksekutif Lembaga Tabung Haji dan Pegawai" immediately followed by the
  // plain continuation line "Pengurusan Dalam Anak Syarikat".
  //
  // Deliberately NOT a generic "next non-anchored line = continuation"
  // heuristic: several Bab 1 sections (1.2, 1.5-1.8, 1.10-1.12) have no
  // N.M.K-numbered body at all, just plain prose starting immediately after
  // the heading — a generic rule swallowed that first sentence straight into
  // the heading line. Restricted to the exact section numbers confirmed (by
  // reading the unmerged output against the table of contents) to have a
  // genuinely wrapped, truncated title.
  const NEEDS_TITLE_CONTINUATION = new Set([
    "2.2", "3.4", "3.6", "3.11", "3.13", "3.15", "3.17",
  ]);
  const merged: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const line = out[i];
    const headingMatch = line.match(/^\n?## (\d\.\d{1,2}) /);
    if (headingMatch && NEEDS_TITLE_CONTINUATION.has(headingMatch[1])) {
      const next = out[i + 1];
      if (next !== undefined && next.trim() !== "" && !next.startsWith("<a id=")) {
        merged.push(`${line.replace(/\s+$/, "")} ${next.trim()}\n`);
        i++;
        continue;
      }
    }
    merged.push(line);
  }

  const missingChapters = [1, 2, 3, 4].filter((n) => !seenChapters.has(n));
  if (missingChapters.length > 0) {
    throw new Error(
      `Never found a "BAB ${missingChapters.join(", ")}" divider — chapter detection is broken.`
    );
  }

  return merged.join("\n");
}

function main() {
  resolvePoppler();
  if (!existsSync(PDF_PATH)) {
    throw new Error(`Source PDF not found at ${PDF_PATH}`);
  }
  console.log("Extracting text via pdftotext -layout ...");
  const raw = extractRawText();
  const pages = parsePages(raw);
  console.log(`Parsed ${pages.length} PDF pages.`);

  const md = buildMarkdown(pages);

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, md, "utf-8");
  console.log(`Wrote ${OUT_PATH} (${(md.length / 1024).toFixed(0)} KB)`);

  console.log("Extracting glossary via pdftotext -table (column-aware) ...");
  const glossary = extractGlossary();
  writeFileSync(GLOSSARY_PATH, JSON.stringify(glossary, null, 2), "utf-8");
  console.log(`Wrote ${GLOSSARY_PATH} (${Object.keys(glossary).length} terms)`);

  console.log(
    "Hand-verify: Malay diacritics, the 4 chapter titles + 3 front-matter titles, " +
      "~10 random page citations, and a few glossary entries (e.g. BNM, LTH, MOF) " +
      "against the real PDF before running scripts/2-chunk.ts."
  );
}

main();
