/**
 * Fixed-window rate limiter keyed by client IP. In memory, so on Vercel it holds per function
 * instance: a best-effort guard that stops one visitor from draining the free-tier LLM quota,
 * not a hard global limit.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit; returns the seconds to wait when over the limit, else 0. */
  take(key: string, now = Date.now()): number {
    const h = this.hits.get(key);
    if (!h || now >= h.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
      return 0;
    }
    if (h.count >= this.limit) return Math.ceil((h.resetAt - now) / 1000);
    h.count++;
    return 0;
  }

  private prune(now: number): void {
    for (const [k, h] of this.hits) if (now >= h.resetAt) this.hits.delete(k);
  }
}

/** Client IP behind Vercel's proxy (x-forwarded-for, first hop), or a fixed key locally. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'local';
}
