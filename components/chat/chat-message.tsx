"use client";

import ReactMarkdown from "react-markdown";
import { CitationChip } from "@/components/chat/citation-chip";
import { CitationCard } from "@/components/chat/citation-card";
import paragraphsData from "@/data/paragraphs.json";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";
import { cn } from "@/lib/utils";

const paragraphs: Record<string, unknown> = paragraphsData;
const CITATION_ID_RE = /¶([\d]+(?:\.[\d]+){1,2})/g;

/** Deduped, order-preserving list of valid citation ids in an assistant
 *  answer — feeds the "Sumber" row rendered below the prose. */
function extractValidCitationIds(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(CITATION_ID_RE)) {
    if (m[1] in paragraphs) seen.add(m[1]);
  }
  return [...seen];
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** true while an assistant message is still streaming in. */
  streaming?: boolean;
  error?: boolean;
}

// Rewrite bare "¶N.M.K" citation markers into a markdown link with a
// recognizable fake href BEFORE handing the text to react-markdown, then
// intercept that link in the `a` renderer below and swap in a real
// CitationChip. Simplest way to make citations coexist with markdown
// rendering (bold, headings, lists) without writing a custom remark plugin.
// Deliberately lenient on the source pattern — matches bare "¶N.M.K"
// wherever it appears, not just inside a well-formed "[¶N.M.K]" bracket,
// since model output occasionally combines two citations into one bracket.
function preprocessCitations(text: string): string {
  return text.replace(/¶([\d]+(?:\.[\d]+){1,2})/g, (match, id) => `[${match}](#cite-${id})`);
}

const CITE_HREF_RE = /^#cite-([\d]+(?:\.[\d]+){1,2})$/;

interface ChatMessageProps {
  message: ChatMessageData;
  lang: UiLanguage;
}

export function ChatMessage({ message, lang }: ChatMessageProps) {
  const isUser = message.role === "user";
  const strings = getUiStrings(lang);
  const sourceIds = isUser ? [] : extractValidCitationIds(message.content);

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "whitespace-pre-wrap bg-primary text-primary-foreground"
            : message.error
              ? "bg-destructive/10 text-destructive"
              : "prose-answer bg-muted text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
        )}
      >
        {isUser ? (
          message.content
        ) : (
          <ReactMarkdown
            components={{
              a: ({ href, children }) => {
                const match = href?.match(CITE_HREF_RE);
                if (match) return <CitationChip paragraphId={match[1]} lang={lang} />;
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {preprocessCitations(message.content)}
          </ReactMarkdown>
        )}
        {message.streaming && (
          <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
        )}
        {!message.streaming && sourceIds.length > 0 && (
          <div className="mt-3 border-t border-border/60 pt-2 font-sans">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{strings.sourcesLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              {sourceIds.map((id) => (
                <CitationCard key={id} paragraphId={id} lang={lang} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
