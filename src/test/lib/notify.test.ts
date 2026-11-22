import { beforeEach, describe, expect, it, vi } from 'vitest';

const sonner = vi.hoisted(() => ({
  success: vi.fn(() => 'id-success'),
  info: vi.fn(() => 'id-info'),
  warning: vi.fn(() => 'id-warning'),
  error: vi.fn(() => 'id-error'),
  promise: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: sonner }));

import { errorMessage, isMissingRelationError, normaliseError, notify } from '@/shared/lib/notify';

const pg = (code: string, message = 'raw database message', extra: Record<string, string> = {}) => ({
  code,
  message,
  details: extra.details ?? '',
  hint: extra.hint ?? '',
});

beforeEach(() => {
  Object.values(sonner).forEach((fn) => fn.mockClear());
});

describe('normaliseError: Supabase / PostgREST', () => {
  it.each([
    ['42501', 'permission', "You don't have permission to do that."],
    ['PGRST116', 'not_found', "That record wasn't found, or you don't have access to it."],
    ['23505', 'duplicate', 'That already exists. Check for a duplicate and try again.'],
    ['23503', 'conflict', 'This is linked to other records, so it cannot be changed or removed.'],
    ['23502', 'validation', 'A required field is missing.'],
    ['23514', 'validation', "One of the values isn't allowed here."],
    ['22P02', 'validation', 'One of the values has the wrong format.'],
    ['40001', 'conflict', 'Someone else changed this at the same time. Reload and try again.'],
    ['42P01', 'missing_feature', "This feature isn't switched on for your account yet."],
    ['PGRST205', 'missing_feature', "This feature isn't switched on for your account yet."],
    ['PGRST202', 'missing_feature', "This feature isn't switched on for your account yet."],
    ['PGRST301', 'auth', 'Your session has expired. Sign in again to continue.'],
  ])('%s → %s', (code, kind, message) => {
    const n = normaliseError(pg(code, 'new row violates row-level security policy for table "x"'));
    expect(n).toMatchObject({ code, kind, message });
    // The raw text is kept for logs, not shown.
    expect(n.details).toContain('row-level security');
  });

  it('shows the server’s own sentence for RAISE EXCEPTION (P0001)', () => {
    expect(normaliseError(pg('P0001', 'Close is blocked: 1 open request'))).toMatchObject({
      kind: 'validation',
      message: 'Close is blocked: 1 open request',
    });
  });

  it('keeps details and hint in the technical text', () => {
    const n = normaliseError(pg('23505', 'duplicate key', { details: 'Key (reference)=(PTW-DRA-2026-061) already exists.', hint: 'none' }));
    expect(n.details).toBe('duplicate key — Key (reference)=(PTW-DRA-2026-061) already exists. — none');
  });

  it('recognises an RLS message without a code', () => {
    expect(normaliseError(new Error('permission denied for table record_envelopes')).kind).toBe('permission');
  });

  it('unknown codes fall back to the message', () => {
    expect(normaliseError(pg('XX999', 'Odd failure'))).toMatchObject({ kind: 'unknown', message: 'Odd failure', code: 'XX999' });
  });
});

describe('normaliseError: other sources', () => {
  it('network failures read as a connection problem', () => {
    for (const msg of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'TypeError: fetch failed']) {
      expect(normaliseError(new TypeError(msg))).toMatchObject({ kind: 'network', message: "Can't reach the server. Check the connection and try again." });
    }
  });

  it('edge function errors', () => {
    const http = Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError' });
    const fetchErr = Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError' });
    expect(normaliseError(http).kind).toBe('server');
    expect(normaliseError(fetchErr).kind).toBe('network');
  });

  it('auth errors keep their user-facing text, but an expired session is explained', () => {
    const invalid = Object.assign(new Error('Invalid login credentials'), { name: 'AuthApiError', status: 400 });
    const expired = Object.assign(new Error('JWT expired'), { name: 'AuthApiError', status: 401 });
    expect(normaliseError(invalid)).toMatchObject({ kind: 'auth', message: 'Invalid login credentials' });
    expect(normaliseError(expired)).toMatchObject({ kind: 'auth', message: 'Your session has expired. Sign in again to continue.' });
  });

  it('storage errors', () => {
    const big = Object.assign(new Error('Payload too large'), { name: 'StorageApiError', statusCode: '413' });
    const denied = Object.assign(new Error('new row violates row-level security policy'), { name: 'StorageApiError', statusCode: '403' });
    const missing = Object.assign(new Error('Object not found'), { name: 'StorageApiError', statusCode: '404' });
    expect(normaliseError(big)).toMatchObject({ kind: 'storage', message: 'The file is larger than the upload limit.' });
    expect(normaliseError(denied).kind).toBe('permission');
    expect(normaliseError(missing).kind).toBe('not_found');
  });

  it('strings, Errors, nothing at all', () => {
    expect(normaliseError('Choose a vessel first')).toMatchObject({ kind: 'unknown', message: 'Choose a vessel first' });
    expect(normaliseError(new Error('Boom')).message).toBe('Boom');
    expect(normaliseError(undefined).message).toMatch(/Something went wrong/);
    expect(normaliseError(null, 'Could not load').message).toBe('Could not load');
    expect(normaliseError({}, 'Could not load').message).toBe('Could not load');
    expect(normaliseError(42).kind).toBe('unknown');
    expect(normaliseError('   ', 'Fallback').message).toBe('Fallback');
  });

  it('errorMessage and isMissingRelationError', () => {
    expect(errorMessage(pg('23505'))).toBe('That already exists. Check for a duplicate and try again.');
    expect(isMissingRelationError(pg('42P01'))).toBe(true);
    expect(isMissingRelationError(pg('PGRST205'))).toBe(true);
    expect(isMissingRelationError(pg('42501'))).toBe(false);
    expect(isMissingRelationError(null)).toBe(false);
  });
});

describe('notify', () => {
  it('success / info / warning pass options through', () => {
    const onClick = vi.fn();
    expect(notify.success('Permit saved', { description: 'PTW-DRA-2026-061', id: 'save', duration: 4000, action: { label: 'Open', onClick } })).toBe('id-success');
    expect(sonner.success).toHaveBeenCalledWith('Permit saved', { description: 'PTW-DRA-2026-061', id: 'save', duration: 4000, action: { label: 'Open', onClick } });
    notify.info('Draft kept on this device');
    expect(sonner.info).toHaveBeenCalledWith('Draft kept on this device', {});
    notify.warning('1 signature is stale');
    expect(sonner.warning).toHaveBeenCalledWith('1 signature is stale', {});
  });

  it('error normalises and shows the sentence as the title', () => {
    notify.error(pg('42501'));
    expect(sonner.error).toHaveBeenCalledWith("You don't have permission to do that.", {});
  });

  it('error with a title shows what failed, then why', () => {
    notify.error(pg('23505'), { title: 'Could not save the permit' });
    expect(sonner.error).toHaveBeenCalledWith('Could not save the permit', {
      description: 'That already exists. Check for a duplicate and try again.',
    });
  });

  it('error uses the fallback when there is nothing usable', () => {
    notify.error(undefined, { fallback: 'Could not load the crew list' });
    expect(sonner.error).toHaveBeenCalledWith('Could not load the crew list', {});
  });

  it('promise returns the original promise and wires the messages', async () => {
    const work = Promise.resolve({ reference: 'CA-DRA-2026-014' });
    const returned = notify.promise(work, {
      loading: 'Submitting…',
      success: (v) => `Submitted ${v.reference}`,
      error: 'Could not submit',
    });
    expect(returned).toBe(work);
    await expect(returned).resolves.toEqual({ reference: 'CA-DRA-2026-014' });

    expect(sonner.promise).toHaveBeenCalledTimes(1);
    const [passed, data] = sonner.promise.mock.calls[0] as unknown as [
      Promise<unknown>,
      { loading: string; success: (v: { reference: string }) => string; error: (e: unknown) => string },
    ];
    expect(passed).toBe(work);
    expect(data.loading).toBe('Submitting…');
    expect(data.success({ reference: 'CA-DRA-2026-014' })).toBe('Submitted CA-DRA-2026-014');
    expect(data.error(pg('42501'))).toBe("Could not submit: You don't have permission to do that.");
  });

  it('promise still rejects for the caller', async () => {
    const failing = Promise.reject(pg('40001'));
    const returned = notify.promise(failing, { loading: '…', success: 'ok', error: () => 'Could not close' });
    await expect(returned).rejects.toMatchObject({ code: '40001' });
    const data = sonner.promise.mock.calls[0][1] as unknown as { error: (e: unknown) => string };
    expect(data.error(pg('40001'))).toBe('Could not close: Someone else changed this at the same time. Reload and try again.');
  });

  it('dismiss', () => {
    notify.dismiss('save');
    expect(sonner.dismiss).toHaveBeenCalledWith('save');
  });
});
