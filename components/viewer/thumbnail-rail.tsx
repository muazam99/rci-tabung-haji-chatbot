"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cn } from "@/lib/utils";
import { pdfPageToPrintedLabel } from "@/lib/pdf-pages";

const THUMB_WIDTH = 90;
const THUMB_SCALE = 0.16;
/** How many thumbnails beyond the visible range stay mounted, so a small
 *  scroll doesn't cause a visible pop-in at the edges. */
const BUFFER = 6;

interface ThumbnailRailProps {
  pdfDoc: PDFDocumentProxy;
  numPages: number;
  currentPage: number;
  onSelect: (pdfPageNumber: number) => void;
}

export function ThumbnailRail({ pdfDoc, numPages, currentPage, onSelect }: ThumbnailRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: Math.min(20, numPages) });

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    function updateRange() {
      if (!rail) return;
      const startIdx = Math.max(1, Math.floor(rail.scrollLeft / THUMB_WIDTH) - BUFFER);
      const endIdx = Math.min(
        numPages,
        Math.ceil((rail.scrollLeft + rail.clientWidth) / THUMB_WIDTH) + BUFFER
      );
      setVisibleRange({ start: startIdx, end: endIdx });
    }

    updateRange();
    rail.addEventListener("scroll", updateRange, { passive: true });
    window.addEventListener("resize", updateRange);
    return () => {
      rail.removeEventListener("scroll", updateRange);
      window.removeEventListener("resize", updateRange);
    };
  }, [numPages]);

  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [currentPage]);

  return (
    <div ref={railRef} className="flex h-24 gap-1.5 overflow-x-auto border-t bg-muted/40 px-2 py-2">
      {Array.from({ length: numPages }, (_, i) => {
        const pageNumber = i + 1;
        const isVisible = pageNumber >= visibleRange.start && pageNumber <= visibleRange.end;
        const isActive = pageNumber === currentPage;
        return (
          <button
            key={pageNumber}
            ref={isActive ? activeThumbRef : undefined}
            type="button"
            onClick={() => onSelect(pageNumber)}
            className={cn(
              "flex shrink-0 flex-col items-center gap-0.5",
              "focus-visible:outline-none"
            )}
            style={{ width: THUMB_WIDTH }}
            aria-label={pdfPageToPrintedLabel(pageNumber) ?? `${pageNumber}`}
          >
            <div
              className={cn(
                "flex h-20 w-full items-center justify-center overflow-hidden rounded border bg-white",
                isActive && "border-primary ring-2 ring-primary/40"
              )}
            >
              {isVisible ? (
                <ThumbnailImage pdfDoc={pdfDoc} pageNumber={pageNumber} />
              ) : (
                <div className="h-full w-full animate-pulse bg-neutral-100" />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {pdfPageToPrintedLabel(pageNumber) ?? "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ThumbnailImage({ pdfDoc, pageNumber }: { pdfDoc: PDFDocumentProxy; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: THUMB_SCALE });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const task = page.render({ canvas, canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        // cancelled or superseded — ignore
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber]);

  return <canvas ref={canvasRef} className="max-h-full max-w-full" />;
}
