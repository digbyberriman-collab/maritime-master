/**
 * Where the sign-in screen sends the user once a session exists.
 *
 * ProtectedRoute redirects here with `state.from` (the location the user
 * asked for). That location is honoured when it is an in-app path, so a deep
 * link from an email or a bookmark survives the sign-in; anything else (no
 * state, another origin, the auth screens themselves) falls back to the home
 * redirect.
 */
export const DEFAULT_AFTER_SIGN_IN = '/dashboard';

const AUTH_PATHS = ['/auth', '/reset-password'];

interface FromLocation {
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
}

export function afterSignInPath(state: unknown): string {
  const from = (state && typeof state === 'object' ? (state as { from?: unknown }).from : undefined) as FromLocation | undefined;
  if (!from || typeof from !== 'object') return DEFAULT_AFTER_SIGN_IN;
  const { pathname, search, hash } = from;
  // In-app absolute paths only: "//host" is protocol-relative, so not one.
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) return DEFAULT_AFTER_SIGN_IN;
  if (AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return DEFAULT_AFTER_SIGN_IN;
  const query = typeof search === 'string' && search.startsWith('?') ? search : '';
  const fragment = typeof hash === 'string' && hash.startsWith('#') ? hash : '';
  return `${pathname}${query}${fragment}`;
}

export type AuthMode = 'login' | 'register' | 'forgot-password';

/** `navigate('/auth', { state: { mode: 'forgot-password' } })` opens the reset request form. */
export function initialAuthMode(state: unknown, fallback: AuthMode = 'login'): AuthMode {
  const mode = state && typeof state === 'object' ? (state as { mode?: unknown }).mode : undefined;
  return mode === 'forgot-password' ? 'forgot-password' : fallback;
}
