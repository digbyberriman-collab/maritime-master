/**
 * `notify`: the one way new code shows a toast (DECISIONS D-05).
 *
 * Backed by `sonner`. The shadcn `use-toast` stays mounted until its call
 * sites migrate module by module; new code never imports it.
 *
 *   notify.success('Permit saved');
 *   notify.error(error, { title: 'Could not save the permit' });
 *   await notify.promise(savePermit(), { loading: 'Saving…', success: 'Saved', error: 'Could not save' });
 *
 * Errors are normalised first, so a Supabase/PostgREST, auth, storage or
 * edge-function error reads as a sentence a crew member can act on, not as
 * "new row violates row-level security policy for table …". The raw error is
 * still logged in development.
 *
 * No fake success: only call `success` after the work has actually finished.
 *
 * "Not live yet" (a table, column or RPC missing from the schema, D-01) is
 * decided by the one classifier in `@/integrations/supabase/missingRelation`,
 * the same one pages use through `isMissingRelation`.
 */
import { toast } from 'sonner';
import { isMissingRelation } from '@/integrations/supabase/missingRelation';

// ─── Error normalisation ──────────────────────────────────────────────────

export type ErrorKind =
  | 'permission'
  | 'not_found'
  | 'duplicate'
  | 'conflict'
  | 'validation'
  | 'missing_feature'
  | 'network'
  | 'auth'
  | 'storage'
  | 'server'
  | 'unknown';

export interface NormalisedError {
  /** One sentence to show the user. */
  message: string;
  kind: ErrorKind;
  /** Postgres / PostgREST / auth error code when the source had one. */
  code?: string;
  /** Technical detail for logs and support; never the only thing shown. */
  details?: string;
}

const DEFAULT_FALLBACK = 'Something went wrong. Try again, and contact support if it keeps happening.';

/** Postgres SQLSTATE and PostgREST codes → copy and kind. */
const CODE_MESSAGES: Readonly<Record<string, { kind: ErrorKind; message: string | null }>> = {
  // Row level security or a missing grant.
  '42501': { kind: 'permission', message: "You don't have permission to do that." },
  PGRST301: { kind: 'auth', message: 'Your session has expired. Sign in again to continue.' },
  PGRST302: { kind: 'auth', message: 'Your session has expired. Sign in again to continue.' },
  // `.single()` found nothing: either missing or hidden by RLS.
  PGRST116: { kind: 'not_found', message: "That record wasn't found, or you don't have access to it." },
  '23505': { kind: 'duplicate', message: 'That already exists. Check for a duplicate and try again.' },
  '23503': { kind: 'conflict', message: 'This is linked to other records, so it cannot be changed or removed.' },
  '23502': { kind: 'validation', message: 'A required field is missing.' },
  '23514': { kind: 'validation', message: "One of the values isn't allowed here." },
  '22P02': { kind: 'validation', message: 'One of the values has the wrong format.' },
  '22001': { kind: 'validation', message: 'One of the values is too long.' },
  '22007': { kind: 'validation', message: 'One of the dates is not valid.' },
  '22008': { kind: 'validation', message: 'One of the dates is out of range.' },
  '22003': { kind: 'validation', message: 'One of the numbers is too large.' },
  '40001': { kind: 'conflict', message: 'Someone else changed this at the same time. Reload and try again.' },
  '40P01': { kind: 'conflict', message: 'Someone else changed this at the same time. Reload and try again.' },
  // lock_timeout: another transaction holds the row.
  '55P03': { kind: 'conflict', message: 'Someone else is working on this record. Try again in a moment.' },
  '57014': { kind: 'server', message: 'That took too long. Try again, or narrow the filters.' },
  // idle_in_transaction_session_timeout.
  '25P03': { kind: 'server', message: 'That took too long. Try again.' },
  // RAISE EXCEPTION in an RPC guard: the server wrote the sentence; show it.
  P0001: { kind: 'validation', message: null },
};

/*
 * Table, column or function not in the live schema yet (DECISIONS D-01):
 * the codes live in `MISSING_RELATION_CODES`. PGRST200 (an embed whose
 * relationship PostgREST cannot find) counts: an embedded pending table is
 * the D-01 case. A typo in an embed reads the same way; the code stays on
 * the normalised error (and in PageError's reference) for diagnosis.
 */
const MISSING_FEATURE_MESSAGE = "This feature isn't switched on for your account yet.";

const NETWORK_MESSAGE = "Can't reach the server. Check the connection and try again.";

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
  error?: unknown;
  error_description?: unknown;
}

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Transport failures only. A bare "timeout" is not one: server timeouts
 * arrive with a code (57014, 55P03, 25P03) and a lock timeout is not a
 * connection problem.
 */
function isNetworkMessage(message: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i.test(message);
}

/** A client-side request timeout (`AbortSignal.timeout`, fetch with a timeout signal). */
function isTransportTimeout(name: string | undefined, message: string | undefined): boolean {
  if (name === 'TimeoutError') return true;
  return name === 'AbortError' && /timed? ?out|timeout/i.test(message ?? '');
}

/**
 * Turn anything thrown or returned as `error` into one user-facing sentence
 * plus a kind and code. Never throws.
 */
export function normaliseError(error: unknown, fallback: string = DEFAULT_FALLBACK): NormalisedError {
  if (error === null || error === undefined) return { message: fallback, kind: 'unknown' };
  if (typeof error === 'string') {
    const text = error.trim();
    if (!text) return { message: fallback, kind: 'unknown' };
    // Kind and message agree: a network kind always carries the network sentence.
    if (isNetworkMessage(text)) return { message: NETWORK_MESSAGE, kind: 'network', details: text };
    if (isMissingRelation(text)) return { message: MISSING_FEATURE_MESSAGE, kind: 'missing_feature', details: text };
    return { message: text, kind: 'unknown' };
  }
  if (typeof error !== 'object') return { message: fallback, kind: 'unknown' };

  const e = error as ErrorLike;
  const message = asText(e.message) ?? asText(e.error_description) ?? asText(e.error);
  const code = asText(e.code) ?? (typeof e.code === 'number' ? String(e.code) : undefined);
  const name = asText(e.name);
  const technical = [message, asText(e.details), asText(e.hint)].filter(Boolean).join(' — ') || undefined;

  if (isMissingRelation(error)) {
    return { message: MISSING_FEATURE_MESSAGE, kind: 'missing_feature', code, details: technical };
  }

  if (code && CODE_MESSAGES[code]) {
    const mapped = CODE_MESSAGES[code];
    return { message: mapped.message ?? message ?? fallback, kind: mapped.kind, code, details: technical };
  }

  if ((message && isNetworkMessage(message)) || isTransportTimeout(name, message)) {
    return { message: NETWORK_MESSAGE, kind: 'network', code, details: technical };
  }

  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') {
    return { message: NETWORK_MESSAGE, kind: 'network', details: technical };
  }
  if (name === 'FunctionsHttpError') {
    return { message: "The server couldn't complete that request. Try again shortly.", kind: 'server', details: technical };
  }

  if (name && /^Auth/.test(name)) {
    const status = typeof e.status === 'number' ? e.status : undefined;
    if (status === 401 || /jwt|session/i.test(message ?? '')) {
      return { message: 'Your session has expired. Sign in again to continue.', kind: 'auth', code, details: technical };
    }
    // Auth API messages ("Invalid login credentials") are written for users.
    return { message: message ?? fallback, kind: 'auth', code, details: technical };
  }

  if (name === 'StorageError' || name === 'StorageApiError' || name === 'StorageUnknownError') {
    const status = Number(e.statusCode ?? e.status);
    if (status === 413 || /payload too large|exceeded the maximum allowed size/i.test(message ?? '')) {
      return { message: 'The file is larger than the upload limit.', kind: 'storage', details: technical };
    }
    if (status === 403 || /row-level security|unauthori[sz]ed/i.test(message ?? '')) {
      return { message: "You don't have permission to upload or open that file.", kind: 'permission', details: technical };
    }
    if (status === 404 || /not found/i.test(message ?? '')) {
      return { message: "That file wasn't found.", kind: 'not_found', details: technical };
    }
    return { message: message ?? fallback, kind: 'storage', details: technical };
  }

  if (message && /row-level security|permission denied/i.test(message)) {
    return { message: CODE_MESSAGES['42501'].message as string, kind: 'permission', code, details: technical };
  }

  return { message: message ?? fallback, kind: 'unknown', code, details: technical };
}

/** The user-facing sentence for an error. */
export function errorMessage(error: unknown, fallback?: string): string {
  return normaliseError(error, fallback).message;
}

/**
 * True when the error means a table, view, column or RPC is not in the live
 * schema yet. Pages use it to render `ModuleOff` / `PageEmpty` instead of an
 * error (DECISIONS D-01: never crash, never mock data). The same function as
 * `isMissingRelation` (`@/integrations/supabase/missingRelation`).
 */
export const isMissingRelationError: (error: unknown) => boolean = isMissingRelation;

// ─── Toasts ───────────────────────────────────────────────────────────────

export interface NotifyOptions {
  /** Second line under the title. */
  description?: string;
  /** Reuse an id to replace an existing toast instead of stacking. */
  id?: string | number;
  /** Milliseconds; sonner's default when omitted. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export interface NotifyErrorOptions extends Omit<NotifyOptions, 'description'> {
  /** What failed, e.g. "Could not save the permit". The error becomes the description. */
  title?: string;
  /** Used when the error has no usable message. */
  fallback?: string;
}

export interface NotifyPromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  /** Title for the failure; the normalised error is appended. */
  error: string | ((error: unknown) => string);
}

type ToastData = Parameters<typeof toast.success>[1];

function toastData(options: NotifyOptions = {}): ToastData {
  const data: NonNullable<ToastData> = {};
  if (options.description !== undefined) data.description = options.description;
  if (options.id !== undefined) data.id = options.id;
  if (options.duration !== undefined) data.duration = options.duration;
  if (options.action) data.action = options.action;
  return data;
}

function logInDev(error: unknown): void {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.error('[notify]', error);
}

export const notify = {
  success(message: string, options?: NotifyOptions): string | number {
    return toast.success(message, toastData(options));
  },

  info(message: string, options?: NotifyOptions): string | number {
    return toast.info(message, toastData(options));
  },

  warning(message: string, options?: NotifyOptions): string | number {
    return toast.warning(message, toastData(options));
  },

  /**
   * Show an error. Pass the error itself (Supabase, Error, string); it is
   * normalised. With `title`, the title says what failed and the normalised
   * message becomes the description.
   */
  error(error: unknown, options: NotifyErrorOptions = {}): string | number {
    logInDev(error);
    const { title, fallback, ...rest } = options;
    const normalised = normaliseError(error, fallback);
    if (title) return toast.error(title, toastData({ ...rest, description: normalised.message }));
    return toast.error(normalised.message, toastData(rest));
  },

  /**
   * Loading → success / error toast around a promise. Returns the original
   * promise, so callers still `await` the real result (and still see the
   * rejection).
   */
  promise<T>(promise: Promise<T>, messages: NotifyPromiseMessages<T>, options: Pick<NotifyOptions, 'id' | 'duration'> = {}): Promise<T> {
    toast.promise(promise, {
      ...toastData(options),
      loading: messages.loading,
      success: (value: T) => (typeof messages.success === 'function' ? messages.success(value) : messages.success),
      error: (error: unknown) => {
        logInDev(error);
        const title = typeof messages.error === 'function' ? messages.error(error) : messages.error;
        return `${title}: ${normaliseError(error).message}`;
      },
    });
    return promise;
  },

  dismiss(id?: string | number): void {
    toast.dismiss(id);
  },
};

export default notify;
