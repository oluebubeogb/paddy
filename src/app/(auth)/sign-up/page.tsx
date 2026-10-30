"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { InfoTip } from "@/components/ui/info-tip";
import { AuthShell, FieldLabel, FormError } from "@/components/auth/auth-shell";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      setError("You seem to be offline. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox 💚"
        subtitle="A little secret is on its way."
        tip="Open the email from Paddy and tap “Confirm it's me”, or copy the phrase and paste it here in this same browser."
        center
        footer={
          <Link href="/sign-in" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            Sent to <strong className="text-foreground">{email}</strong>
          </p>
          <Link
            href="/verify-email"
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
      title="Meet Paddy"
      subtitle="Let's make sure it's really you."
      tip="We'll email you a one-time Paddy phrase. Tap the button in the email or paste the phrase back here — no codes to type."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="displayName">What should Paddy call you?</FieldLabel>
          <Input
            id="displayName"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>
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
        <div>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordInput
            id="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <FormError>{error}</FormError>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Sending your little secret…" : "Continue"}
        </Button>
        <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
          Paddy is an AI companion
          <InfoTip label="About Paddy">
            Warm, honest about being AI, and never a replacement for the people in your life.
          </InfoTip>
        </p>
      </form>
    </AuthShell>
  );
}
