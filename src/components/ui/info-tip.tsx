"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rich tooltip for secondary explanations — hover / focus on desktop, tap on touch.
 * Keeps pages short: the long "why" lives here instead of in paragraphs.
 */
export function InfoTip({
  children,
  label = "More info",
  className,
  side = "top",
  align = "center",
  icon,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
  side?: "top" | "bottom";
  align?: "center" | "start" | "end";
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        pinned.current = false;
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pinned.current = false;
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className={cn("relative inline-flex align-middle", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned.current && setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => {
          pinned.current = !pinned.current || !open;
          setOpen(pinned.current);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned.current && setOpen(false)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-all hover:scale-110 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {icon ?? <Info className="h-3.5 w-3.5" />}
      </button>
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute z-50 w-64 max-w-[78vw] rounded-2xl border border-primary/20 bg-card/95 px-3.5 py-2.5 text-left text-xs font-normal leading-relaxed text-foreground shadow-xl shadow-primary/10 backdrop-blur transition-all duration-150",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
          open ? "visible translate-y-0 opacity-100" : cn("invisible opacity-0", side === "top" ? "translate-y-1" : "-translate-y-1")
        )}
      >
        {children}
      </span>
    </span>
  );
}
