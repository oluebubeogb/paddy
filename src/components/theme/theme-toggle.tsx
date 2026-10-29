"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

import { THEME_STORAGE_KEY as KEY } from "./theme-script";

type Theme = "system" | "light" | "dark";
const listeners = new Set<() => void>();


function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(t: Theme) {
  try {
    if (t === "system") {
      localStorage.removeItem(KEY);
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem(KEY, t);
      document.documentElement.dataset.theme = t;
    }
  } catch {
    /* storage blocked — still apply for this page */
    if (t !== "system") document.documentElement.dataset.theme = t;
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = {
  system: "Theme: match device",
  light: "Theme: light",
  dark: "Theme: dark",
};

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => apply(NEXT[theme])}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        className
      )}
      aria-label={`${LABEL[theme]} (click to change)`}
      title={LABEL[theme]}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}
