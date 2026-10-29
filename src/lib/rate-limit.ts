/**
 * Minimal fixed-window rate limiter.
 *
 * In-memory and per process: correct for the single `web` container in
 * docker-compose.prod.yml. If you scale web horizontally, swap the store for
 * Redis (REDIS_URL is already provisioned) — the call sites don't change.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    lastSweep = now;
  }

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  const ok = bucket.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: ok ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Check several limits at once; all are counted, first failure is returned. */
export function rateLimitAll(
  rules: Array<{ key: string; limit: number; windowMs: number }>
): RateLimitResult {
  let worst: RateLimitResult = { ok: true, remaining: Infinity, retryAfterSeconds: 0 };
  for (const r of rules) {
    const res = rateLimit(r.key, r.limit, r.windowMs);
    if (!res.ok && worst.ok) worst = res;
  }
  return worst;
}

export function resetRateLimits() {
  buckets.clear();
}

/** Best-effort client IP behind Caddy/Traefik (Coolify). */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
