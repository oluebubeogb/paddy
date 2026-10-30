"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CalendarHeart, Check, Download, Heart, LogOut, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { InstallAppButton } from "@/components/pwa/install-app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, PageHeader, SectionTitle, Spinner } from "@/components/app/app-shell";
import { FieldLabel } from "@/components/auth/auth-shell";
import { useToast } from "@/components/ui/toast";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { DobField, formatDob } from "@/components/dob/dob-picker";

const RELATIONSHIP_OPTIONS = [
  { value: "friend", label: "Friend", desc: "Warm, supportive companionship" },
  { value: "best_friend", label: "Best friend", desc: "Closer, more familiar tone" },
  { value: "romantic", label: "Romantic companion", desc: "Affectionate (verified adults only)" },
  { value: "develop_naturally", label: "Let it develop", desc: "See where conversations go" },
];

export default function CompanionSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [relationshipStyle, setRelationshipStyle] = useState("friend");
  const [preferredName, setPreferredName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [proactiveEnabled, setProactiveEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [savedDob, setSavedDob] = useState<string | null>(null);
  const [dob, setDob] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState("unknown");
  const [wasRomantic, setWasRomantic] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/me");
        if (res.status === 401) {
          router.push("/sign-in");
          return;
        }
        const data = await res.json();
        setEmail(data.email || "");
        setDisplayName(data.profile?.displayName || "");
        setPreferredName(data.profile?.preferredName || "");
        setRelationshipStyle(data.companionPreferences?.relationshipStyle || "friend");
        setWasRomantic(data.companionPreferences?.relationshipStyle === "romantic");
        setSavedDob(data.dateOfBirth || null);
        setEligibility(data.ageEligibilityStatus || "unknown");
        setProactiveEnabled(data.notificationPreferences?.proactiveEnabled || false);
      } catch {
        toast("Couldn't load your settings.", "error");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [router, toast]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          preferredName,
          relationshipStyle,
          proactiveEnabled,
          ...(!savedDob && dob ? { dateOfBirth: dob } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!savedDob && dob) {
          setSavedDob(dob);
          setDob(null);
        }
        if (data.ageEligibilityStatus) {
          setEligibility(data.ageEligibilityStatus);
          if (data.ageEligibilityStatus !== "verified_adult" && relationshipStyle === "romantic") {
            setRelationshipStyle("friend");
          }
        }
        toast("Saved — Paddy will keep that in mind 💚");
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Couldn't save your changes.", "error");
      }
    } catch {
      toast(
        navigator.onLine === false
          ? "You're offline — reconnect and save again."
          : "Couldn't reach Paddy to save. Try again.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } catch {
      // Cookie is cleared server-side; fall through to sign-in either way.
    }
    router.push("/sign-in");
    router.refresh();
  }

  async function enablePush() {
    try {
      const { subscribeToPush } = await import("@/lib/proactive/register-push");
      const ok = await subscribeToPush();
      toast(
        ok ? "Notifications are on" : "Couldn't enable notifications (permission denied or unsupported)",
        ok ? "success" : "error"
      );
    } catch {
      toast("Push registration failed.", "error");
    }
  }

  if (loading) return <Spinner label="Loading your settings…" />;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 pb-16">
      <PageHeader
        icon={Sparkles}
        title="Companion"
        description="How Paddy talks with you."
        tip="Change any of this, any time. Paddy also adapts to how you text — casual, abbreviated, or full sentences."
      />

      <section className="space-y-3">
        <SectionTitle icon={UserRound}>Names</SectionTitle>
        <Card className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="displayName">Display name</FieldLabel>
            <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="preferredName">What Paddy calls you</FieldLabel>
            <Input
              id="preferredName"
              placeholder="e.g. Sam"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <label htmlFor="dob">Birthday</label>
              <InfoTip label="About your birthday">
                Used for age checks (romantic is 18+) and birthday wishes. It can only be set once.
              </InfoTip>
            </div>
            {savedDob ? (
              <p className="flex h-11 items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3.5 text-sm">
                <CalendarHeart className="h-4 w-4 text-primary" />
                {formatDob(savedDob)}
              </p>
            ) : (
              <DobField value={dob} onChange={setDob} />
            )}
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle icon={Heart}>Relationship style</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Relationship style">
          {RELATIONSHIP_OPTIONS.map((opt) => {
            const locked =
              opt.value === "romantic" && eligibility !== "verified_adult" && !(wasRomantic && eligibility !== "underage");
            const on = relationshipStyle === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={locked || undefined}
                onClick={() => !locked && setRelationshipStyle(opt.value)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4 text-left transition-all",
                  locked
                    ? "cursor-not-allowed border-border bg-card opacity-60"
                    : on
                      ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                      : "border-border bg-card hover:bg-secondary"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span>
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {locked ? (eligibility === "underage" ? "18+ only" : "Add your birthday to unlock (18+)") : opt.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          Romantic is 18+ only
          <InfoTip label="About age">
            Romantic and flirty features are only available once your birthday confirms you&apos;re an adult.
          </InfoTip>
        </p>
      </section>

      <section className="space-y-3">
        <SectionTitle icon={BellRing}>Proactive messages</SectionTitle>
        <Card className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1 text-sm font-medium">
              Let Paddy check in
              <InfoTip label="About check-ins">
                Paddy can follow up on events you mention and start light conversations.
              </InfoTip>
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={proactiveEnabled}
            aria-label="Enable proactive messages"
            onClick={() => setProactiveEnabled((v) => !v)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              proactiveEnabled ? "bg-primary" : "bg-secondary ring-1 ring-border"
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                proactiveEnabled ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </button>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle icon={Bell}>Browser notifications</SectionTitle>
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1 text-xs leading-relaxed text-muted-foreground">
            A gentle nudge when Paddy checks in.
            <InfoTip label="About notifications">Needs a supported browser (and HTTPS in production).</InfoTip>
          </p>
          <Button variant="secondary" size="sm" className="shrink-0 gap-2" onClick={() => void enablePush()}>
            <Bell className="h-4 w-4" />
            Turn on
          </Button>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle icon={Download}>Paddy on your home screen</SectionTitle>
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">Full-screen chat, one tap away.</p>
          <InstallAppButton />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle icon={ShieldCheck}>Account</SectionTitle>
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Signed in{email ? " as" : ""}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}

          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-2 hover:text-destructive"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </Card>
      </section>

      <div className="sticky bottom-3 z-10">
        <Button className="w-full shadow-lg shadow-primary/20" size="lg" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
