/**
 * Status-update threads (gap/08 §D, TH1–TH3).
 *
 * Entry types:
 *   update   company or vessel; optional follow-up date
 *   request  company; due date required
 *   reply    vessel; answers a request
 *   system   engine-written (status changes, signatures, reminders, nudges)
 *
 * Request lifecycle:
 *   open ──vessel Reply──▶ open (replied) ──company Mark done──▶ done
 *   open ──company Change date (reason)──▶ open (new due date; history kept)
 *   open ──company Cancel (reason)──▶ cancelled
 *   done and cancelled are final.
 *
 * Entries are append-only: "Edit" posts a new entry that replaces the old
 * one (the old one shows "edited"); nothing is deleted. Close and sign-off
 * are blocked while any request is open.
 *
 * Pure: the server (`post_record_update`, `resolve_status_request`) is the
 * authority; these functions mirror its rules.
 */
import { daysBetween, instant, isCalendarDate } from './dates';
import { fail, ok, type EngineResult, type EntryParty, type Party } from './types';

export type ThreadEntryType = 'update' | 'request' | 'reply' | 'system';
export type RequestState = 'open' | 'done' | 'cancelled';
/** `open` split into replied / not replied, for display and whose-move. */
export type RequestDisplayState = 'open' | 'replied' | 'done' | 'cancelled';

export const MAX_ENTRY_LENGTH = 5000;

export interface DueChange {
  /** The due date before the change. */
  from: string;
  to: string;
  reason: string;
  changedAt: string;
  changedBy: string | null;
}

export interface ThreadEntry {
  id: string;
  type: ThreadEntryType;
  party: EntryParty;
  authorProfileId: string | null;
  body: string;
  createdAt: string;
  /** update: optional follow-up date (`yyyy-MM-dd`). */
  followUpDue?: string | null;
  /** request: due date (`yyyy-MM-dd`). */
  requestDue?: string | null;
  requestState?: RequestState;
  requestResolvedAt?: string | null;
  requestResolvedBy?: string | null;
  resolutionNote?: string | null;
  /** request: earlier due dates and why they changed. */
  dueHistory?: readonly DueChange[];
  /** reply: the request it answers. */
  parentId?: string | null;
  /** edit: the entry this one replaces. */
  replacesId?: string | null;
}

export interface Thread {
  entries: readonly ThreadEntry[];
}

export interface ThreadActor {
  party: Party;
  profileId: string;
}

export type ThreadErrorCode =
  | 'empty_body'
  | 'body_too_long'
  | 'invalid_date'
  | 'wrong_party'
  | 'unknown_entry'
  | 'not_a_request'
  | 'request_closed'
  | 'reason_required'
  | 'same_date'
  | 'not_author'
  | 'already_edited'
  | 'not_editable';

export type ThreadResult = EngineResult<Thread, ThreadErrorCode>;

export const emptyThread = (): Thread => ({ entries: [] });

// ─── Lookups ──────────────────────────────────────────────────────────────

const byTime = (a: ThreadEntry, b: ThreadEntry) => instant(a.createdAt) - instant(b.createdAt);

export function findEntry(thread: Thread, id: string): ThreadEntry | undefined {
  return thread.entries.find((e) => e.id === id);
}

/** Entries oldest first. */
export function chronological(thread: Thread): ThreadEntry[] {
  return [...thread.entries].sort(byTime);
}

export function repliesTo(thread: Thread, requestId: string): ThreadEntry[] {
  return thread.entries.filter((e) => e.type === 'reply' && e.parentId === requestId).sort(byTime);
}

/** open / replied / done / cancelled for a request entry. */
export function requestDisplayState(thread: Thread, request: ThreadEntry): RequestDisplayState {
  const state = request.requestState ?? 'open';
  if (state !== 'open') return state;
  return repliesTo(thread, request.id).length > 0 ? 'replied' : 'open';
}

/** Requests still open (replied or not). */
export function openRequests(thread: Thread): ThreadEntry[] {
  return thread.entries.filter((e) => e.type === 'request' && (e.requestState ?? 'open') === 'open');
}

/** True when an entry has been replaced by an edit. */
export function isEdited(thread: Thread, entryId: string): boolean {
  return thread.entries.some((e) => e.replacesId === entryId);
}

/** The thread as people read it: latest version of each entry, oldest first, with an `edited` flag. */
export function visibleEntries(thread: Thread): Array<ThreadEntry & { edited: boolean }> {
  return chronological(thread)
    .filter((e) => !isEdited(thread, e.id))
    .map((e) => ({ ...e, edited: Boolean(e.replacesId) }));
}

/** Newest entry written by a person (not the engine). */
export function latestHumanEntry(thread: Thread): ThreadEntry | undefined {
  const human = thread.entries.filter((e) => e.type !== 'system');
  return human.length ? [...human].sort(byTime)[human.length - 1] : undefined;
}

/** Timestamp of the newest entry ("last update" on headers and lists). */
export function lastUpdateAt(thread: Thread): string | null {
  if (!thread.entries.length) return null;
  return chronological(thread)[thread.entries.length - 1].createdAt;
}

// ─── Follow-up and close gate ─────────────────────────────────────────────

/**
 * Follow-up due (gap/08 §D): the earliest due date among open requests
 * (shown red once past); otherwise the follow-up date of the newest update
 * that set one, while it has not passed. A newer update's plan replaces an
 * older one.
 */
export function followUpDue(thread: Thread, today: string): string | null {
  const dues = openRequests(thread)
    .map((r) => r.requestDue)
    .filter((d): d is string => isCalendarDate(d));
  if (dues.length) return [...dues].sort()[0];
  const withFollowUp = chronological(thread).filter((e) => e.type === 'update' && isCalendarDate(e.followUpDue) && !isEdited(thread, e.id));
  const newest = withFollowUp[withFollowUp.length - 1];
  if (!newest) return null;
  return daysBetween(today, newest.followUpDue as string) >= 0 ? (newest.followUpDue as string) : null;
}

/** True when the follow-up date has passed (only an open request can be overdue). */
export function isFollowUpOverdue(thread: Thread, today: string): boolean {
  const due = followUpDue(thread, today);
  return due !== null && daysBetween(today, due) < 0;
}

/** Close and sign-off are blocked while any request is open. */
export function closeBlockedByRequests(thread: Thread): { blocked: boolean; openCount: number; message: string | null } {
  const openCount = openRequests(thread).length;
  if (openCount === 0) return { blocked: false, openCount, message: null };
  const message =
    openCount === 1
      ? '1 open request — mark it done or cancel it first'
      : `${openCount} open requests — mark them done or cancel them first`;
  return { blocked: true, openCount, message };
}

// ─── Actions ──────────────────────────────────────────────────────────────

function checkBody(body: string): { code: ThreadErrorCode; message: string } | null {
  const text = (body ?? '').trim();
  if (!text) return { code: 'empty_body', message: 'Write something first.' };
  if (text.length > MAX_ENTRY_LENGTH) return { code: 'body_too_long', message: `Keep it to ${MAX_ENTRY_LENGTH} characters or fewer.` };
  return null;
}

const append = (thread: Thread, entry: ThreadEntry): Thread => ({ entries: [...thread.entries, entry] });

const replaceEntry = (thread: Thread, id: string, patch: Partial<ThreadEntry>): Thread => ({
  entries: thread.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
});

/** Post an update (company or vessel), with an optional follow-up date. */
export function postUpdate(
  thread: Thread,
  input: { id: string; body: string; at: string; followUpDue?: string | null },
  actor: ThreadActor,
): ThreadResult {
  const bad = checkBody(input.body);
  if (bad) return fail(bad.code, bad.message);
  if (input.followUpDue && !isCalendarDate(input.followUpDue)) return fail('invalid_date', 'Enter a valid follow-up date.');
  return ok(
    append(thread, {
      id: input.id,
      type: 'update',
      party: actor.party,
      authorProfileId: actor.profileId,
      body: input.body.trim(),
      createdAt: input.at,
      followUpDue: input.followUpDue || null,
    }),
  );
}

/** Company asks the vessel for something by a due date. */
export function postRequest(
  thread: Thread,
  input: { id: string; body: string; at: string; dueOn: string },
  actor: ThreadActor,
): ThreadResult {
  if (actor.party !== 'company') return fail('wrong_party', 'Only the company can post a request.');
  const bad = checkBody(input.body);
  if (bad) return fail(bad.code, bad.message);
  if (!isCalendarDate(input.dueOn)) return fail('invalid_date', 'A request needs a valid due date.');
  return ok(
    append(thread, {
      id: input.id,
      type: 'request',
      party: 'company',
      authorProfileId: actor.profileId,
      body: input.body.trim(),
      createdAt: input.at,
      requestDue: input.dueOn,
      requestState: 'open',
      dueHistory: [],
    }),
  );
}

function openRequestOrError(thread: Thread, requestId: string): ThreadEntry | { code: ThreadErrorCode; message: string } {
  const request = findEntry(thread, requestId);
  if (!request) return { code: 'unknown_entry', message: 'That request no longer exists.' };
  if (request.type !== 'request') return { code: 'not_a_request', message: 'That entry is not a request.' };
  if ((request.requestState ?? 'open') !== 'open') return { code: 'request_closed', message: `That request is already ${request.requestState}.` };
  return request;
}

/** Vessel replies to an open request. The request stays open until the company marks it done. */
export function postReply(
  thread: Thread,
  input: { id: string; requestId: string; body: string; at: string },
  actor: ThreadActor,
): ThreadResult {
  if (actor.party !== 'vessel') return fail('wrong_party', 'Only the vessel replies to a request.');
  const bad = checkBody(input.body);
  if (bad) return fail(bad.code, bad.message);
  const request = openRequestOrError(thread, input.requestId);
  if ('code' in request) return fail(request.code, request.message);
  return ok(
    append(thread, {
      id: input.id,
      type: 'reply',
      party: 'vessel',
      authorProfileId: actor.profileId,
      body: input.body.trim(),
      createdAt: input.at,
      parentId: request.id,
    }),
  );
}

/** Company marks an open request done (replied or not). */
export function markRequestDone(
  thread: Thread,
  input: { requestId: string; at: string; note?: string | null },
  actor: ThreadActor,
): ThreadResult {
  if (actor.party !== 'company') return fail('wrong_party', 'Only the company can mark a request done.');
  const request = openRequestOrError(thread, input.requestId);
  if ('code' in request) return fail(request.code, request.message);
  return ok(
    replaceEntry(thread, request.id, {
      requestState: 'done',
      requestResolvedAt: input.at,
      requestResolvedBy: actor.profileId,
      resolutionNote: input.note?.trim() || null,
    }),
  );
}

/** Company moves an open request's due date (reason required; history kept). */
export function changeRequestDue(
  thread: Thread,
  input: { requestId: string; newDue: string; reason: string; at: string },
  actor: ThreadActor,
): ThreadResult {
  if (actor.party !== 'company') return fail('wrong_party', 'Only the company can change a due date.');
  const request = openRequestOrError(thread, input.requestId);
  if ('code' in request) return fail(request.code, request.message);
  if (!isCalendarDate(input.newDue)) return fail('invalid_date', 'Enter a valid due date.');
  if (!input.reason?.trim()) return fail('reason_required', 'Say why the date is changing.');
  if (input.newDue === request.requestDue) return fail('same_date', 'That is already the due date.');
  const change: DueChange = {
    from: request.requestDue as string,
    to: input.newDue,
    reason: input.reason.trim(),
    changedAt: input.at,
    changedBy: actor.profileId,
  };
  return ok(replaceEntry(thread, request.id, { requestDue: input.newDue, dueHistory: [...(request.dueHistory ?? []), change] }));
}

/** Company cancels an open request (reason required). */
export function cancelRequest(
  thread: Thread,
  input: { requestId: string; reason: string; at: string },
  actor: ThreadActor,
): ThreadResult {
  if (actor.party !== 'company') return fail('wrong_party', 'Only the company can cancel a request.');
  const request = openRequestOrError(thread, input.requestId);
  if ('code' in request) return fail(request.code, request.message);
  if (!input.reason?.trim()) return fail('reason_required', 'Say why the request is cancelled.');
  return ok(
    replaceEntry(thread, request.id, {
      requestState: 'cancelled',
      requestResolvedAt: input.at,
      requestResolvedBy: actor.profileId,
      resolutionNote: input.reason.trim(),
    }),
  );
}

/**
 * Edit = a new entry that replaces the old one. Only the author edits, only
 * the newest version, never a system entry. Requests keep their state and
 * due date (they live on the original row); only the text changes.
 */
export function editEntry(
  thread: Thread,
  input: { id: string; replacesId: string; body: string; at: string },
  actor: ThreadActor,
): ThreadResult {
  const original = findEntry(thread, input.replacesId);
  if (!original) return fail('unknown_entry', 'That entry no longer exists.');
  if (original.type === 'system') return fail('not_editable', 'Engine entries cannot be edited.');
  if (original.type === 'request') return fail('not_editable', 'Change a request with "Change date" or "Cancel", or post an update.');
  if (original.authorProfileId !== actor.profileId) return fail('not_author', 'Only the author can edit an entry.');
  if (isEdited(thread, original.id)) return fail('already_edited', 'Edit the newest version of this entry.');
  const bad = checkBody(input.body);
  if (bad) return fail(bad.code, bad.message);
  return ok(
    append(thread, {
      ...original,
      id: input.id,
      body: input.body.trim(),
      createdAt: input.at,
      replacesId: original.id,
    }),
  );
}

/** Engine entry (status change, signature, reminder, nudge, export). */
export function appendSystemEntry(thread: Thread, input: { id: string; body: string; at: string }): Thread {
  return append(thread, { id: input.id, type: 'system', party: 'system', authorProfileId: null, body: input.body, createdAt: input.at });
}
