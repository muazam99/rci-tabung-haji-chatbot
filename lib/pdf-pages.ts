/**
 * Maps between the report's PRINTED page labels (what paragraphs.json and
 * the model's citations use — arabic "3", roman "ix") and the PDF's raw
 * page index (what pdf.js and the flipbook viewer use — 1-based, into
 * public/laporan-rci-tabung-haji.pdf).
 *
 * The mapping is reverse-engineered from the PDF's own layout — see the
 * page-numbering scheme documented in scripts/1-extract.ts, which this file
 * is the single source of truth for (that script imports from here so the
 * two can't drift apart):
 *   - PDF pages 1-10:   cover / TOC — no printed number.
 *   - PDF pages 11-38:  front matter, roman ix..xxxvi, 1:1 with PDF page.
 *   - PDF pages 39-249: body, printed as Arabic 1..211 via `pdfPage - 38`.
 *   - PDF pages 250-253: trailing colophon — no printed number.
 */

// 252, not 253: pdftotext's page-splitting (used to derive this scheme)
// leaves one trailing empty split after the real last page, which is easy
// to miscount as an extra page — confirmed against both pdfjs's own
// `numPages` and the PDF's own page-tree /Count field. Nothing in this
// file's actual math depends on this constant; the viewer gets its real
// page count straight from pdfjs at runtime.
export const PDF_TOTAL_PAGES = 252;

const ROMAN_SEQ = [
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
  "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx",
  "xxi", "xxii", "xxiii", "xxiv", "xxv", "xxvi", "xxvii", "xxviii", "xxix", "xxx",
  "xxxi", "xxxii", "xxxiii", "xxxiv", "xxxv", "xxxvi",
];

const BODY_START_PDF_PAGE = 39;
const BODY_END_PDF_PAGE = 249;
const FRONT_MATTER_START_PDF_PAGE = 11;
const FRONT_MATTER_END_PDF_PAGE = 38;

/** Printed label for a given 1-based PDF page index, or null if that page
 *  (cover, TOC, colophon) carries no printed page number. */
export function pdfPageToPrintedLabel(pdfPage: number): string | null {
  if (pdfPage >= FRONT_MATTER_START_PDF_PAGE && pdfPage <= FRONT_MATTER_END_PDF_PAGE) {
    return ROMAN_SEQ[pdfPage - FRONT_MATTER_START_PDF_PAGE + 8] ?? null; // pdfPage 11 -> ix (index 8)
  }
  if (pdfPage >= BODY_START_PDF_PAGE && pdfPage <= BODY_END_PDF_PAGE) {
    return String(pdfPage - 38);
  }
  return null;
}

/** 1-based PDF page index for a printed label ("3", "xii"), or null if the
 *  label doesn't map to any page (bad citation data, out-of-range). Only
 *  handles arabic labels — every value actually stored in paragraphs.json
 *  is arabic (the report's citable body never falls in the roman-numeral
 *  front matter), so roman lookups aren't needed here. */
export function printedPageToPdfPage(label: string): number | null {
  const n = Number(label);
  if (!Number.isFinite(n) || n <= 0) return null;
  const pdfPage = n + 38;
  if (pdfPage < BODY_START_PDF_PAGE || pdfPage > BODY_END_PDF_PAGE) return null;
  return pdfPage;
}
