"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarClock,
  CalendarHeart,
  CheckCircle2,
  CircleSlash,
  History,
  Plus,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, EmptyState, PageHeader, SectionTitle, Spinner } from "@/components/app/app-shell";
import { useToast } from "@/components/ui/toast";

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

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const chip = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors";

export default function LifePage() {
  const router = useRouter();
  const toast = useToast();
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newGoalTitle, setNewGoalTitle] = useState("");

  const load = useCallback(async () => {
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
      const [ev, go, fu] = await Promise.all([evRes.json(), goRes.json(), fuRes.json()]);
      setEvents(ev.events || []);
      setGoals(go.goals || []);
      setFollowUps(fu.followUps || []);
    } catch {
      toast("Couldn't load your life timeline.", "error");
    } finally {
      setLoaded(true);
    }
  }, [router, toast]);

  useEffect(() => {
    // Defer so state updates happen in a callback, not the effect body.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function mutate(url: string, init: RequestInit, ok?: string) {
    const res = await fetch(url, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    }).catch(() => null);
    if (!res?.ok) {
      toast("That didn't work — try again?", "error");
      return false;
    }
    if (ok) toast(ok);
    await load();
    return true;
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newEventTitle.trim()) return;
    if (await mutate("/api/life/events", { method: "POST", body: JSON.stringify({ title: newEventTitle.trim() }) }, "Added — Paddy will keep an eye on it"))
      setNewEventTitle("");
  }

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;
    if (await mutate("/api/life/goals", { method: "POST", body: JSON.stringify({ title: newGoalTitle.trim() }) }, "Goal added — you've got this"))
      setNewGoalTitle("");
  }

  const patch = (kind: "events" | "goals", id: string, status: string, msg: string) =>
    mutate(`/api/life/${kind}/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }, msg);

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event?")) return;
    await mutate(`/api/life/events/${id}`, { method: "DELETE" }, "Event deleted");
  }

  const upcoming = events.filter((e) => ["upcoming", "ongoing"].includes(e.status));
  const completed = events.filter((e) => ["completed", "cancelled"].includes(e.status));
  const activeGoals = goals.filter((g) => g.status === "active");
  const pendingFollowUps = followUps.filter((f) => ["proposed", "scheduled"].includes(f.status));

  if (!loaded) return <Spinner label="Loading your timeline…" />;

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-8 pb-16">
      <PageHeader
        icon={CalendarHeart}
        title="Life"
        description="Moments and goals Paddy keeps track of."
      />

      <section className="space-y-3">
        <SectionTitle icon={BellRing}>Upcoming check-ins</SectionTitle>
        {pendingFollowUps.length === 0 ? (
          <EmptyState icon={BellRing} title="Nothing scheduled">
            When you mention something coming up, Paddy can offer to check in afterwards.
          </EmptyState>
        ) : (
          pendingFollowUps.map((f) => (
            <Card key={f.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{f.messageIntent || "Check-in"}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {f.type.replace(/_/g, " ")} · {f.status}
                  {f.scheduledAt && ` · ${fmt(f.scheduledAt)}`}
                </p>
              </div>
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void mutate(`/api/follow-ups/${f.id}/dismiss`, { method: "POST" }, "Check-in dismissed")}>
                <X className="h-3.5 w-3.5" /> Dismiss
              </Button>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle icon={CalendarClock}>Upcoming events</SectionTitle>
        <form onSubmit={addEvent} className="flex gap-2">
          <label htmlFor="new-event" className="sr-only">New event</label>
          <Input id="new-event" placeholder="A presentation, a trip, a date…" value={newEventTitle} onChange={(e) => setNewEventTitle(e.target.value)} />
          <Button type="submit" className="shrink-0 gap-1.5" disabled={!newEventTitle.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
        {upcoming.length === 0 && (
          <EmptyState icon={CalendarClock} title="No upcoming events">
            Paddy picks these up from conversation — or add one above.
          </EmptyState>
        )}
        {upcoming.map((e) => (
          <Card key={e.id} className="animate-in space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{e.title}</p>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] capitalize text-primary">{e.status}</span>
            </div>
            {e.eventAt && <p className="text-xs text-muted-foreground">{fmt(e.eventAt)}</p>}
            {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}
            <div className="flex gap-1">
              <button type="button" className={`${chip} hover:bg-primary/10 hover:text-primary`} onClick={() => void patch("events", e.id, "completed", "Nice — marked complete")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Done
              </button>
              <button type="button" className={`${chip} hover:bg-destructive/10 hover:text-destructive`} onClick={() => void deleteEvent(e.id)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <SectionTitle icon={Target}>Goals</SectionTitle>
        <form onSubmit={addGoal} className="flex gap-2">
          <label htmlFor="new-goal" className="sr-only">New goal</label>
          <Input id="new-goal" placeholder="Something you're working towards…" value={newGoalTitle} onChange={(e) => setNewGoalTitle(e.target.value)} />
          <Button type="submit" className="shrink-0 gap-1.5" disabled={!newGoalTitle.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
        {activeGoals.length === 0 && (
          <EmptyState icon={Target} title="No active goals">
            Big or small, Paddy can cheer you on.
          </EmptyState>
        )}
        {activeGoals.map((g) => (
          <Card key={g.id} className="animate-in space-y-2">
            <p className="text-sm font-medium">{g.title}</p>
            {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
            <div className="flex gap-1">
              <button type="button" className={`${chip} hover:bg-primary/10 hover:text-primary`} onClick={() => void patch("goals", g.id, "completed", "Goal complete — well done! 🎉")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
              </button>
              <button type="button" className={`${chip} hover:bg-secondary hover:text-foreground`} onClick={() => void patch("goals", g.id, "abandoned", "Goal set aside")}>
                <CircleSlash className="h-3.5 w-3.5" /> Set aside
              </button>
            </div>
          </Card>
        ))}
      </section>

      {completed.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={History}>Past events</SectionTitle>
          <div className="space-y-2">
            {completed.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/50 px-4 py-2.5">
                <p className="truncate text-sm text-muted-foreground">{e.title}</p>
                <span className="text-[11px] capitalize text-muted-foreground">{e.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
