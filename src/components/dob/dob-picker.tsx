"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarHeart, ChevronDown } from "lucide-react";
import { MIN_AGE, ageOn, parseIsoDate } from "@/lib/user/age";
import { cn } from "@/lib/utils";

const ITEM = 40; // px per wheel row
const VISIBLE = 5; // rows shown
const PAD = ((VISIBLE - 1) / 2) * ITEM;
const YEARS_BACK = 100;

const pad2 = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export function toIso(y: number, m: number, d: number) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

/** A sensible starting point when someone opens the picker. */
export function defaultDob(now = new Date()) {
  return toIso(now.getFullYear() - 20, 0, 1);
}

/** Pretty label like "14 March 2001" in the user's locale. */
export function formatDob(iso: string | null | undefined) {
  const d = iso ? parseIsoDate(iso) : null;
  if (!d) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function ageFromIso(iso: string | null | undefined) {
  const d = iso ? parseIsoDate(iso) : null;
  return d ? ageOn(d) : null;
}

type Part = "day" | "month" | "year";

function localeOrder(): Part[] {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" })
      .formatToParts(new Date(Date.UTC(2001, 2, 14)))
      .map((p) => p.type)
      .filter((t): t is Part => t === "day" || t === "month" || t === "year");
    if (parts.length === 3) return parts;
  } catch {
    /* fall through */
  }
  return ["day", "month", "year"];
}

/**
 * Paddy's date-of-birth picker: three soft scroll wheels (day · month · year)
 * with snap, tap and keyboard support — no raw native date input.
 */
export function DobPicker({
  value,
  onChange,
  className,
}: {
  /** "YYYY-MM-DD" */
  value: string;
  onChange: (iso: string) => void;
  className?: string;
}) {
  const [order] = useState(localeOrder);
  const parsed = parseIsoDate(value);
  const thisYear = new Date().getFullYear();
  const y = parsed?.getUTCFullYear() ?? thisYear - 20;
  const m = parsed?.getUTCMonth() ?? 0;
  const d = parsed?.getUTCDate() ?? 1;

  const years = useMemo(() => {
    const out: number[] = [];
    for (let yr = thisYear - YEARS_BACK; yr <= thisYear - MIN_AGE; yr++) out.push(yr);
    return out;
  }, [thisYear]);
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        new Date(Date.UTC(2001, i, 1)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })
      ),
    []
  );
  const dayCount = daysIn(y, m);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => String(i + 1)), [dayCount]);

  function set(next: { y?: number; m?: number; d?: number }) {
    const ny = next.y ?? y;
    const nm = next.m ?? m;
    const nd = Math.min(next.d ?? d, daysIn(ny, nm));
    onChange(toIso(ny, nm, nd));
  }

  const wheels: Record<Part, React.ReactNode> = {
    day: <Wheel key="day" label="Day" items={days} index={d - 1} onIndex={(i) => set({ d: i + 1 })} className="w-16" />,
    month: <Wheel key="month" label="Month" items={months} index={m} onIndex={(i) => set({ m: i })} className="flex-1" />,
    year: (
      <Wheel
        key="year"
        label="Year"
        items={years.map(String)}
        index={Math.max(0, years.indexOf(y))}
        onIndex={(i) => set({ y: years[i] })}
        className="w-20"
      />
    ),
  };

  return (
    <div
      className={cn(
        "relative flex items-stretch gap-1 rounded-2xl border border-border bg-card px-2 shadow-[0_1px_2px_rgba(28,25,23,0.04)]",
        className
      )}
    >
      {/* selection band */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-2 rounded-xl bg-primary/10 ring-1 ring-primary/20"
        style={{ top: PAD, height: ITEM }}
      />
      {order.map((p) => wheels[p])}
    </div>
  );
}

function Wheel({
  items,
  index,
  onIndex,
  label,
  className,
}: {
  items: string[];
  index: number;
  onIndex: (i: number) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ready = useRef(false);

  // Keep the wheel centred on the selected row.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * ITEM;
    if (Math.abs(el.scrollTop - target) > 1) {
      el.scrollTo({ top: target, behavior: ready.current ? "smooth" : "auto" });
    }
    ready.current = true;
  }, [index, items.length]);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  function onScroll() {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      if (i !== index) onIndex(i);
    }, 90);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
    let next: number | null = null;
    if (e.key in step) next = index + step[e.key];
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    onIndex(Math.max(0, Math.min(items.length - 1, next)));
  }

  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${label}-${index}`}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      className={cn(
        "relative z-[1] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-xl outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden",
        className
      )}
      style={{
        height: ITEM * VISIBLE,
        paddingTop: PAD,
        paddingBottom: PAD,
        maskImage: "linear-gradient(to bottom, transparent, black 32%, black 68%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 32%, black 68%, transparent)",
      }}
    >
      {items.map((it, i) => (
        <div
          key={it + i}
          id={`${label}-${i}`}
          role="option"
          aria-selected={i === index}
          onClick={() => onIndex(i)}
          className={cn(
            "flex cursor-pointer snap-center select-none items-center justify-center tabular-nums transition-all duration-150",
            i === index ? "text-base font-semibold text-foreground" : "text-sm text-muted-foreground/80"
          )}
          style={{ height: ITEM }}
        >
          {it}
        </div>
      ))}
    </div>
  );
}

/**
 * Collapsible birthday field for forms: shows the chosen date as a pill and
 * opens the wheel picker on tap.
 */
export function DobField({
  value,
  onChange,
  id = "dob",
  placeholder = "Add your birthday",
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const age = ageFromIso(value);
  return (
    <div className="space-y-2">
      <button
        id={id}
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!value) onChange(defaultDob());
          setOpen((o) => !o);
        }}
        className={cn(
          "flex h-11 w-full items-center gap-3 rounded-xl border border-input bg-card px-3.5 text-left text-sm transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "border-primary/50 ring-2 ring-primary/15"
        )}
      >
        <CalendarHeart className="h-4 w-4 shrink-0 text-primary" />
        <span className={cn("flex-1 truncate", !value && "text-muted-foreground")}>
          {value ? formatDob(value) : placeholder}
        </span>
        {age !== null && <span className="text-xs text-muted-foreground">{age} yrs</span>}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && value && (
        <div className="animate-in space-y-2">
          <DobPicker value={value} onChange={onChange} />
          <div className="flex justify-end gap-3 text-xs">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
            <button type="button" onClick={() => setOpen(false)} className="font-medium text-primary hover:underline">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
