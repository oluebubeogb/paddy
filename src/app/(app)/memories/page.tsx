"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export default function MemoriesPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
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
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [category, query, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this memory? Paddy will no longer use it.")) return;
    await fetch(`/api/memories/${id}`, { method: "DELETE" });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleSaveEdit(id: string) {
    const res = await fetch(`/api/memories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent }),
    });
    if (res.ok) {
      const data = await res.json();
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...data.memory } : m))
      );
      setEditingId(null);
    }
  }

  async function handleClearAll() {
    if (!confirm("Clear all memories? This cannot be undone.")) return;
    await fetch("/api/memories/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setMemories([]);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border h-14 flex items-center px-4 gap-4">
        <Link
          href="/app/chat"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Chat
        </Link>
        <h1 className="font-semibold">Memories</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <p className="text-sm text-muted-foreground">
          Things Paddy remembers about you. You can edit or delete anything.
          Deleting a memory removes it from future conversations immediately.
        </p>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                category === c
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {c === "all" ? "All" : c.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Search memories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <Button variant="secondary" onClick={load}>
            Search
          </Button>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground text-center">Loading…</p>
        )}

        {!loading && memories.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No memories yet. They appear as you chat with Paddy.
          </p>
        )}

        <div className="space-y-3">
          {memories.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-border bg-card p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {m.category.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(m.createdAt).toLocaleDateString()}
                </span>
              </div>

              {editingId === m.id ? (
                <div className="space-y-2">
                  <Input
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSaveEdit(m.id)}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground leading-relaxed">
                  {m.content}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditingId(m.id);
                    setEditContent(m.content);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(m.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {memories.length > 0 && (
          <div className="pt-4 border-t border-border text-center">
            <Button variant="destructive" size="sm" onClick={handleClearAll}>
              Clear all memories
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
