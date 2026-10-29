import { PaddyAvatar } from "@/components/brand/paddy-mark";

export function TypingIndicator() {
  return (
    <div className="animate-in flex items-end gap-2" role="status" aria-label="Paddy is typing">
      <PaddyAvatar />
      <div className="flex h-10 items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-[var(--assistant-bubble)] px-4 text-primary shadow-sm">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}
