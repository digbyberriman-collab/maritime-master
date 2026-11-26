/**
 * What `development_transition()` answers, checked before anything says
 * "done" (no fake success), and how its refusals read. Kept apart from the
 * mutation hooks so the hooks file holds only the calls (and the D-X5-20
 * fallback writes).
 */
import type { PostgrestError } from '@supabase/supabase-js';
import type { Json } from '@/integrations/supabase/types';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { normaliseError } from '@/shared/lib/notify';
import {
  APPLICATION_ACTIONS,
  APPLICATION_ACTORS,
  TRANSITION_NOT_SET_UP,
  isApplicationStatus,
  transitionRefusalMessage,
  type ApplicationAction,
  type ApplicationActor,
  type ApplicationStatus,
} from '../lib/applicationMachine';

/** The parts of the answer the client relies on. */
export interface TransitionResult {
  id: string;
  status: ApplicationStatus;
  fromStatus: ApplicationStatus | null;
  action: ApplicationAction;
  actorRole: ApplicationActor | null;
  eventId: string | null;
  updatedAt: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * The answer for `applicationId`, or null when it is not a transition of
 * that application (another id, an unknown status or action): the caller
 * then reports that nothing was confirmed, never success.
 */
export function parseTransitionResult(value: Json | null | undefined, applicationId: string): TransitionResult | null {
  if (!isObject(value)) return null;
  const status = value.status;
  const action = value.action;
  if (value.id !== applicationId || !isApplicationStatus(status)) return null;
  if (typeof action !== 'string' || !(APPLICATION_ACTIONS as readonly string[]).includes(action)) return null;
  const from = value.from_status;
  const role = value.actor_role;
  return {
    id: applicationId,
    status,
    fromStatus: isApplicationStatus(from) ? from : null,
    action: action as ApplicationAction,
    actorRole: typeof role === 'string' && (APPLICATION_ACTORS as readonly string[]).includes(role) ? (role as ApplicationActor) : null,
    eventId: str(value.event_id),
    updatedAt: str(value.updated_at),
  };
}

/** development_transition is not in the database and the action has no D-X5-20 fallback. */
export class TransitionNotSetUpError extends Error {
  constructor() {
    super(TRANSITION_NOT_SET_UP);
    this.name = 'TransitionNotSetUpError';
  }
}

/** The server answered without confirming the change. */
export class TransitionUnconfirmedError extends Error {
  constructor() {
    super('The application did not confirm the change. Reload it to see where it stands.');
    this.name = 'TransitionUnconfirmedError';
  }
}

/** True when a call failed because development_transition is missing (D-01). */
export const isTransitionMissing = (error: Pick<PostgrestError, 'code' | 'message'> | null | undefined): boolean => isMissingRelation(error ?? null);

/** The sentence for a failed transition: the definer's refusal in words, else the normalised error. */
export function transitionErrorMessage(error: unknown): string {
  if (error instanceof TransitionNotSetUpError || error instanceof TransitionUnconfirmedError) return error.message;
  const message = isObject(error) && typeof error.message === 'string' ? error.message : error instanceof Error ? error.message : null;
  return transitionRefusalMessage(message) ?? normaliseError(error).message;
}
