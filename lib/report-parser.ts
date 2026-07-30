/**
 * Parses report.md into renderable blocks for the report reader
 * (app/laporan/[bab]/page.tsx). Shares the same "join wrapped lines within
 * one paragraph, break only at real boundaries" approach as
 * scripts/4-core.ts, for the same reason: report.md preserves the PDF's
 * original hard line-wrapping, and rendering one <p> per source line would
 * be both ugly and semantically wrong.
 */

export type ReportBlock =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "paragraph"; text: string; anchorId?: string };

const ANY_H1_RE = /^# (.+)$/;
const CHAPTER_HEADING_RE = /^# Bab (\d)(?:\s*—.*)?$/;

/** Extract just one chapter's blocks (its own H1 through the next H1). */
export function parseChapter(reportMd: string, chapterNum: number): ReportBlock[] {
  const lines = reportMd.split("\n");
  const blocks: ReportBlock[] = [];

  let inChapter = false;
  let currentParagraph = "";
  let currentAnchor: string | undefined;

  const closeParagraph = () => {
    if (currentParagraph.trim() !== "") {
      blocks.push({ type: "paragraph", text: currentParagraph.trim(), anchorId: currentAnchor });
    }
    currentParagraph = "";
    currentAnchor = undefined;
  };

  for (const line of lines) {
    // ANY top-level heading ends our chapter once we're inside it — not
    // just the next "Bab N" divider. Without this, content after Bab 4
    // (whose H1 is "# Senarai Ekshibit", not "# Bab N") would fall through
    // and get appended as body text onto Bab 4's last paragraph.
    if (ANY_H1_RE.test(line)) {
      closeParagraph();
      if (inChapter) break;
      const chapterMatch = line.match(CHAPTER_HEADING_RE);
      inChapter = chapterMatch !== null && Number(chapterMatch[1]) === chapterNum;
      if (inChapter) {
        const titleMatch = line.match(/^# Bab \d\s*—\s*(.+)$/);
        blocks.push({ type: "h1", text: titleMatch ? titleMatch[1].trim() : line.replace(/^#\s*/, "") });
      }
      continue;
    }
    if (!inChapter) continue;

    if (line.startsWith("<!-- page:")) continue;

    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      closeParagraph();
      blocks.push({ type: "h2", text: h2Match[1].trim() });
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === "") continue;

    const anchorMatch = trimmed.match(/^<a id="(p-[\d-]+)"><\/a>(.*)$/);
    const bareNumberMatch = !anchorMatch && chapterNum === 4 && trimmed.match(/^\d{1,3}\.\s+[A-Z(]/);
    if (anchorMatch || bareNumberMatch) {
      closeParagraph();
      currentParagraph = anchorMatch ? anchorMatch[2] : trimmed;
      currentAnchor = anchorMatch ? anchorMatch[1] : undefined;
    } else {
      currentParagraph += (currentParagraph ? " " : "") + trimmed;
    }
  }
  closeParagraph();

  return blocks;
}

export const CHAPTER_SLUGS = ["bab-1", "bab-2", "bab-3", "bab-4"] as const;

export function chapterNumFromSlug(slug: string): number | null {
  const m = slug.match(/^bab-(\d)$/);
  return m ? Number(m[1]) : null;
}
