"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  MessageCircle,
  PanelLeft,
  PanelLeftClose,
  Reply,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { PaddyMark } from "@/components/brand/paddy-mark";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import {
  MessageBubble,
  quoteSnippet,
  type ChatBubbleMessage,
  type QuotedMessage,
} from "@/components/chat/message-bubble";
import { DOB_REQUIRED_EVENT } from "@/components/dob/dob-gate";
import { Spinner } from "@/components/app/app-shell";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  MAX_WAIT_IDLE_MS,
  MAX_WAIT_TYPING_MS,
  TYPING_ACTIVE_MS,
  TYPING_RECHECK_MS,
  adaptiveWaitMs,
} from "@/lib/chat/adaptive-wait";

type Message = ChatBubbleMessage;

interface Conversation {
  id: string;
  title: string | null;
  lastMessageAt: string | null;
  createdAt?: string;
  isCurrent?: boolean;
}

/** A user bubble waiting in the batch window. */
interface QueuedBubble {
  tempId: string;
  content: string;
  replyTo: QuotedMessage | null;
}

const STARTERS = [
  "How was your day? Mine could use a recap.",
  "Help me plan something I've been putting off.",
  "I just want to chat for a bit.",
];

// Paddy waits adaptively before answering the whole batch (one AI call):
// longer while the user is mid-thought, sooner after one clear message.
// See lib/chat/adaptive-wait.ts.
const SIDEBAR_KEY = "paddy.chat.sidebarCollapsed";
const PAGE_SIZE = 40;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string, todayKey: string | null, yesterdayKey: string | null) {
  const k = dayKey(iso);
  if (k === todayKey) return "Today";
  if (k === yesterdayKey) return "Yesterday";
  const d = new Date(iso);
  const sameYear = todayKey?.startsWith(`${d.getFullYear()}-`);
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isTemp = (id: string) => id.startsWith("temp-");
/** Wall-clock helper (used only from event handlers / timers, never during render). */
const nowMs = () => Date.now();

export default function ChatPage() {
  return (
    <Suspense fallback={<Spinner label="Opening your chat…" />}>
      <ChatView />
    </Suspense>
  );
}

function ChatView() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  /** Browsing a past session from Memories → sidebar mode. Otherwise: the endless main chat. */
  const sessionId = searchParams.get("session");
  const sessionMode = !!sessionId;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoaded, setConvLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false); // AI request in flight or bubbles still revealing
  const [queuedCount, setQueuedCount] = useState(0);
  const [error, setError] = useState("");
  const [retryBatch, setRetryBatch] = useState<QueuedBubble[] | null>(null);
  const [replyTarget, setReplyTarget] = useState<QuotedMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typingNow, setTypingNow] = useState(false);
  const [days, setDays] = useState<{ today: string; yesterday: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAdjustRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tempSeq = useRef(0);
  // A conversation we just created is empty — don't fetch (and clobber optimistic messages).

  // Batching state lives in refs so timers always see the latest values.
  const queueRef = useRef<QueuedBubble[]>([]);
  const queueConvRef = useRef<string | null>(null);
  const firstQueuedAtRef = useRef(0);
  const lastTypedAtRef = useRef(0);
  const lastQueuedAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempToRealRef = useRef(new Map<string, string>());
  const activeIdRef = useRef<string | null>(null);
  const inputRef = useRef("");

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // Remember the desktop sidebar preference.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    try {
      localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
    } catch {}
  }
  function openSidebar() {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setCollapsedPersist(false);
    } else {
      setSidebarOpen(true);
    }
  }

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Today / Yesterday labels for day dividers (computed after mount).
  useEffect(() => {
    const t = setTimeout(() => {
      const now = new Date();
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      setDays({ today: dayKey(now.toISOString()), yesterday: dayKey(y.toISOString()) });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.status === 401) {
        router.push("/sign-in");
        return;
      }
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      setError("Couldn't load your conversations.");
    } finally {
      setConvLoaded(true);
    }
  }, [router]);

  // Sessions sidebar only exists when browsing a past session.
  useEffect(() => {
    if (!sessionMode) return;
    const t = setTimeout(() => void loadConversations(), 0);
    return () => clearTimeout(t);
  }, [sessionMode, loadConversations]);

  /** One page of history: the endless timeline, or a single session when browsing. */
  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) qs.set("cursor", cursor);
      const url = sessionId
        ? `/api/conversations/${sessionId}/messages?${qs}`
        : `/api/chat/timeline?${qs}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) {
        router.push("/sign-in");
        return null;
      }
      if (res.status === 404 && sessionId) {
        toast("That conversation isn't available anymore.", "error");
        router.replace("/chat");
        return null;
      }
      if (!res.ok) throw new Error();
      return (await res.json()) as { messages: Message[]; nextCursor: string | null; conversationId?: string | null };
    },
    [sessionId, router, toast]
  );

  // Initial load (and whenever we switch between main chat / a session).
  const viewKey = sessionId ?? "main";
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPage(null);
        if (cancelled || !data) return;
        const convId = sessionId ?? data.conversationId ?? null;
        activeIdRef.current = convId;
        setActiveId(convId);
        setMessages(data.messages || []);
        setNextCursor(data.nextCursor ?? null);
        setTimeout(() => bottomRef.current?.scrollIntoView(), 30);
      } catch {
        if (!cancelled) setError("Couldn't load messages.");
      } finally {
        if (!cancelled) setLoadedFor(viewKey);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewKey, sessionId, fetchPage]);

  // Scrolling near the top loads the previous page — never the whole history.
  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const el = scrollRef.current;
      const data = await fetchPage(nextCursor);
      if (!data) return;
      scrollAdjustRef.current = el ? el.scrollHeight - el.scrollTop : null;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...(data.messages || []).filter((m) => !seen.has(m.id)), ...prev];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch {
      toast("Couldn't load earlier messages.", "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  // Keep the reading position steady when older messages are prepended.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && scrollAdjustRef.current !== null) {
      el.scrollTop = el.scrollHeight - scrollAdjustRef.current;
      scrollAdjustRef.current = null;
    }
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (el && el.scrollTop < 160 && nextCursor && !loadingOlder) void loadOlder();
  }

  // Auto-grow the composer.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const loadingMessages = loadedFor !== viewKey;

  // ── Batching ─────────────────────────────────────────────────────────────

  function clearTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  /** Is the user actively typing in the composer right now? */
  function isTyping(now = nowMs()) {
    return inputRef.current.trim().length > 0 && now - lastTypedAtRef.current < TYPING_ACTIVE_MS;
  }

  /** Adaptive quiet period: longer mid-thought / after short bursts, shorter after one finished message. */
  function requiredQuietMs(now = nowMs()) {
    return adaptiveWaitMs({ bubbles: queueRef.current.map((b) => b.content), typing: isTyping(now) });
  }

  function scheduleFlush(delay?: number) {
    clearTimer();
    const now = nowMs();
    const typing = isTyping(now);
    setTypingNow(typing);
    const wait =
      delay ??
      (typing
        ? TYPING_RECHECK_MS
        : Math.max(0, requiredQuietMs(now) - (now - Math.max(lastQueuedAtRef.current, lastTypedAtRef.current))));
    timerRef.current = setTimeout(() => tryFlush(), wait);
  }

  function tryFlush(force = false) {
    clearTimer();
    if (!queueRef.current.length || inFlightRef.current) return;
    if (!force) {
      const now = nowMs();
      const typing = isTyping(now);
      const sinceFirst = now - firstQueuedAtRef.current;
      const ceiling = typing ? MAX_WAIT_TYPING_MS : MAX_WAIT_IDLE_MS;
      const quietFor = now - Math.max(lastQueuedAtRef.current, lastTypedAtRef.current);
      if (sinceFirst < ceiling && (typing || quietFor < requiredQuietMs(now))) {
        scheduleFlush();
        return;
      }
    }
    setTypingNow(false);
    void flushBatch();
  }

  async function flushBatch() {
    const convId = queueConvRef.current;
    const batch = queueRef.current.splice(0);
    setQueuedCount(0);
    if (!convId || !batch.length) return;

    inFlightRef.current = true;
    setSending(true);
    setError("");
    setRetryBatch(null);
    const batchIds = new Set(batch.map((b) => b.tempId));
    setMessages((prev) => prev.map((m) => (batchIds.has(m.id) ? { ...m, status: "sending" } : m)));

    const payload = batch.map((b) => {
      let replyToId: string | undefined;
      let replyToIndex: number | undefined;
      if (b.replyTo) {
        const real = isTemp(b.replyTo.id) ? tempToRealRef.current.get(b.replyTo.id) : b.replyTo.id;
        if (real) replyToId = real;
        else {
          const idx = batch.findIndex((x) => x.tempId === b.replyTo!.id);
          if (idx >= 0) replyToIndex = idx;
        }
      }
      return { content: b.content, replyToId, replyToIndex };
    });

    const isActive = () => activeIdRef.current === convId;
    let failed = false;

    const fail = (msg: string) => {
      failed = true;
      setMessages((prev) => prev.filter((m) => !batchIds.has(m.id)));
      if (!isActive()) {
        toast(msg, "error");
        return;
      }
      setError(msg);
      setRetryBatch(batch);
      // Put the words back in the box (unless the user already typed something new).
      if (!inputRef.current.trim()) setInput(batch.map((b) => b.content).join("\n"));
    };

    try {
      let res: Response;
      try {
        res = await fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payload }),
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
        return;
      }

      // Proxies (Traefik/Coolify) can answer with HTML on 502/504 — don't let
      // a JSON parse error masquerade as a network problem.
      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        router.push("/sign-in");
        return;
      }

      const assistantMessages: Message[] =
        data?.assistantMessages ?? (data?.assistantMessage ? [data.assistantMessage] : []);
      const userMessages: Message[] = data?.userMessages ?? (data?.userMessage ? [data.userMessage] : []);

      if (!res.ok || !assistantMessages.length) {
        if (res.status === 403 && data?.code === "dob_required") {
          window.dispatchEvent(new Event(DOB_REQUIRED_EVENT));
          fail(data.error || "Add your birthday to start chatting.");
        } else if (res.status === 429) {
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

      // The server may have rolled the endless chat into a fresh weekly session.
      if (!sessionMode && data?.conversationId && data.conversationId !== activeIdRef.current) {
        activeIdRef.current = data.conversationId;
        setActiveId(data.conversationId);
      }

      // Swap optimistic bubbles for the saved ones (same order).
      batch.forEach((b, i) => {
        if (userMessages[i]) tempToRealRef.current.set(b.tempId, userMessages[i].id);
      });
      setMessages((prev) => {
        const out: Message[] = [];
        for (const m of prev) {
          if (!batchIds.has(m.id)) out.push(m);
          else {
            const real = userMessages.find((u) => u.id === tempToRealRef.current.get(m.id));
            out.push(real ?? { ...m, status: undefined });
          }
        }
        return out;
      });
      if (sessionMode) void loadConversations();
      const deliveredTo = data?.conversationId ?? convId;
      const stillHere = () => activeIdRef.current === deliveredTo || isActive();
      if (!stillHere()) return;

      // Reveal Paddy's bubbles one by one, like someone texting back.
      for (let i = 0; i < assistantMessages.length; i++) {
        const m = assistantMessages[i];
        if (i > 0) await sleep(Math.min(1700, 500 + m.content.length * 18));
        if (!stillHere()) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        setTimeout(scrollToBottom, 40);
      }
    } finally {
      inFlightRef.current = false;
      setSending(false);
      // Anything the user sent meanwhile goes out as the next single batch
      // (after a failure, wait for them — don't wipe the Retry banner).
      if (queueRef.current.length && !failed) scheduleFlush(700);
    }
  }

  async function enqueue(text?: string, opts: { immediate?: boolean } = {}) {
    const content = (text ?? input).trim();
    if (!content) return;

    // Only call it "offline" when the browser actually is.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You're offline. Reconnect and try again — your message is still in the box.");
      setInput(content);
      return;
    }

    let convId = activeIdRef.current;
    if (!convId) convId = await ensureCurrentConversation();
    if (!convId) return;

    // A batch for another conversation must go out before we start a new one.
    if (queueRef.current.length && queueConvRef.current !== convId) tryFlush(true);

    const tempId = `temp-${++tempSeq.current}`;
    const quoted = replyTarget;
    if (text === undefined) setInput("");
    setReplyTarget(null);
    setError("");
    setRetryBatch(null);

    if (!queueRef.current.length) firstQueuedAtRef.current = nowMs();
    lastQueuedAtRef.current = nowMs();
    queueConvRef.current = convId;
    queueRef.current.push({ tempId, content, replyTo: quoted });
    setQueuedCount(queueRef.current.length);

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
        replyToId: quoted?.id ?? null,
        replyTo: quoted,
        status: "queued",
      },
    ]);
    setTimeout(scrollToBottom, 30);

    if (opts.immediate) tryFlush(true);
    else if (!inFlightRef.current) scheduleFlush();
    textareaRef.current?.focus();
  }

  function retry() {
    const batch = retryBatch;
    if (!batch?.length) return;
    if (inputRef.current.trim() === batch.map((b) => b.content).join("\n")) setInput("");
    setRetryBatch(null);
    setError("");
    const convId = activeIdRef.current;
    if (!convId) return;
    if (!queueRef.current.length) firstQueuedAtRef.current = nowMs();
    queueConvRef.current = convId;
    const fresh = batch.map((b) => ({ ...b, tempId: `temp-${++tempSeq.current}` }));
    // Re-point in-batch quotes at the new temp ids.
    const remap = new Map(batch.map((b, i) => [b.tempId, fresh[i].tempId]));
    for (const f of fresh) if (f.replyTo && remap.has(f.replyTo.id)) f.replyTo = { ...f.replyTo, id: remap.get(f.replyTo.id)! };
    queueRef.current.push(...fresh);
    setQueuedCount(queueRef.current.length);
    setMessages((prev) => [
      ...prev,
      ...fresh.map((b) => ({
        id: b.tempId,
        role: "user",
        content: b.content,
        createdAt: new Date().toISOString(),
        replyToId: b.replyTo?.id ?? null,
        replyTo: b.replyTo,
        status: "queued" as const,
      })),
    ]);
    setTimeout(scrollToBottom, 30);
    tryFlush(true);
  }

  // ── Conversations ────────────────────────────────────────────────────────

  function resetComposerState() {
    setError("");
    setRetryBatch(null);
    setReplyTarget(null);
  }

  function selectConversation(id: string) {
    if (id !== sessionId) {
      if (queueRef.current.length) tryFlush(true);
      setMessages([]);
      resetComposerState();
      router.replace(`/chat?session=${id}`);
    }
    setSidebarOpen(false);
  }

  /** The endless chat's current session id (the server creates/rotates it). */
  async function ensureCurrentConversation(): Promise<string | null> {
    try {
      const res = await fetch("/api/chat/timeline?limit=1", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/sign-in");
        return null;
      }
      const data = await res.json();
      if (!res.ok || !data.conversationId) throw new Error();
      activeIdRef.current = data.conversationId;
      setActiveId(data.conversationId);
      return data.conversationId as string;
    } catch {
      toast("Couldn't reach Paddy — try again in a moment.", "error");
      return null;
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
    toast("Conversation deleted");
    if (sessionId === id) router.replace("/memories#sessions");
  }

  // ── Composer ─────────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enqueue();
    } else if (e.key === "Escape" && replyTarget) {
      setReplyTarget(null);
    }
  }

  function handleInput(value: string) {
    setInput(value);
    lastTypedAtRef.current = nowMs();
    // Still typing → Paddy keeps listening (adaptive, see tryFlush).
    if (queueRef.current.length && !inFlightRef.current) scheduleFlush();
  }

  function startReply(m: Message) {
    if (!m.content) return;
    setReplyTarget({ id: m.id, role: m.role, content: m.content });
    setTimeout(() => textareaRef.current?.focus(), 20);
  }

  function jumpTo(id: string) {
    const real = isTemp(id) ? tempToRealRef.current.get(id) ?? id : id;
    const el = document.getElementById(`msg-${real}`) ?? document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(el.id.slice(4));
    setTimeout(() => setHighlightId(null), 1400);
  }

  const showWelcome = !loadingMessages && messages.length === 0 && !sending;
  const waitingForBatch = queuedCount > 0 && !sending;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sessions sidebar — only when browsing a past session (from Memories) */}
      {sessionMode && (
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:bg-card/60",
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          collapsed && "md:hidden"
        )}
        aria-label="Conversations"
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-3">
          <Link
            href="/chat"
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-px hover:shadow-md hover:shadow-primary/25"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to chat
          </Link>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversations"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="hidden h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:inline-flex"
            onClick={() => setCollapsedPersist(true)}
            aria-label="Collapse conversations"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors",
                sessionId === c.id
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => selectConversation(c.id)}
                aria-current={sessionId === c.id ? "true" : undefined}
              >
                <MessageCircle className={cn("h-4 w-4 shrink-0", sessionId === c.id && "text-primary")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {c.isCurrent && (!c.title || c.title === "New conversation") ? "This week" : c.title || "Conversation"}
                  </span>
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
      )}

      {sessionMode && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Chat column — no secondary header; messages start right under the app nav */}
      <section className="relative flex min-w-0 flex-1 flex-col">
        {sessionMode && (
        <button
          type="button"
          onClick={openSidebar}
          className={cn(
            "absolute left-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur transition-all hover:scale-105 hover:text-foreground",
            !collapsed && "md:hidden"
          )}
          aria-label="Open conversations"
          title="Conversations"
        >
          <PanelLeft className="h-[18px] w-[18px]" />
        </button>
        )}

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
          <div
            className={cn(
              "mx-auto max-w-3xl px-3 pb-6 sm:px-6",
              !sessionMode ? "pt-4" : collapsed ? "pt-14" : "pt-14 md:pt-6"
            )}
          >
            {loadingMessages && messages.length === 0 && (
              <Spinner label={sessionMode ? "Opening your conversation…" : "Opening your chat…"} />
            )}
            {nextCursor && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  className="rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                >
                  {loadingOlder ? "Loading earlier messages…" : "Load earlier messages"}
                </button>
              </div>
            )}

            {showWelcome && (
              <div className="animate-in flex flex-col items-center px-4 pt-6 text-center sm:pt-12">
                <PaddyMark size={72} className="drop-shadow" />
                <h2 className="mt-5 text-2xl font-semibold tracking-tight">Hey, I&apos;m here 💚</h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  What&apos;s on your mind?
                </p>
                <div className="mt-6 flex w-full max-w-md flex-col gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void enqueue(s, { immediate: true })}
                      className="rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const nextNewDay = !!next && dayKey(next.createdAt) !== dayKey(m.createdAt);
              return (
                <div key={m.id}>
                  {newDay && (
                    <div className="my-4 flex items-center justify-center" role="separator">
                      <span className="rounded-full bg-secondary/70 px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {dayLabel(m.createdAt, days?.today ?? null, days?.yesterday ?? null)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    firstInGroup={newDay || !prev || prev.role !== m.role}
                    lastInGroup={nextNewDay || !next || next.role !== m.role}
                    highlighted={highlightId === m.id}
                    onReply={startReply}
                    onJumpTo={jumpTo}
                  />
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
                {retryBatch && !sending && (
                  <button
                    type="button"
                    onClick={retry}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/30 px-2.5 py-0.5 font-medium transition-colors hover:bg-destructive/10"
                  >
                    <RotateCw className="h-3 w-3" />
                    Retry
                  </button>
                )}
              </div>
            )}

            {waitingForBatch && (
              <div className="animate-in mb-1.5 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex gap-0.5" aria-hidden>
                  <span className="h-1 w-1 animate-pulse rounded-full bg-primary" />
                  <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                  <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                </span>
                {typingNow ? "Take your time — Paddy's listening" : "Paddy will reply when you pause"}
                <button
                  type="button"
                  onClick={() => tryFlush(true)}
                  className="rounded-full px-2 py-0.5 font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Reply now
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enqueue();
              }}
              className="rounded-3xl border border-input bg-card shadow-sm"
            >
              {replyTarget && (
                <div className="animate-in flex items-start gap-2 px-2 pt-2">
                  <div className="min-w-0 flex-1 rounded-2xl border-l-[3px] border-primary bg-primary/[0.07] px-3 py-1.5">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                      <Reply className="h-3 w-3" />
                      Replying to {replyTarget.role === "assistant" ? "Paddy" : "yourself"}
                    </span>
                    <span className="line-clamp-2 break-words text-[13px] text-muted-foreground">
                      {quoteSnippet(replyTarget.content)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                    className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Cancel reply"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2 p-1.5 pl-4">
                <label htmlFor="composer" className="sr-only">
                  Message Paddy
                </label>
                <textarea
                  id="composer"
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => handleInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Paddy…"
                  rows={1}
                  className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:opacity-90 active:scale-90 disabled:scale-95 disabled:opacity-40"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-[18px] w-[18px]" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
