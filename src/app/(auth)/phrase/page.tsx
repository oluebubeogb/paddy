"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PhraseCard } from "@/components/auth/phrase-card";
import { takeUrlToken } from "@/lib/strip-token";
import { AuthShell, FormError } from "@/components/auth/auth-shell";
import { Spinner } from "@/components/app/app-shell";

/**
 * Target of the email's "Copy my secret phrase" button. The token rides in the
 * #fragment (never sent to servers/logs), is stripped immediately, and is used
 * only to fetch the phrase — it does not confirm anything.
 */
export default function PhrasePage() {
  const [phrase, setPhrase] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = takeUrlToken("hash");
    if (!token) {
      queueMicrotask(() =>
        setError("This link is missing its little secret.")
      );
      return;
    }
    fetch("/api/auth/challenge-phrase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setPhrase(data.phrase);
        setPurpose(data.purpose);
      })
      .catch((e: Error) => setError(e.message || "Something went wrong."));
  }, []);

  const back = purpose === "reset_password" ? "/reset-password" : "/verify-email";

  return (
    <AuthShell
      title={error ? "Link expired" : "Your little secret 💚"}
      subtitle={error ? "Grab a fresh one in a tap." : "Copy it, then paste it into Paddy."}
      tip={
        error
          ? "Paddy links work once and only for a short while, to keep your account safe."
          : "Paste it in the browser where you started — that's how Paddy knows it's really you."
      }
      footer={
        phrase ? (
          <p>
            Started on this device?{" "}
            <Link href={back} className="font-medium text-primary hover:underline">
              Paste it here
            </Link>
          </p>
        ) : null
      }
    >
      <FormError>{error}</FormError>
      {error && (
        <Link
          href={purpose === "reset_password" ? "/forgot-password" : "/verify-email?expired=1"}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-medium text-primary-foreground transition-all hover:-translate-y-px hover:shadow-md hover:shadow-primary/25"
        >
          Send a fresh one
        </Link>
      )}
      {!error && !phrase && <Spinner label="Fetching your phrase…" />}
      {phrase && <PhraseCard phrase={phrase} />}
    </AuthShell>
  );
}
