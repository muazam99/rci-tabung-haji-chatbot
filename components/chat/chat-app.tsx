"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Languages } from "lucide-react";
import { ChatMessage, type ChatMessageData } from "@/components/chat/chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";

const LANG_STORAGE_KEY = "rci-chat-lang";

function newId() {
  return Math.random().toString(36).slice(2);
}

export function ChatApp() {
  const [lang, setLang] = useState<UiLanguage>("ms");
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const strings = getUiStrings(lang);

  useEffect(() => {
    // Restoring persisted UI language after mount is deliberate here: a lazy
    // useState initializer would read localStorage during the server render
    // pass too (where it doesn't exist), causing a hydration mismatch.
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "ms" || stored === "en") setLang(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const question = input.trim();
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

    const updateAssistant = (updater: (msg: ChatMessageData) => ChatMessageData) => {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)));
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
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
    } catch {
      updateAssistant((m) => ({ ...m, content: strings.errorGeneric, streaming: false, error: true }));
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">{strings.title}</h1>
          <p className="text-xs text-muted-foreground">{strings.subtitle}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLang((l) => (l === "ms" ? "en" : "ms"))}
          aria-label="Toggle language"
        >
          <Languages className="size-4" />
          {strings.languageToggleLabel}
        </Button>
      </header>

      <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {strings.disclaimerText}
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="flex flex-col gap-3 py-4">
          {messages.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">{strings.emptyState}</p>
          )}
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} lang={lang} />
          ))}
          <div ref={scrollAnchorRef} />
        </div>
      </ScrollArea>

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
        <Button onClick={() => void handleSend()} disabled={isSending || !input.trim()}>
          <Send className="size-4" />
          {strings.send}
        </Button>
      </div>
    </div>
  );
}
