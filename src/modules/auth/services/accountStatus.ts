/**
 * The signed-in user's account status (Phase 2 spec §B.3; gap/01 F47, W7;
 * DECISIONS D-04, proposed D-122).
 *
 * Source order:
 * 1. `my_account_status()` (P2 SQL): profile status, membership status and
 *    the auth ban together.
 * 2. When that RPC is not in the database yet (D-01): the caller's own
 *    `profiles.account_status`, which is live today and is what the admin
 *    "Disable access" action writes. `disabled` / `deactivated` → disabled.
 *
 * Any other error is thrown: the caller decides (the sign-in screen shows
 * the error with Retry and does not open the app; it never treats an
 * unknown status as active). A missing profile row is `no_profile`.
 *
 * Contract stub created by the Phase 2 architect; E2 wires it into
 * AuthContext and the sign-in screen and adds tests.
 */
import { supabase } from '@/integrations/supabase/client';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { authDb } from './accessDb';
import type { AccountStatus } from '../types/db.pending';

export type AccountStatusSource = 'rpc' | 'profile';

export interface AccountStatusResult {
  status: AccountStatus;
  source: AccountStatusSource;
}

/** Legacy `profiles.account_status` values that mean "access disabled". */
export const DISABLED_ACCOUNT_STATUSES: readonly string[] = ['disabled', 'deactivated'];

/** `profiles.account_status` (any case, null = active) as an AccountStatus. */
export function accountStatusFromProfile(raw: string | null | undefined): AccountStatus {
  const value = (raw ?? '').trim().toLowerCase();
  return DISABLED_ACCOUNT_STATUSES.includes(value) ? 'disabled' : 'active';
}

const ACCOUNT_STATUSES: readonly AccountStatus[] = ['active', 'disabled', 'no_profile'];

function asAccountStatus(value: unknown): AccountStatus | null {
  return typeof value === 'string' && (ACCOUNT_STATUSES as readonly string[]).includes(value) ? (value as AccountStatus) : null;
}

/**
 * The check AuthContext runs once per signed-in user, before anything reads
 * the profile (spec §B.3): `record_session_start()` answers the status
 * (and, for an active user, records the sign-in: last login, an accepted
 * invitation, `invited` → `active`). When that RPC is not in the database
 * yet (D-01), `fetchAccountStatus` answers instead (`my_account_status()`,
 * else the own profile row). Any other error is thrown: the caller fails
 * closed.
 */
export async function startAccountSession(userId: string): Promise<AccountStatusResult> {
  const { data, error } = await authDb.rpc('record_session_start');
  if (!error) {
    const status = asAccountStatus(data);
    if (!status) throw new Error('The account status could not be read.');
    return { status, source: 'rpc' };
  }
  if (!isMissingRelation(error)) throw error;
  return fetchAccountStatus(userId);
}

/** Supabase Auth's answer for a banned login (`ban_duration` set by admin-actions when access is turned off). */
export function isBannedSignInError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  return e.code === 'user_banned' || (typeof e.message === 'string' && /user is banned/i.test(e.message));
}

export const ACCOUNT_DISABLED_MESSAGE = 'Your access has been disabled by your account administrator.';
export const ACCOUNT_CHECK_FAILED_MESSAGE = 'We could not check your account. Try again.';

export async function fetchAccountStatus(userId: string): Promise<AccountStatusResult> {
  const { data, error } = await authDb.rpc('my_account_status');
  if (!error) {
    const status = asAccountStatus(data);
    // An answer outside the vocabulary is not "active": fail closed.
    if (!status) throw new Error('The account status could not be read.');
    return { status, source: 'rpc' };
  }
  if (!isMissingRelation(error)) throw error;

  const profile = await supabase.from('profiles').select('account_status').eq('user_id', userId).maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return { status: 'no_profile', source: 'profile' };
  return { status: accountStatusFromProfile(profile.data.account_status), source: 'profile' };
}
