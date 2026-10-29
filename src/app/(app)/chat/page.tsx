"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowUp,
  MessageCircle,
  MessageSquarePlus,
  PanelLeft,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaddyAvatar, PaddyMark } from "@/components/brand/paddy-mark";
import { Markdown } from "@/components/chat/markdown";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { Spinner } from "@/components/app/app-shell";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelativeTime } from "@/lib/utils";

interface Message {
  id: string;
  role: string;
  content: string;
  origin?: string;
  generationStatus?: string | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string | null;
  lastMessageAt: string | null;
}

const STARTERS = [
  "How was your day? Mine could use a recap.",
  "Help me plan something I've been putting off.",
  "I just want to chat for a bit.",
];

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ChatPage() {
  const router = useRouter();
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoaded, setConvLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [retryText, setRetryText] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // A conversation we just created is empty — don't fetch (and clobber optimistic messages).
  const tempSeq = useRef(0);
  const freshIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.status === 401) {
        router.push("/sign-in");
        return;
      }
      const data = await res.json();
      const list: Conversation[] = data.conversations || [];
      setConversations(list);
      setActiveId((prev) => prev ?? list[0]?.id ?? null);
    } catch {
      setError("Couldn't load your conversations.");
    } finally {
      setConvLoaded(true);
    }
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => void loadConversations(), 0);
    return () => clearTimeout(t);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId || freshIdRef.current === activeId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${activeId}/messages`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        setMessages(data.messages || []);
        setTimeout(scrollToBottom, 50);
      } catch {
        if (!cancelled) setError("Couldn't load messages.");
      } finally {
        if (!cancelled) setLoadedFor(activeId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, scrollToBottom]);

  // Auto-grow the composer.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const loadingMessages = !!activeId && loadedFor !== activeId;

  function selectConversation(id: string) {
    if (id !== activeId) {
      freshIdRef.current = null;
      setMessages([]);
      setError("");
      setRetryText(null);
    }
    setActiveId(id);
    setSidebarOpen(false);
  }

  async function createConversation(): Promise<string | null> {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setConversations((prev) => [data.conversation, ...prev]);
      freshIdRef.current = data.conversation.id;
      setMessages([]);
      setLoadedFor(data.conversation.id);
      setActiveId(data.conversation.id);
      setSidebarOpen(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
      return data.conversation.id;
    } catch {
      toast("Couldn't start a new conversation.", "error");
      return null;
    }
  }

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    // Only call it "offline" when the browser actually is.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You're offline. Reconnect and try again — your message is still in the box.");
      setInput(content);
      setRetryText(content);
      return;
    }

    let convId = activeId;
    if (!convId) convId = await createConversation();
    if (!convId) return;

    setInput("");
    setSending(true);
    setError("");
    setRetryText(null);

    const tempId = `temp-${++tempSeq.current}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content, createdAt: new Date().toISOString() },
    ]);
    setTimeout(scrollToBottom, 30);

    const fail = (msg: string) => {
      setError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
      setRetryText(content);
    };

    let res: Response;
    try {
      res = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        // A little longer than the server's AI timeout (AI_TIMEOUT_MS, 120s default).
        signal: AbortSignal.timeout(150_000),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        fail("Paddy took too long to answer. Your message is back in the box — try again.");
      } else if (typeof navigator !== "undefined" && navigator.onLine === false) {
        fail("You're offline. Your message is back in the box.");
      } else {
        fail("Couldn't reach Paddy — the connection dropped. Your message is back in the box.");
      }
      setSending(false);
      textareaRef.current?.focus();
      return;
    }

    try {
      // Proxies (Traefik/Coolify) can answer with HTML on 502/504 — don't let
      // a JSON parse error masquerade as a network problem.
      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        router.push("/sign-in");
        return;
      }

      if (!res.ok || !data?.assistantMessage) {
        if (res.status === 429) {
          fail(data?.error || "You're sending messages quickly — give it a moment and try again.");
        } else if (res.status === 504) {
          fail(
            data?.error ||
              "Paddy is taking too long to answer (the AI server may be waking up). Try again in a moment."
          );
        } else if (res.status >= 500 || !data) {
          fail(
            data?.error ||
              "Paddy is having trouble responding right now. Your message is back in the box — try again."
          );
        } else {
          fail(data?.error || "That didn't send. Try again?");
        }
        return;
      }

      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== tempId);
        if (data.userMessage) next.push(data.userMessage);
        next.push(data.assistantMessage);
        return next;
      });
      setTimeout(scrollToBottom, 50);
      void loadConversations();
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void sendMessage();
    }
  }

  async function deleteConversation(id: string) {
    if (!confirm("Delete this conversation?")) return;
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Couldn't delete that conversation.", "error");
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    toast("Conversation deleted");
  }

  const activeTitle = conversations.find((c) => c.id === activeId)?.title || "New conversation";
  const showWelcome = !loadingMessages && messages.length === 0 && !sending;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversation list */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:bg-card/60",
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        )}
        aria-label="Conversations"
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-3">
          <Button onClick={() => void createConversation()} size="sm" className="flex-1 gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </Button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversations"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors",
                activeId === c.id
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => selectConversation(c.id)}
                aria-current={activeId === c.id ? "true" : undefined}
              >
                <MessageCircle
                  className={cn("h-4 w-4 shrink-0", activeId === c.id && "text-primary")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.title || "Conversation"}</span>
                  {c.lastMessageAt && (
                    <span className="block text-[11px] text-muted-foreground">
                      {formatRelativeTime(c.lastMessageAt)}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground opacity-100 transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                onClick={() => void deleteConversation(c.id)}
                aria-label={`Delete ${c.title || "conversation"}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {convLoaded && conversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Your conversations will live here.
            </p>
          )}
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Chat column */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3 sm:px-4">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
          >
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>
          <PaddyMark size={22} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{activeTitle}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            AI companion
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-5 px-3 py-6 sm:px-6">
            {loadingMessages && messages.length === 0 && <Spinner label="Opening your conversation…" />}

            {showWelcome && (
              <div className="animate-in flex flex-col items-center px-4 pt-10 text-center sm:pt-16">
                <PaddyMark size={72} className="drop-shadow" />
                <h2 className="mt-5 text-2xl font-semibold tracking-tight">Hey, I&apos;m here 💚</h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Tell me what&apos;s on your mind — big or small. I&apos;ll remember the
                  things that matter to you.
                </p>
                <div className="mt-6 flex w-full max-w-md flex-col gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void sendMessage(s)}
                      className="rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => {
              const mine = m.role === "user";
              const body = m.content || (m.generationStatus === "pending" ? "…" : "");
              return (
                <div
                  key={m.id}
                  className={cn("animate-in group flex items-end gap-2", mine ? "justify-end" : "justify-start")}
                >
                  {!mine && <PaddyAvatar />}
                  <div className={cn("flex max-w-[85%] flex-col sm:max-w-[75%]", mine ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                        mine
                          ? "whitespace-pre-wrap rounded-br-md bg-[var(--user-bubble)] text-[var(--user-bubble-fg)] shadow-sm"
                          : m.generationStatus === "failed"
                            ? "rounded-bl-md border border-dashed border-border bg-transparent text-muted-foreground italic"
                            : "rounded-bl-md border border-border bg-[var(--assistant-bubble)] text-[var(--assistant-bubble-fg)] shadow-sm"
                      )}
                    >
                      {mine ? body : <Markdown>{body}</Markdown>}
                    </div>
                    <span className="mt-1 px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {m.origin === "proactive" ? "Paddy checked in · " : ""}
                      {timeLabel(m.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}

            {sending && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-border/70 bg-background/80 px-3 pb-3 pt-2 sm:px-6">
          <div className="mx-auto max-w-3xl">
            {error && (
              <div
                role="alert"
                className="animate-in mb-2 flex items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">{error}</span>
                {retryText && !sending && (
                  <button
                    type="button"
                    onClick={() => void sendMessage(retryText)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/30 px-2.5 py-0.5 font-medium transition-colors hover:bg-destructive/10"
                  >
                    <RotateCw className="h-3 w-3" />
                    Retry
                  </button>
                )}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
              className="flex items-end gap-2 rounded-3xl border border-input bg-card p-1.5 pl-4 shadow-sm transition-shadow focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15"
            >
              <label htmlFor="composer" className="sr-only">
                Message Paddy
              </label>
              <textarea
                id="composer"
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Paddy…"
                rows={1}
                className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:scale-95 disabled:opacity-40"
                aria-label="Send message"
              >
                <ArrowUp className="h-[18px] w-[18px]" />
              </button>
            </form>
            <p className="mt-1.5 hidden text-center text-[11px] text-muted-foreground sm:block">
              Enter to send · Shift+Enter for a new line · Paddy is an AI and can make mistakes
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
