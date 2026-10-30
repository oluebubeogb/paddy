"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/auth-shell";
import { PaddyMark } from "@/components/brand/paddy-mark";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/components/ui/toast";
import { DobPicker, ageFromIso, defaultDob, formatDob } from "@/components/dob/dob-picker";

const SKIP_KEY = "paddy.dob.skipped";
/** After "Not now", ask again at most once a week. */
const REASK_MS = 7 * 24 * 60 * 60 * 1000;

interface Me {
  dateOfBirth: string | null;
  dobPromptedAt: string | null;
}

/**
 * Asks for a date of birth on first login, in a Paddy-styled sheet.
 * Never blocks: "Not now" (or Esc) dismisses it, and it waits a week before asking again.
 */
export function DobGate() {
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(() => defaultDob());
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    try {
      if (sessionStorage.getItem(SKIP_KEY)) return;
    } catch {
      /* storage blocked — still fine to ask */
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) return;
        const me = (await res.json()) as Me;
        if (cancelled || me.dateOfBirth) return;
        const promptedAt = me.dobPromptedAt ? new Date(me.dobPromptedAt).getTime() : 0;
        if (promptedAt && Date.now() - promptedAt < REASK_MS) return;
        setOpen(true);
      } catch {
        /* never block the app on this */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(SKIP_KEY, "1");
    } catch {
      /* ignore */
    }
    void fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dobSkipped: true }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateOfBirth: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't save that — try again.");
        return;
      }
      setOpen(false);
      toast("Birthday saved 🎂");
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || pathname?.startsWith("/onboarding")) return null;
  const age = ageFromIso(value);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="Not now"
        onClick={dismiss}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        style={{ animation: "paddy-in 0.2s ease-out both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dob-title"
        className="animate-in relative w-full max-w-sm rounded-t-3xl border border-border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-5 flex flex-col items-center text-center">
          <PaddyMark size={44} />
          <h2 id="dob-title" className="mt-3 text-lg font-semibold tracking-tight">
            When&apos;s your birthday?
          </h2>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
            So Paddy can celebrate with you.
            <InfoTip label="Why Paddy asks" side="bottom">
              Paddy is for ages 13+, and romantic mode is 18+ only. Your birthday is only used for that and for
              birthday wishes — never shown to anyone.
            </InfoTip>
          </p>
        </div>

        <DobPicker
          value={value}
          onChange={(v) => {
            setValue(v);
            setTouched(true);
            setError("");
          }}
        />
        <p className="mt-3 h-5 text-center text-sm text-muted-foreground" aria-live="polite">
          {touched ? `${formatDob(value)}${age !== null ? ` · ${age}` : ""}` : "Scroll or tap to pick"}
        </p>

        <div className="mt-3 space-y-3">
          <FormError>{error}</FormError>
          <Button className="w-full" size="lg" onClick={() => void save()} disabled={saving || !touched}>
            {saving ? "Saving…" : "Save birthday"}
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
