/**
 * Query expansion using the report's own glossary (data/glossary.json,
 * extracted by scripts/1-extract.ts from "Senarai Definisi dan Singkatan").
 * Bidirectional: a query containing an abbreviation ("BNM") also searches
 * for its full form ("Bank Negara Malaysia"), and vice versa — since the
 * body text almost always uses the abbreviation after first definition, but
 * a user might ask using either form.
 *
 * Callers pass in the already-loaded glossary object (imported as static
 * JSON in the API route) — this module does no file I/O of its own.
 */

import { tokenize } from "./tokenize";

/**
 * Small English -> Malay domain lexicon. BM25 + Malay stemming closes the
 * gap between inflected forms of the SAME word ("pelaburan"/"melabur"), but
 * it cannot bridge two different languages — an English query like "police
 * report" shares no tokens at all with the Malay body text ("Laporan
 * Polis"). This isn't meant to be a translator; it's a short, hand-picked
 * list of report-domain nouns a bilingual user is likely to type in English
 * while asking about a Malay document.
 */
const EN_TO_MY: Record<string, string> = {
  police: "polis",
  report: "laporan",
  reports: "laporan",
  investment: "pelaburan",
  investments: "pelaburan",
  chairman: "pengerusi",
  chairperson: "pengerusi",
  minister: "menteri",
  government: "kerajaan",
  board: "lembaga",
  loss: "rugi",
  losses: "rugi",
  profit: "untung keuntungan",
  distribution: "agihan pengagihan",
  regulator: "kawal selia",
  regulation: "kawal selia",
  committee: "jawatankuasa",
  recommendation: "cadangan syor",
  recommendations: "cadangan syor",
  finding: "penemuan",
  findings: "penemuan",
  company: "syarikat",
  subsidiary: "anak syarikat",
  court: "mahkamah",
  corruption: "rasuah",
  fund: "tabung dana",
  salary: "gaji",
  management: "pengurusan",
  governance: "tadbir urus",
  commission: "suruhanjaya",
  inquiry: "siasatan suruhanjaya",
  pilgrim: "jemaah haji",
  pilgrims: "jemaah haji",
};

/** Sections that are reference/meta material (glossary, exhibit index)
 *  rather than findings — they tend to dominate BM25 scores for any query
 *  that happens to use one of their many short entries as a literal token
 *  (e.g. an abbreviation), crowding out the substantive chunk the question
 *  actually wants. Both are always available to the model another way
 *  (the glossary is included verbatim in every prompt; the exhibit list is
 *  a reference index, not content a public Q&A bot needs to surface), so
 *  down-weighting them in retrieval loses no real coverage. */
const REFERENCE_HEADING_PATHS = new Set(["Senarai Definisi dan Singkatan", "Senarai Ekshibit"]);
const REFERENCE_SECTION_WEIGHT = 0.25;

export interface GlossaryIndex {
  /** lowercased abbreviation -> first/primary full-form definition */
  forward: Map<string, string>;
  /** lowercased full-form phrase -> abbreviation */
  reverse: Map<string, string>;
}

export function buildGlossaryIndex(glossary: Record<string, string>): GlossaryIndex {
  const forward = new Map<string, string>();
  const reverse = new Map<string, string>();

  for (const [abbrev, definition] of Object.entries(glossary)) {
    // Definitions sometimes offer an "X atau Y" alternative phrasing (e.g.
    // "Royal Commission of Inquiry atau Suruhanjaya Siasatan Diraja") — both
    // sides are registered as reverse lookups, but only the first is used
    // as the forward expansion text, to avoid bloating the query.
    const alternatives = definition
      .split(/\s+atau\s+/i)
      .map((alt) => alt.replace(/\[.*?\]/g, "").trim())
      .filter((alt) => alt.length > 2);

    forward.set(abbrev.toLowerCase(), alternatives[0] ?? definition);
    for (const alt of alternatives) {
      reverse.set(alt.toLowerCase(), abbrev);
    }
  }
  return { forward, reverse };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeTerm(haystack: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(haystack);
}

/** Append glossary + English-Malay domain-term expansions found in the
 *  query, so BM25 also matches chunks that only use the other form. */
export function expandQuery(query: string, index: GlossaryIndex): string {
  const additions = new Set<string>();

  for (const [abbrev, definition] of index.forward) {
    if (containsWholeTerm(query, abbrev)) additions.add(definition);
  }
  for (const [phrase, abbrev] of index.reverse) {
    if (containsWholeTerm(query, phrase)) additions.add(abbrev);
  }
  for (const [en, my] of Object.entries(EN_TO_MY)) {
    if (containsWholeTerm(query, en)) additions.add(my);
  }

  return additions.size > 0 ? `${query} ${[...additions].join(" ")}` : query;
}

/**
 * Modest score multiplier for chunks whose heading path shares stemmed
 * terms with the query — a heading match is a strong relevance signal in a
 * structured report (asking about "hibah" should favor the chunk actually
 * titled "Pengagihan Keuntungan (Hibah)" over one that merely mentions it
 * in passing).
 */
export function headingBoost(headingPath: string, queryTokens: string[]): number {
  if (REFERENCE_HEADING_PATHS.has(headingPath)) return REFERENCE_SECTION_WEIGHT;
  const headingTokens = new Set(tokenize(headingPath));
  const matches = new Set(queryTokens.filter((t) => headingTokens.has(t)));
  return matches.size > 0 ? 1 + 0.15 * matches.size : 1;
}
