"use client";

import { useEffect } from "react";

/**
 * If the URL has a `#p-N-M-K` hash (a citation deep link from the chat UI),
 * scroll that paragraph into view and apply a fading highlight. Runs on
 * mount AND on subsequent `hashchange` events — a citation Link to a
 * different paragraph within the SAME chapter page is a same-document
 * navigation that changes only the hash, which wouldn't otherwise re-run a
 * mount-only effect. Client-only by necessity — reads `window.location`.
 */
export function ScrollToHash() {
  useEffect(() => {
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    let raf1: number | undefined;
    let raf2: number | undefined;
    let previousEl: HTMLElement | null = null;

    const runHighlight = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;

      const el = document.getElementById(hash);
      if (!el) return;

      // Clear any in-flight highlight from a previous hash so two quick
      // citation clicks don't leave a stale highlighted paragraph behind.
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (cleanupTimer) clearTimeout(cleanupTimer);
      previousEl?.classList.remove("highlight-paragraph", "highlight-paragraph-fade");
      previousEl = el;

      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("highlight-paragraph");

      // Two rAFs so the browser paints the "lit" state before the fade-out
      // transition class is added — otherwise the transition can start from
      // the very first frame and never visibly show the highlight at all.
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          el.classList.add("highlight-paragraph-fade");
        });
      });

      cleanupTimer = setTimeout(() => {
        el.classList.remove("highlight-paragraph", "highlight-paragraph-fade");
      }, 3000);
    };

    runHighlight();
    window.addEventListener("hashchange", runHighlight);

    return () => {
      window.removeEventListener("hashchange", runHighlight);
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (cleanupTimer) clearTimeout(cleanupTimer);
    };
  }, []);

  return null;
}
