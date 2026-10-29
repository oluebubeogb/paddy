"use client";

/**
 * Tiny PWA store: captures `beforeinstallprompt` as early as possible (from the
 * root layout) so any page can offer "Install Paddy" later.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = "installed" | "promptable" | "ios" | "manual" | "unsupported";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function startPwa() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });

  // Service workers need HTTPS (Coolify/Traefik) or localhost.
  if ("serviceWorker" in navigator && (window.isSecureContext || location.hostname === "localhost")) {
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("Service worker registration failed", err);
      });
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });
  }
}

export function getInstallState(): InstallState {
  if (typeof window === "undefined") return "unsupported";
  if (installed || isStandalone()) return "installed";
  if (deferred) return "promptable";
  if (isIos()) return "ios";
  if (!window.isSecureContext) return "unsupported";
  return "manual";
}

export function subscribeInstall(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const evt = deferred;
  deferred = null;
  await evt.prompt();
  const { outcome } = await evt.userChoice;
  if (outcome === "accepted") installed = true;
  emit();
  return outcome === "accepted";
}
