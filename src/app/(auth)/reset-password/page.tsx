"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { takeUrlToken } from "@/lib/strip-token";
import { CheckCircle2 } from "lucide-react";
import { AuthShell, FormError } from "@/components/auth/auth-shell";
import { Spinner } from "@/components/app/app-shell";

function ResetPasswordForm() {
  const router = useRouter();
  // Token is captured once and stripped from the URL (blueprint §6).
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const captured = useRef(false);

  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    setToken(takeUrlToken("query"));
    setReady(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body = token ? { token, newPassword: password } : { phrase, newPassword: password };
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Reset failed");
        if (data.reason && data.reason !== "invalid_phrase") setToken(null);
      } else {
        setDone(data.message);
        setTimeout(() => router.push("/sign-in"), 2000);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <Spinner label="One moment…" />;

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <p className="font-medium">Password updated 💚</p>
        <p className="text-sm text-muted-foreground">{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!token && (
        <>
          <label htmlFor="phrase" className="sr-only">Your Paddy phrase</label>
          <Input
            id="phrase"
            spellCheck={false}
            placeholder='e.g. "My cat knows too much."'
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            required
          />
        </>
      )}
      <label htmlFor="new-password" className="sr-only">New password</label>
      <PasswordInput
        id="new-password"
        placeholder="New password (min 8 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
        minLength={8}
      />
      <label htmlFor="confirm-password" className="sr-only">Confirm new password</label>
      <PasswordInput
        id="confirm-password"
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
        minLength={8}
      />
      <FormError>{error}</FormError>
      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? "Updating…" : "Update password"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Expired?{" "}
        <Link href="/forgot-password" className="text-primary hover:underline">
          Send a fresh one
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Let's get you back in"
      subtitle="Choose a new password."
      tip="Paste the phrase from your email in the same browser you requested it from. Other devices get signed out, just to be safe."
      footer={
        <Link href="/sign-in" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
