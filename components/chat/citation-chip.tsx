"use client";

import { BookOpenText } from "lucide-react";
import paragraphsData from "@/data/paragraphs.json";
import { useViewer } from "@/components/workspace/viewer-context";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const paragraphs: Record<string, { page: string; headingPath: string }> = paragraphsData;

interface CitationChipProps {
  paragraphId: string;
  lang: UiLanguage;
}

/** Renders one `[¶N.M.K]` citation as a clickable container: "Bab 3 ›
 *  Hibah, m.s. 74". Clicking it jumps the PDF flipbook pane (left side of
 *  the workspace) straight to that page or opens the full-text report.
 *  Unknown paragraph ids render as plain text. */
export function CitationChip({ paragraphId, lang }: CitationChipProps) {
  const info = paragraphs[paragraphId];
  const strings = getUiStrings(lang);
  const { goToParagraph } = useViewer();

  if (!info) {
    return <span className="text-muted-foreground">[{paragraphId}]</span>;
  }

  const shortHeading = info.headingPath.split("›").pop()?.trim() ?? info.headingPath;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="mx-0.5 inline-flex align-middle"
            aria-label={`${paragraphId} — ${strings.viewInReport}`}
          />
        }
      >
        <Badge
          variant="outline"
          className="cursor-pointer gap-1.5 border-primary/30 bg-primary/6 px-2.5 align-middle text-xs font-medium transition-all hover:border-primary/50 hover:bg-primary/12 active:scale-95"
          onPointerDown={(e) => {
            // Use onPointerDown so navigation fires before the tooltip's
            // own pointer handlers can swallow the event. Stopping
            // propagation prevents the TooltipTrigger button from also
            // receiving the click (Base UI merges its own handlers into
            // the rendered element, which can override custom onClick).
            e.stopPropagation();
            goToParagraph(paragraphId);
          }}
        >
          <BookOpenText className="size-3 shrink-0 text-primary" />
          <span className="font-semibold tracking-tight">{paragraphId}</span>
          <span className="text-muted-foreground">· {strings.citationPage} {info.page}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        <span>{shortHeading}</span>
      </TooltipContent>
    </Tooltip>
  );
}
