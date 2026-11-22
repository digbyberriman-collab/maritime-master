import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRY_LENGTH,
  appendSystemEntry,
  cancelRequest,
  changeRequestDue,
  closeBlockedByRequests,
  editEntry,
  emptyThread,
  findEntry,
  followUpDue,
  isEdited,
  isFollowUpOverdue,
  lastUpdateAt,
  markRequestDone,
  openRequests,
  postReply,
  postRequest,
  postUpdate,
  requestDisplayState,
  visibleEntries,
  type Thread,
  type ThreadActor,
} from '@/lib/records/threads';

const COMPANY: ThreadActor = { party: 'company', profileId: 'p-shore' };
const VESSEL: ThreadActor = { party: 'vessel', profileId: 'p-master' };

const must = <T,>(r: { ok: boolean; value?: T; error?: { code: string } }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.value;
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);

const at = (h: number) => `2026-11-22T${String(h).padStart(2, '0')}:00:00Z`;

const withRequest = (due = '2026-11-25'): Thread =>
  must(postRequest(emptyThread(), { id: 'req-1', body: 'Send photos of the repaired rail', at: at(8), dueOn: due }, COMPANY));

describe('posting', () => {
  it('either side posts updates, with an optional follow-up date', () => {
    let t = must(postUpdate(emptyThread(), { id: 'u1', body: '  Parts ordered  ', at: at(8), followUpDue: '2026-12-01' }, VESSEL));
    t = must(postUpdate(t, { id: 'u2', body: 'Noted', at: at(9) }, COMPANY));
    expect(t.entries.map((e) => [e.type, e.party, e.body, e.followUpDue])).toEqual([
      ['update', 'vessel', 'Parts ordered', '2026-12-01'],
      ['update', 'company', 'Noted', null],
    ]);
  });

  it('rejects empty, over-long and badly dated entries', () => {
    expect(code(postUpdate(emptyThread(), { id: 'x', body: '   ', at: at(8) }, VESSEL))).toBe('empty_body');
    expect(code(postUpdate(emptyThread(), { id: 'x', body: 'a'.repeat(MAX_ENTRY_LENGTH + 1), at: at(8) }, VESSEL))).toBe('body_too_long');
    expect(code(postUpdate(emptyThread(), { id: 'x', body: 'a'.repeat(MAX_ENTRY_LENGTH), at: at(8) }, VESSEL))).toBe('ok');
    expect(code(postUpdate(emptyThread(), { id: 'x', body: 'ok', at: at(8), followUpDue: '2026-02-30' }, VESSEL))).toBe('invalid_date');
  });

  it('only the company posts requests, and a request needs a due date', () => {
    expect(code(postRequest(emptyThread(), { id: 'r', body: 'Send photos', at: at(8), dueOn: '2026-11-25' }, VESSEL))).toBe('wrong_party');
    expect(code(postRequest(emptyThread(), { id: 'r', body: 'Send photos', at: at(8), dueOn: '' }, COMPANY))).toBe('invalid_date');
    const t = withRequest();
    expect(findEntry(t, 'req-1')).toMatchObject({ type: 'request', party: 'company', requestDue: '2026-11-25', requestState: 'open', dueHistory: [] });
  });

  it('system entries are engine-written', () => {
    const t = appendSystemEntry(emptyThread(), { id: 's1', body: 'Status changed to in review', at: at(8) });
    expect(t.entries[0]).toMatchObject({ type: 'system', party: 'system', authorProfileId: null });
  });
});

describe('request lifecycle: allowed transitions', () => {
  it('open → (vessel reply) open/replied → (company mark done) done', () => {
    let t = withRequest();
    const request = () => findEntry(t, 'req-1')!;
    expect(requestDisplayState(t, request())).toBe('open');
    t = must(postReply(t, { id: 'rep-1', requestId: 'req-1', body: 'Photos attached', at: at(9) }, VESSEL));
    expect(requestDisplayState(t, request())).toBe('replied');
    expect(openRequests(t)).toHaveLength(1);
    t = must(markRequestDone(t, { requestId: 'req-1', at: at(10), note: 'Thanks' }, COMPANY));
    expect(request()).toMatchObject({ requestState: 'done', requestResolvedAt: at(10), requestResolvedBy: 'p-shore', resolutionNote: 'Thanks' });
    expect(requestDisplayState(t, request())).toBe('done');
    expect(openRequests(t)).toHaveLength(0);
  });

  it('the company may mark a request done without a reply', () => {
    expect(code(markRequestDone(withRequest(), { requestId: 'req-1', at: at(9) }, COMPANY))).toBe('ok');
  });

  it('open → (change date, reason) open with history', () => {
    let t = withRequest('2026-11-25');
    t = must(changeRequestDue(t, { requestId: 'req-1', newDue: '2026-11-30', reason: 'Port call delayed', at: at(9) }, COMPANY));
    t = must(changeRequestDue(t, { requestId: 'req-1', newDue: '2026-12-02', reason: 'Spares late', at: at(10) }, COMPANY));
    expect(findEntry(t, 'req-1')).toMatchObject({
      requestDue: '2026-12-02',
      requestState: 'open',
      dueHistory: [
        { from: '2026-11-25', to: '2026-11-30', reason: 'Port call delayed', changedAt: at(9), changedBy: 'p-shore' },
        { from: '2026-11-30', to: '2026-12-02', reason: 'Spares late', changedAt: at(10), changedBy: 'p-shore' },
      ],
    });
  });

  it('open → (cancel, reason) cancelled', () => {
    const t = must(cancelRequest(withRequest(), { requestId: 'req-1', reason: 'Raised on the wrong record', at: at(9) }, COMPANY));
    expect(findEntry(t, 'req-1')).toMatchObject({ requestState: 'cancelled', resolutionNote: 'Raised on the wrong record' });
    expect(requestDisplayState(t, findEntry(t, 'req-1')!)).toBe('cancelled');
  });
});

describe('request lifecycle: forbidden transitions', () => {
  const done = () => must(markRequestDone(withRequest(), { requestId: 'req-1', at: at(9) }, COMPANY));
  const cancelled = () => must(cancelRequest(withRequest(), { requestId: 'req-1', reason: 'x', at: at(9) }, COMPANY));

  it.each([
    ['done', done],
    ['cancelled', cancelled],
  ])('a %s request is final', (_label, make) => {
    const t = make();
    expect(code(postReply(t, { id: 'r', requestId: 'req-1', body: 'late', at: at(11) }, VESSEL))).toBe('request_closed');
    expect(code(markRequestDone(t, { requestId: 'req-1', at: at(11) }, COMPANY))).toBe('request_closed');
    expect(code(changeRequestDue(t, { requestId: 'req-1', newDue: '2026-12-09', reason: 'x', at: at(11) }, COMPANY))).toBe('request_closed');
    expect(code(cancelRequest(t, { requestId: 'req-1', reason: 'x', at: at(11) }, COMPANY))).toBe('request_closed');
  });

  it('wrong party', () => {
    const t = withRequest();
    expect(code(postReply(t, { id: 'r', requestId: 'req-1', body: 'x', at: at(9) }, COMPANY))).toBe('wrong_party');
    expect(code(markRequestDone(t, { requestId: 'req-1', at: at(9) }, VESSEL))).toBe('wrong_party');
    expect(code(changeRequestDue(t, { requestId: 'req-1', newDue: '2026-12-01', reason: 'x', at: at(9) }, VESSEL))).toBe('wrong_party');
    expect(code(cancelRequest(t, { requestId: 'req-1', reason: 'x', at: at(9) }, VESSEL))).toBe('wrong_party');
  });

  it('reasons, dates and targets', () => {
    const t = must(postUpdate(withRequest(), { id: 'u1', body: 'Update', at: at(9) }, COMPANY));
    expect(code(changeRequestDue(t, { requestId: 'req-1', newDue: '2026-12-01', reason: ' ', at: at(9) }, COMPANY))).toBe('reason_required');
    expect(code(changeRequestDue(t, { requestId: 'req-1', newDue: '2026-11-25', reason: 'x', at: at(9) }, COMPANY))).toBe('same_date');
    expect(code(changeRequestDue(t, { requestId: 'req-1', newDue: 'soon', reason: 'x', at: at(9) }, COMPANY))).toBe('invalid_date');
    expect(code(cancelRequest(t, { requestId: 'req-1', reason: '', at: at(9) }, COMPANY))).toBe('reason_required');
    expect(code(postReply(t, { id: 'r', requestId: 'u1', body: 'x', at: at(9) }, VESSEL))).toBe('not_a_request');
    expect(code(postReply(t, { id: 'r', requestId: 'nope', body: 'x', at: at(9) }, VESSEL))).toBe('unknown_entry');
  });
});

describe('close gate', () => {
  it('close is blocked while any request is open', () => {
    expect(closeBlockedByRequests(emptyThread())).toEqual({ blocked: false, openCount: 0, message: null });
    let t = withRequest();
    expect(closeBlockedByRequests(t)).toEqual({ blocked: true, openCount: 1, message: '1 open request — mark it done or cancel it first' });
    t = must(postRequest(t, { id: 'req-2', body: 'And the test certificate', at: at(9), dueOn: '2026-11-26' }, COMPANY));
    expect(closeBlockedByRequests(t).message).toBe('2 open requests — mark them done or cancel them first');
    t = must(markRequestDone(t, { requestId: 'req-1', at: at(10) }, COMPANY));
    t = must(cancelRequest(t, { requestId: 'req-2', reason: 'Not needed', at: at(10) }, COMPANY));
    expect(closeBlockedByRequests(t).blocked).toBe(false);
  });
});

describe('follow-up due', () => {
  const TODAY = '2026-11-22';

  it('the earliest open request due date wins', () => {
    let t = withRequest('2026-11-28');
    t = must(postRequest(t, { id: 'req-2', body: 'Also this', at: at(9), dueOn: '2026-11-24' }, COMPANY));
    t = must(postUpdate(t, { id: 'u', body: 'x', at: at(10), followUpDue: '2026-11-23' }, VESSEL));
    expect(followUpDue(t, TODAY)).toBe('2026-11-24');
  });

  it('an overdue request stays the follow-up date and is overdue', () => {
    const t = withRequest('2026-11-20');
    expect(followUpDue(t, TODAY)).toBe('2026-11-20');
    expect(isFollowUpOverdue(t, TODAY)).toBe(true);
  });

  it('without open requests: the newest update’s follow-up date, while it has not passed', () => {
    let t = must(postUpdate(emptyThread(), { id: 'u1', body: 'x', at: at(8), followUpDue: '2026-12-10' }, VESSEL));
    t = must(postUpdate(t, { id: 'u2', body: 'y', at: at(9), followUpDue: '2026-11-30' }, COMPANY));
    expect(followUpDue(t, TODAY)).toBe('2026-11-30');
    expect(followUpDue(t, '2026-11-30')).toBe('2026-11-30');
    expect(followUpDue(t, '2026-12-01')).toBeNull();
    expect(isFollowUpOverdue(t, '2026-12-01')).toBe(false);
  });

  it('done and cancelled requests no longer count', () => {
    const t = must(markRequestDone(withRequest('2026-11-20'), { requestId: 'req-1', at: at(9) }, COMPANY));
    expect(followUpDue(t, TODAY)).toBeNull();
  });
});

describe('append-only edits', () => {
  it('an edit is a new entry; the old one shows edited and is hidden from the reading view', () => {
    let t = must(postUpdate(emptyThread(), { id: 'u1', body: 'Engine room fire drill done', at: at(8) }, VESSEL));
    t = must(editEntry(t, { id: 'u1b', replacesId: 'u1', body: 'Engine room fire drill done; hoses tested', at: at(9) }, VESSEL));
    expect(t.entries).toHaveLength(2);
    expect(isEdited(t, 'u1')).toBe(true);
    expect(visibleEntries(t).map((e) => [e.id, e.edited])).toEqual([['u1b', true]]);
  });

  it('only the author edits, only the newest version, never system entries or requests', () => {
    let t = must(postUpdate(emptyThread(), { id: 'u1', body: 'x', at: at(8) }, VESSEL));
    expect(code(editEntry(t, { id: 'e', replacesId: 'u1', body: 'y', at: at(9) }, { party: 'vessel', profileId: 'p-other' }))).toBe('not_author');
    t = must(editEntry(t, { id: 'u1b', replacesId: 'u1', body: 'y', at: at(9) }, VESSEL));
    expect(code(editEntry(t, { id: 'e', replacesId: 'u1', body: 'z', at: at(10) }, VESSEL))).toBe('already_edited');
    expect(code(editEntry(t, { id: 'e', replacesId: 'u1b', body: 'z', at: at(10) }, VESSEL))).toBe('ok');
    const sys = appendSystemEntry(emptyThread(), { id: 's', body: 'x', at: at(8) });
    expect(code(editEntry(sys, { id: 'e', replacesId: 's', body: 'y', at: at(9) }, VESSEL))).toBe('not_editable');
    expect(code(editEntry(withRequest(), { id: 'e', replacesId: 'req-1', body: 'y', at: at(9) }, COMPANY))).toBe('not_editable');
    expect(code(editEntry(emptyThread(), { id: 'e', replacesId: 'nope', body: 'y', at: at(9) }, VESSEL))).toBe('unknown_entry');
  });
});

describe('lastUpdateAt', () => {
  it('is the newest entry of any kind, whatever the insertion order', () => {
    expect(lastUpdateAt(emptyThread())).toBeNull();
    let t = must(postUpdate(emptyThread(), { id: 'a', body: 'x', at: at(10) }, VESSEL));
    t = appendSystemEntry(t, { id: 'b', body: 'y', at: at(9) });
    expect(lastUpdateAt(t)).toBe(at(10));
  });

  it('actions never mutate the thread they are given', () => {
    const t = withRequest();
    const before = JSON.stringify(t);
    postReply(t, { id: 'r', requestId: 'req-1', body: 'x', at: at(9) }, VESSEL);
    markRequestDone(t, { requestId: 'req-1', at: at(9) }, COMPANY);
    changeRequestDue(t, { requestId: 'req-1', newDue: '2026-12-01', reason: 'x', at: at(9) }, COMPANY);
    expect(JSON.stringify(t)).toBe(before);
  });
});
