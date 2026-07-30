/**
 * On-device chat history — every conversation lives only in this browser's
 * localStorage (no server-side storage at all, consistent with the rest of
 * the app's "static files + in-memory" design). Pure functions only; the
 * hydration-safe "read in a mount useEffect, never in a lazy useState
 * initializer" rule lives in the calling component, not here.
 */

import type { ChatMessageData } from "@/components/chat/chat-message";

const STORAGE_KEY = "rci-chat-conversations-v1";
const MAX_CONVERSATIONS = 100;
const TITLE_MAX_LENGTH = 60;

export interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessageData[];
}

export function loadConversations(): StoredConversation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredConversation[]) : [];
  } catch {
    return [];
  }
}

/** Persists the full conversation list, newest-first, capped at
 *  MAX_CONVERSATIONS (oldest by `updatedAt` dropped first). Swallows
 *  QuotaExceededError and similar storage failures (e.g. private browsing)
 *  — chat still works for the rest of the session, it just won't survive
 *  a reload, which is preferable to throwing mid-stream. */
export function saveConversations(conversations: StoredConversation[]): void {
  try {
    const pruned = [...conversations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch (err) {
    console.warn("Failed to save chat history to localStorage:", err);
  }
}

export function titleFromMessage(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH)}…` : trimmed;
}

export function newConversationId(): string {
  return Math.random().toString(36).slice(2);
}

export function createConversation(): StoredConversation {
  const now = Date.now();
  return { id: newConversationId(), title: "", createdAt: now, updatedAt: now, messages: [] };
}
