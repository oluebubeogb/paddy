"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "manual">(
    tokenFromUrl ? "loading" : "manual"
  );
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [phrase, setPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!tokenFromUrl) return;

    async function verifyToken() {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenFromUrl }),
        });
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setTimeout(() => router.push("/onboarding"), 1500);
        } else {
          setError(data.error || "Verification failed");
          setStatus("error");
        }
      } catch {
        setError("Network error");
        setStatus("error");
      }
    }

    verifyToken();
  }, [tokenFromUrl, router]);

  async function handlePhraseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phrase }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setTimeout(() => router.push("/onboarding"), 1500);
      } else {
        setError(data.error || "Verification failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Confirming your secret…</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="text-4xl">💚</div>
          <h1 className="text-2xl font-semibold">You&apos;re all set</h1>
          <p className="text-muted-foreground">Welcome to Paddy! Redirecting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="text-2xl font-semibold text-primary">
            Paddy
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">Confirm it&apos;s you</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the little secret from your email, or paste the phrase below.
          </p>
        </div>

        {status === "error" && error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <form onSubmit={handlePhraseSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            placeholder='e.g. "My cat knows too much."'
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? "Confirming…" : "Confirm with phrase"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t get the email?{" "}
          <Link href="/sign-up" className="text-primary hover:underline">
            Try again
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
