"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/auth-shell";
import { PaddyMark } from "@/components/brand/paddy-mark";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/components/ui/toast";
import { DobPicker, ageFromIso, defaultDob, formatDob } from "@/components/dob/dob-picker";

/** Fired (e.g. by the chat page) when the server says a birthday is required. */
export const DOB_REQUIRED_EVENT = "paddy:dob-required";

interface Me {
  dateOfBirth: string | null;
}

/**
 * Required date-of-birth gate. If the signed-in user has no birthday on file,
 * a Paddy-styled sheet covers the app until one is saved — no "Not now", no Esc,
 * no backdrop dismiss. The server enforces the same rule on chat.
 */
export function DobGate() {
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(() => defaultDob());
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async (attempt = 0): Promise<void> => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (res.status === 401) return; // signed out — the proxy handles it
      if (!res.ok) throw new Error(String(res.status));
      const me = (await res.json()) as Me;
      setOpen(!me.dateOfBirth);
    } catch {
      // Transient failure: retry a few times rather than silently letting it slide.
      if (attempt < 3) setTimeout(() => void check(attempt + 1), 1500 * (attempt + 1));
    }
  }, []);

  useEffect(() => {
    void check();
    const onRequired = () => setOpen(true);
    window.addEventListener(DOB_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(DOB_REQUIRED_EVENT, onRequired);
  }, [check]);

  // Lock background scroll while the gate is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  // Onboarding has its own (required) birthday field.
  if (!open || pathname?.startsWith("/onboarding")) return null;
  const age = ageFromIso(value);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="presentation">
      <div
        aria-hidden
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
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
            One quick thing before we chat.
            <InfoTip label="Why Paddy asks" side="bottom">
              Paddy is for ages 13+, and romantic mode is 18+ only. Your birthday is only used for that and for
              birthday wishes — never shown to anyone. It can only be set once.
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
        </div>
      </div>
    </div>
  );
}
