"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pdfPageToPrintedLabel, printedPageToPdfPage } from "@/lib/pdf-pages";
import type { UiLanguage } from "@/lib/ui-strings";
import { getUiStrings } from "@/lib/ui-strings";

const PDF_URL = "/laporan-rci-tabung-haji.pdf";
export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

interface ViewerToolbarProps {
  currentPage: number;
  numPages: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onJumpToPage: (pdfPageNumber: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showThumbnails: boolean;
  onToggleThumbnails: () => void;
  lang: UiLanguage;
}

export function ViewerToolbar({
  currentPage,
  numPages,
  zoom,
  onZoomChange,
  onPrev,
  onNext,
  onJumpToPage,
  isFullscreen,
  onToggleFullscreen,
  showThumbnails,
  onToggleThumbnails,
  lang,
}: ViewerToolbarProps) {
  const strings = getUiStrings(lang);
  const printedLabel = pdfPageToPrintedLabel(currentPage);
  // Only the actual text field value while it's focused — otherwise the
  // input always displays `currentPage` directly, so it tracks page flips,
  // TOC clicks, citation jumps, etc. instead of freezing at whatever page
  // was current the one time this component happened to mount.
  const [isEditing, setIsEditing] = useState(false);
  const [pageInput, setPageInput] = useState(printedLabel ?? String(currentPage));
  const displayedValue = isEditing ? pageInput : (printedLabel ?? String(currentPage));

  function commitPageInput() {
    setIsEditing(false);
    const target = printedPageToPdfPage(pageInput.trim());
    if (target) onJumpToPage(target);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-background px-2 py-1.5">
      <Button variant="ghost" size="icon-sm" onClick={onPrev} aria-label={strings.viewerPrevPage}>
        <ChevronLeft />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onNext} aria-label={strings.viewerNextPage}>
        <ChevronRight />
      </Button>

      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          commitPageInput();
        }}
      >
        <Input
          value={displayedValue}
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={commitPageInput}
          onFocus={() => {
            setPageInput(printedLabel ?? String(currentPage));
            setIsEditing(true);
          }}
          className="h-7 w-14 text-center text-xs"
          aria-label={strings.viewerJumpToPage}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {strings.citationPage} · {numPages}
        </span>
      </form>

      <div className="mx-1 h-5 w-px bg-border" />

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
        aria-label={strings.viewerZoomOut}
        disabled={zoom <= MIN_ZOOM}
      >
        <ZoomOut />
      </Button>
      <span className="w-10 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
        aria-label={strings.viewerZoomIn}
        disabled={zoom >= MAX_ZOOM}
      >
        <ZoomIn />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" />

      <Button
        variant={showThumbnails ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={onToggleThumbnails}
        aria-label={strings.viewerThumbnails}
      >
        <LayoutGrid />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onToggleFullscreen} aria-label={strings.viewerFullscreen}>
        {isFullscreen ? <Minimize2 /> : <Maximize2 />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        nativeButton={false}
        render={<a href={PDF_URL} download="laporan-rci-tabung-haji.pdf" />}
        aria-label={strings.viewerDownload}
      >
        <Download />
      </Button>
    </div>
  );
}
