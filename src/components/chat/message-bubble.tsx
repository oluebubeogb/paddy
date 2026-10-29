"use client";

import { useRef, useState } from "react";
import { Reply } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { cn } from "@/lib/utils";

export interface QuotedMessage {
  id: string;
  role: string;
  content: string;
}

export interface ChatBubbleMessage {
  id: string;
  role: string;
  content: string;
  origin?: string;
  generationStatus?: string | null;
  createdAt: string;
  replyToId?: string | null;
  replyTo?: QuotedMessage | null;
  turnId?: string | null;
  sequence?: number;
  /** Client-only: waiting in the batch window / on its way to Paddy. */
  status?: "queued" | "sending";
}

const SWIPE_TRIGGER = 56;
const SWIPE_MAX = 84;

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function quoteSnippet(text: string, max = 140) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function QuoteBlock({
  quote,
  onMine,
  onClick,
  className,
}: {
  quote: QuotedMessage;
  /** Rendered inside the user's (teal) bubble. */
  onMine?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const fromPaddy = quote.role === "assistant";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full min-w-0 rounded-lg border-l-[3px] px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors",
        onMine
          ? "border-white/80 bg-black/10 text-[var(--user-bubble-fg)] hover:bg-black/15"
          : "border-primary bg-primary/[0.07] text-foreground hover:bg-primary/[0.12]",
        className
      )}
    >
      <span className={cn("block text-[11px] font-semibold", onMine ? "text-white/90" : "text-primary")}>
        {fromPaddy ? "Paddy" : "You"}
      </span>
      <span className={cn("line-clamp-2 break-words", onMine ? "text-white/85" : "text-muted-foreground")}>
        {quoteSnippet(quote.content) || "…"}
      </span>
    </button>
  );
}

export function MessageBubble({
  message,
  firstInGroup,
  lastInGroup,
  highlighted,
  onReply,
  onJumpTo,
}: {
  message: ChatBubbleMessage;
  firstInGroup: boolean;
  lastInGroup: boolean;
  highlighted?: boolean;
  onReply: (m: ChatBubbleMessage) => void;
  onJumpTo: (id: string) => void;
}) {
  const mine = message.role === "user";
  const failed = !mine && message.generationStatus === "failed";
  const body = message.content || (message.generationStatus === "pending" ? "…" : "");
  const canReply = !failed && !!message.content;

  // Swipe-right-to-reply (touch / pen), WhatsApp style.
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; id: number; active: boolean; fired: boolean } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (!canReply || e.pointerType === "mouse") return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false, fired: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
        drag.current = null; // vertical scroll wins
        return;
      }
      if (mx > 10) d.active = true;
      else return;
    }
    const next = Math.max(0, Math.min(SWIPE_MAX, mx * 0.7));
    if (next >= SWIPE_TRIGGER && !d.fired) {
      d.fired = true;
      navigator.vibrate?.(8);
    }
    setDx(next);
  }
  function endDrag() {
    const d = drag.current;
    drag.current = null;
    if (d?.active && dx >= SWIPE_TRIGGER) onReply(message);
    setDx(0);
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        "animate-in group relative flex items-center gap-1.5 [touch-action:pan-y]",
        mine ? "flex-row-reverse" : "flex-row",
        firstInGroup ? "mt-4 first:mt-0" : "mt-1"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => canReply && onReply(message)}
    >
      {/* Swipe hint icon (sits behind, revealed as the bubble slides right) */}
      {dx > 4 && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-primary/10 text-primary"
          style={{ opacity: Math.min(1, dx / SWIPE_TRIGGER), transform: `translateY(-50%) scale(${0.6 + Math.min(1, dx / SWIPE_TRIGGER) * 0.4})` }}
        >
          <Reply className="h-4 w-4" />
        </span>
      )}

      <div
        className={cn(
          "flex max-w-[85%] flex-col sm:max-w-[75%]",
          mine ? "items-end" : "items-start",
          dx === 0 && "transition-transform duration-200"
        )}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      >
        <div
          className={cn(
            "rounded-2xl text-[15px] leading-relaxed transition-shadow duration-300",
            message.replyTo ? "space-y-1.5 p-1.5 pb-2.5" : "px-4 py-2.5",
            mine
              ? cn(
                  "bg-[var(--user-bubble)] text-[var(--user-bubble-fg)] shadow-sm",
                  !firstInGroup && "rounded-tr-md",
                  lastInGroup && "rounded-br-md",
                  message.status && "opacity-90"
                )
              : failed
                ? "rounded-bl-md border border-dashed border-border bg-transparent italic text-muted-foreground"
                : cn(
                    "border border-border bg-[var(--assistant-bubble)] text-[var(--assistant-bubble-fg)] shadow-sm",
                    !firstInGroup && "rounded-tl-md",
                    lastInGroup && "rounded-bl-md"
                  ),
            highlighted && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background"
          )}
        >
          {message.replyTo && (
            <QuoteBlock quote={message.replyTo} onMine={mine} onClick={() => onJumpTo(message.replyTo!.id)} />
          )}
          <div className={cn(message.replyTo && "px-2.5", mine && "whitespace-pre-wrap break-words")}>
            {mine ? body : <Markdown>{body}</Markdown>}
          </div>
        </div>
        {lastInGroup && (
          <span className="mt-1 px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {message.origin === "proactive" ? "Paddy checked in · " : ""}
            {message.status === "queued" ? "Waiting for you to finish…" : message.status === "sending" ? "Sending…" : timeLabel(message.createdAt)}
          </span>
        )}
      </div>

      {/* Desktop reply affordance */}
      {canReply && (
        <button
          type="button"
          onClick={() => onReply(message)}
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-secondary hover:text-primary focus:opacity-100 group-hover:opacity-100 md:inline-flex"
          aria-label="Reply to this message"
          title="Reply"
        >
          <Reply className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
