"use client";

import { useState } from "react";
import { ChevronRight, Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useViewer } from "@/components/workspace/viewer-context";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";

interface SearchPanelProps {
  lang: UiLanguage;
}

interface SearchResult {
  id: string;
  headingPath: string;
  pages: string;
  snippet: string;
}

export function SearchPanel({ lang }: SearchPanelProps) {
  const strings = getUiStrings(lang);
  const { goToPrintedPage } = useViewer();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function runSearch() {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data: { results: SearchResult[] } = await res.json();
      setResults(data.results);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder={strings.searchPlaceholder}
            className="pl-8"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {results === null && !isSearching && (
            <p className="mt-8 text-center text-sm text-muted-foreground">{strings.searchPrompt}</p>
          )}
          {isSearching && <p className="mt-8 text-center text-sm text-muted-foreground">{strings.thinking}</p>}
          {results !== null && !isSearching && results.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">{strings.searchEmpty}</p>
          )}
          {results?.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => goToPrintedPage(r.pages)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{r.headingPath}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.pages}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>
              </div>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
