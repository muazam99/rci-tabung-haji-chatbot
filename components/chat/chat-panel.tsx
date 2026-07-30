"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Square } from "lucide-react";
import { ChatMessage, type ChatMessageData } from "@/components/chat/chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
// ScrollArea replaced with plain div — @base-ui's Viewport uses height:100%
// which never reliably resolves inside nested flex containers.
import { getSuggestedPrompts } from "@/lib/suggested-prompts";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";

function newId() {
  return Math.random().toString(36).slice(2);
}

interface ChatPanelProps {
  lang: UiLanguage;
  /** Seeded once at mount — the parent remounts this component (via a
   *  `key` on the active conversation id) when the user switches
   *  conversations, so this never needs to react to prop changes mid-life. */
  initialMessages: ChatMessageData[];
  onMessagesChange: (messages: ChatMessageData[]) => void;
}

export function ChatPanel({ lang, initialMessages, onMessagesChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const strings = getUiStrings(lang);

  useEffect(() => {
    onMessagesChange(messages);
    // onMessagesChange is a useCallback from the parent keyed on the active
    // conversation id — including it would re-run this on every parent
    // render for no reason; messages is the only thing that should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(override?: string) {
    const question = (override ?? input).trim();
    if (!question || isSending) return;

    const userMessage: ChatMessageData = { id: newId(), role: "user", content: question };
    const assistantId = newId();
    const assistantPlaceholder: ChatMessageData = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setInput("");
    setIsSending(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const updateAssistant = (updater: (msg: ChatMessageData) => ChatMessageData) => {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)));
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMessage: string = strings.errorGeneric;
        if (res.status === 429) errorMessage = strings.errorRateLimit;
        updateAssistant((m) => ({ ...m, content: errorMessage, streaming: false, error: true }));
        return;
      }
      if (!res.body) {
        updateAssistant((m) => ({ ...m, content: strings.errorGeneric, streaming: false, error: true }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const snapshot = accumulated;
        updateAssistant((m) => ({ ...m, content: snapshot }));
      }
      updateAssistant((m) => ({ ...m, streaming: false }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        updateAssistant((m) => ({ ...m, streaming: false }));
      } else {
        updateAssistant((m) => ({ ...m, content: strings.errorGeneric, streaming: false, error: true }));
      }
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="flex flex-col gap-3 py-4">
          {messages.length === 0 && (
            <div className="flex min-h-full flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <p className="max-w-sm text-sm text-muted-foreground">{strings.emptyState}</p>
              <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                {getSuggestedPrompts(lang).map(({ icon: Icon, text }) => (
                  <Button
                    key={text}
                    variant="outline"
                    onClick={() => void handleSend(text)}
                    disabled={isSending}
                    className="h-auto justify-start gap-2 whitespace-normal px-3 py-2 text-left text-sm font-normal"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    {text}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} lang={lang} />
          ))}
          <div ref={scrollAnchorRef} />
        </div>
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={strings.inputPlaceholder}
          className="min-h-[44px] resize-none"
          rows={1}
          disabled={isSending}
        />
        {isSending ? (
          <Button onClick={handleStop} variant="outline">
            <Square className="size-4" />
            {strings.stop}
          </Button>
        ) : (
          <Button onClick={() => void handleSend()} disabled={!input.trim()}>
            <Send className="size-4" />
            {strings.send}
          </Button>
        )}
      </div>
    </div>
  );
}
