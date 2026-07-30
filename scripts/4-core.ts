/**
 * Stage 1, step 4 — report.md -> core.md
 *
 * The condensed core that's ALWAYS in the prompt, regardless of what
 * retrieval finds: the executive summary, the commission's own concluding
 * assessment (§3.18), and the full closing chapter including all 25
 * recommendations (§4.4.1-§4.4.25). Target ~15-20k tokens.
 *
 * This is deliberately NOT "all of Bab 3" — that's the ~150-page findings
 * chapter itself, already fully covered by report.md/chunks.json and
 * retrievable on demand. core.md's job is the condensed version that covers
 * the common case (headline findings, the recommendations) with zero
 * dependence on retrieval succeeding; Ringkasan Eksekutif already condenses
 * every major finding into a few paragraphs each, which is what "all
 * findings" means at this layer — the full unabridged text stays behind
 * retrieval, by design (see the build plan's three-layer coverage model).
 *
 * Sections pulled, in reading order:
 *   - Ringkasan Eksekutif (executive summary, incl. its own Penutup)
 *   - Bab 3 › 3.18 Pandangan Suruhanjaya (the commission's own summary
 *     assessment closing out the findings chapter)
 *   - Bab 4 — Rumusan (closing chapter, includes all 25 recommendations)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_PATH = join(process.cwd(), "data", "report.md");
const CORE_PATH = join(process.cwd(), "data", "core.md");

const INCLUDED_HEADINGS = [
  "Ringkasan Eksekutif",
  "Ringkasan Eksekutif › Penutup",
  "Bab 3 — Penemuan dan Cadangan › 3.18 Pandangan Suruhanjaya",
  "Bab 4 — Rumusan",
  "Bab 4 — Rumusan › Penutup",
];

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function main() {
  const raw = readFileSync(REPORT_PATH, "utf-8");
  const lines = raw.split("\n");

  let currentH1 = "";
  let currentH2: string | null = null;
  const headingPath = () => (currentH2 ? `${currentH1} › ${currentH2}` : currentH1);

  // Each section accumulates a list of PARAGRAPHS (not raw lines) — wrapped
  // lines from the same paragraph are joined with a single space, and a new
  // paragraph starts only at a real boundary: a numbered-paragraph anchor
  // (<a id="p-...">, used everywhere except Ringkasan Eksekutif), or, for
  // Ringkasan Eksekutif specifically, its own bare "N." numbering (e.g.
  // "2. Pada 20 Januari 2022...") — that section predates the report's
  // N.M.K anchoring scheme and isn't wrapped in <a id> tags at all.
  const sections = new Map<string, string[]>();
  for (const h of INCLUDED_HEADINGS) sections.set(h, []);

  let currentParagraph = "";
  const closeParagraph = () => {
    const hp = headingPath();
    if (currentParagraph.trim() !== "" && sections.has(hp)) {
      sections.get(hp)!.push(currentParagraph.trim());
    }
    currentParagraph = "";
  };

  for (const line of lines) {
    const h1Match = line.match(/^# (.+)$/);
    if (h1Match) {
      closeParagraph();
      currentH1 = h1Match[1].trim();
      currentH2 = null;
      continue;
    }
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      closeParagraph();
      currentH2 = h2Match[1].trim();
      continue;
    }
    if (line.startsWith("<!-- page:")) continue;

    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (!sections.has(headingPath())) continue;

    const anchorMatch = trimmed.match(/^<a id="p-[\d-]+"><\/a>(.*)$/);
    const bareNumberMatch = !anchorMatch && trimmed.match(/^\d{1,3}\.\s+[A-Z(]/);
    if (anchorMatch || bareNumberMatch) {
      closeParagraph();
      currentParagraph = anchorMatch ? anchorMatch[1] : trimmed;
    } else {
      currentParagraph += (currentParagraph ? " " : "") + trimmed;
    }
  }
  closeParagraph();

  const missing = INCLUDED_HEADINGS.filter((h) => (sections.get(h)?.length ?? 0) === 0);
  if (missing.length > 0) {
    throw new Error(
      `core.md source section(s) came back empty — report.md's heading structure may have ` +
        `changed: ${missing.join(", ")}`
    );
  }

  const parts: string[] = [
    "# Ringkasan Eksekutif",
    sections.get("Ringkasan Eksekutif")!.join("\n\n"),
    sections.get("Ringkasan Eksekutif › Penutup")!.join("\n\n"),
    "\n# Bab 3 › 3.18 Pandangan Suruhanjaya",
    sections.get("Bab 3 — Penemuan dan Cadangan › 3.18 Pandangan Suruhanjaya")!.join("\n\n"),
    "\n# Bab 4 — Rumusan",
    sections.get("Bab 4 — Rumusan")!.join("\n\n"),
    sections.get("Bab 4 — Rumusan › Penutup")!.join("\n\n"),
  ];

  const core = parts.join("\n\n");
  writeFileSync(CORE_PATH, core, "utf-8");

  const tokens = estimateTokens(core);
  console.log(`Wrote ${CORE_PATH} (${(core.length / 1024).toFixed(0)} KB, ~${tokens} tokens)`);
  if (tokens < 10000 || tokens > 30000) {
    console.warn(`Warning: core.md is well outside the 15-20k token target (~${tokens}).`);
  }

  // The 25 recommendations are the single most load-bearing part of core.md
  // — verify all of them actually made it in, not just that Bab 4 is non-empty.
  const recNumbers = [...core.matchAll(/(\d)\.(\d)\.(\d{1,2})\s/g)]
    .filter((m) => m[1] === "4" && m[2] === "4")
    .map((m) => Number(m[3]));
  const missingRecs = Array.from({ length: 25 }, (_, i) => i + 1).filter(
    (n) => !recNumbers.includes(n)
  );
  if (missingRecs.length > 0) {
    throw new Error(`core.md is missing recommendation(s) §4.4.${missingRecs.join(", §4.4.")}`);
  }
  console.log("All 25 recommendations (§4.4.1-§4.4.25) confirmed present in core.md.");
}

main();
