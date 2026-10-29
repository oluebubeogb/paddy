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
        setError("This link is missing its little secret. Open it again from your email.")
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
      title="Your little secret 💚"
      subtitle="Copy it, then paste it into Paddy in the browser where you started."
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
      {!error && !phrase && <Spinner label="Fetching your phrase…" />}
      {phrase && <PhraseCard phrase={phrase} />}
    </AuthShell>
  );
}
