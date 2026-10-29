"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export default function ChatPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      setConversations(data.conversations || []);
      if (!activeId && data.conversations?.length > 0) {
        setActiveId(data.conversations[0].id);
      }
    } catch {
      setError("Failed to load conversations");
    }
  }, [activeId, router]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages`
        );
        if (!res.ok) throw new Error("Failed to load messages");
        const data = await res.json();
        setMessages(data.messages || []);
        setTimeout(scrollToBottom, 50);
      } catch {
        setError("Could not load messages");
      } finally {
        setLoading(false);
      }
    },
    [scrollToBottom]
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);

  async function createConversation() {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setConversations((prev) => [data.conversation, ...prev]);
        setActiveId(data.conversation.id);
        setMessages([]);
        setSidebarOpen(false);
      }
    } catch {
      setError("Could not create conversation");
    }
  }

  async function sendMessage() {
    if (!input.trim() || !activeId || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    setError("");

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
    setTimeout(scrollToBottom, 30);

    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();

      if (!res.ok && !data.assistantMessage) {
        setError(data.error || "Failed to send");
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        const next = [...withoutTemp];
        if (data.userMessage) next.push(data.userMessage);
        if (data.assistantMessage) next.push(data.assistantMessage);
        return next;
      });
      setTimeout(scrollToBottom, 50);
      loadConversations();
    } catch {
      setError("Network error");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function deleteConversation(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-72 bg-card border-r border-border flex flex-col transition-transform duration-200 md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <span className="font-semibold text-primary">Paddy</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={createConversation}
            className="text-xs"
          >
            New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-3 py-2 text-sm cursor-pointer",
                activeId === c.id
                  ? "bg-primary/10 text-foreground"
                  : "hover:bg-secondary text-muted-foreground"
              )}
              onClick={() => {
                setActiveId(c.id);
                setSidebarOpen(false);
              }}
            >
              <span className="flex-1 truncate">
                {c.title || "Conversation"}
              </span>
              <button
                className="opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(c.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-4">
              No conversations yet. Start a new one.
            </p>
          )}
        </div>
        <div className="p-3 border-t border-border space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => router.push("/app/memories")}
          >
            Memories
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => router.push("/app/life")}
          >
            Life
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => router.push("/app/companion")}
          >
            Companion settings
          </Button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card/50">
          <button
            className="md:hidden text-muted-foreground"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
          >
            ☰
          </button>
          <span className="font-medium text-sm truncate">
            {conversations.find((c) => c.id === activeId)?.title ||
              "Conversation"}
          </span>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {!activeId && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <p className="text-2xl font-semibold text-foreground mb-2">
                Hello 💚
              </p>
              <p className="text-muted-foreground max-w-sm">
                Start a new conversation and Paddy will be here with you.
              </p>
              <Button className="mt-6" onClick={createConversation}>
                New conversation
              </Button>
            </div>
          )}

          {activeId && loading && messages.length === 0 && (
            <p className="text-center text-muted-foreground text-sm">
              Loading…
            </p>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-[var(--user-bubble)] text-[var(--user-bubble-fg)] rounded-br-md"
                    : "bg-[var(--assistant-bubble)] text-[var(--assistant-bubble-fg)] border border-border rounded-bl-md shadow-sm"
                )}
              >
                {m.content ||
                  (m.generationStatus === "pending" ? "…" : "")}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-[var(--assistant-bubble)] border border-border rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-muted-foreground shadow-sm">
                Paddy is thinking…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        {activeId && (
          <div className="border-t border-border bg-card p-3 sm:p-4 safe-area-pb">
            {error && (
              <p className="text-xs text-destructive mb-2 text-center">
                {error}
              </p>
            )}
            <div className="flex items-end gap-2 max-w-3xl mx-auto">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Paddy…"
                rows={1}
                className="flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-h-32"
                disabled={sending}
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                size="md"
                className="shrink-0"
              >
                Send
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
