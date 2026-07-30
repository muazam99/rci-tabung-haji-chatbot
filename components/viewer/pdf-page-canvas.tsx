"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { Util } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/** Minimal shape of pdf.js's TextItem — not re-exported from the package's
 *  top-level types (only from its internal display/api module), so this
 *  covers just the fields findHighlightBand actually reads. */
interface PdfTextItem {
  str: string;
  transform: number[];
}

interface PdfPageCanvasProps {
  pageNumber: number;
  pdfDoc: PDFDocumentProxy;
  /** Whether this page is within the render window (close to the current
   *  spread) — pages outside it show a skeleton and release their canvas
   *  bitmap instead of holding onto rendered pixels for all ~250 pages. */
  active: boolean;
  /** Output scale, in CSS pixels per PDF point at 1x DPR (before the
   *  devicePixelRatio multiplier applied internally). Passed down from the
   *  viewer's fit-to-container + zoom calculation. */
  scale: number;
  /** Paragraph id ("3.6.6") to highlight on this page, if any — set only
   *  on whichever page a citation click landed on. `nonce` changes on every
   *  click (even to the same paragraph) so the fade restarts each time. */
  highlight?: { paragraphId: string; nonce: number };
}

/** Locates a citation's paragraph on the page by its printed number
 *  ("3.6.6 Suruhanjaya mendapati...") and returns a highlight band spanning
 *  from the top of that paragraph to the top of the next numbered
 *  paragraph (or the bottom of the page) — full page width, not
 *  per-line boxes, since a coarse band is far simpler to compute correctly
 *  than unioning individual line rects and reads just as clearly as a
 *  highlight. Returns null if the id can't be found on this page (a
 *  paragraph split across a page boundary lands on whichever page pdf.js's
 *  text order puts it on first) — callers should treat that as "no
 *  highlight" rather than an error. */
async function findHighlightBand(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  paragraphId: string,
  cssScale: number
): Promise<{ top: number; height: number } | null> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: cssScale });
  const textContent = await page.getTextContent();
  const items = textContent.items.filter((it) => "str" in it) as unknown as PdfTextItem[];

  // pdf.js's text items are split at the PDF content stream's own run
  // boundaries, not at word gaps in the rendered layout — so the paragraph
  // number frequently arrives as its OWN item with no trailing space
  // character (the gap before the next word is cursor positioning, not a
  // literal " "). Matching end-of-string as an alternative to `\s` covers
  // that case alongside the "number + space + text in one item" case.
  const idPattern = new RegExp(`^${paragraphId.replace(/\./g, "\\.")}(?:\\s|$)`);
  const nextParaPattern = /^\d+\.\d+(\.\d+)?(?:\s|$)/;

  const startIdx = items.findIndex((it) => idPattern.test(it.str.trim()));
  if (startIdx === -1) return null;

  const topOf = (item: PdfTextItem) => {
    const tx = Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    return tx[5] - fontHeight;
  };

  const top = topOf(items[startIdx]);
  let bottom = viewport.height;
  for (let i = startIdx + 1; i < items.length; i++) {
    const str = items[i].str.trim();
    if (str && nextParaPattern.test(str) && !idPattern.test(str)) {
      bottom = topOf(items[i]);
      break;
    }
  }

  return { top: Math.max(0, top - 2), height: Math.max(14, bottom - top + 2) };
}

/** One flipbook page: a plain div (which react-pageflip-enhanced moves into
 *  its internal DOM structure — hence forwardRef, per the library's
 *  "pages as components" requirement) containing a canvas pdf.js renders
 *  into. Only renders pixels while `active`; otherwise shows a skeleton and
 *  frees its canvas bitmap by zeroing its dimensions. */
export const PdfPageCanvas = forwardRef<HTMLDivElement, PdfPageCanvasProps>(
  function PdfPageCanvas({ pageNumber, pdfDoc, active, scale, highlight }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<RenderTask | null>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const [rendered, setRendered] = useState(false);

    useEffect(() => {
      if (!active) {
        setRendered(false);
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        return;
      }

      let cancelled = false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      async function render() {
        console.log("DEBUG2 effect fired", pageNumber, "scale=", scale);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        renderTaskRef.current?.cancel();
        const task = page.render({ canvas, canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        try {
          await task.promise;
          console.log("DEBUG2 render resolved", pageNumber, "cancelled=", cancelled);
          if (!cancelled) setRendered(true);
        } catch (err) {
          console.log("DEBUG2 render rejected", pageNumber, "cancelled=", cancelled, err instanceof Error ? err.name : err);
          // RenderingCancelledException is expected when we cancel a
          // stale render below — anything else is a real failure.
          if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) {
            console.error(`Failed to render PDF page ${pageNumber}:`, err);
          }
        }
      }

      void render();

      return () => {
        cancelled = true;
        renderTaskRef.current?.cancel();
      };
    }, [active, pageNumber, pdfDoc, scale]);

    // Paragraph highlight: only attempted once the page has actually
    // rendered (so the overlay never floats over a blank canvas), and
    // wrapped so any lookup failure just skips the highlight silently —
    // the page navigation itself already succeeded regardless.
    useEffect(() => {
      if (!rendered || !highlight) return;
      const el = highlightRef.current;
      if (!el) return;

      let cancelled = false;
      let raf1: number | undefined;
      let raf2: number | undefined;
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

      findHighlightBand(pdfDoc, pageNumber, highlight.paragraphId, scale)
        .then((band) => {
          if (cancelled || !band) return;
          el.style.top = `${band.top}px`;
          el.style.height = `${band.height}px`;
          el.classList.add("highlight-paragraph");
          raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
              el.classList.add("highlight-paragraph-fade");
            });
          });
          cleanupTimer = setTimeout(() => {
            el.classList.remove("highlight-paragraph", "highlight-paragraph-fade");
          }, 3000);
        })
        .catch(() => {
          // Text lookup failed (unusual layout, id not found) — no highlight,
          // no error surfaced; the page jump itself already worked.
        });

      return () => {
        cancelled = true;
        if (raf1) cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
        if (cleanupTimer) clearTimeout(cleanupTimer);
        el.classList.remove("highlight-paragraph", "highlight-paragraph-fade");
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rendered, highlight?.paragraphId, highlight?.nonce, pageNumber, pdfDoc, scale]);

    return (
      <div ref={ref} className="relative flex items-center justify-center bg-white" data-density="soft">
        {!rendered && (
          <div className="absolute inset-4 animate-pulse rounded bg-neutral-200" aria-hidden />
        )}
        <canvas ref={canvasRef} className="max-h-full max-w-full" />
        {highlight && <div ref={highlightRef} className="pointer-events-none absolute inset-x-2 rounded-sm" />}
      </div>
    );
  }
);
