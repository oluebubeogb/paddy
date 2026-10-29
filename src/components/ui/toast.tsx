"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  variant: Variant;
}

const ToastContext = createContext<(message: string, variant?: Variant) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const ICON = { success: CheckCircle2, error: TriangleAlert, info: Info };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: Variant = "success") => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, variant }]);
      setTimeout(() => dismiss(id), 3200);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => {
          const Icon = ICON[t.variant];
          return (
            <div
              key={t.id}
              className={cn(
                "glass animate-in pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-full border border-border px-4 py-2.5 text-sm shadow-lg",
                t.variant === "error" && "text-destructive"
              )}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", t.variant === "success" && "text-primary")}
              />
              <span className="text-foreground">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="ml-1 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
