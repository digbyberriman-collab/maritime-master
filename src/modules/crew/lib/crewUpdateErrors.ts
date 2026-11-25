/**
 * Crew edit honesty (finding crew-edit-guard-refusal-fake-success;
 * non-negotiable 9).
 *
 * A crew edit writes two rows: the profile, then the current
 * crew_assignments row (position, join date). The Phase 2 guards refuse
 * some of those writes with 42501 and a DETAIL sentence:
 *
 *   crew_assignments  master_office_change_refused  appointing or removing a Master / Captain
 *                     self_office_change_refused    your own position or rank
 *   profiles          profile_access_columns_locked the position, rank or joining date of a
 *                                                   pending crew member, and the access columns
 *
 * The user reads the DETAIL (or the notify copy), never the snake_case
 * MESSAGE; a refused assignment after a saved profile is reported as
 * "Partly saved", never as success.
 */
import { normaliseError } from '@/shared/lib/notify';

/** The guards' sentences, mirrored in the edit form so the lock reads the same before and after a save. */
export const MASTER_OFFICE_MESSAGE = 'Only a users-access administrator of the vessel can appoint or remove a Master.';
export const OWN_POSITION_MESSAGE = 'Only a users-access administrator can change your own position.';
export const PENDING_PLACEMENT_MESSAGE = 'Only a users-access administrator of the pending vessel can change this.';
/** An assignment update that matched no row (filtered by RLS, or the row is gone). */
export const ASSIGNMENT_NOT_CHANGED_MESSAGE = "You can't change this assignment.";
/** A refusal that came back as a bare code. Same copy as notify's 42501. */
export const NO_PERMISSION_MESSAGE = "You don't have permission to do that.";

const CODE_LIKE = /^[a-z0-9_]+$/;

/**
 * The profile was saved; the assignment change (position or join date) was
 * refused. Thrown by updateCrewMember after the profile write succeeded.
 */
export class CrewUpdatePartialError extends Error {
  readonly profileSaved = true as const;
  readonly reason: string;

  constructor(reason: string) {
    super(`Profile saved. The position change was refused: ${reason}`);
    this.name = 'CrewUpdatePartialError';
    this.reason = reason;
  }
}

interface PostgrestLike {
  code?: unknown;
  details?: unknown;
}

/**
 * One STORM sentence for a refused crew write. A 42501 with a DETAIL is a
 * guard refusal: the DETAIL is the sentence. Anything else goes through
 * notify's normaliser. A result that is still a code (a guard MESSAGE
 * without its DETAIL) becomes the permission sentence.
 */
export function crewRefusalMessage(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const { code, details } = error as PostgrestLike;
    const detail = typeof details === 'string' ? details.trim() : '';
    if (code === '42501' && detail && !CODE_LIKE.test(detail)) return detail;
  }
  const message = normaliseError(error).message;
  return CODE_LIKE.test(message) ? NO_PERMISSION_MESSAGE : message;
}

/**
 * The office key the guards compare, normalised as the SQL does
 * (record_normalise_office): ASCII lower-case, every run of characters
 * outside [a-z0-9] becomes '_', leading and trailing '_' trimmed.
 */
export function normaliseOffice(text: string | null | undefined): string {
  const lowered = (text ?? '').trim().replace(/[A-Z]/g, (c) => c.toLowerCase());
  return lowered.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** True for the Master office: a normalised position of master or captain. */
export function isMasterOffice(text: string | null | undefined): boolean {
  const office = normaliseOffice(text);
  return office === 'master' || office === 'captain';
}

/**
 * useCrew builds a "current assignment" for an imported profile from
 * profiles.imported_vessel_id (its pending vessel placement). It is not a
 * crew_assignments row, so it is never written as one.
 */
export const PENDING_PLACEMENT_ID_PREFIX = 'imported-';

export function isPendingPlacementAssignment(
  assignment: { id: string; pending_placement?: boolean } | null | undefined,
): boolean {
  if (!assignment) return false;
  return assignment.pending_placement === true || assignment.id.startsWith(PENDING_PLACEMENT_ID_PREFIX);
}
