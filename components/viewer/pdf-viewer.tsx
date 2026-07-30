"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { usePdfDocument } from "@/components/viewer/pdf-provider";
import { PdfFlipbook, type PdfFlipbookHandle } from "@/components/viewer/pdf-flipbook";
import { ViewerToolbar } from "@/components/viewer/viewer-toolbar";
import { PageScrubber } from "@/components/viewer/page-scrubber";
import { ThumbnailRail } from "@/components/viewer/thumbnail-rail";
import { Skeleton } from "@/components/ui/skeleton";
import type { PendingViewerTarget } from "@/components/workspace/viewer-context";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";

export interface PdfViewerHandle {
  /** Animated jump to a 1-based PDF page number. When `paragraphId` is
   *  given, that paragraph gets a fading highlight once the target page
   *  renders (see PdfPageCanvas) — a `nonce` bump lets the same paragraph
   *  be clicked twice in a row and still restart the fade. */
  goToPage: (pdfPageNumber: number, paragraphId?: string) => void;
}

interface PdfViewerProps {
  lang: UiLanguage;
  /** Whether the desktop split-pane layout is active. Drives whether the
   *  flipbook renders a two-page spread (desktop) or a single page
   *  (mobile/tablet) — see the `book-frame`/`book-spine` sizing below,
   *  which must match whichever mode the flipbook itself is told to use. */
  isDesktop: boolean;
  /** A page/paragraph a caller tried to navigate to before this component
   *  had mounted (see ViewerContext) — consumed once, as this instance's
   *  initial page/highlight, since there's no live `PdfViewerHandle` ref to
   *  call `.goToPage()` on until after mount. */
  pendingTarget?: PendingViewerTarget | null;
  onPendingTargetConsumed?: () => void;
}

/** Approximate report page size (A4-ish, points) — only used as a fallback
 *  before the real page-1 dimensions are measured, so the very first paint
 *  isn't NaN-sized. */
const FALLBACK_PAGE_SIZE = { width: 595, height: 842 };

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer(
  { lang, isDesktop, pendingTarget, onPendingTargetConsumed },
  ref
) {
  const { pdfDoc, numPages, loading, error } = usePdfDocument();
  const strings = getUiStrings(lang);

  const containerRef = useRef<HTMLDivElement>(null);
  const flipbookRef = useRef<PdfFlipbookHandle>(null);
  // Lazy initializers so a viewer that mounts to satisfy a pending
  // navigation (see the prop doc above) opens directly on the target page
  // instead of flashing page 1 first — captured once at mount, since a
  // later prop change (a second citation click while this instance is
  // already mounted) goes through the imperative `goToPage` ref instead.
  const [currentPage, setCurrentPage] = useState(() => pendingTarget?.page ?? 1);
  const [isPageFlipping, setIsPageFlipping] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Visible by default — a page-thumbnail strip beneath the spread is what
  // makes this read as a book rather than a bare document canvas.
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 900 });
  const [basePageSize, setBasePageSize] = useState(FALLBACK_PAGE_SIZE);
  const [highlight, setHighlight] = useState<{ page: number; paragraphId: string; nonce: number } | null>(
    () =>
      pendingTarget?.paragraphId
        ? { page: pendingTarget.page, paragraphId: pendingTarget.paragraphId, nonce: 0 }
        : null
  );
  const highlightNonceRef = useRef(0);

  useEffect(() => {
    if (pendingTarget) onPendingTargetConsumed?.();
    // Only ever meant to consume whatever pendingTarget this instance
    // mounted with (captured above) — not to re-fire for every later prop
    // change, which the ref-based goToPage path already handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      goToPage: (pdfPageNumber: number, paragraphId?: string) => {
        flipbookRef.current?.flipToPage(pdfPageNumber);
        if (paragraphId) {
          highlightNonceRef.current += 1;
          setHighlight({ page: pdfPageNumber, paragraphId, nonce: highlightNonceRef.current });
        } else {
          setHighlight(null);
        }
      },
    }),
    []
  );

  useEffect(() => {
    // `containerRef` is only attached to a DOM node once `loading` is
    // false — before that this component renders the skeleton branch
    // below, which has no such element. Without `loading` in the deps,
    // this effect's first (and only, given an empty array) run would catch
    // `containerRef.current` still null while the PDF is fetching, bail
    // out immediately, and never attach an observer at all — leaving
    // `containerSize` stuck at its hardcoded fallback default forever,
    // which is what made the fit-to-container math (and therefore the
    // default zoom) wrong on every load.
    const el = containerRef.current;
    if (!el) return;
    const applySize = (width: number, height: number) => {
      // Rounded to whole pixels and only applied on an actual change: raw
      // contentRect values otherwise jitter by sub-pixel fractions between
      // observer callbacks (ordinary layout/subpixel-snapping noise, not a
      // real resize). Left unrounded, that jitter flows straight into
      // `scale` below and retriggers PdfPageCanvas's render effect on every
      // tick — cancelling each page's render before it ever finishes, so
      // the canvas stays permanently blank despite "succeeding" every time.
      setContainerSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    // A ResizeObserver's callback is only guaranteed to fire "soon" after
    // observe() — not synchronously — so this component would otherwise sit
    // on the stale fallback default for at least one extra paint (visible
    // as a flash of wrong sizing) whenever this effect runs on an element
    // that's already laid out, e.g. right after the `loading` transition
    // above. A direct measurement here covers that gap immediately; the
    // observer below still takes over for every resize after that.
    const rect = el.getBoundingClientRect();
    applySize(Math.round(rect.width), Math.round(rect.height));
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applySize(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    pdfDoc.getPage(1).then((page) => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setBasePageSize({ width: vp.width, height: vp.height });
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
      // The fullscreenchange event can fire a frame or two before the
      // browser finishes resizing the element (Chrome animates the
      // transition), so the very next ResizeObserver tick sometimes still
      // reports the pre-fullscreen size. A direct rect read after a paint
      // catches the real size instead of waiting on that tick.
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        setContainerSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      });
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft" || e.key === "PageUp") flipbookRef.current?.flipToPage(currentPage - 1);
      else if (e.key === "ArrowRight" || e.key === "PageDown") flipbookRef.current?.flipToPage(currentPage + 1);
      else if (e.key === "Home") flipbookRef.current?.flipToPage(1);
      else if (e.key === "End") flipbookRef.current?.flipToPage(numPages);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPage, numPages]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Skeleton className="h-[70%] w-[55%]" />
        <p className="text-sm text-muted-foreground">{strings.viewerLoading}</p>
      </div>
    );
  }
  if (error || !pdfDoc) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-destructive">
        {strings.viewerError}
      </div>
    );
  }

  // Fit a two-page spread (desktop) or a single page (mobile/tablet) to the
  // container at zoom=1 (whichever dimension constrains first), then scale
  // both dimensions directly by zoom — so zooming in naturally overflows the
  // scrollable container (pannable via native scroll) and zooming out
  // shrinks within it, without a separate CSS-transform code path that would
  // fight the container's own scrollbar.
  const availableWidth = Math.max(containerSize.width - 24, 200);
  const availableHeight = Math.max(containerSize.height - 24, 260);
  let baseWidth = isDesktop ? availableWidth / 2 : availableWidth;
  let baseHeight = (baseWidth * basePageSize.height) / basePageSize.width;
  if (baseHeight > availableHeight) {
    baseHeight = availableHeight;
    baseWidth = (baseHeight * basePageSize.width) / basePageSize.height;
  }
  const pageWidth = baseWidth * zoom;
  const pageHeight = baseHeight * zoom;
  // Rounded for the same reason containerSize is rounded above: passed
  // straight into PdfPageCanvas's render effect as a dependency, so any
  // sub-pixel instability here would cancel and restart every page's
  // render on a loop instead of ever letting one finish.
  const renderScale = Math.round((pageWidth / basePageSize.width) * 1000) / 1000;

  // react-pageflip-enhanced only applies width/height (and singlePage) at
  // construction time (see its source: `new PageFlip(el, props)` guarded by
  // `if (!pageFlip.current)`, never re-run on prop changes) — so a resize,
  // zoom change, or desktop/mobile mode switch is applied by remounting the
  // flipbook via this key, rather than expecting the library to relayout an
  // already-live instance. `isDesktop` is included so crossing the
  // desktop/mobile breakpoint always forces a clean remount even if the
  // rounded pixel dimensions happen to coincide.
  const sizeKey = `${isDesktop ? "d" : "m"}-${Math.round(pageWidth / 4) * 4}x${Math.round(pageHeight / 4) * 4}`;

  return (
    <div className="flex h-full flex-col">
      <ViewerToolbar
        currentPage={currentPage}
        numPages={numPages}
        zoom={zoom}
        onZoomChange={setZoom}
        onPrev={() => flipbookRef.current?.flipToPage(currentPage - 1)}
        onNext={() => flipbookRef.current?.flipToPage(currentPage + 1)}
        onJumpToPage={(p) => flipbookRef.current?.flipToPage(p)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        showThumbnails={showThumbnails}
        onToggleThumbnails={() => setShowThumbnails((v) => !v)}
        lang={lang}
      />
      <div
        ref={containerRef}
        className="scrollbar-hide relative flex-1 overflow-auto bg-[#ded6c2] dark:bg-neutral-900"
      >
        <div className="flex min-h-full items-center justify-center p-3">
          <div
            className="book-frame relative shrink-0"
            style={{
              width: Math.round(pageWidth) * (isDesktop ? 2 : 1),
              height: Math.round(pageHeight),
            }}
          >
            <PdfFlipbook
              key={sizeKey}
              ref={flipbookRef}
              pdfDoc={pdfDoc}
              numPages={numPages}
              initialPage={currentPage}
              pageWidth={Math.round(pageWidth)}
              pageHeight={Math.round(pageHeight)}
              scale={renderScale}
              singlePage={!isDesktop}
              onPageChange={setCurrentPage}
              onFlippingChange={setIsPageFlipping}
              highlight={highlight ?? undefined}
            />
            {isDesktop && (
              <div className="book-spine" style={{ opacity: isPageFlipping ? 0 : 1 }} aria-hidden />
            )}
          </div>
        </div>
      </div>
      <PageScrubber
        currentPage={currentPage}
        numPages={numPages}
        onCommit={(p) => flipbookRef.current?.flipToPage(p)}
        lang={lang}
      />
      {showThumbnails && (
        <ThumbnailRail
          pdfDoc={pdfDoc}
          numPages={numPages}
          currentPage={currentPage}
          onSelect={(p) => flipbookRef.current?.flipToPage(p)}
        />
      )}
    </div>
  );
});
