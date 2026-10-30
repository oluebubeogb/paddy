import Link from "next/link";
import { PaddyMark } from "@/components/brand/paddy-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

/** Shared frame for sign-in / sign-up / verify / reset / onboarding. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide,
  center,
  tip,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  center?: boolean;
  /** Longer explanation, tucked into a tooltip next to the subtitle. */
  tip?: React.ReactNode;
}) {
  return (
    <div className="paddy-glow relative flex min-h-dvh items-center justify-center px-4 py-12">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className={cn("animate-in w-full", wide ? "max-w-lg" : "max-w-md")}>
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/" aria-label="Paddy home" className="rounded-full">
            <PaddyMark size={56} className="drop-shadow-sm" />
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
          {(subtitle || tip) && (
            <p className="mt-2 inline-flex max-w-sm items-center justify-center gap-1 text-sm leading-relaxed text-muted-foreground">
              {subtitle && <span>{subtitle}</span>}
              {tip && <InfoTip label="Why?" side="bottom">{tip}</InfoTip>}
            </p>
          )}
        </div>
        {children && (
          <div
            className={cn(
              "rounded-3xl border border-border/80 bg-card/85 p-6 shadow-xl shadow-primary/5 backdrop-blur sm:p-7",
              center && "text-center"
            )}
          >
            {children}
          </div>
        )}
        {footer && <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
      {children}
    </p>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}
