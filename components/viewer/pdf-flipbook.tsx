"use client";

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip-enhanced";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "@/components/viewer/pdf-page-canvas";

/** How many pages on either side of the current one stay rendered — wide
 *  enough to cover a flip's two visible faces plus their immediate
 *  neighbours (so a fast flip never shows a blank page mid-animation). */
const RENDER_WINDOW = 3;

interface FlipBookRef {
  pageFlip: () => { flip: (page: number) => void; turnToPage: (page: number) => void };
}

export interface PdfFlipbookHandle {
  /** Jump to a 1-based PDF page number — animated (a single page-turn) for
   *  an adjacent page, instant for anything farther. See the comment on
   *  `flipToPage` below for why the split is necessary, not cosmetic. */
  flipToPage: (pdfPageNumber: number) => void;
}

interface PdfFlipbookProps {
  pdfDoc: PDFDocumentProxy;
  numPages: number;
  /** 1-based PDF page number to mount on. Purely an initial value — all
   *  later navigation goes through the imperative `flipToPage` handle, not
   *  through this prop, so the library's own current-page state (driven by
   *  drag/click gestures) is never fought by a re-render from above. */
  initialPage: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  onPageChange: (pdfPageNumber: number) => void;
  /** Fires whenever the library's internal drag/turn state moves off
   *  "read" (a corner-fold preview, an in-progress drag, or the flip
   *  animation itself) and back — lets the viewer hide the static center-
   *  gutter shadow while a page is actually mid-turn, since that overlay
   *  doesn't rotate with the curling page and looks wrong sitting on top
   *  of it. */
  onFlippingChange?: (flipping: boolean) => void;
  /** Which page (if any) should show a paragraph highlight, and which
   *  paragraph — see PdfPageCanvas for how the highlight itself is found. */
  highlight?: { page: number; paragraphId: string; nonce: number };
}

export const PdfFlipbook = forwardRef<PdfFlipbookHandle, PdfFlipbookProps>(function PdfFlipbook(
  { pdfDoc, numPages, initialPage, pageWidth, pageHeight, scale, onPageChange, onFlippingChange, highlight },
  ref
) {
  const bookRef = useRef<FlipBookRef | null>(null);
  const [currentIndex, setCurrentIndex] = useState(initialPage - 1);

  useImperativeHandle(
    ref,
    () => ({
      flipToPage: (pdfPageNumber: number) => {
        const pf = bookRef.current?.pageFlip();
        if (!pf) return;
        const targetIndex = pdfPageNumber - 1;
        // pf.flip() only performs ONE single-page-turn animation toward the
        // target and swallows any error from doing so (see the vendored
        // page-flip source's flipToPage()) — reliable for an adjacent page,
        // but for a far jump (a citation click, the page-jump box, or
        // dragging the scrubber) it silently no-ops instead of actually
        // landing on the target. pf.turnToPage() jumps straight there with
        // no animation and still fires the page-change event our
        // `onFlip` handler listens for, so use it whenever the jump spans
        // more than one page.
        if (Math.abs(targetIndex - currentIndex) <= 1) {
          pf.flip(targetIndex);
        } else {
          pf.turnToPage(targetIndex);
        }
      },
    }),
    [currentIndex]
  );

  const handleFlip = useCallback(
    (e: { data: number }) => {
      setCurrentIndex(e.data);
      onPageChange(e.data + 1);
    },
    [onPageChange]
  );

  // "read" is the only at-rest state — anything else (a corner fold
  // preview, an in-progress drag, or the flip animation) counts as
  // "flipping" for the caller's purposes.
  const handleChangeState = useCallback(
    (e: { data: string }) => {
      onFlippingChange?.(e.data !== "read");
    },
    [onFlippingChange]
  );

  // Every page within RENDER_WINDOW of the page currently on screen —
  // recomputed on every flip (currentIndex is real state, unlike a ref)
  // so the render window actually follows the reader through the book,
  // not just on externally-triggered jumps.
  const activeSet = useMemo(() => {
    const set = new Set<number>();
    const current = currentIndex + 1;
    for (let p = current - RENDER_WINDOW; p <= current + RENDER_WINDOW; p++) {
      if (p >= 1 && p <= numPages) set.add(p);
    }
    return set;
  }, [currentIndex, numPages]);

  const pages = useMemo(
    () =>
      Array.from({ length: numPages }, (_, i) => {
        const pageNumber = i + 1;
        const pageHighlight =
          highlight && highlight.page === pageNumber
            ? { paragraphId: highlight.paragraphId, nonce: highlight.nonce }
            : undefined;
        return (
          <PdfPageCanvas
            key={pageNumber}
            pageNumber={pageNumber}
            pdfDoc={pdfDoc}
            active={activeSet.has(pageNumber)}
            scale={scale}
            highlight={pageHighlight}
          />
        );
      }),
    [numPages, pdfDoc, activeSet, scale, highlight]
  );

  return (
    <HTMLFlipBook
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={bookRef as any}
      width={pageWidth}
      height={pageHeight}
      size="fixed"
      minWidth={200}
      maxWidth={2000}
      minHeight={280}
      maxHeight={2800}
      maxShadowOpacity={0.4}
      showCover={false}
      mobileScrollSupport
      startPage={initialPage - 1}
      onFlip={handleFlip}
      onChangeState={handleChangeState}
      className="mx-auto"
    >
      {pages}
    </HTMLFlipBook>
  );
});
