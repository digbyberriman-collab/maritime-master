export interface PersonLite {
  user_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  rank?: string | null;
  position?: string | null;
}

export const personDisplayName = (p: PersonLite | null | undefined): string => {
  if (!p) return '';
  const first = p.preferred_name || p.first_name || '';
  return `${first} ${p.last_name ?? ''}`.trim() || p.email || '';
};

export const personInitials = (p: PersonLite | null | undefined): string =>
  p ? `${(p.preferred_name || p.first_name || '')[0] ?? ''}${(p.last_name || '')[0] ?? ''}`.toUpperCase() || '?' : '?';

/** Map user id → display name with a fallback for unknown ids. */
export const makeNameLookup = (people: PersonLite[]): ((userId: string | null | undefined) => string) => {
  const byId = new Map(people.filter((p) => p.user_id).map((p) => [p.user_id as string, personDisplayName(p)]));
  return (userId) => (userId ? byId.get(userId) ?? 'Unknown user' : '');
};
