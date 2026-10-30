"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MessageCircle, MessageSquarePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/app/app-shell";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelativeTime } from "@/lib/utils";

interface Session {
  id: string;
  title: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  messageCount?: number;
  isCurrent?: boolean;
}

const COLLAPSED_COUNT = 5;

/** Chat sessions live in Memories; the main chat is one endless thread. */
export function ChatSessions() {
  const router = useRouter();
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      if (res.status === 401) return router.push("/sign-in");
      const data = await res.json();
      setSessions(data.conversations || []);
    } catch {
      toast("Couldn't load your chats.", "error");
    } finally {
      setLoaded(true);
    }
  }, [router, toast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function newChat() {
    setCreating(true);
    try {
      const res = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.status === 401) return router.push("/sign-in");
      if (!res.ok) throw new Error();
      router.push("/chat");
    } catch {
      toast("Couldn't start a new chat.", "error");
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this conversation?")) return;
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Couldn't delete that conversation.", "error");
    setSessions((prev) => prev.filter((s) => s.id !== id));
    toast("Conversation deleted");
  }

  const visible = showAll ? sessions : sessions.slice(0, COLLAPSED_COUNT);

  return (
    <section id="sessions" className="scroll-mt-20 space-y-3" aria-labelledby="sessions-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="sessions-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          Chat sessions
          <InfoTip label="About chat sessions" side="bottom" align="start">
            Your chat is one endless thread. Paddy tucks it into a new session every week (or after a few
            quiet days) so it stays fast. Open one to browse it.
          </InfoTip>
        </h2>
        <Button size="sm" className="gap-2" onClick={() => void newChat()} disabled={creating}>
          <MessageSquarePlus className="h-4 w-4" />
          {creating ? "Starting…" : "New chat"}
        </Button>
      </div>

      {!loaded ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-secondary/60" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          No chats yet.
        </p>
      ) : (
        <Card className="divide-y divide-border p-0">
          {visible.map((s) => (
            <div key={s.id} className="group flex items-center gap-3 px-4 py-3">
              <Link
                href={s.isCurrent ? "/chat" : `/chat?session=${s.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    s.isCurrent ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                  )}
                >
                  <MessageCircle className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.title || "Conversation"}</span>
                    {s.isCurrent && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Current
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatRelativeTime(s.lastMessageAt || s.createdAt)}
                    {typeof s.messageCount === "number" && ` · ${s.messageCount} message${s.messageCount === 1 ? "" : "s"}`}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
              {!s.isCurrent && (
                <button
                  type="button"
                  onClick={() => void remove(s.id)}
                  className="rounded-lg p-1.5 text-muted-foreground opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label={`Delete ${s.title || "conversation"}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {sessions.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-secondary/50"
            >
              {showAll ? "Show less" : `Show all ${sessions.length}`}
            </button>
          )}
        </Card>
      )}
    </section>
  );
}
