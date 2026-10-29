"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { takeUrlToken } from "@/lib/strip-token";
import { CheckCircle2, RefreshCw } from "lucide-react";
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
    setError(data.error || "Verification failed");
    return false;
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = takeUrlToken("query"); // strips ?token= from the address bar
    void (async () => {
      if (!token) {
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
    setError("");
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
    } else setError(data.error || "Couldn't send a fresh one.");
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

  return (
    <AuthShell
      title="Confirm it's you"
      subtitle="Tap the button in your email, or paste your Paddy phrase below."
      footer={
        <Link href="/sign-in" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-6">
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
          <p className="text-center text-xs text-muted-foreground">
            Pasting works in the same browser you signed up from.
          </p>
        </form>

        <form onSubmit={handleResend} className="space-y-3 border-t border-border pt-6">
          <p className="text-center text-sm text-muted-foreground">
            Expired or didn&apos;t arrive? Let&apos;s send you a fresh one.
          </p>
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
          <Button type="submit" variant="secondary" className="w-full gap-2">
            <RefreshCw className="h-4 w-4" /> Send a fresh one
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
