"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { takeUrlToken } from "@/lib/strip-token";
import { CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { AuthShell, FieldLabel, FormError } from "@/components/auth/auth-shell";
import { Spinner } from "@/components/app/app-shell";
import { useToast } from "@/components/ui/toast";

type Status = "init" | "loading" | "success" | "manual";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("init");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [phrase, setPhrase] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendError, setResendError] = useState("");
  const started = useRef(false);
  const toast = useToast();

  async function confirm(body: { token: string } | { phrase: string }) {
    const res = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSignedIn(!!data.signedIn);
      setInfo(data.message);
      setStatus("success");
      setTimeout(() => router.push(data.signedIn ? "/onboarding" : "/sign-in"), 1800);
      return true;
    }
    setReason(data.reason ?? null);
    setError(data.error || "Verification failed");
    return false;
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = takeUrlToken("query"); // strips ?token= from the address bar
    void (async () => {
      if (!token) {
        if (new URLSearchParams(window.location.search).get("expired") === "1") setReason("expired");
        setStatus("manual");
        return;
      }
      setStatus("loading");
      const ok = await confirm({ token }).catch(() => {
        setError("Network error");
        return false;
      });
      if (!ok) setStatus("manual");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePhraseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await confirm({ phrase });
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendError("");
    setInfo("");
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resendEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setInfo(data.message);
      toast("A fresh little secret is on its way 💌");
    } else setResendError(data.error || "Couldn't send a fresh one.");
  }

  if (status === "init" || status === "loading") {
    return (
      <AuthShell title="Confirming your little secret…" subtitle="Just a moment.">
        <Spinner label="Checking…" />
      </AuthShell>
    );
  }

  if (status === "success") {
    return (
      <AuthShell title="You're all set 💚" subtitle={info} center>
        <div className="space-y-3">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            {signedIn ? "Taking you to Paddy…" : "Taking you to sign in…"}
          </p>
        </div>
      </AuthShell>
    );
  }

  const linkDead = reason === "expired" || reason === "already_used" || reason === "invalid_token" || reason === "too_many_attempts";
  const resendOpen = showResend || linkDead;

  return (
    <AuthShell
      title={linkDead ? (reason === "already_used" ? "Link already used" : "Link expired") : "Confirm it's you"}
      subtitle={linkDead ? "Grab a fresh one below." : "Paste your Paddy phrase."}
      tip={
        linkDead
          ? "Paddy links work once and only for a short while, to keep your account safe. A fresh one takes seconds."
          : "Tap “Confirm it's me” in the email, or paste the phrase here — pasting works in the same browser you signed up from."
      }
      footer={
        <Link href="/sign-in" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-5">
        {linkDead && (
          <div className="animate-in flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock3 className="h-4 w-4" />
            </span>
          </div>
        )}

        {!linkDead && (
          <form onSubmit={handlePhraseSubmit} className="space-y-4">
            <div>
              <FieldLabel htmlFor="phrase">Your Paddy phrase</FieldLabel>
              <Input
                id="phrase"
                placeholder='e.g. "My cat knows too much."'
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
                className="text-base"
              />
            </div>
            <FormError>{error}</FormError>
            {info && <p className="rounded-xl bg-primary/10 px-3 py-2 text-center text-sm text-primary">{info}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Confirming…" : "Confirm it's me"}
            </Button>
          </form>
        )}

        {resendOpen ? (
          <form onSubmit={handleResend} className={linkDead ? "space-y-3" : "animate-in space-y-3 border-t border-border pt-5"}>
            <label htmlFor="resend-email" className="sr-only">Email</label>
            <Input
              id="resend-email"
              type="email"
              placeholder="Your email address"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <FormError>{resendError}</FormError>
            {linkDead && info && (
              <p className="rounded-xl bg-primary/10 px-3 py-2 text-center text-sm text-primary">{info}</p>
            )}
            <Button type="submit" variant={linkDead ? "primary" : "secondary"} size={linkDead ? "lg" : undefined} className="w-full gap-2">
              <RefreshCw className="h-4 w-4" /> Send a fresh one
            </Button>
            {linkDead && (
              <button
                type="button"
                onClick={() => {
                  setReason(null);
                  setError("");
                }}
                className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                I have a phrase to paste
              </button>
            )}
          </form>
        ) : (
          <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setShowResend(true)}
              className="font-medium text-primary transition-colors hover:underline"
            >
              Expired or missing?
            </button>
            <InfoTip label="About fresh links">
              Each little secret works once and expires quickly. Request a fresh one and use the newest email.
            </InfoTip>
          </p>
        )}
      </div>
    </AuthShell>
  );
}
