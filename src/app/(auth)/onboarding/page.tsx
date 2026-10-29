"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      router.push("/app/chat");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Step {step} of 5
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {step === 1 && "Nice to meet you"}
            {step === 2 && "How should we relate?"}
            {step === 3 && "Communication style"}
            {step === 4 && "Proactive messages"}
            {step === 5 && "Ready to chat"}
          </h1>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <Input
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Input
              placeholder="Preferred name (what Paddy should call you)"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
            />
            <Input
              placeholder="Time zone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
            <Button
              className="w-full"
              size="lg"
              disabled={!displayName.trim()}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRelationshipStyle(opt.value)}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  relationshipStyle === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-secondary"
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-sm text-muted-foreground">{opt.desc}</div>
              </button>
            ))}
            <p className="text-xs text-muted-foreground text-center">
              You can change this any time in settings.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-center">
            <p className="text-muted-foreground text-sm">
              Defaults are balanced and friendly. You can fine-tune humour,
              directness, and affection later in Companion settings.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(4)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-xl border border-border p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={proactiveEnabled}
                onChange={(e) => setProactiveEnabled(e.target.checked)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Enable proactive messages</div>
                <div className="text-sm text-muted-foreground">
                  Paddy can follow up on events and start light conversations
                  when you want. You can turn this off any time.
                </div>
              </div>
            </label>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(5)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4 text-center">
            <p className="text-muted-foreground">
              Your companion profile is ready. Let&apos;s start a conversation.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" size="lg" onClick={finish} disabled={loading}>
              {loading ? "Saving…" : "Start chatting"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
