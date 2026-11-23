/**
 * JSON responses and stable error codes for edge functions (Phase 2 spec
 * §C.1; gap/00 F1). An error body is always
 * `{ "error": { "code": "<stable_code>", "message": "<sentence for people>" } }`
 * plus optional non-secret details. Unknown errors become `internal_error`
 * with a generic sentence: never a stack trace, provider text or a secret.
 */
import { corsHeaders } from './cors.ts';
import { log } from './log.ts';

export type ErrorCode =
  | 'unauthorized'
  | 'account_disabled'
  | 'forbidden'
  | 'cross_company'
  | 'not_found'
  | 'invalid_request'
  | 'method_not_allowed'
  | 'conflict'
  | 'already_active'
  | 'cooldown'
  | 'rate_limited'
  | 'send_failed'
  /** A multi-step action did part of its work (e.g. status stored, sign-in block not applied); details say which. */
  | 'partial_failure'
  /** The platform offers no supported way to do this (e.g. revoke sessions by user id): said honestly, never faked. */
  | 'not_supported'
  | 'status_unavailable'
  | 'server_misconfigured'
  | 'internal_error';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly publicMessage: string,
    readonly details?: Record<string, JsonValue>,
    /** Extra response headers (e.g. `Retry-After` on 429). */
    readonly headers?: Readonly<Record<string, string>>,
  ) {
    super(publicMessage);
    this.name = 'HttpError';
  }
}

export interface ResponseOptions {
  status?: number;
  req?: Request | null;
  allowedOrigins?: readonly string[];
  headers?: Readonly<Record<string, string>>;
}

export function json(body: JsonValue | Record<string, unknown>, options: ResponseOptions = {}): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      ...corsHeaders(options.req ?? null, options.allowedOrigins),
      ...(options.headers ?? {}),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/** The JSON error body for an `HttpError` (also used when a response carries more than the error). */
export function errorBody(err: HttpError): { error: Record<string, JsonValue> } {
  return { error: { code: err.code, message: err.publicMessage, ...(err.details ? { details: err.details } : {}) } };
}

/** Map any thrown value to a JSON error response (HttpError keeps its status and code). */
export function errorResponse(err: unknown, options: Omit<ResponseOptions, 'status'> = {}): Response {
  if (err instanceof HttpError) {
    return json(errorBody(err), { ...options, status: err.status, headers: { ...(options.headers ?? {}), ...(err.headers ?? {}) } });
  }
  return json({ error: { code: 'internal_error', message: 'Something went wrong. Try again.' } }, { ...options, status: 500 });
}

/** Parse the JSON body with `parse`; any failure is 400 `invalid_request`. */
export async function readJson<T>(req: Request, parse: (value: unknown) => T): Promise<T> {
  let value: unknown;
  try {
    value = await req.json();
  } catch {
    throw new HttpError(400, 'invalid_request', 'The request body must be JSON.');
  }
  try {
    return parse(value);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'invalid_request', 'The request is missing a field or has a wrong value.');
  }
}

export type Handler = (req: Request) => Promise<Response>;

export interface HttpOptions {
  /** Static list, or a function read per request (from `STORM_ALLOWED_ORIGINS`). */
  allowedOrigins?: readonly string[] | (() => readonly string[]);
  methods?: readonly string[];
  /** Function name for the structured log line of an unexpected error. */
  name?: string;
}

/** The request's CORS answer replaces whatever the handler's response carried (handlers build bodies, not CORS). */
function applyCors(headers: Headers, cors: Record<string, string>): void {
  if (!('Access-Control-Allow-Origin' in cors)) headers.delete('Access-Control-Allow-Origin');
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
}

function withCors(res: Response, cors: Record<string, string>): Response {
  try {
    applyCors(res.headers, cors);
    return res;
  } catch {
    // Immutable headers (e.g. a fetched Response): copy into a new one.
    const headers = new Headers(res.headers);
    applyCors(headers, cors);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
}

/**
 * Preflight, method check, CORS on every response and error mapping around
 * a handler. Unexpected errors are logged with their class name only (never
 * the message: it may carry provider text or personal data) and answered as
 * 500 `internal_error`.
 */
export function withHttp(handler: Handler, options: HttpOptions = {}): Handler {
  const methods = options.methods ?? ['POST'];
  const originsFor = (): readonly string[] => {
    const o = options.allowedOrigins;
    if (typeof o === 'function') {
      try {
        return o();
      } catch {
        return [];
      }
    }
    return o ?? [];
  };
  return async (req) => {
    const allowedOrigins = originsFor();
    const cors = corsHeaders(req, allowedOrigins);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (!methods.includes(req.method)) {
        throw new HttpError(405, 'method_not_allowed', 'Method not allowed.', undefined, { Allow: [...methods, 'OPTIONS'].join(', ') });
      }
      return withCors(await handler(req), cors);
    } catch (err) {
      if (!(err instanceof HttpError)) {
        log('error', 'unhandled_error', { fn: options.name ?? 'edge', kind: err instanceof Error ? err.name : typeof err });
      } else if (err.status >= 500) {
        log('warn', 'request_failed', { fn: options.name ?? 'edge', code: err.code, status: err.status });
      }
      return errorResponse(err, { req, allowedOrigins });
    }
  };
}
