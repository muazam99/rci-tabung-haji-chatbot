"use client";

import { useState } from "react";
import { MessageSquarePlus, Pencil, Trash2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";
import type { StoredConversation } from "@/lib/chat-store";

const DAY_MS = 24 * 60 * 60 * 1000;

function groupConversations(
  conversations: StoredConversation[],
  strings: ReturnType<typeof getUiStrings>
): Array<{ label: string; items: StoredConversation[] }> {
  const now = Date.now();
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const today: StoredConversation[] = [];
  const past7Days: StoredConversation[] = [];
  const older: StoredConversation[] = [];

  for (const c of sorted) {
    const age = now - c.updatedAt;
    if (age < DAY_MS) today.push(c);
    else if (age < 7 * DAY_MS) past7Days.push(c);
    else older.push(c);
  }

  return [
    { label: strings.groupToday, items: today },
    { label: strings.groupPast7Days, items: past7Days },
    { label: strings.groupOlder, items: older },
  ].filter((g) => g.items.length > 0);
}

interface ChatSidebarProps {
  conversations: StoredConversation[];
  activeId: string;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  lang: UiLanguage;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  lang,
  collapsed = false,
  onToggleCollapsed,
}: ChatSidebarProps) {
  const strings = getUiStrings(lang);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const groups = groupConversations(conversations, strings);

  function startRename(c: StoredConversation) {
    setRenamingId(c.id);
    setRenameValue(c.title || strings.untitledChat);
  }

  function commitRename() {
    if (renamingId) onRename(renamingId, renameValue.trim() || strings.untitledChat);
    setRenamingId(null);
  }

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center gap-2 border-r bg-muted/30 py-2">
        <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label={strings.toggleSidebar}>
          <PanelLeftOpen />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onNewChat} aria-label={strings.newChat}>
          <MessageSquarePlus />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="flex items-center gap-1 p-2">
        <Button variant="secondary" className="flex-1 justify-start" onClick={onNewChat}>
          <MessageSquarePlus className="size-4" />
          {strings.newChat}
        </Button>
        {onToggleCollapsed && (
          <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label={strings.toggleSidebar}>
            <PanelLeftClose />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {groups.length === 0 && (
          <p className="mt-6 px-2 text-center text-xs text-muted-foreground">{strings.chatListEmpty}</p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{group.label}</p>
            {group.items.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group/chat-item flex items-center gap-1 rounded-lg px-2 py-1.5",
                  c.id === activeId ? "bg-secondary" : "hover:bg-muted"
                )}
              >
                {renamingId === c.id ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="h-6 flex-1 text-xs"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className="flex-1 truncate text-left text-sm"
                  >
                    {c.title || strings.untitledChat}
                  </button>
                )}
                {renamingId !== c.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-0 group-hover/chat-item:opacity-100 data-[popup-open]:opacity-100"
                        />
                      }
                    >
                      <span className="sr-only">{strings.renameChat}</span>
                      <Pencil />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => startRename(c)}>
                        <Pencil />
                        {strings.renameChat}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          if (window.confirm(strings.deleteChatConfirm)) onDelete(c.id);
                        }}
                      >
                        <Trash2 />
                        {strings.deleteChat}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
