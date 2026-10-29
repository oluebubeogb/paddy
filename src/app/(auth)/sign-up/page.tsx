"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        subtitle="We've sent you something to confirm it's really you. Look for a little secret from Paddy."
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
          <p className="text-xs text-muted-foreground">
            Or just tap &ldquo;Confirm it&apos;s me&rdquo; in the email.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Meet Paddy"
      subtitle="Let's make sure it's really you. We'll send a little secret to your inbox."
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
          <Input
            id="password"
            type="password"
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
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Paddy is an AI companion — warm, honest about being AI, and never a replacement for the people in your life.
        </p>
      </form>
    </AuthShell>
  );
}
