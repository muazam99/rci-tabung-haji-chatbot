"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { buildTocTree, type TocNode } from "@/lib/toc";
import { useViewer } from "@/components/workspace/viewer-context";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";

interface TocPanelProps {
  lang: UiLanguage;
}

function ChapterRow({ node, expanded, onToggle }: { node: TocNode; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-muted"
      aria-expanded={expanded}
    >
      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
      <span className="truncate">{node.title}</span>
    </button>
  );
}

function SectionRow({ node, onNavigate }: { node: TocNode; onNavigate: (pages: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(node.pages)}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pl-8 text-left text-sm hover:bg-muted"
    >
      <span className="min-w-0 flex-1 truncate">{node.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{node.pages}</span>
    </button>
  );
}

export function TocPanel({ lang }: TocPanelProps) {
  const strings = getUiStrings(lang);
  const tree = useMemo(() => buildTocTree(), []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { goToPrintedPage } = useViewer();

  function toggle(headingPath: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(headingPath)) next.delete(headingPath);
      else next.add(headingPath);
      return next;
    });
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-0.5 p-2">
        {tree.length === 0 && <p className="mt-8 text-center text-sm text-muted-foreground">{strings.tocEmpty}</p>}
        {tree.map((chapter) => (
          <div key={chapter.headingPath}>
            <ChapterRow node={chapter} expanded={expanded.has(chapter.headingPath)} onToggle={() => toggle(chapter.headingPath)} />
            {expanded.has(chapter.headingPath) && (
              <div className="flex flex-col gap-0.5">
                {chapter.children.map((section) => (
                  <SectionRow key={section.headingPath} node={section} onNavigate={goToPrintedPage} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
