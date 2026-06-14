"use client";

import { useCallback, useState } from "react";

export type ConversationSummary = {
  id: string;
  title: string | null;
  expertIds: string[];
  pinned: boolean;
  updatedAt: number;
};

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? fallback;
}

// Sort the way the server does: pinned first, then most recently updated.
function sortList(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

// Owns the chat-history sidebar: the list of the user's threads and the CRUD
// against /api/conversations. Thread contents + streaming live in ExpertChat.
export function useConversations() {
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) throw new Error(await readError(res, "Couldn't load chats"));
      const data = (await res.json()) as { conversations: ConversationSummary[] };
      setList(sortList(data.conversations ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load chats");
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (expertIds?: string[]) => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expertIds }),
    });
    if (!res.ok) throw new Error(await readError(res, "Couldn't start a chat"));
    const data = (await res.json()) as { conversation: ConversationSummary };
    setList((prev) => sortList([data.conversation, ...prev]));
    return data.conversation;
  }, []);

  const patch = useCallback(
    async (id: string, body: { title?: string; pinned?: boolean; archived?: boolean }) => {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't update the chat"));
      const data = (await res.json()) as { conversation: ConversationSummary };
      setList((prev) =>
        body.archived
          ? prev.filter((c) => c.id !== id)
          : sortList(prev.map((c) => (c.id === id ? data.conversation : c))),
      );
      return data.conversation;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await readError(res, "Couldn't delete the chat"));
    setList((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Local-only nudges so the sidebar reflects live streaming state without a refetch.
  const setTitleLocal = useCallback((id: string, title: string) => {
    setList((prev) => sortList(prev.map((c) => (c.id === id ? { ...c, title } : c))));
  }, []);

  const bumpLocal = useCallback((id: string) => {
    setList((prev) =>
      sortList(prev.map((c) => (c.id === id ? { ...c, updatedAt: Date.now() } : c))),
    );
  }, []);

  return {
    list,
    loading,
    error,
    refresh,
    create,
    rename: (id: string, title: string) => patch(id, { title }),
    setPinned: (id: string, pinned: boolean) => patch(id, { pinned }),
    remove,
    setTitleLocal,
    bumpLocal,
  };
}
