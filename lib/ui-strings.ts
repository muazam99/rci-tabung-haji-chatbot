/**
 * UI chrome strings (buttons, placeholders, disclaimer) — separate from
 * answer language, which always follows whatever language the user asks
 * in (enforced by the system prompt, not this file). Malay-first with an
 * English toggle, per the build plan.
 */

export type UiLanguage = "ms" | "en";

export const UI_STRINGS = {
  ms: {
    title: "Chatbot Laporan RCI Tabung Haji",
    subtitle: "Tanya soalan mengenai Laporan Suruhanjaya Siasatan Diraja LTH (2014–2020)",
    inputPlaceholder: "Taip soalan anda mengenai laporan RCI...",
    send: "Hantar",
    thinking: "Sedang menjana jawapan...",
    disclaimerText:
      "Alat tidak rasmi. Jawapan dijana oleh AI dan mungkin tersilap — sila sahkan dengan Laporan Suruhanjaya Siasatan Diraja rasmi.",
    emptyState: "Mulakan dengan bertanya soalan mengenai laporan, contohnya “Apa itu UJSB?” atau “kenapa TH rugi?”",
    citationPage: "m.s.",
    viewInReport: "Lihat dalam laporan",
    errorGeneric: "Maaf, berlaku ralat. Sila cuba lagi.",
    errorRateLimit: "Anda telah mencapai had soalan bagi tempoh ini. Sila cuba lagi sebentar lagi.",
    languageToggleLabel: "EN",
    cacheHitLabel: "Jawapan tersimpan",
  },
  en: {
    title: "RCI Tabung Haji Report Chatbot",
    subtitle: "Ask questions about the Royal Commission of Inquiry report on LTH (2014–2020)",
    inputPlaceholder: "Type your question about the RCI report...",
    send: "Send",
    thinking: "Generating answer...",
    disclaimerText:
      "Unofficial tool. Answers are AI-generated and may be wrong — please verify against the official Royal Commission of Inquiry report.",
    emptyState: "Start by asking a question about the report, e.g. “What is UJSB?” or “Why did TH lose money?”",
    citationPage: "p.",
    viewInReport: "View in report",
    errorGeneric: "Sorry, something went wrong. Please try again.",
    errorRateLimit: "You've reached the question limit for this period. Please try again shortly.",
    languageToggleLabel: "BM",
    cacheHitLabel: "Cached answer",
  },
} as const;

export function getUiStrings(lang: UiLanguage) {
  return UI_STRINGS[lang];
}
