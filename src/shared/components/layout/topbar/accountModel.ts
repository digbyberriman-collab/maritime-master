/**
 * Labels and links for the account menu (spec §6.6), kept apart from the
 * component so tests and the personal-area routes read the same values.
 */

/** User kind as the account menu names it: the legacy `profiles.role`. */
export const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  master: 'Master',
  captain: 'Captain',
  chief_engineer: 'Chief Engineer',
  chief_officer: 'Chief Officer',
  crew: 'Crew',
  dpa: 'DPA',
  shore_management: 'Shore Management',
});

/**
 * Where the account menu's items go. The personal area moves to one URL per
 * section (`/me/<section>`, BUILD-PLAN S6); Branding keeps its own route.
 */
export const ACCOUNT_PATHS = Object.freeze({
  profile: '/me/profile',
  security: '/me/security',
  appearance: '/me/appearance',
  favourites: '/me/shortcuts',
  branding: '/settings/branding',
});

interface ProfileLike {
  first_name?: string | null;
  last_name?: string | null;
}

/** Two initials, or "U" when the profile has no name. */
export function accountInitials(profile: ProfileLike | null | undefined): string {
  const initials = `${profile?.first_name?.trim()?.[0] ?? ''}${profile?.last_name?.trim()?.[0] ?? ''}`.toUpperCase();
  return initials || 'U';
}

/**
 * The job role line: `job_title`, else `position`. Both are `profiles`
 * columns the profile row carries (it is read with `select('*')`), though the
 * auth context's Profile type does not list them.
 */
export function jobRoleOf(profile: object | null | undefined): string | null {
  if (!profile) return null;
  const row = profile as { job_title?: unknown; position?: unknown };
  const pick = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return pick(row.job_title) ?? pick(row.position);
}
