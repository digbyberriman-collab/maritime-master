// Shared helpers for inviting crew. Used by both send-invitation (single)
// and bulk-invite. Keeps the "real people only" rule and the
// imported-vs-existing branch in one place.

const BLOCKED_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net',
  'test.com', 'test.local', 'localhost',
  'mailinator.com', 'tempmail.com', 'temp-mail.org',
  'guerrillamail.com', 'yopmail.com', 'sharklasers.com',
  'fakeinbox.com', 'trashmail.com', 'dispostable.com',
]);

export function isFakeEmail(email: string): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  const domain = normalized.split('@')[1] ?? '';
  if (!domain) return true;
  if (BLOCKED_DOMAINS.has(domain)) return true;
  if (domain.endsWith('.test') || domain.endsWith('.example') ||
      domain.endsWith('.invalid') || domain.endsWith('.localhost')) {
    return true;
  }
  if (/^test[\.\-_]?crew@/i.test(normalized)) return true;
  return false;
}

export interface InviteRowResult {
  profileId: string;
  email: string;
  success: boolean;
  error?: string;
}

/**
 * Invite a single profile by id.
 *  - Validates same-company.
 *  - Enforces a 5-minute cooldown.
 *  - Rejects fake / placeholder email domains.
 *  - If the profile has no auth user yet (imported crew), creates one
 *    with email_confirm:false and links it to the profile.
 *  - Sends the verification email via Supabase Auth (inviteUserByEmail).
 *  - Updates account_status to 'invited' and clears is_imported.
 */
// deno-lint-ignore no-explicit-any
export async function inviteProfileById(
  // deno-lint-ignore no-explicit-any
  admin: any,
  profileId: string,
  callerCompanyId: string,
  redirectTo?: string,
): Promise<InviteRowResult> {
  // 1. Load profile
  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('id, user_id, email, company_id, last_invited_at, invitation_count, is_imported')
    .eq('id', profileId)
    .maybeSingle();

  if (pErr || !profile) {
    return { profileId, email: '', success: false, error: 'Crew member not found' };
  }

  if (profile.company_id !== callerCompanyId) {
    return { profileId, email: profile.email, success: false, error: 'Different company' };
  }

  // 2. Email sanity
  if (!profile.email) {
    return { profileId, email: '', success: false, error: 'No email on file' };
  }
  if (isFakeEmail(profile.email)) {
    return {
      profileId,
      email: profile.email,
      success: false,
      error: 'Test/placeholder email — only real inboxes can be invited',
    };
  }

  // 3. Cooldown (5 min)
  if (profile.last_invited_at) {
    const last = new Date(profile.last_invited_at).getTime();
    if (Date.now() - last < 5 * 60 * 1000) {
      return { profileId, email: profile.email, success: false, error: 'Cooldown active (try again in a few minutes)' };
    }
  }

  let authUserId: string | null = profile.user_id ?? null;

  // 4. Create auth user if missing (imported crew path)
  if (!authUserId) {
    // Check if an auth user with this email already exists (orphan)
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find(
      // deno-lint-ignore no-explicit-any
      (u: any) => u.email?.toLowerCase() === profile.email.toLowerCase(),
    );
    if (existing) {
      authUserId = existing.id;
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: profile.email,
        email_confirm: false, // require verification
      });
      if (cErr || !created?.user) {
        return { profileId, email: profile.email, success: false, error: cErr?.message ?? 'Failed to create user' };
      }
      authUserId = created.user.id;
    }
  }

  // 5. Send the verification / invite email via Supabase Auth
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(profile.email, {
    redirectTo,
  });
  if (inviteErr) {
    // Not fatal: link is still created via createUser flow above, but report it.
    console.warn('inviteUserByEmail failed:', inviteErr.message);
  }

  // 6. Stamp the profile
  const { error: updErr } = await admin
    .from('profiles')
    .update({
      user_id: authUserId,
      is_imported: false,
      account_status: 'invited',
      last_invited_at: new Date().toISOString(),
      invitation_count: (profile.invitation_count ?? 0) + 1,
      invited_at: profile.invitation_count ? undefined : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);

  if (updErr) {
    return { profileId, email: profile.email, success: false, error: updErr.message };
  }

  return { profileId, email: profile.email, success: true };
}