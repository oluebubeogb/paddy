"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LifeEvent {
  id: string;
  title: string;
  description: string | null;
  eventAt: string | null;
  status: string;
  userConfirmed: boolean;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  targetAt: string | null;
  status: string;
  progressNotes: string | null;
}

interface FollowUp {
  id: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  messageIntent: string | null;
}

export default function LifePage() {
  const router = useRouter();
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newGoalTitle, setNewGoalTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, goRes, fuRes] = await Promise.all([
        fetch("/api/life/events"),
        fetch("/api/life/goals"),
        fetch("/api/follow-ups"),
      ]);
      if (evRes.status === 401) {
        router.push("/sign-in");
        return;
      }
      const ev = await evRes.json();
      const go = await goRes.json();
      const fu = await fuRes.json();
      setEvents(ev.events || []);
      setGoals(go.goals || []);
      setFollowUps(fu.followUps || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function addEvent() {
    if (!newEventTitle.trim()) return;
    const res = await fetch("/api/life/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newEventTitle.trim() }),
    });
    if (res.ok) {
      setNewEventTitle("");
      load();
    }
  }

  async function addGoal() {
    if (!newGoalTitle.trim()) return;
    const res = await fetch("/api/life/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newGoalTitle.trim() }),
    });
    if (res.ok) {
      setNewGoalTitle("");
      load();
    }
  }

  async function updateEventStatus(id: string, status: string) {
    await fetch(`/api/life/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event?")) return;
    await fetch(`/api/life/events/${id}`, { method: "DELETE" });
    load();
  }

  async function updateGoalStatus(id: string, status: string) {
    await fetch(`/api/life/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function dismissFollowUp(id: string) {
    await fetch(`/api/follow-ups/${id}/dismiss`, { method: "POST" });
    load();
  }

  const upcoming = events.filter((e) =>
    ["upcoming", "ongoing"].includes(e.status)
  );
  const completed = events.filter((e) =>
    ["completed", "cancelled"].includes(e.status)
  );
  const activeGoals = goals.filter((g) => g.status === "active");
  const pendingFollowUps = followUps.filter((f) =>
    ["proposed", "scheduled"].includes(f.status)
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border h-14 flex items-center px-4 gap-4">
        <Link
          href="/app/chat"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Chat
        </Link>
        <h1 className="font-semibold">Life</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-10">
        {loading && (
          <p className="text-sm text-muted-foreground text-center">Loading…</p>
        )}

        {/* Follow-ups */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Pending follow-ups
          </h2>
          {pendingFollowUps.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No scheduled check-ins right now.
            </p>
          )}
          {pendingFollowUps.map((f) => (
            <div
              key={f.id}
              className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {f.messageIntent || "Check-in"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {f.type} · {f.status}
                  {f.scheduledAt &&
                    ` · ${new Date(f.scheduledAt).toLocaleString()}`}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismissFollowUp(f.id)}
              >
                Dismiss
              </Button>
            </div>
          ))}
        </section>

        {/* Events */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Upcoming events
          </h2>
          <div className="flex gap-2">
            <Input
              placeholder="Add an event…"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEvent()}
            />
            <Button onClick={addEvent}>Add</Button>
          </div>
          {upcoming.map((e) => (
            <div
              key={e.id}
              className="rounded-xl border border-border bg-card p-4 space-y-2"
            >
              <div className="flex justify-between gap-2">
                <p className="text-sm font-medium">{e.title}</p>
                <span className="text-xs text-muted-foreground">
                  {e.status}
                </span>
              </div>
              {e.eventAt && (
                <p className="text-xs text-muted-foreground">
                  {new Date(e.eventAt).toLocaleString()}
                </p>
              )}
              {e.description && (
                <p className="text-sm text-muted-foreground">{e.description}</p>
              )}
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => updateEventStatus(e.id, "completed")}
                >
                  Mark complete
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteEvent(e.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No upcoming events. Paddy will detect them from conversation, or
              add one above.
            </p>
          )}
        </section>

        {/* Goals */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Goals
          </h2>
          <div className="flex gap-2">
            <Input
              placeholder="Add a goal…"
              value={newGoalTitle}
              onChange={(e) => setNewGoalTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGoal()}
            />
            <Button onClick={addGoal}>Add</Button>
          </div>
          {activeGoals.map((g) => (
            <div
              key={g.id}
              className="rounded-xl border border-border bg-card p-4 space-y-2"
            >
              <p className="text-sm font-medium">{g.title}</p>
              {g.description && (
                <p className="text-sm text-muted-foreground">{g.description}</p>
              )}
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => updateGoalStatus(g.id, "completed")}
                >
                  Mark complete
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => updateGoalStatus(g.id, "abandoned")}
                >
                  Abandon
                </button>
              </div>
            </div>
          ))}
          {activeGoals.length === 0 && (
            <p className="text-sm text-muted-foreground">No active goals.</p>
          )}
        </section>

        {/* Completed events */}
        {completed.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Completed / cancelled
            </h2>
            {completed.map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-border bg-card/50 p-3 opacity-70"
              >
                <p className="text-sm">
                  {e.title}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {e.status}
                  </span>
                </p>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
