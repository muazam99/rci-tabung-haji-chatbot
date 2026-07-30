"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { pdfPageToPrintedLabel } from "@/lib/pdf-pages";
import { getUiStrings } from "@/lib/ui-strings";
import type { UiLanguage } from "@/lib/ui-strings";

interface PageScrubberProps {
  currentPage: number;
  numPages: number;
  onCommit: (pdfPageNumber: number) => void;
  lang: UiLanguage;
}

/** Slider spanning every PDF page — the "scrollbar to go to certain pages".
 *  Shows a live printed-page label while dragging; only jumps the book on
 *  release (onValueCommitted), so a drag-through doesn't trigger a flip
 *  animation per pixel of travel. */
export function PageScrubber({ currentPage, numPages, onCommit, lang }: PageScrubberProps) {
  const strings = getUiStrings(lang);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const displayed = dragValue ?? currentPage;
  const label = pdfPageToPrintedLabel(displayed);

  return (
    <div className="flex items-center gap-2 border-t bg-background px-3 py-1.5">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">
        {label ? `${strings.citationPage} ${label}` : strings.viewerFrontMatter}
      </span>
      <Slider
        min={1}
        max={numPages}
        value={displayed}
        onValueChange={(value) => setDragValue(value as number)}
        onValueCommitted={(value) => {
          setDragValue(null);
          onCommit(value as number);
        }}
        aria-label={strings.viewerPageScrubber}
      />
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">
        {displayed} / {numPages}
      </span>
    </div>
  );
}
