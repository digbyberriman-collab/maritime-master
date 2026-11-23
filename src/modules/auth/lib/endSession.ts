/**
 * Ending the signed-in session: the one sign-out every surface uses (the
 * account menu and the command palette through AuthContext.signOut, the
 * refit session diagnostics page directly).
 *
 * Fails closed (D-04) and never fakes success. supabase-js `signOut()`
 * revokes the session on the server (POST /logout) and only then removes the
 * stored session. When the revoke fails for any reason other than 401, 403
 * or 404 (offline, a 5xx, a timeout), or the stored session cannot be
 * loaded, it returns `{ error }` and KEEPS the stored session: the screen
 * looks signed out, but a reload, or the refresh ticker in the same tab,
 * signs the user straight back in.
 *
 * `signOut({ scope: 'local' })` is no way out: it POSTs /logout as well and
 * fails the same way offline.
 *
 * So when the revoke fails, the session is removed on this device without
 * any network call: the stored value is made invalid and the client is asked
 * for its session, so supabase-js runs its own `_removeSession`. That removes
 * the token, `-code-verifier` and `-user` keys, emits SIGNED_OUT (to
 * AuthContext's listener and, over its broadcast channel, to other tabs) and
 * leaves the refresh ticker with no refresh token to use. If a session is
 * still there afterwards, the keys are removed directly. The user is told
 * that only this device was signed out, since the server could not be
 * reached to end their other sessions.
 */
import { supabase } from '@/integrations/supabase/client';
import { brokeredPreviewStorage, type PreviewAuthStorage } from '@/integrations/supabase/previewAuthStorage';
import { notify } from '@/shared/lib/notify';

export type EndSessionResult = 'signed-out' | 'signed-out-on-this-device';

export const SIGNED_OUT_LOCALLY_MESSAGE =
  'Signed out on this device. STORM could not reach the server, so your other sessions are still signed in.';

/**
 * The key supabase-js stores the session under by default:
 * `sb-<first label of the API host>-auth-token` (e.g. `sb-127-auth-token`
 * for http://127.0.0.1:54321). Null when the URL does not parse.
 */
export function authStorageKey(url: string | undefined = import.meta.env.VITE_SUPABASE_URL): string | null {
  try {
    if (!url) return null;
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** The storage the client was created with (the preview broker, else localStorage); null if none is reachable. */
function authStorage(): PreviewAuthStorage | null {
  try {
    return brokeredPreviewStorage() ?? window.localStorage;
  } catch {
    return null;
  }
}

/** Every session key on this origin, for when the client's own key cannot be derived. */
function storedSessionKeys(): string[] {
  try {
    return Object.keys(window.localStorage).filter((k) => /^sb-.+-auth-token$/.test(k));
  } catch {
    return [];
  }
}

async function hasStoredSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    // Unknown is not signed out.
    return true;
  }
}

async function removeKey(storage: PreviewAuthStorage, key: string): Promise<void> {
  try {
    await storage.removeItem(key);
  } catch {
    // Nothing more can be done for this key.
  }
}

/** Remove the stored session on this device, without any network call. */
async function dropLocalSession(): Promise<void> {
  const key = authStorageKey();
  const storage = authStorage();
  if (key && storage) {
    try {
      await storage.setItem(key, '{}');
    } catch {
      // Fall through to the direct removal below.
    }
    try {
      // Finds an invalid session and runs the client's own _removeSession.
      await supabase.auth.getSession();
    } catch {
      // Checked below.
    }
  }

  // Fail closed: whatever is still stored goes, key by key.
  if (!storage || !(await hasStoredSession())) return;
  const keys = key ? [key] : storedSessionKeys();
  for (const k of keys) {
    await removeKey(storage, k);
    await removeKey(storage, `${k}-code-verifier`);
    await removeKey(storage, `${k}-user`);
  }
}

/**
 * Sign out. `signed-out`: the server revoked the session and the client
 * removed it. `signed-out-on-this-device`: the server could not be reached,
 * the session was removed here, and the user has been told (see the header).
 */
export async function endSession(): Promise<EndSessionResult> {
  let failed = false;
  try {
    const { error } = await supabase.auth.signOut();
    failed = Boolean(error);
  } catch {
    failed = true;
  }
  if (!failed) return 'signed-out';

  await dropLocalSession();
  notify.warning(SIGNED_OUT_LOCALLY_MESSAGE);
  return 'signed-out-on-this-device';
}
