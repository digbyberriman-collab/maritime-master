/**
 * "Whose move" (gap/08 §A, TH3): the chip on every record header and list.
 *
 * The server stores it on the envelope and recomputes it by trigger; this is
 * the display mirror, tested against the same rules:
 *
 * 1. closed or void → none
 * 2. a company request is open without a reply → vessel
 * 3. every open request has a vessel reply → company (it is the company's
 *    turn to mark them done; covers "newest entry is a vessel reply to an
 *    open request")
 * 4. status submitted / awaiting_company_close → company
 * 5. status open / in_review / info_requested → vessel
 * 6. otherwise (acknowledged): the side that did not post last; vessel when
 *    nobody has posted
 *
 * Open requests are checked before the status (STORM decision): a company
 * question to the vessel makes it the vessel's move even while the record
 * waits for company sign-off.
 */
import { latestHumanEntry, openRequests, repliesTo, type Thread } from './threads';
import type { EnvelopeStatus, WhoseMove } from './types';

const COMPANY_STATUSES: ReadonlySet<EnvelopeStatus> = new Set(['submitted', 'awaiting_company_close']);
const VESSEL_STATUSES: ReadonlySet<EnvelopeStatus> = new Set(['open', 'in_review', 'info_requested']);

export interface WhoseMoveInput {
  status: EnvelopeStatus;
  thread?: Thread | null;
}

export function whoseMove({ status, thread }: WhoseMoveInput): WhoseMove {
  if (status === 'closed' || status === 'void') return 'none';

  const t = thread ?? { entries: [] };
  const open = openRequests(t);
  if (open.some((r) => repliesTo(t, r.id).length === 0)) return 'vessel';
  if (open.length > 0) return 'company';

  if (COMPANY_STATUSES.has(status)) return 'company';
  if (VESSEL_STATUSES.has(status)) return 'vessel';

  const last = latestHumanEntry(t);
  if (!last || last.party === 'system') return 'vessel';
  return last.party === 'vessel' ? 'company' : 'vessel';
}

/** Header chip copy (gap/08 "Standard record page"). */
export function whoseMoveLabel(move: WhoseMove, status?: EnvelopeStatus): string {
  if (move === 'vessel') return 'Waiting on vessel';
  if (move === 'company') return 'Waiting on company';
  return status === 'void' ? 'Voided' : 'Closed';
}
