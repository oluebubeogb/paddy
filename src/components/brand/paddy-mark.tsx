import { cn } from "@/lib/utils";

/**
 * Paddy's mark: a soft teal "pebble" with a gentle face and a sprout.
 * Pure inline SVG — no external assets. Decorative by default.
 */
export function PaddyMark({
  size = 32,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id="paddy-g" x1="8" y1="6" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      {/* sprout */}
      <path d="M24 10c0-3 1.5-5.5 4.5-6.5-.2 3.3-1.8 5.6-4.5 6.5Z" fill="#5eead4" />
      <path d="M24 10c-.2-2.4-1.6-4.2-3.9-4.9.3 2.5 1.6 4.2 3.9 4.9Z" fill="#99f6e4" />
      {/* body */}
      <path
        d="M24 9.5c9.6 0 17 6.9 17 16.6C41 36 33.9 42 24 42S7 36 7 26.1C7 16.4 14.4 9.5 24 9.5Z"
        fill="url(#paddy-g)"
      />
      {/* face */}
      <circle cx="18.5" cy="25" r="2.2" fill="#f0fdfa" />
      <circle cx="29.5" cy="25" r="2.2" fill="#f0fdfa" />
      <path
        d="M19.5 31.2c2.6 2.4 6.4 2.4 9 0"
        stroke="#f0fdfa"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="15" cy="30" r="1.8" fill="#fda4af" opacity=".55" />
      <circle cx="33" cy="30" r="1.8" fill="#fda4af" opacity=".55" />
    </svg>
  );
}

/** Mark + wordmark, for headers. */
export function PaddyLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <PaddyMark size={size} />
      <span className="text-lg font-semibold tracking-tight text-foreground">Paddy</span>
    </span>
  );
}

/** Small round avatar used beside Paddy's chat bubbles. */
export function PaddyAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20",
        className
      )}
    >
      <PaddyMark size={22} />
    </span>
  );
}
