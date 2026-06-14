"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Icon from "@/components/ui/Icon";
import {
  isImageLike,
  prepareImageForUpload,
  MAX_DIRECT_UPLOAD_BYTES,
} from "@/lib/capture/prepareUpload";
import { EXPERTS, EXPERT_BY_ID, type Expert, type ExpertId } from "@/lib/experts/personas";
import Markdown from "./Markdown";
import { useConversations } from "./useConversations";

type ExpertChatProps = {
  open: boolean;
  onClose: () => void;
};

type AttachmentRef = { fileName: string; kind: "image" | "document" };
type UserMessage = { id: string; role: "user"; content: string; attachments: AttachmentRef[] };
type AssistantMessage = {
  id: string;
  role: "assistant";
  expertId: ExpertId;
  content: string;
  streaming: boolean;
  failed: boolean;
};
type Message = UserMessage | AssistantMessage;

type Pending = {
  id: string;
  fileName: string;
  kind: "image" | "document";
  previewUrl?: string;
};

// SSE event shapes emitted by /api/conversations/[id]/messages.
type StreamEvent =
  | { type: "delta"; expertId: ExpertId; text: string }
  | { type: "done"; expertId: ExpertId }
  | { type: "error"; expertId: ExpertId; message: string }
  | { type: "title"; title: string }
  | { type: "end" };

// Static Tailwind classes per accent (kept literal so they survive purge).
const ACCENT: Record<
  Expert["accent"],
  { selected: string; dot: string; card: string; label: string }
> = {
  sky: {
    selected: "border-sky-400 bg-sky-50 text-sky-900 ring-1 ring-sky-300",
    dot: "bg-sky-500",
    card: "border-sky-100 bg-sky-50/40",
    label: "text-sky-800",
  },
  emerald: {
    selected: "border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300",
    dot: "bg-emerald-500",
    card: "border-emerald-100 bg-emerald-50/40",
    label: "text-emerald-800",
  },
  amber: {
    selected: "border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-300",
    dot: "bg-amber-500",
    card: "border-amber-100 bg-amber-50/40",
    label: "text-amber-800",
  },
  orange: {
    selected: "border-orange-400 bg-orange-50 text-orange-900 ring-1 ring-orange-300",
    dot: "bg-orange-500",
    card: "border-orange-100 bg-orange-50/40",
    label: "text-orange-800",
  },
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// A modern, persistent farm-advisory chat: pick one or a few experts, attach
// photos/docs, stream replies, and revisit any past thread from history.
export default function ExpertChat({ open, onClose }: ExpertChatProps) {
  const convos = useConversations();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExpertId[]>(["plot_assistant"]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Monotonic counter for unique optimistic message ids (Date.now() in render is
  // flagged as impure; a ref counter is stable and enough for local keys).
  const turnRef = useRef(0);

  const selectedExperts = selected.map((id) => EXPERT_BY_ID[id]);

  const starters = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of selectedExperts) {
      for (const s of e.starters) {
        if (!seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
    }
    return out.slice(0, 4);
  }, [selectedExperts]);

  // Refresh history each time the sheet opens.
  const refreshConvos = convos.refresh;
  useEffect(() => {
    if (open) void refreshConvos();
  }, [open, refreshConvos]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  function toggleExpert(id: ExpertId) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.length === 1 ? prev : prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  function newChat() {
    setActiveId(null);
    setActiveTitle(null);
    setMessages([]);
    setPending([]);
    setError(null);
    setShowHistory(false);
  }

  // Lazily create the backing conversation the first time it's needed (a send or
  // an attachment), so opening the chat doesn't litter history with empties.
  async function ensureConversation(): Promise<string> {
    if (activeId) return activeId;
    const c = await convos.create(selected);
    setActiveId(c.id);
    setActiveTitle(c.title);
    return c.id;
  }

  async function openConversation(id: string) {
    setShowHistory(false);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't open that chat");
      }
      const data = (await res.json()) as {
        conversation: { id: string; title: string | null; expertIds: string[] };
        messages: {
          id: string;
          role: "user" | "assistant";
          expertId: string | null;
          content: string;
          attachments: AttachmentRef[];
        }[];
      };
      setActiveId(id);
      setActiveTitle(data.conversation.title);
      const eids = data.conversation.expertIds.filter((x): x is ExpertId => x in EXPERT_BY_ID);
      if (eids.length) setSelected(eids);
      setMessages(
        data.messages.map((m): Message =>
          m.role === "user"
            ? { id: m.id, role: "user", content: m.content, attachments: m.attachments }
            : {
                id: m.id,
                role: "assistant",
                expertId: (m.expertId && m.expertId in EXPERT_BY_ID
                  ? m.expertId
                  : "plot_assistant") as ExpertId,
                content: m.content,
                streaming: false,
                failed: false,
              },
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open that chat");
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      const convId = await ensureConversation();
      for (const file of Array.from(files)) {
        let toSend = file;
        let previewUrl: string | undefined;
        if (isImageLike(file)) {
          const prep = await prepareImageForUpload(file);
          toSend = prep.file;
          previewUrl = URL.createObjectURL(prep.file);
        } else if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
          setError(`${file.name} is too large to upload (max ~4 MB for documents).`);
          continue;
        }
        const form = new FormData();
        form.append("file", toSend);
        form.append("conversationId", convId);
        const res = await fetch("/api/chat-attachments", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Upload failed");
        }
        const data = (await res.json()) as {
          attachment: { id: string; fileName: string; kind: "image" | "document" };
        };
        setPending((prev) => [
          ...prev,
          {
            id: data.attachment.id,
            fileName: data.attachment.fileName,
            kind: data.attachment.kind,
            previewUrl,
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePending(id: string) {
    setPending((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function handleEvent(evt: StreamEvent, idByExpert: Map<ExpertId, string>, convId: string) {
    if (evt.type === "delta") {
      const id = idByExpert.get(evt.expertId);
      if (id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id && m.role === "assistant" ? { ...m, content: m.content + evt.text } : m,
          ),
        );
      }
    } else if (evt.type === "done") {
      const id = idByExpert.get(evt.expertId);
      if (id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id && m.role === "assistant" ? { ...m, streaming: false } : m)),
        );
      }
    } else if (evt.type === "error") {
      const id = idByExpert.get(evt.expertId);
      if (id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id && m.role === "assistant"
              ? { ...m, streaming: false, failed: true, content: m.content || evt.message }
              : m,
          ),
        );
      }
    } else if (evt.type === "title") {
      setActiveTitle(evt.title);
      convos.setTitleLocal(convId, evt.title);
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending || uploading || selected.length === 0) return;
    setError(null);

    let convId: string;
    try {
      convId = await ensureConversation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the chat");
      return;
    }

    const turn = `${(turnRef.current += 1)}`;
    const attachmentIds = pending.map((p) => p.id);
    const userMsg: UserMessage = {
      id: `u-${turn}`,
      role: "user",
      content,
      attachments: pending.map((p) => ({ fileName: p.fileName, kind: p.kind })),
    };
    const placeholders: AssistantMessage[] = selected.map((eid) => ({
      id: `a-${eid}-${turn}`,
      role: "assistant",
      expertId: eid,
      content: "",
      streaming: true,
      failed: false,
    }));
    const idByExpert = new Map<ExpertId, string>(
      selected.map((eid, i) => [eid, placeholders[i].id]),
    );

    setMessages((prev) => [...prev, userMsg, ...placeholders]);
    setInput("");
    setPending([]);
    setSending(true);

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertIds: selected, content, attachmentIds }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = block.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            handleEvent(JSON.parse(line.slice(5).trim()) as StreamEvent, idByExpert, convId);
          } catch {
            // skip a malformed event rather than aborting the stream
          }
        }
      }
      convos.bumpLocal(convId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" && m.streaming
            ? { ...m, streaming: false, failed: !m.content }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  async function copyMessage(m: AssistantMessage) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1500);
    } catch {
      // clipboard blocked — silently ignore
    }
  }

  async function commitRename(id: string) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      await convos.rename(id, title);
      if (id === activeId) setActiveTitle(title);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename the chat");
    }
  }

  async function deleteConversation(id: string) {
    try {
      await convos.remove(id);
      if (id === activeId) newChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the chat");
    }
  }

  const empty = messages.length === 0;
  const filteredHistory = convos.list.filter((c) =>
    (c.title ?? "New chat").toLowerCase().includes(historyQuery.trim().toLowerCase()),
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      fullScreen
      title={activeTitle ?? "Ask a farm expert"}
      subtitle={selectedExperts.map((e) => e.title).join(" · ")}
    >
      <div className="relative flex h-full flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between gap-2 pb-2">
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 active:bg-stone-50"
          >
            <Icon name="menu" size={16} />
            History
          </button>
          <button
            type="button"
            onClick={newChat}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 active:bg-stone-50"
          >
            <Icon name="plus" size={16} />
            New chat
          </button>
        </div>

        {/* Expert picker */}
        <div className="shrink-0 border-b border-stone-100 pb-2.5">
          <div className="flex flex-wrap gap-2">
            {EXPERTS.map((e) => {
              const on = selected.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggleExpert(e.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    on ? ACCENT[e.accent].selected : "border-stone-200 bg-white text-stone-600"
                  }`}
                >
                  <span aria-hidden>{e.emoji}</span>
                  {e.title}
                  {on && <Icon name="check" size={14} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <div
          ref={scrollerRef}
          className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-2"
        >
          {empty && (
            <div className="pt-6">
              <p className="text-center text-sm text-stone-500">
                Ask anything about your farm. Try:
              </p>
              <div className="mt-3 space-y-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block w-full rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 text-left text-sm text-stone-700 active:bg-stone-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end gap-1">
                {m.attachments.length > 0 && (
                  <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {m.attachments.map((a, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-600"
                      >
                        <Icon name={a.kind === "image" ? "camera" : "file"} size={12} />
                        <span className="max-w-32 truncate">{a.fileName}</span>
                      </span>
                    ))}
                  </div>
                )}
                {m.content && (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2 text-sm text-white">
                    {m.content}
                  </div>
                )}
              </div>
            ) : (
              <AssistantBubble
                key={m.id}
                message={m}
                copied={copiedId === m.id}
                onCopy={() => copyMessage(m)}
              />
            ),
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-stone-100 pt-2.5 pb-safe">
          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="relative flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 py-1 pl-1 pr-6 text-xs text-stone-600"
                >
                  {p.kind === "image" && p.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.previewUrl}
                      alt=""
                      className="h-7 w-7 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded bg-stone-200 text-stone-500">
                      <Icon name="file" size={14} />
                    </span>
                  )}
                  <span className="max-w-28 truncate">{p.fileName}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.fileName}`}
                    onClick={() => removePending(p.id)}
                    className="absolute right-1 top-1 text-stone-400 hover:text-stone-600"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.heic,.heif,application/pdf,text/csv,text/plain,.csv,.txt"
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Attach a photo or document"
              className="touch-target flex shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-500 active:bg-stone-50 disabled:opacity-40"
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-transparent" />
              ) : (
                <Icon name="paperclip" size={20} />
              )}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={`Message ${selectedExperts
                .map((e) => e.title.split(" ")[0])
                .join(" & ")}…`}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-stone-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400"
            />
            <button
              type="submit"
              disabled={sending || uploading || !input.trim()}
              aria-label="Send"
              className="focus-ring touch-target flex shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow active:bg-emerald-700 disabled:opacity-40"
            >
              <Icon name="send" size={20} />
            </button>
          </form>
        </div>

        {/* History drawer */}
        {showHistory && (
          <div className="absolute inset-0 z-10 flex flex-col bg-white">
            <div className="flex shrink-0 items-center justify-between gap-2 pb-2">
              <h3 className="text-base font-semibold text-stone-900">Chat history</h3>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                aria-label="Close history"
                className="touch-target flex items-center justify-center rounded-full text-stone-400 active:bg-stone-100"
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="relative mb-2 shrink-0">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
                <Icon name="search" size={16} />
              </span>
              <input
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Search chats"
                className="w-full rounded-full border border-stone-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            <button
              type="button"
              onClick={newChat}
              className="mb-2 flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-sm font-medium text-stone-600 active:bg-stone-50"
            >
              <Icon name="plus" size={16} />
              New chat
            </button>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
              {convos.loading && convos.list.length === 0 && (
                <p className="px-1 py-3 text-sm text-stone-400">Loading…</p>
              )}
              {!convos.loading && filteredHistory.length === 0 && (
                <p className="px-1 py-3 text-sm text-stone-400">
                  {historyQuery ? "No matching chats." : "No chats yet."}
                </p>
              )}
              {filteredHistory.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-1 rounded-xl px-2 py-1.5 ${
                    c.id === activeId ? "bg-emerald-50" : "active:bg-stone-50"
                  }`}
                >
                  {renamingId === c.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(c.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-emerald-300 px-2 py-1 text-sm outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => openConversation(c.id)}
                      className="flex min-w-0 flex-1 flex-col items-start py-1 text-left"
                    >
                      <span className="flex w-full items-center gap-1 truncate text-sm font-medium text-stone-800">
                        {c.pinned && <Icon name="pin" size={12} />}
                        <span className="truncate">{c.title ?? "New chat"}</span>
                      </span>
                      <span className="text-xs text-stone-400">{relativeTime(c.updatedAt)}</span>
                    </button>
                  )}
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => convos.setPinned(c.id, !c.pinned).catch(() => {})}
                      aria-label={c.pinned ? "Unpin" : "Pin"}
                      className={`flex h-8 w-8 items-center justify-center rounded-full active:bg-stone-100 ${
                        c.pinned ? "text-emerald-600" : "text-stone-400"
                      }`}
                    >
                      <Icon name="pin" size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(c.id);
                        setRenameValue(c.title ?? "");
                      }}
                      aria-label="Rename"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 active:bg-stone-100"
                    >
                      <Icon name="pencil" size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteConversation(c.id)}
                      aria-label="Delete"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 active:bg-stone-100"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function AssistantBubble({
  message,
  copied,
  onCopy,
}: {
  message: AssistantMessage;
  copied: boolean;
  onCopy: () => void;
}) {
  const e = EXPERT_BY_ID[message.expertId];
  const accent = ACCENT[e.accent];
  const thinking = message.streaming && !message.content;
  return (
    <div className={`rounded-2xl rounded-bl-md border p-3 ${accent.card}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span aria-hidden>{e.emoji}</span>
          <span className={`text-xs font-semibold ${accent.label}`}>
            {e.name} · {e.title}
          </span>
        </div>
        {!message.streaming && message.content && !message.failed && (
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy"
            className="flex items-center gap-1 text-xs text-stone-400 active:text-stone-600"
          >
            <Icon name={copied ? "check" : "copy"} size={13} />
          </button>
        )}
      </div>
      {thinking ? (
        <div className="flex items-center gap-2 text-sm text-stone-400">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-transparent" />
          Thinking…
        </div>
      ) : message.failed && !message.content ? (
        <p className="text-sm text-red-500">Couldn&apos;t get a reply from this expert.</p>
      ) : (
        <div className="relative">
          <Markdown>{message.content}</Markdown>
          {message.streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-stone-400 align-middle" />
          )}
        </div>
      )}
    </div>
  );
}
