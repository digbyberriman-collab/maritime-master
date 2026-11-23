/**
 * A recording `fetch` stand-in for email tests (Deno only). Answers each call
 * with the next scripted status (default 200 with a provider id) or throws
 * when the script says `'network'`.
 */
import type { Fetcher } from '../email.ts';

export interface FetchCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface FakeFetcher {
  fetcher: Fetcher;
  calls: FetchCall[];
}

export function fakeFetcher(script: Array<number | 'network'> = []): FakeFetcher {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetcher: Fetcher = (url, init) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const parsed: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : {};
    calls.push({ url, headers, body: parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {} });
    const next = script[i++] ?? 200;
    if (next === 'network') return Promise.reject(new TypeError('network down'));
    const body = next < 300 ? { id: `msg-${calls.length}` } : { name: 'validation_error', message: 'provider says no to someone@example.test' };
    return Promise.resolve(new Response(JSON.stringify(body), { status: next, headers: { 'Content-Type': 'application/json' } }));
  };
  return { fetcher, calls };
}

export interface ProviderLogEntry {
  key: string;
  status: number | 'timeout';
}

export interface IdempotentProvider {
  fetcher: Fetcher;
  log: ProviderLogEntry[];
  /** Bodies the provider accepted (one per delivered email). */
  delivered: string[];
}

/**
 * The email provider's idempotency rule: the same key with the same body is
 * answered from cache (200, no second email); the same key with a different
 * body is 409 `invalid_idempotent_request`. `script` can make an accepted
 * request time out on the way back (`'timeout_after_accept'`: the email was
 * delivered, the caller sees a network failure).
 */
export function idempotentProvider(script: Array<'ok' | 'timeout_after_accept'> = []): IdempotentProvider {
  const seen = new Map<string, string>();
  const log: ProviderLogEntry[] = [];
  const delivered: string[] = [];
  let i = 0;
  const fetcher: Fetcher = (_url, init) => {
    const key = new Headers(init.headers).get('Idempotency-Key') ?? '';
    const body = String(init.body);
    const step = script[i++] ?? 'ok';
    const prior = seen.get(key);
    if (prior !== undefined && prior !== body) {
      log.push({ key, status: 409 });
      return Promise.resolve(new Response('{"name":"invalid_idempotent_request"}', { status: 409 }));
    }
    if (prior === undefined) {
      seen.set(key, body);
      delivered.push(body);
    }
    if (step === 'timeout_after_accept') {
      log.push({ key, status: 'timeout' });
      return Promise.reject(new DOMException('timeout', 'TimeoutError'));
    }
    log.push({ key, status: 200 });
    return Promise.resolve(new Response(JSON.stringify({ id: `msg-${log.length}` }), { status: 200 }));
  };
  return { fetcher, log, delivered };
}
