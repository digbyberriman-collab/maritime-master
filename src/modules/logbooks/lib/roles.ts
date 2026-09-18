/**
 * Maps platform roles to the author / signing capacities the logbook templates
 * use. Strict onboard mapping: only the Master (captain) signs as Master and
 * seals pages; shore and audit roles read and export but never sign.
 *
 * Both role sources are honoured: the RBAC `user_roles` assignments (app_role)
 * and the legacy `profiles.role` value. The database RPCs apply the same
 * mapping server-side, so a client cannot widen its own capacity.
 */
import type { ActorCapacity, TemplateSection } from './templates';
import type { LogbookBook } from './catalog';

export type CrewCapacity = Extract<ActorCapacity, 'master' | 'officer' | 'engineer' | 'steward'>;
export type ExternalCapacity = Extract<ActorCapacity, 'mother' | 'surveyor' | 'portofficial'>;

const MASTER_ROLES = ['captain', 'master'];
const OFFICER_ROLES = ['chief_officer', 'officer'];
const ENGINEER_ROLES = ['chief_engineer'];
/** Crew-witness capacity: interior, purser and heads of department who are not deck or engine officers. */
const STEWARD_ROLES = ['crew', 'purser', 'hod'];
export const READ_ONLY_ROLES = ['superadmin', 'dpa', 'fleet_master', 'shore_management', 'auditor_flag', 'auditor_class', 'travel_agent', 'employer_api'];

export const EXTERNAL_CAPACITY_LABELS: Record<ExternalCapacity, string> = {
  mother: 'Mother',
  surveyor: 'Authorised surveyor',
  portofficial: 'Port official',
};

export const CAPACITY_LABELS: Record<ActorCapacity, string> = {
  master: 'Master', officer: 'Deck officer', engineer: 'Engineer', steward: 'Crew witness', ...EXTERNAL_CAPACITY_LABELS,
};

/** Resolve the crew capacity for a set of RBAC role names. The strongest capacity wins. */
export function capacityFor(roles: Array<string | null | undefined>): CrewCapacity | null {
  const set = new Set(roles.filter((role): role is string => Boolean(role)));
  const has = (list: string[]) => list.some((role) => set.has(role));
  if (has(MASTER_ROLES)) return 'master';
  if (has(OFFICER_ROLES)) return 'officer';
  if (has(ENGINEER_ROLES)) return 'engineer';
  if (has(STEWARD_ROLES)) return 'steward';
  return null;
}

/**
 * Mirrors public.logbook_capacity(): the RBAC roles decide when any of them maps
 * to a capacity; the legacy profile role is only a fallback.
 */
export function resolveCapacity(rbacRoles: Array<string | null | undefined>, legacyRole: string | null | undefined): CrewCapacity | null {
  return capacityFor(rbacRoles) ?? legacyCapacity(legacyRole);
}

/** The legacy profiles.role values the database maps; anything else has no capacity. */
const LEGACY_CAPACITY: Record<string, CrewCapacity> = { master: 'master', chief_officer: 'officer', chief_engineer: 'engineer', crew: 'steward' };
export const legacyCapacity = (role: string | null | undefined): CrewCapacity | null => (role ? LEGACY_CAPACITY[role] ?? null : null);

export const isMaster = (capacity: ActorCapacity | null | undefined) => capacity === 'master';

/** Whether the capacity may author lines in this book. The Master may write in every book. */
export const canWriteBook = (capacity: ActorCapacity | null | undefined, book: LogbookBook | undefined) =>
  Boolean(capacity && book && (capacity === 'master' || book.roles.includes(capacity)));

/** Whether the capacity may author lines in this section (sections may restrict authorship further; the Master is exempt, as in the database). */
export const canWriteSection = (capacity: ActorCapacity | null | undefined, section: TemplateSection | undefined) =>
  Boolean(capacity && section && (capacity === 'master' || !section.roles || section.roles.includes(capacity)));

export const canWrite = (capacity: ActorCapacity | null | undefined, book: LogbookBook | undefined, section: TemplateSection | undefined) =>
  canWriteBook(capacity, book) && canWriteSection(capacity, section);

/** Roles allowed to maintain the vessel registry and open, close or continue volumes. */
export const canAdministerVolumes = (capacity: ActorCapacity | null | undefined) => capacity === 'master';

export const isReadOnlyRole = (roles: Array<string | null | undefined>) =>
  capacityFor(roles) === null && roles.some((role) => role && READ_ONLY_ROLES.includes(role));
