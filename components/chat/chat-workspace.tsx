"use client";

import { useCallback, useEffect, useState } from "react";
import { History, List, MessageSquarePlus, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChatHistoryDialog } from "@/components/chat/chat-history-dialog";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TocPanel } from "@/components/toc/toc-panel";
import { SearchPanel } from "@/components/search/search-panel";
import type { ChatMessageData } from "@/components/chat/chat-message";
import {
  createConversation,
  loadConversations,
  saveConversations,
  titleFromMessage,
  type StoredConversation,
} from "@/lib/chat-store";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";

interface ChatWorkspaceProps {
  lang: UiLanguage;
}

export function ChatWorkspace({ lang }: ChatWorkspaceProps) {
  const strings = getUiStrings(lang);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  // Lazy initializer only generates a random id — no localStorage read, so
  // this is safe to compute during the server render pass too.
  const [activeId, setActiveId] = useState(() => createConversation().id);
  // Deliberately state, not a ref — see the equivalent comment this replaced
  // in the pre-tabs version of this file: gating the save effect on state
  // (not a ref) guarantees it only fires in a render where `conversations`
  // has already caught up to the loaded value.
  const [hydrated, setHydrated] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tab, setTab] = useState<"toc" | "search" | "chat">("chat");

  useEffect(() => {
    // Restoring persisted conversations after mount is deliberate — a lazy
    // useState initializer would read localStorage during the server
    // render pass too (where it doesn't exist), causing a hydration
    // mismatch (same rule this codebase already follows elsewhere).
    const loaded = loadConversations();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(loaded);
    if (loaded[0]) setActiveId(loaded[0].id);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveConversations(conversations);
  }, [conversations, hydrated]);

  const activeMessages = conversations.find((c) => c.id === activeId)?.messages ?? [];

  const handleMessagesChange = useCallback(
    (messages: ChatMessageData[]) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === activeId);
        const now = Date.now();
        if (idx === -1) {
          // No entry yet — this is a fresh "New chat" draft. Don't create a
          // list entry until it actually has a message, so opening a new
          // chat and never using it doesn't clutter the history.
          if (messages.length === 0) return prev;
          const firstUser = messages.find((m) => m.role === "user");
          const created: StoredConversation = {
            id: activeId,
            title: firstUser ? titleFromMessage(firstUser.content) : "",
            createdAt: now,
            updatedAt: now,
            messages,
          };
          return [created, ...prev];
        }
        const next = [...prev];
        next[idx] = { ...next[idx], messages, updatedAt: now };
        return next;
      });
    },
    [activeId]
  );

  function handleNewChat() {
    setActiveId(createConversation().id);
  }

  function handleRename(id: string, title: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  function handleDelete(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(createConversation().id);
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-2">
        <TabsList className="w-full h-10!">
          <TabsTrigger value="toc" className="py-2!">
            <List />
            {strings.tabKandungan}
          </TabsTrigger>
          <TabsTrigger value="search" className="py-2!">
            <Search />
            {strings.tabCari}
          </TabsTrigger>
          <TabsTrigger value="chat" className="py-2!">
            <Sparkles />
            {strings.tabTanyaAi}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="toc" className="min-h-0 flex-1">
        <TocPanel lang={lang} />
      </TabsContent>

      <TabsContent value="search" className="min-h-0 flex-1">
        <SearchPanel lang={lang} />
      </TabsContent>

      <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{strings.tabTanyaAi}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
              <History />
              {strings.historyButtonLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={handleNewChat}>
              <MessageSquarePlus />
              {strings.newChat}
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 flex flex-col">
          <ChatPanel
            key={activeId}
            lang={lang}
            initialMessages={activeMessages}
            onMessagesChange={handleMessagesChange}
          />
        </div>
      </TabsContent>

      <ChatHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onRename={handleRename}
        onDelete={handleDelete}
        lang={lang}
      />
    </Tabs>
  );
}
