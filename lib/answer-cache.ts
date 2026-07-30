/**
 * Answer cache — two tiers, both explicitly no-database:
 *
 *   1. data/faq.json — curated, hand-reviewed question -> answer pairs,
 *      committed to the repo like every other data artifact. Starts empty;
 *      the plan's intent is to promote real, frequently-asked questions
 *      into this file over time based on the request log, not to have the
 *      server write to it at runtime (most serverless hosts have read-only
 *      filesystems in production anyway).
 *   2. An in-process Map — zero-cost, zero-latency for repeat questions
 *      hitting the same warm serverless instance. It does NOT persist
 *      across cold starts; that's fine, it's a bonus layer on top of (1),
 *      not the only cache.
 *
 * Both are checked via fuzzy match (token-Jaccard similarity over the same
 * tokenizer used for retrieval — reusing it keeps "similar question"
 * behavior consistent with "similar chunk" behavior) so paraphrases of an
 * already-answered question still hit the cache.
 */

import { tokenize } from "./search/tokenize";

const MAX_RUNTIME_CACHE_SIZE = 200;
const FUZZY_THRESHOLD = 0.85;

interface RuntimeCacheEntry {
  answer: string;
}

// Module-scope — survives across requests on a warm serverless instance,
// reset on cold start. Map preserves insertion order, which is all an LRU
// eviction policy needs here (touch-on-access re-insertion, evict oldest).
const runtimeCache = new Map<string, RuntimeCacheEntry>();

export function normalizeQuestion(question: string): string {
  return question.toLowerCase().trim().replace(/\s+/g, " ");
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function bestFuzzyMatch(
  normalizedQuestion: string,
  candidates: Iterable<string>
): { key: string; similarity: number } | null {
  let best: { key: string; similarity: number } | null = null;
  for (const key of candidates) {
    const similarity = jaccardSimilarity(normalizedQuestion, key);
    if (similarity >= FUZZY_THRESHOLD && (!best || similarity > best.similarity)) {
      best = { key, similarity };
    }
  }
  return best;
}

export interface CacheHit {
  answer: string;
  source: "faq" | "runtime";
}

/** Check both cache tiers, exact match first, then fuzzy. `faq` is the
 *  statically-imported data/faq.json content (normalized question -> answer). */
export function lookupCache(question: string, faq: Record<string, string>): CacheHit | null {
  const norm = normalizeQuestion(question);

  if (faq[norm]) return { answer: faq[norm], source: "faq" };
  if (runtimeCache.has(norm)) {
    const entry = runtimeCache.get(norm)!;
    runtimeCache.delete(norm);
    runtimeCache.set(norm, entry); // touch for LRU
    return { answer: entry.answer, source: "runtime" };
  }

  const faqMatch = bestFuzzyMatch(norm, Object.keys(faq));
  const runtimeMatch = bestFuzzyMatch(norm, runtimeCache.keys());

  if (faqMatch && (!runtimeMatch || faqMatch.similarity >= runtimeMatch.similarity)) {
    return { answer: faq[faqMatch.key], source: "faq" };
  }
  if (runtimeMatch) {
    const entry = runtimeCache.get(runtimeMatch.key);
    if (entry) return { answer: entry.answer, source: "runtime" };
  }
  return null;
}

export function storeInRuntimeCache(question: string, answer: string): void {
  const norm = normalizeQuestion(question);
  if (!runtimeCache.has(norm) && runtimeCache.size >= MAX_RUNTIME_CACHE_SIZE) {
    const oldestKey = runtimeCache.keys().next().value;
    if (oldestKey !== undefined) runtimeCache.delete(oldestKey);
  }
  runtimeCache.set(norm, { answer });
}
