"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Password field with a sleek show/hide eye toggle. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={show ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-90"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        tabIndex={0}
      >
        <span className="relative h-4 w-4">
          <Eye className={cn("absolute inset-0 h-4 w-4 transition-all duration-200", show ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
          <EyeOff className={cn("absolute inset-0 h-4 w-4 transition-all duration-200", show ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
        </span>
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
