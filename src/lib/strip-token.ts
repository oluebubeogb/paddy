/**
 * Read a one-time ?token= (or #token) from the URL once, then remove it from
 * the address bar/history so it can't leak via screenshots, history sync or
 * Referer. Call from a client component (browser only).
 */
export function takeUrlToken(source: "query" | "hash" = "query"): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  let token: string | null = null;
  if (source === "query") {
    token = url.searchParams.get("token");
    if (token) url.searchParams.delete("token");
  } else {
    token = url.hash.replace(/^#/, "") || null;
    url.hash = "";
  }
  if (token) window.history.replaceState(window.history.state, "", url.pathname + url.search);
  return token;
}
