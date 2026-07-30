"use client";

import Link from "next/link";
import { BookOpenText, ExternalLink } from "lucide-react";
import paragraphsData from "@/data/paragraphs.json";
import { chapterOf, paragraphIdToAnchor } from "@/lib/citations";
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
 *  the workspace) straight to that page — the report reader at
 *  /laporan/bab-N stays available as a secondary "open full text" link in
 *  the tooltip, for anyone who wants the plain-text/searchable version.
 *  Unknown paragraph ids (a citation that failed server-side validation
 *  slipped through, or a stray bracket in the model's prose) render as
 *  plain text instead of a dead button. */
export function CitationChip({ paragraphId, lang }: CitationChipProps) {
  const info = paragraphs[paragraphId];
  const strings = getUiStrings(lang);
  const { goToParagraph } = useViewer();

  if (!info) {
    return <span className="text-muted-foreground">[{paragraphId}]</span>;
  }

  const chapter = chapterOf(paragraphId);
  const reportHref = chapter ? `/laporan/bab-${chapter}#${paragraphIdToAnchor(paragraphId)}` : "#";
  const shortHeading = info.headingPath.split("›").pop()?.trim() ?? info.headingPath;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => goToParagraph(paragraphId)}
            className="mx-0.5 inline-flex align-middle"
            aria-label={`${paragraphId} — ${strings.viewInReport}`}
          />
        }
      >
        <Badge
          variant="secondary"
          className="cursor-pointer gap-1 border border-border/60 align-middle transition-colors hover:border-primary/40 hover:bg-secondary/70 active:scale-95"
        >
          <BookOpenText />
          {paragraphId} · {strings.citationPage} {info.page}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col items-start gap-1 py-0.5">
          <span>{shortHeading}</span>
          <Link
            href={reportHref}
            target="_blank"
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
          >
            {strings.viewInReport}
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
