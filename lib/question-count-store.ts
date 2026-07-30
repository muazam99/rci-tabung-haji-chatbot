/**
 * Tracks how many questions the user has asked (across all conversations,
 * on-device only) so the donation dialog can be shown every N questions.
 * Follows the same pure-function + localStorage shape as chat-store.ts.
 */

const STORAGE_KEY = "rci-question-count-v1";
const PROMPT_EVERY = 2;

function readCount(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/** Increments the persisted question count and reports whether the
 *  donation dialog should be shown for this question. */
export function recordQuestionAsked(): boolean {
  const next = readCount() + 1;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Storage unavailable (e.g. private browsing) — the dialog just won't
    // fire reliably this session, which is fine.
  }
  return next % PROMPT_EVERY === 0;
}
