"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, FieldLabel, FormError } from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Something went wrong");
      else setSent(true);
    } catch {
      setError("You seem to be offline. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const back = (
    <Link href="/sign-in" className="text-primary hover:underline">
      Back to sign in
    </Link>
  );

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox 💚"
        subtitle="Let's get you back in. If that email has a Paddy account, a little secret is on its way."
        center
        footer={back}
      >
        <div className="space-y-4">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            Tap the button in the email, or paste the phrase here.
          </p>
          <Link
            href="/reset-password"
            className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Paste my secret phrase
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="No worries. Tell us your email and Paddy will send a little secret to get you back in."
      footer={back}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Sending…" : "Send my little secret"}
        </Button>
      </form>
    </AuthShell>
  );
}
