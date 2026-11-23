/**
 * In-memory rate limiting for edge functions (Phase 2 spec §C.1, §C.3;
 * gap/00 F1). Per isolate: a Supabase function instance keeps its own
 * counters, so this slows down bursts against one instance (token guessing
 * on `accept-invitation`, a stuck client resending invitations) and is not a
 * global quota. Keys are opaque strings: a client IP, a caller id, or a
 * SHA-256 digest of a token (never the raw token, see `digestKey`).
 *
 * Fixed windows per key; the map is pruned so it cannot grow without bound.
 */
import { HttpError } from './http.ts';

export interface RateLimitRule {
  /** Requests allowed per window and key. */
  limit: number;
  windowMs: number;
}

export interface RateLimitVerdict {
  ok: boolean;
  /** Seconds until the key's window resets (0 when ok). */
  retryAfterSeconds: number;
}

interface Bucket {
  start: number;
  count: number;
}

const MAX_KEYS = 10_000;

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private rule: RateLimitRule, private now: () => number = Date.now) {}

  /** Count one request for `key` and say whether it is within the rule. */
  hit(key: string): RateLimitVerdict {
    const t = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || t - bucket.start >= this.rule.windowMs) {
      if (!bucket && this.buckets.size >= MAX_KEYS) this.prune(t);
      bucket = { start: t, count: 0 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count <= this.rule.limit) return { ok: true, retryAfterSeconds: 0 };
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.start + this.rule.windowMs - t) / 1000)) };
  }

  /** `hit` that throws 429 `rate_limited` (with `Retry-After`) when over the rule. */
  enforce(key: string, message = 'Too many attempts. Wait a moment and try again.'): void {
    const verdict = this.hit(key);
    if (!verdict.ok) {
      throw new HttpError(429, 'rate_limited', message, { retry_after_seconds: verdict.retryAfterSeconds }, {
        'Retry-After': String(verdict.retryAfterSeconds),
      });
    }
  }

  get size(): number {
    return this.buckets.size;
  }

  private prune(t: number): void {
    for (const [k, b] of this.buckets) if (t - b.start >= this.rule.windowMs) this.buckets.delete(k);
    // Still full (a flood of fresh keys): drop the oldest half rather than grow.
    if (this.buckets.size >= MAX_KEYS) {
      const keys = [...this.buckets.keys()].slice(0, Math.ceil(this.buckets.size / 2));
      for (const k of keys) this.buckets.delete(k);
    }
  }
}

/** The client IP as the platform reports it (`x-forwarded-for` first hop, then `cf-connecting-ip`), else 'unknown'. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || req.headers.get('cf-connecting-ip')?.trim() || req.headers.get('x-real-ip')?.trim();
  return ip && ip.length <= 64 ? ip : 'unknown';
}

/** A SHA-256 hex digest, so raw tokens never sit in memory as map keys. */
export async function digestKey(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two strings (length leaks; content does not). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  const length = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
