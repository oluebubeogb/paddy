"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RELATIONSHIP_OPTIONS = [
  { value: "friend", label: "Friend" },
  { value: "best_friend", label: "Best friend" },
  { value: "romantic", label: "Romantic companion" },
  { value: "develop_naturally", label: "Let it develop" },
];

export default function CompanionSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [relationshipStyle, setRelationshipStyle] = useState("friend");
  const [preferredName, setPreferredName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [proactiveEnabled, setProactiveEnabled] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/me");
        if (res.status === 401) {
          router.push("/sign-in");
          return;
        }
        const data = await res.json();
        setDisplayName(data.profile?.displayName || "");
        setPreferredName(data.profile?.preferredName || "");
        setRelationshipStyle(
          data.companionPreferences?.relationshipStyle || "friend"
        );
        setProactiveEnabled(
          data.notificationPreferences?.proactiveEnabled || false
        );
      } catch {
        setMessage("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          preferredName,
          relationshipStyle,
          proactiveEnabled,
        }),
      });
      if (res.ok) {
        setMessage("Saved");
      } else {
        const data = await res.json();
        setMessage(data.error || "Could not save");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border h-14 flex items-center px-4 gap-4">
        <Link href="/app/chat" className="text-sm text-muted-foreground hover:text-foreground">
          ← Chat
        </Link>
        <h1 className="font-semibold">Companion settings</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Names
          </h2>
          <Input
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            placeholder="Preferred name (what Paddy calls you)"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Relationship style
          </h2>
          <div className="space-y-2">
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRelationshipStyle(opt.value)}
                className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors ${
                  relationshipStyle === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Romantic features are for verified adults only. You can change this
            preference at any time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Proactive messages
          </h2>
          <label className="flex items-start gap-3 rounded-xl border border-border p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={proactiveEnabled}
              onChange={(e) => setProactiveEnabled(e.target.checked)}
              className="mt-1"
            />
            <div>
              <div className="font-medium text-sm">Enable proactive messages</div>
              <div className="text-xs text-muted-foreground">
                Allow Paddy to follow up on events and start light conversations.
              </div>
            </div>
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Browser notifications
          </h2>
          <p className="text-xs text-muted-foreground">
            Receive a push notification when Paddy sends a proactive message.
            Requires a supported browser and HTTPS in production.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                const { subscribeToPush } = await import(
                  "@/lib/proactive/register-push"
                );
                const ok = await subscribeToPush();
                setMessage(
                  ok
                    ? "Notifications enabled"
                    : "Could not enable notifications (permission denied or unsupported)"
                );
              } catch {
                setMessage("Push registration failed");
              }
            }}
          >
            Enable browser notifications
          </Button>
        </section>

        {message && (
          <p className="text-sm text-center text-muted-foreground">{message}</p>
        )}

        <Button className="w-full" size="lg" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </main>
    </div>
  );
}
