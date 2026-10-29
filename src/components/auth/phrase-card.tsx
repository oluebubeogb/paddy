"use client";

import { useRef, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Blueprint "YOUR PADDY PHRASE" card with copy button + clipboard fallback. */
export function PhraseCard({ phrase }: { phrase: string }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const toast = useToast();

  function selectText() {
    const el = textRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(phrase);
      } else {
        selectText();
        if (!document.execCommand("copy")) throw new Error("copy failed");
      }
      setCopied(true);
      setFallback(false);
      toast("Phrase copied!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      selectText();
      setFallback(true);
      toast("Couldn't copy automatically — it's selected for you", "info");
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 space-y-4">
      <Sparkles className="pointer-events-none absolute -right-2 -top-2 h-16 w-16 text-primary/10" aria-hidden />
      <p className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground">
        YOUR PADDY PHRASE
      </p>
      <p
        ref={textRef}
        className="text-xl font-semibold leading-snug text-foreground select-all break-words"
      >
        {phrase}
      </p>
      <Button type="button" onClick={copy} className="w-full gap-2" size="lg" aria-live="polite">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Phrase copied!" : "Copy my secret phrase"}
      </Button>
      {fallback && (
        <p className="text-xs text-muted-foreground text-center">
          Couldn&apos;t copy automatically — the phrase is selected, so press
          Ctrl+C (or long-press → Copy).
        </p>
      )}
    </div>
  );
}
