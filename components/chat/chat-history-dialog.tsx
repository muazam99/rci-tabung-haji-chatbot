"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface ChatHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: StoredConversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  lang: UiLanguage;
}

export function ChatHistoryDialog({
  open,
  onOpenChange,
  conversations,
  activeId,
  onSelect,
  onRename,
  onDelete,
  lang,
}: ChatHistoryDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{strings.historyDialogTitle}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-96">
          <div className="flex flex-col gap-1 pr-2">
            {groups.length === 0 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">{strings.chatListEmpty}</p>
            )}
            {groups.map((group) => (
              <div key={group.label} className="mb-2">
                <p className="px-1 py-1 text-xs font-medium text-muted-foreground">{group.label}</p>
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
                        onClick={() => {
                          onSelect(c.id);
                          onOpenChange(false);
                        }}
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
