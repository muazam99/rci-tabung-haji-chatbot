"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { ChatMessageData } from "@/components/chat/chat-message";
import {
  createConversation,
  loadConversations,
  saveConversations,
  titleFromMessage,
  type StoredConversation,
} from "@/lib/chat-store";
import type { UiLanguage } from "@/lib/ui-strings";

const SIDEBAR_COLLAPSED_KEY = "rci-chat-sidebar-collapsed";

interface ChatWorkspaceProps {
  lang: UiLanguage;
  /** Hides the sidebar column entirely — used by the mobile layout, which
   *  puts the conversation list in a drawer instead (see workspace.tsx). */
  hideSidebar?: boolean;
}

export function ChatWorkspace({ lang, hideSidebar }: ChatWorkspaceProps) {
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  // Lazy initializer only generates a random id — no localStorage read, so
  // this is safe to compute during the server render pass too.
  const [activeId, setActiveId] = useState(() => createConversation().id);
  // Collapsed by default — the conversation list is a secondary affordance
  // most readers won't need open while asking questions.
  const [collapsed, setCollapsed] = useState(true);
  // Deliberately state, not a ref: a ref flips to "hydrated" synchronously
  // the instant the load effect runs, but `conversations` only catches up
  // to the loaded value on the NEXT render — so a save effect gated on a
  // ref reads hydrated=true paired with the stale pre-load `conversations`
  // closure and immediately overwrites localStorage with []. Gating on
  // state instead means the save effect only ever sees hydrated=true in a
  // render where `conversations` has already caught up, since both are set
  // together in the same effect and thus land in the same batched render.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Restoring persisted conversations after mount is deliberate — a lazy
    // useState initializer would read localStorage during the server
    // render pass too (where it doesn't exist), causing a hydration
    // mismatch (same rule this codebase already follows elsewhere).
    const loaded = loadConversations();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(loaded);
    if (loaded[0]) setActiveId(loaded[0].id);
    if (window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "0") setCollapsed(false);
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

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex h-full">
      {!hideSidebar && (
        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          onNewChat={handleNewChat}
          onSelect={setActiveId}
          onRename={handleRename}
          onDelete={handleDelete}
          lang={lang}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      )}
      <div className="min-w-0 flex-1">
        <ChatPanel
          key={activeId}
          lang={lang}
          initialMessages={activeMessages}
          onMessagesChange={handleMessagesChange}
        />
      </div>
    </div>
  );
}
