"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Check, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/app/app-shell";
import { useToast } from "@/components/ui/toast";
import { ChatSessions } from "@/components/memories/chat-sessions";
import { cn } from "@/lib/utils";

interface Memory {
  id: string;
  category: string;
  content: string;
  confidence: number;
  importance: number;
  sensitivity: string;
  createdAt: string;
  lastConfirmedAt: string | null;
}

const CATEGORIES = [
  "all",
  "personal_fact",
  "preference",
  "episodic",
  "relationship",
  "goal",
  "ongoing_situation",
];

const label = (c: string) => (c === "all" ? "All" : c.replace(/_/g, " "));

export default function MemoriesPage() {
  const router = useRouter();
  const toast = useToast();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/memories?${params}`);
      if (res.status === 401) {
        router.push("/sign-in");
        return;
      }
      const data = await res.json();
      setMemories(data.memories || []);
    } catch {
      toast("Couldn't load memories.", "error");
    } finally {
      setLoaded(true);
    }
  }, [category, query, router, toast]);

  // Debounced so typing in search doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this memory? Paddy will no longer use it.")) return;
    const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Couldn't delete that memory.", "error");
    setMemories((prev) => prev.filter((m) => m.id !== id));
    toast("Forgotten. Paddy won't use that any more.");
  }

  async function handleSaveEdit(id: string) {
    const res = await fetch(`/api/memories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent }),
    });
    if (res.ok) {
      const data = await res.json();
      setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, ...data.memory } : m)));
      setEditingId(null);
      toast("Memory updated");
    } else {
      toast("Couldn't save that edit.", "error");
    }
  }

  async function handleClearAll() {
    if (!confirm("Clear all memories? This cannot be undone.")) return;
    const res = await fetch("/api/memories/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return toast("Couldn't clear memories.", "error");
    setMemories([]);
    toast("All memories cleared");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 pb-16">
      <PageHeader
        icon={Brain}
        title="Memories"
        description="What Paddy remembers, and your chats."
        tip="Edit or delete anything — deleting a memory removes it from future conversations right away."
      />

      <ChatSessions />

      <section className="space-y-3 pt-2" aria-labelledby="memories-heading">
        <h2 id="memories-heading" className="text-sm font-semibold">
          What Paddy remembers
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="memory-search" className="sr-only">
            Search memories
          </label>
          <Input
            id="memory-search"
            type="search"
            placeholder="Search memories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-full pl-10"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Memory category">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs capitalize transition-colors",
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {label(c)}
            </button>
          ))}
        </div>
      </section>

      {!loaded && <Spinner label="Gathering memories…" />}

      {loaded && memories.length === 0 && (
        <EmptyState icon={Brain} title={query || category !== "all" ? "Nothing matches that" : "No memories yet"}>
          {query || category !== "all"
            ? "Try a different word or category."
            : "As you chat, Paddy will gently remember the things that matter to you."}
        </EmptyState>
      )}

      <div className="space-y-3">
        {memories.map((m) => (
          <Card key={m.id} className="animate-in group space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium capitalize text-primary">
                {label(m.category)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {new Date(m.createdAt).toLocaleDateString()}
              </span>
            </div>

            {editingId === m.id ? (
              <div className="space-y-2">
                <Input
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && void handleSaveEdit(m.id)}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1.5" onClick={() => void handleSaveEdit(m.id)}>
                    <Check className="h-3.5 w-3.5" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-foreground">{m.content}</p>
            )}

            {editingId !== m.id && (
              <div className="flex gap-1 pt-1">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={() => {
                    setEditingId(m.id);
                    setEditContent(m.content);
                  }}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void handleDelete(m.id)}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {memories.length > 0 && (
        <div className="border-t border-border pt-6 text-center">
          <Button variant="ghost" size="sm" className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => void handleClearAll()}>
            <Trash2 className="h-4 w-4" /> Clear all memories
          </Button>
        </div>
      )}
    </div>
  );
}
