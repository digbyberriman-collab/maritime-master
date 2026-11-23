/**
 * Request body field readers for edge functions (Phase 2 spec §C.1). Each
 * reader returns a typed value or throws 400 `invalid_request` naming the
 * field (never echoing its value). Use them inside the `parse` callback of
 * `readJson`.
 */
import { isUuid } from './db.ts';
import { HttpError } from './http.ts';

export type Body = Readonly<Record<string, unknown>>;

function invalid(field: string, what: string): HttpError {
  return new HttpError(400, 'invalid_request', `The request has a missing or wrong ${what}.`, { field });
}

/** The body as a plain object (arrays and scalars refused). */
export function objectBody(value: unknown): Body {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid_request', 'The request body must be a JSON object.');
  }
  return value as Body;
}

export function optionalString(body: Body, field: string, maxLength = 500): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > maxLength) throw invalid(field, 'text value');
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function requiredString(body: Body, field: string, maxLength = 500): string {
  const value = optionalString(body, field, maxLength);
  if (value === null) throw invalid(field, 'text value');
  return value;
}

export function optionalUuid(body: Body, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === '') return null;
  if (!isUuid(value)) throw invalid(field, 'id');
  return value.toLowerCase();
}

export function requiredUuid(body: Body, field: string): string {
  const value = optionalUuid(body, field);
  if (value === null) throw invalid(field, 'id');
  return value;
}

export function optionalBoolean(body: Body, field: string): boolean | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw invalid(field, 'true / false value');
  return value;
}

export function requiredBoolean(body: Body, field: string): boolean {
  const value = optionalBoolean(body, field);
  if (value === null) throw invalid(field, 'true / false value');
  return value;
}

/** A list of ids, de-duplicated in order; `max` caps the length (400 when exceeded). */
export function uuidList(body: Body, field: string, max: number): string[] {
  const value = body[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(field, 'list of ids');
  if (value.length > max) {
    throw new HttpError(400, 'invalid_request', `At most ${max} people can be handled in one request.`, { field, max });
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (!isUuid(item)) throw invalid(field, 'list of ids');
    const id = item.toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** A calendar date `YYYY-MM-DD` that exists (2025-02-30 refused). */
export function optionalDate(body: Body, field: string): string | null {
  const value = optionalString(body, field, 10);
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw invalid(field, 'date');
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (d.getUTCFullYear() !== Number(match[1]) || d.getUTCMonth() !== Number(match[2]) - 1 || d.getUTCDate() !== Number(match[3])) {
    throw invalid(field, 'date');
  }
  return value;
}
