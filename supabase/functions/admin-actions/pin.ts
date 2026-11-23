/**
 * Admin PIN hashing (admin-actions `set_pin` / `verify_pin`). PBKDF2-SHA-256,
 * 100 000 iterations, 16-byte random salt, stored as `<salt hex>:<hash hex>`
 * (the format the live `admin_pins` rows already use). Verification derives
 * with the stored salt and compares in constant time; a malformed stored
 * value never matches (and never throws).
 */
import { timingSafeEqual } from '../_shared/rateLimit.ts';

const ITERATIONS = 100_000;

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function fromHex(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return hex(new Uint8Array(bits));
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${hex(salt)}:${await derive(pin, salt)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex, extra] = stored.split(':');
  const salt = saltHex ? fromHex(saltHex) : null;
  if (!salt || !hashHex || extra !== undefined || !fromHex(hashHex)) return false;
  return timingSafeEqual(await derive(pin, salt), hashHex.toLowerCase());
}
