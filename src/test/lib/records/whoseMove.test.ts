import { describe, expect, it } from 'vitest';
import { whoseMove, whoseMoveLabel } from '@/lib/records/whoseMove';
import { appendSystemEntry, emptyThread, markRequestDone, postReply, postRequest, postUpdate, type Thread } from '@/lib/records/threads';
import { ENVELOPE_STATUSES, type EnvelopeStatus } from '@/lib/records/types';

const must = <T,>(r: { ok: boolean; value?: T; error?: { code: string } }): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
const COMPANY = { party: 'company' as const, profileId: 'p-shore' };
const VESSEL = { party: 'vessel' as const, profileId: 'p-master' };
const at = (h: number) => `2026-11-22T${String(h).padStart(2, '0')}:00:00Z`;

const openRequest = (): Thread => must(postRequest(emptyThread(), { id: 'req', body: 'Photos please', at: at(8), dueOn: '2026-11-25' }, COMPANY));
const replied = (): Thread => must(postReply(openRequest(), { id: 'rep', requestId: 'req', body: 'Attached', at: at(9) }, VESSEL));

describe('whoseMove from status alone', () => {
  it.each<[EnvelopeStatus, string]>([
    ['open', 'vessel'],
    ['in_review', 'vessel'],
    ['info_requested', 'vessel'],
    ['submitted', 'company'],
    ['awaiting_company_close', 'company'],
    ['acknowledged', 'vessel'], // nobody has posted: the vessel owns the record
    ['closed', 'none'],
    ['void', 'none'],
  ])('%s → %s', (status, move) => {
    expect(whoseMove({ status })).toBe(move);
    expect(whoseMove({ status, thread: emptyThread() })).toBe(move);
  });

  it('covers every status', () => {
    for (const status of ENVELOPE_STATUSES) expect(['vessel', 'company', 'none']).toContain(whoseMove({ status }));
  });
});

describe('whoseMove with a thread', () => {
  it('an open company request without a reply is the vessel’s move, even while awaiting the company', () => {
    for (const status of ['awaiting_company_close', 'submitted', 'acknowledged', 'in_review'] as EnvelopeStatus[]) {
      expect(whoseMove({ status, thread: openRequest() })).toBe('vessel');
    }
  });

  it('a vessel reply to an open request hands the move to the company', () => {
    for (const status of ['in_review', 'info_requested', 'acknowledged', 'awaiting_company_close'] as EnvelopeStatus[]) {
      expect(whoseMove({ status, thread: replied() })).toBe('company');
    }
  });

  it('still the company’s move after it posts a note without marking the request done', () => {
    const t = must(postUpdate(replied(), { id: 'u', body: 'Reviewing', at: at(10) }, COMPANY));
    expect(whoseMove({ status: 'in_review', thread: t })).toBe('company');
  });

  it('a second, unanswered request makes it the vessel’s move again', () => {
    const t = must(postRequest(replied(), { id: 'req2', body: 'And the certificate', at: at(10), dueOn: '2026-11-26' }, COMPANY));
    expect(whoseMove({ status: 'in_review', thread: t })).toBe('vessel');
  });

  it('once requests are done, the status decides again', () => {
    const t = must(markRequestDone(replied(), { requestId: 'req', at: at(10) }, COMPANY));
    expect(whoseMove({ status: 'in_review', thread: t })).toBe('vessel');
    expect(whoseMove({ status: 'awaiting_company_close', thread: t })).toBe('company');
  });

  it('acknowledged: the side that did not post last (system entries ignored)', () => {
    let t = must(postUpdate(emptyThread(), { id: 'u1', body: 'Investigating', at: at(8) }, VESSEL));
    expect(whoseMove({ status: 'acknowledged', thread: t })).toBe('company');
    t = must(postUpdate(t, { id: 'u2', body: 'Thanks, keep us posted', at: at(9) }, COMPANY));
    expect(whoseMove({ status: 'acknowledged', thread: t })).toBe('vessel');
    t = appendSystemEntry(t, { id: 's', body: 'Reminder sent', at: at(10) });
    expect(whoseMove({ status: 'acknowledged', thread: t })).toBe('vessel');
  });

  it('closed and void are nobody’s move, whatever the thread says', () => {
    expect(whoseMove({ status: 'closed', thread: openRequest() })).toBe('none');
    expect(whoseMove({ status: 'void', thread: replied() })).toBe('none');
  });
});

describe('whoseMoveLabel', () => {
  it('header chip copy', () => {
    expect(whoseMoveLabel('vessel')).toBe('Waiting on vessel');
    expect(whoseMoveLabel('company')).toBe('Waiting on company');
    expect(whoseMoveLabel('none', 'closed')).toBe('Closed');
    expect(whoseMoveLabel('none', 'void')).toBe('Voided');
    expect(whoseMoveLabel('none')).toBe('Closed');
  });
});
