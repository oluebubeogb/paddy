"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, BellRing, Check, MessageCircleHeart } from "lucide-react";
import { AuthShell, FieldLabel, FormError } from "@/components/auth/auth-shell";
import { PaddyMark } from "@/components/brand/paddy-mark";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4 | 5;

const RELATIONSHIP_OPTIONS = [
  { value: "friend", label: "Friend", desc: "Warm, supportive companionship" },
  { value: "best_friend", label: "Best friend", desc: "Closer, more familiar tone" },
  { value: "romantic", label: "Romantic companion", desc: "Affectionate (adults only)" },
  { value: "develop_naturally", label: "Let it develop", desc: "See where the conversation goes" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [displayName, setDisplayName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [relationshipStyle, setRelationshipStyle] = useState("friend");
  const [proactiveEnabled, setProactiveEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          preferredName: preferredName || displayName,
          timezone,
          relationshipStyle,
          proactiveEnabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Could not save preferences");
        setLoading(false);
        return;
      }
      router.push("/chat");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  const titles: Record<Step, string> = {
    1: "Nice to meet you",
    2: "How should we relate?",
    3: "Communication style",
    4: "Proactive messages",
    5: "Ready to chat",
  };
  const subtitles: Record<Step, string> = {
    1: "A few small things so Paddy feels like yours.",
    2: "Pick what feels right — this can always change.",
    3: "Balanced and friendly to start.",
    4: "Only if you want Paddy to reach out first.",
    5: "Everything's set. Paddy's here when you are.",
  };

  return (
    <AuthShell title={titles[step]} subtitle={subtitles[step]} wide>
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Step {step} of 5</span>
        </div>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                n <= step ? "bg-primary" : "bg-secondary"
              )}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (displayName.trim()) setStep(2);
          }}
        >
          <div>
            <FieldLabel htmlFor="displayName">Your name</FieldLabel>
            <Input
              id="displayName"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div>
            <FieldLabel htmlFor="preferredName">What should Paddy call you?</FieldLabel>
            <Input
              id="preferredName"
              placeholder="Nickname (optional)"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="timezone">Time zone</FieldLabel>
            <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
          <Button type="submit" className="w-full gap-2" size="lg" disabled={!displayName.trim()}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div role="radiogroup" aria-label="Relationship style" className="space-y-2.5">
            {RELATIONSHIP_OPTIONS.map((opt) => {
              const active = relationshipStyle === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRelationshipStyle(opt.value)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all",
                    active
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border bg-card hover:bg-secondary"
                  )}
                >
                  <div className="flex-1">
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-sm text-muted-foreground">{opt.desc}</div>
                  </div>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            You can change this any time in settings.
          </p>
          <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageCircleHeart className="h-6 w-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            Defaults are balanced and friendly. You can fine-tune humour,
            directness, and affection later in Companion settings.
          </p>
          <NavButtons onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 transition-colors hover:bg-secondary/60">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1">
              <div className="font-medium">Enable proactive messages</div>
              <div className="text-sm text-muted-foreground">
                Paddy can follow up on events and start light conversations
                when you want. You can turn this off any time.
              </div>
            </div>
            <input
              type="checkbox"
              checked={proactiveEnabled}
              onChange={(e) => setProactiveEnabled(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--primary)]"
            />
          </label>
          <NavButtons onBack={() => setStep(3)} onNext={() => setStep(5)} />
        </div>
      )}

      {step === 5 && (
        <div className="space-y-5 text-center">
          <PaddyMark size={72} className="mx-auto" />
          <p className="text-muted-foreground">
            Your companion profile is ready. Let&apos;s start a conversation.
          </p>
          <FormError>{error}</FormError>
          <Button className="w-full gap-2" size="lg" onClick={finish} disabled={loading}>
            {loading ? "Saving…" : "Start chatting"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
          <button
            type="button"
            onClick={() => setStep(4)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
        </div>
      )}
    </AuthShell>
  );
}

function NavButtons({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex gap-3 pt-1">
      <Button variant="secondary" className="flex-1 gap-1.5" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <Button className="flex-1 gap-1.5" onClick={onNext}>
        Continue <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
