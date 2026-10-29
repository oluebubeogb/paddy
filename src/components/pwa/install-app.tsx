"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getInstallState, promptInstall, subscribeInstall, type InstallState } from "./pwa";

function useInstallState(): InstallState {
  return useSyncExternalStore(subscribeInstall, getInstallState, () => "unsupported");
}

/** "Install Paddy" button that adapts to Chrome/Edge/Android, iOS Safari, or other browsers. */
export function InstallAppButton({
  className,
  variant = "secondary",
}: {
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const state = useInstallState();
  const [showHelp, setShowHelp] = useState(false);

  if (state === "installed") {
    return (
      <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary", className)}>
        <Check className="h-4 w-4" />
        Installed
      </span>
    );
  }

  if (state === "unsupported") {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Open Paddy over HTTPS to install it.
      </span>
    );
  }

  return (
    <div className={cn("flex shrink-0 flex-col items-stretch gap-2 sm:items-end", className)}>
      <Button
        variant={variant}
        size="sm"
        className="gap-2"
        onClick={() => {
          if (state === "promptable") void promptInstall();
          else setShowHelp((v) => !v);
        }}
      >
        <Download className="h-4 w-4" />
        Install app
      </Button>
      {showHelp && state === "ios" && (
        <p className="animate-in max-w-xs text-xs leading-relaxed text-muted-foreground">
          In Safari, tap <Share className="inline h-3.5 w-3.5 align-[-2px]" /> <b>Share</b>, then{" "}
          <SquarePlus className="inline h-3.5 w-3.5 align-[-2px]" /> <b>Add to Home Screen</b>.
        </p>
      )}
      {showHelp && state === "manual" && (
        <p className="animate-in max-w-xs text-xs leading-relaxed text-muted-foreground">
          Use your browser menu → <b>Install Paddy</b> (or <b>Add to Home screen</b>). In Chrome/Edge
          desktop, click the install icon at the right of the address bar.
        </p>
      )}
    </div>
  );
}
