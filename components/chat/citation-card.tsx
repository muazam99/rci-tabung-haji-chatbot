"use client";

import { BookOpenText } from "lucide-react";
import paragraphsData from "@/data/paragraphs.json";
import { useViewer } from "@/components/workspace/viewer-context";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";

const paragraphs: Record<string, { page: string; headingPath: string }> = paragraphsData;

interface CitationCardProps {
  paragraphId: string;
  lang: UiLanguage;
}

/** One entry in an assistant message's "Sumber" (sources) row — a larger,
 *  fuller-context sibling of the inline CitationChip used within prose.
 *  Shows the complete heading path (not just its last segment) so a reader
 *  scanning the source list doesn't need to hover each one to see context. */
export function CitationCard({ paragraphId, lang }: CitationCardProps) {
  const info = paragraphs[paragraphId];
  const strings = getUiStrings(lang);
  const { goToParagraph } = useViewer();

  if (!info) return null;

  return (
    <button
      type="button"
      onClick={() => goToParagraph(paragraphId)}
      className="flex max-w-[240px] flex-col items-start gap-0.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted active:scale-[0.98]"
    >
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        <BookOpenText className="size-3.5 shrink-0" />
        {paragraphId} · {strings.citationPage} {info.page}
      </span>
      <span className="truncate text-muted-foreground">{info.headingPath}</span>
    </button>
  );
}
