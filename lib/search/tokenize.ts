/**
 * Shared tokenizer for both the build-time BM25 index (scripts/5-bm25.ts)
 * and runtime query scoring (app/api/chat/route.ts). Using the exact same
 * function in both places is the whole point — BM25 only works if the index
 * and the query are tokenized identically.
 *
 * This is a lightweight, rule-based Malay stemmer, not a full linguistic
 * implementation (no dictionary-backed root validation, no reconstruction
 * of consonants dropped by nasalization — e.g. "menyiasat" strips to
 * "iasat", not "siasat"). That's a deliberate scope choice: this exists to
 * fix ONE specific documented weakness (see the build plan) — Fuse.js-style
 * fuzzy matching has no Malay morphology awareness at all, so a paraphrased
 * question ("kenapa TH rugi?") can retrieve worse than a literal one ("hibah
 * 2014"). Collapsing "pelaburan"/"melabur"/"laburan" onto one stem covers
 * the common case cheaply; perfect stemming is the documented upgrade path
 * (precomputed embeddings) if this proves insufficient in testing.
 */

const STOPWORDS = new Set([
  // Malay
  "yang", "dan", "di", "ke", "dari", "pada", "dengan", "untuk", "adalah",
  "ini", "itu", "akan", "telah", "atau", "juga", "tidak", "ada", "oleh",
  "sebagai", "dalam", "kepada", "para", "secara", "seperti", "bagi",
  "sesuatu", "suatu", "mereka", "kami", "kita", "saya", "anda", "ia", "nya",
  "jika", "bahawa", "bahwa", "apa", "apakah", "siapa", "bila", "bilakah",
  "mana", "kenapa", "mengapa", "bagaimana", "boleh", "harus", "mesti",
  "sudah", "belum", "masih", "hanya", "sahaja", "saja", "pun", "lah", "kah",
  "tersebut", "tersebut,", "berikut", "antara", "serta", "iaitu", "yaitu",
  "adakah", "supaya", "sama", "semua", "setiap", "beberapa", "satu", "dua",
  "tiga",
  // English
  "the", "is", "are", "was", "were", "a", "an", "of", "to", "in", "on",
  "at", "for", "and", "or", "but", "not", "this", "that", "these", "those",
  "what", "who", "when", "where", "why", "how", "does", "did", "do", "be",
  "been", "being", "have", "has", "had", "will", "would", "can", "could",
  "should", "it", "its", "as", "by", "with", "from", "about",
]);

const PREFIXES = [
  "menge", "penge", // longest first
  "meng", "meny", "peng", "peny",
  "men", "mem", "pen", "pem",
  "ber", "ter",
  "me", "pe", "be", "di", "ke", "se",
];

const PARTICLE_SUFFIXES = ["lah", "kah", "tah", "pun"];
const POSSESSIVE_SUFFIXES = ["nya", "ku", "mu"];
const DERIVATION_SUFFIXES = ["kan", "an", "i"]; // checked in this order

const MIN_ROOT_LENGTH = 3;

function stripSuffixes(word: string): string {
  let w = word;
  for (const suf of PARTICLE_SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= MIN_ROOT_LENGTH) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  for (const suf of POSSESSIVE_SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= MIN_ROOT_LENGTH) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  for (const suf of DERIVATION_SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= MIN_ROOT_LENGTH) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

function stripOnePrefix(word: string): string {
  for (const pre of PREFIXES) {
    if (word.startsWith(pre) && word.length - pre.length >= MIN_ROOT_LENGTH) {
      return word.slice(pre.length);
    }
  }
  return word;
}

/** Stem one already-lowercased, punctuation-free word. Safe no-op on words
 *  that don't match any affix pattern (numbers, short words, proper nouns
 *  that happen not to look like an affixed form). */
export function stem(word: string): string {
  if (word.length <= MIN_ROOT_LENGTH) return word;
  const afterSuffix = stripSuffixes(word);
  return stripOnePrefix(afterSuffix);
}

/**
 * Tokenize text into a list of search terms: lowercase, strip punctuation,
 * drop stopwords, then emit BOTH the original word and its stem (deduped)
 * — keeping the original protects proper nouns ("Tabung", "Azeez") and
 * abbreviations from being mangled by a stemming rule that doesn't apply to
 * them, while the stem is what lets differently-inflected forms of the same
 * root collide in the BM25 index.
 */
export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));

  const tokens: string[] = [];
  for (const w of words) {
    tokens.push(w);
    const stemmed = stem(w);
    if (stemmed !== w) tokens.push(stemmed);
  }
  return tokens;
}
