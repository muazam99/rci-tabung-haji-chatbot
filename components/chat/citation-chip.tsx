"use client";

import Link from "next/link";
import { BookOpenText } from "lucide-react";
import paragraphsData from "@/data/paragraphs.json";
import { chapterOf, paragraphIdToAnchor } from "@/lib/citations";
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

/** Renders one `[¶N.M.K]` citation as a clickable chip: "Bab 3 › Hibah,
 *  m.s. 74", deep-linking into the report reader where the exact paragraph
 *  is scrolled into view and highlighted. Unknown paragraph ids (a citation
 *  that failed server-side validation slipped through, or a stray bracket
 *  in the model's prose) render as plain text instead of a broken link. */
export function CitationChip({ paragraphId, lang }: CitationChipProps) {
  const info = paragraphs[paragraphId];
  const strings = getUiStrings(lang);

  if (!info) {
    return <span className="text-muted-foreground">[¶{paragraphId}]</span>;
  }

  const chapter = chapterOf(paragraphId);
  const href = chapter ? `/laporan/bab-${chapter}#${paragraphIdToAnchor(paragraphId)}` : "#";
  const shortHeading = info.headingPath.split("›").pop()?.trim() ?? info.headingPath;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            className="mx-0.5 inline-flex"
          />
        }
      >
        <Badge variant="secondary" className="cursor-pointer gap-1 align-middle">
          <BookOpenText />
          ¶{paragraphId} · {strings.citationPage} {info.page}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {shortHeading} — {strings.viewInReport}
      </TooltipContent>
    </Tooltip>
  );
}
