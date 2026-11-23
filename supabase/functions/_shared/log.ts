/**
 * Structured logs for edge functions (Phase 2 spec §C.1). One JSON line per
 * event with scalar fields only. Keys that could carry secrets or personal
 * data are dropped, whatever their value: never log a token, key, password,
 * email, phone, name or a provider's raw error text. String values are also
 * scrubbed: anything that looks like an email address, a JWT, a bearer
 * header or an API secret is replaced, control characters are removed (no
 * log-line injection) and values are cut to 200 characters.
 */
export type LogLevel = 'info' | 'warn' | 'error';
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const BLOCKED_SUBSTRING = /(token|secret|password|passwd|key|authorization|cookie|email|phone|name|address|body|message|text)/i;
/** `pin`, `pin_hash`, `pinHash`, `admin_pin` (but not `shipping` or `pinned`). */
const BLOCKED_PIN = /(^|[_-])[pP][iI][nN]([_-]|[A-Z]|$)/;
const isBlockedKey = (k: string): boolean => BLOCKED_SUBSTRING.test(k) || BLOCKED_PIN.test(k);
const MAX_VALUE = 200;
const REDACTED = '[redacted]';

const VALUE_PATTERNS: readonly RegExp[] = [
  /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g, // email addresses
  /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]+)?/g, // JWTs
  /\bBearer\s+\S+/gi, // authorization header values
  /\b(?:sb_secret|sb_publishable|re)_[A-Za-z0-9_-]{8,}/g, // Supabase / Resend keys
];

/** Control characters (C0, DEL, C1) and Unicode line / paragraph separators become spaces. */
export function stripControls(value: string): string {
  let out = '';
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    out += c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 ? ' ' : ch;
  }
  return out;
}

function scrub(value: string): string {
  let out = stripControls(value);
  for (const pattern of VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
  return out.length > MAX_VALUE ? out.slice(0, MAX_VALUE) : out;
}

export function sanitize(fields: LogFields = {}): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || isBlockedKey(k)) continue;
    if (k === 'level' || k === 'event' || k === 'at') continue; // reserved
    if (typeof v === 'number' && !Number.isFinite(v)) {
      out[k] = null;
      continue;
    }
    out[k] = typeof v === 'string' ? scrub(v) : v;
  }
  return out;
}

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ level, event: scrub(event), at: new Date().toISOString(), ...sanitize(fields) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
