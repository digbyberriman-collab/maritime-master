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
