/**
 * Caller authentication for edge functions (Phase 2 spec §C.1; gap/00 C6,
 * F1; gap/01 F47, W7; proposed D-122).
 *
 * `getAuthContext(req)`:
 * 1. needs `Authorization: Bearer <access token>` (401 `unauthorized`);
 * 2. verifies it with the anon client's `auth.getUser(token)` (401 on any
 *    failure; the gateway's verify_jwt is a second check, not the only one);
 * 3. asks `my_account_status()` as the caller: `'disabled'` → 403
 *    `account_disabled`, `'no_profile'` → 403 `forbidden`. When that RPC is
 *    not in the database yet (42883 / PGRST202, D-01) it reads the caller's
 *    own `profiles.account_status` through the RLS-scoped client
 *    (`disabled` / `deactivated` → 403 `account_disabled`; no row → 403
 *    `forbidden`). Any other failure, or an answer outside the vocabulary,
 *    is 503 `status_unavailable` (fail closed, never "assume active");
 * 4. reads the caller's own profile (company, profile id) through the
 *    RLS-scoped client. After the P3 migration a disabled user reads no
 *    profile row at all, which is why the RPC answer decides first;
 * 5. returns the RLS-scoped user client, the caller's company, and a lazily
 *    created service client. Use the service client only after an explicit
 *    capability check, and only for what RLS cannot do (auth admin API,
 *    service-only RPCs, rows a definer would write).
 *
 * Dependency injection: pass `deps.createClient` (tests pass a fake) and
 * `deps.env`.
 */
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from 'npm:@supabase/supabase-js@2.49.2';
import { asRow, isMissingFunction, text } from './db.ts';
import { readEnv, type EdgeEnv } from './env.ts';
import { HttpError } from './http.ts';

export type ClientFactory = (url: string, key: string, options?: SupabaseClientOptions<'public'>) => SupabaseClient;

export interface AuthDeps {
  env: EdgeEnv;
  createClient: ClientFactory;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthContext {
  user: AuthUser;
  token: string;
  /** RLS-scoped as the caller. */
  userClient: SupabaseClient;
  /** The caller's `profiles.company_id`; null when the profile has none. */
  companyId: string | null;
  /** `profiles.id` of the caller, when there is a profile. */
  profileId: string | null;
  /** Lazily created; never call before a capability check passes. */
  serviceClient: () => SupabaseClient;
  env: EdgeEnv;
}

const DISABLED = new Set(['disabled', 'deactivated']);

export const defaultCreateClient: ClientFactory = (url, key, options) => createSupabaseClient(url, key, options);

/** Options for server-side clients: no session storage, no refresh timers. */
export const NO_SESSION: SupabaseClientOptions<'public'> = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

const UNAVAILABLE = (): HttpError => new HttpError(503, 'status_unavailable', 'Your account could not be checked. Try again.');
const DISABLED_ERROR = (): HttpError =>
  new HttpError(403, 'account_disabled', 'Your access has been disabled by your account administrator.');
const NO_PROFILE = (): HttpError => new HttpError(403, 'forbidden', 'Your account is not set up for this action.');

/** A service-role client (no session). Callers must have passed a capability check, or be machine callers. */
export function createServiceClient(deps: Partial<AuthDeps> = {}): SupabaseClient {
  const env = deps.env ?? readEnv();
  return (deps.createClient ?? defaultCreateClient)(env.supabaseUrl, env.serviceRoleKey, NO_SESSION);
}

export async function getAuthContext(req: Request, deps: Partial<AuthDeps> = {}): Promise<AuthContext> {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'unauthorized', 'Sign in to continue.');
  const env = deps.env ?? readEnv();
  const createClient = deps.createClient ?? defaultCreateClient;

  const userClient = createClient(env.supabaseUrl, env.anonKey, {
    ...NO_SESSION,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  let userId: string | null = null;
  let email: string | null = null;
  try {
    const { data, error } = await userClient.auth.getUser(token);
    if (!error && data?.user) {
      userId = typeof data.user.id === 'string' && data.user.id ? data.user.id : null;
      email = typeof data.user.email === 'string' && data.user.email ? data.user.email : null;
    }
  } catch {
    userId = null;
  }
  if (!userId) throw new HttpError(401, 'unauthorized', 'Your session has expired. Sign in again.');
  const user: AuthUser = { id: userId, email };

  // Status first: after the P3 migration a disabled user reads no profile row, so the row cannot decide.
  const status = await userClient.rpc('my_account_status');
  let rpcAnswered = false;
  if (status.error) {
    if (!isMissingFunction(status.error)) throw UNAVAILABLE();
  } else {
    rpcAnswered = true;
    if (status.data === 'disabled') throw DISABLED_ERROR();
    if (status.data === 'no_profile') throw NO_PROFILE();
    if (status.data !== 'active') throw UNAVAILABLE();
  }

  const profileRes = await userClient.from('profiles').select('id, company_id, account_status').eq('user_id', user.id).maybeSingle();
  if (profileRes.error) throw UNAVAILABLE();
  const profile = asRow(profileRes.data);
  if (!profile) throw NO_PROFILE();
  if (!rpcAnswered && DISABLED.has((text(profile, 'account_status') ?? '').toLowerCase())) throw DISABLED_ERROR();

  let service: SupabaseClient | null = null;
  return {
    user,
    token,
    userClient,
    companyId: text(profile, 'company_id'),
    profileId: text(profile, 'id'),
    serviceClient: () => (service ??= createClient(env.supabaseUrl, env.serviceRoleKey, NO_SESSION)),
    env,
  };
}
