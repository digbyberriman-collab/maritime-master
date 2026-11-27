/**
 * The transfer machine and its readers (X1-11; gap/04 W9, C58; D-X1-12):
 * nextTransferStatus exhaustively against an independent table (the SQL
 * mirror crew_transfer_next is compared with the same function in
 * supabase/tests/sql/crew/transfers.test.sql), the timeline, the wizard
 * step, the review helpers, and the strict jsonb readers (an unreadable
 * answer is null, never a guess).
 */
import { describe, expect, it } from 'vitest';
import {
  NO_TRANSFER_RIGHTS,
  TIMELINE_LABELS,
  TRANSFER_ACTIONS,
  TRANSFER_LIMITS,
  TRANSFER_STATUSES,
  TRANSFER_STATUS_SENTENCE,
  addDays,
  allAcknowledged,
  cancelReasonRequired,
  daysBetween,
  formatTransferDay,
  isOpenTransfer,
  isTransferAction,
  isTransferStatus,
  isTransferStep,
  liveAcknowledgements,
  nextTransferStatus,
  parseReviewItem,
  parseTransfer,
  parseTransferList,
  parseTransferOptions,
  personNameOf,
  reviewCounts,
  sortReviewItems,
  transferDue,
  transferProgressOf,
  transferTimeline,
  wizardStepFor,
  type TransferAction,
  type TransferStatus,
} from '@/modules/crew/lib/transfer';

// ---------------------------------------------------------------- the machine

const FACTS = [null, false, true] as const;

/** The W9 table written out on its own (not derived from the implementation). */
function expected(status: string | null, action: string | null, approval: boolean | null, acked: boolean | null, due: boolean | null): string {
  const open = ['draft', 'review', 'pending_approval', 'scheduled'];
  if (action === 'review') return status === 'draft' || status === 'review' ? 'review' : 'illegal_transition';
  if (action === 'acknowledge') return status === 'review' ? 'review' : 'illegal_transition';
  if (action === 'submit') {
    if (status !== 'review') return 'illegal_transition';
    if (acked !== true) return 'acknowledgements_missing';
    return approval === true ? 'pending_approval' : 'scheduled';
  }
  if (action === 'approve') return status === 'pending_approval' ? 'scheduled' : 'illegal_transition';
  if (action === 'decline') return status === 'pending_approval' ? 'cancelled' : 'illegal_transition';
  if (action === 'cancel') return status !== null && open.includes(status) ? 'cancelled' : 'illegal_transition';
  if (action === 'complete') {
    if (status !== 'scheduled') return 'illegal_transition';
    return due === true ? 'completed' : 'transfer_not_due';
  }
  return 'unknown_action';
}

describe('nextTransferStatus (W9)', () => {
  const statuses: Array<string | null> = [...TRANSFER_STATUSES, null, 'archived'];
  const actions: Array<string | null> = [...TRANSFER_ACTIONS, null, 'reopen'];

  it('matches the table for every status, action and fact', () => {
    let n = 0;
    for (const s of statuses)
      for (const a of actions)
        for (const approval of FACTS)
          for (const acked of FACTS)
            for (const due of FACTS) {
              expect(nextTransferStatus(s, a, approval, acked, due), `${s} ${a} ${approval} ${acked} ${due}`).toBe(expected(s, a, approval, acked, due));
              n += 1;
            }
    expect(n).toBe(8 * 9 * 27);
  });

  it('reaches pending approval only when a vessel asks for fleet approval (D-X1-12)', () => {
    expect(nextTransferStatus('review', 'submit', true, true, false)).toBe('pending_approval');
    expect(nextTransferStatus('review', 'submit', false, true, false)).toBe('scheduled');
    expect(nextTransferStatus('review', 'submit', null, true, false)).toBe('scheduled');
  });

  it('needs every acknowledgement before submit, and the sign-off date before completion', () => {
    expect(nextTransferStatus('review', 'submit', false, false, true)).toBe('acknowledgements_missing');
    expect(nextTransferStatus('scheduled', 'complete', false, true, false)).toBe('transfer_not_due');
    expect(nextTransferStatus('scheduled', 'complete', false, true, true)).toBe('completed');
  });

  it('cancels from any state before completed, never after', () => {
    for (const s of TRANSFER_STATUSES) {
      expect(nextTransferStatus(s, 'cancel', false, false, false)).toBe(isOpenTransfer(s) ? 'cancelled' : 'illegal_transition');
    }
    expect(nextTransferStatus('completed', 'cancel', false, true, true)).toBe('illegal_transition');
  });

  it('every reachable status is a status; the refusals are not', () => {
    const outcomes = new Set<string>();
    for (const s of TRANSFER_STATUSES) for (const a of TRANSFER_ACTIONS) for (const f of FACTS) outcomes.add(nextTransferStatus(s, a, f, f, f));
    for (const o of outcomes) expect(isTransferStep(o as TransferStatus) === isTransferStatus(o)).toBe(true);
    expect([...outcomes].filter((o) => !isTransferStatus(o)).sort()).toEqual(['acknowledgements_missing', 'illegal_transition', 'transfer_not_due']);
    // Every status but draft is reached by some step (draft is where transfer_crew_start begins).
    expect(TRANSFER_STATUSES.filter((s) => s !== 'draft').every((s) => outcomes.has(s))).toBe(true);
  });

  it('knows its vocabularies', () => {
    expect(isTransferStatus('scheduled')).toBe(true);
    expect(isTransferStatus('Scheduled')).toBe(false);
    expect(isTransferAction('approve')).toBe(true);
    expect(isTransferAction('reopen')).toBe(false);
    for (const s of TRANSFER_STATUSES) expect(TRANSFER_STATUS_SENTENCE[s].length).toBeGreaterThan(0);
  });

  it('asks a reason to cancel once submitted', () => {
    const required = TRANSFER_STATUSES.filter((s) => cancelReasonRequired(s));
    expect(required).toEqual(['pending_approval', 'scheduled']);
  });
});

// ---------------------------------------------------------------- days

describe('day arithmetic', () => {
  it('counts calendar days across months, years and leap days', () => {
    expect(daysBetween('2026-11-27', '2026-11-27')).toBe(0);
    expect(daysBetween('2026-11-27', '2026-12-01')).toBe(4);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-12-01', '2026-11-27')).toBe(-4);
    expect(addDays('2026-11-27', TRANSFER_LIMITS.maxGapDays)).toBe('2027-02-25');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('formats a day without a time zone shift', () => {
    expect(formatTransferDay('2026-11-27')).toBe('27 Nov 2026');
    expect(formatTransferDay('2026-01-01T23:30:00Z')).toBe('1 Jan 2026');
    expect(formatTransferDay(null)).toBe('');
    expect(formatTransferDay('soon')).toBe('soon');
  });

  it('is due from the sign-off date', () => {
    expect(transferDue('2026-11-27', '2026-11-27')).toBe(true);
    expect(transferDue('2026-11-26', '2026-11-27')).toBe(true);
    expect(transferDue('2026-11-28', '2026-11-27')).toBe(false);
  });
});

// ---------------------------------------------------------------- the wizard and the timeline

describe('wizardStepFor', () => {
  it('opens the details, the review or the status', () => {
    expect(wizardStepFor(null)).toBe('details');
    expect(wizardStepFor('draft')).toBe('details');
    expect(wizardStepFor('review')).toBe('review');
    for (const s of ['pending_approval', 'scheduled', 'completed', 'cancelled'] as const) expect(wizardStepFor(s)).toBe('status');
  });
});

describe('transferTimeline', () => {
  const base = { requiresApproval: false, reviewed: false, submitted: false, approved: false };
  const states = (p: Parameters<typeof transferTimeline>[0]) => transferTimeline(p).map((s) => `${s.key}:${s.state}`);

  it('shows Fleet approval only when it is required', () => {
    expect(transferTimeline({ ...base, status: 'draft' }).map((s) => s.label)).toEqual(['Details', 'Review', 'Scheduled', 'Completed']);
    expect(transferTimeline({ ...base, status: 'draft', requiresApproval: true }).map((s) => s.label)).toEqual([
      TIMELINE_LABELS.draft,
      TIMELINE_LABELS.review,
      TIMELINE_LABELS.pending_approval,
      TIMELINE_LABELS.scheduled,
      TIMELINE_LABELS.completed,
    ]);
  });

  it('marks the steps before the current one done', () => {
    expect(states({ ...base, status: 'review', reviewed: true })).toEqual(['draft:done', 'review:current', 'scheduled:upcoming', 'completed:upcoming']);
    expect(states({ ...base, status: 'pending_approval', requiresApproval: true, reviewed: true, submitted: true })).toEqual([
      'draft:done',
      'review:done',
      'pending_approval:current',
      'scheduled:upcoming',
      'completed:upcoming',
    ]);
    expect(states({ ...base, status: 'completed', reviewed: true, submitted: true })).toEqual(['draft:done', 'review:done', 'scheduled:done', 'completed:done']);
  });

  it('marks where a cancelled transfer stopped', () => {
    expect(states({ ...base, status: 'cancelled' })).toEqual(['draft:cancelled', 'review:upcoming', 'scheduled:upcoming', 'completed:upcoming']);
    expect(states({ ...base, status: 'cancelled', reviewed: true })).toEqual(['draft:done', 'review:cancelled', 'scheduled:upcoming', 'completed:upcoming']);
    // Declined: submitted for approval, never approved.
    expect(states({ ...base, status: 'cancelled', requiresApproval: true, reviewed: true, submitted: true })).toEqual([
      'draft:done',
      'review:done',
      'pending_approval:cancelled',
      'scheduled:upcoming',
      'completed:upcoming',
    ]);
    // Cancelled once scheduled.
    expect(states({ ...base, status: 'cancelled', requiresApproval: true, reviewed: true, submitted: true, approved: true })).toEqual([
      'draft:done',
      'review:done',
      'pending_approval:done',
      'scheduled:cancelled',
      'completed:upcoming',
    ]);
    expect(states({ ...base, status: 'cancelled', reviewed: true, submitted: true })).toEqual(['draft:done', 'review:done', 'scheduled:cancelled', 'completed:upcoming']);
  });
});

// ---------------------------------------------------------------- the review

const item = (key: string, severity: 'danger' | 'warning' | 'info', fingerprint = `fp-${key}`) => ({
  key,
  kind: 'requirement' as const,
  severity,
  title: `Item ${key}`,
  detail: '',
  fingerprint,
});

describe('review helpers', () => {
  it('needs every item acknowledged', () => {
    expect(allAcknowledged([], [])).toBe(true);
    expect(allAcknowledged([item('a', 'info'), item('b', 'danger')], [{ key: 'a' }])).toBe(false);
    expect(allAcknowledged([item('a', 'info'), item('b', 'danger')], [{ key: 'b' }, { key: 'a' }, { key: 'x' }])).toBe(true);
  });

  it('sorts worst first, stable within a severity, and counts', () => {
    const items = [item('i1', 'info'), item('w1', 'warning'), item('d1', 'danger'), item('i2', 'info'), item('d2', 'danger')];
    expect(sortReviewItems(items).map((i) => i.key)).toEqual(['d1', 'd2', 'w1', 'i1', 'i2']);
    expect(reviewCounts(items)).toEqual({ danger: 2, warning: 1, info: 2 });
  });

  it('keeps an acknowledgement only while the item reads the same', () => {
    const review = { generatedAt: '2026-11-27T08:00:00Z', items: [item('a', 'info', 'fa'), item('b', 'info', 'fb')] };
    const live = liveAcknowledgements(review, [
      { key: 'a', fingerprint: 'fa', note: 'seen', at: null },
      { key: 'b', fingerprint: 'stale', note: null, at: null },
      { key: 'gone', fingerprint: 'fg', note: null, at: null },
    ]);
    expect([...live.keys()]).toEqual(['a']);
    expect(live.get('a')?.note).toBe('seen');
    expect(liveAcknowledgements(null, [{ key: 'a', fingerprint: 'fa', note: null, at: null }]).size).toBe(0);
  });

  it('reads review items strictly', () => {
    expect(parseReviewItem({ key: 'k', kind: 'medical', severity: 'warning', title: 'Medical follow-up', fingerprint: 'f' })).toEqual({
      key: 'k',
      kind: 'medical',
      severity: 'warning',
      title: 'Medical follow-up',
      detail: '',
      fingerprint: 'f',
    });
    expect(parseReviewItem({ key: 'k', kind: 'clinical_notes', severity: 'warning', title: 'x' })).toBeNull();
    expect(parseReviewItem({ key: 'k', kind: 'medical', severity: 'critical', title: 'x' })).toBeNull();
    expect(parseReviewItem({ kind: 'medical', severity: 'info', title: 'x' })).toBeNull();
    expect(parseReviewItem('item')).toBeNull();
  });
});

// ---------------------------------------------------------------- the readers

const P = 'b0000000-0000-4000-8000-0000000000a1';
const T = 'c0000000-0000-4000-8000-0000000000t1';

const transferJson = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: T,
  status: 'review',
  profile_id: P,
  user_id: 'u-1',
  person: { first_name: 'Demo', preferred_name: null, last_name: 'Crew' },
  from_vessel: { id: 'v-dra', name: 'DRAAK', code: 'DRA' },
  to_vessel: { id: 'v-hyd', name: 'HYDRA', code: 'HYD' },
  from_position: { id: 'pos-deck', name: 'Deckhand' },
  to_position: { id: 'pos-deck-h', name: 'Deckhand' },
  same_role: true,
  sign_off_date: '2026-12-01',
  sign_on_date: '2026-12-02',
  requires_approval: false,
  review: {
    generated_at: '2026-11-27T08:00:00Z',
    items: [
      { key: 'requirement:stcw-bst', kind: 'requirement', severity: 'danger', title: 'Basic safety training', detail: 'Required for Deckhand on HYDRA', fingerprint: 'f1' },
      { key: 'appraisal:last', kind: 'appraisal', severity: 'info', title: 'Last appraisal', detail: '2026-06-01', fingerprint: 'f2' },
      { key: 'bad', kind: 'nope', severity: 'info', title: 'Dropped' },
    ],
  },
  acknowledgements: [{ key: 'appraisal:last', fingerprint: 'f2', note: null, at: '2026-11-27T08:01:00Z' }, { note: 'no key' }],
  acknowledged: false,
  notes: null,
  created_at: '2026-11-27T07:59:00Z',
  created_by_name: 'Demo Officer',
  submitted_at: null,
  rights: { can_edit: true, can_submit: true, can_decide: false, can_cancel: true, can_complete: false, decide_block: null },
  ...over,
});

describe('parseTransfer', () => {
  it('reads a transfer', () => {
    const t = parseTransfer(transferJson());
    expect(t).not.toBeNull();
    expect(t?.personName).toBe('Demo Crew');
    expect(t?.fromVessel).toEqual({ id: 'v-dra', name: 'DRAAK', code: 'DRA' });
    expect(t?.review?.items.map((i) => i.key)).toEqual(['requirement:stcw-bst', 'appraisal:last']);
    expect(t?.acknowledgements.map((a) => a.key)).toEqual(['appraisal:last']);
    expect(t?.rights).toEqual({ ...NO_TRANSFER_RIGHTS, canEdit: true, canSubmit: true, canCancel: true });
    expect(t?.decideBlock).toBeNull();
    expect(t && transferProgressOf(t)).toEqual({ status: 'review', requiresApproval: false, reviewed: true, submitted: false, approved: false });
  });

  it('returns null for an answer it cannot read', () => {
    expect(parseTransfer(null)).toBeNull();
    expect(parseTransfer([])).toBeNull();
    for (const key of ['id', 'profile_id', 'from_vessel', 'to_vessel', 'sign_off_date', 'sign_on_date']) {
      expect(parseTransfer(transferJson({ [key]: null })), key).toBeNull();
    }
    expect(parseTransfer(transferJson({ status: 'approved' }))).toBeNull();
    expect(parseTransfer(transferJson({ sign_off_date: 'soon' }))).toBeNull();
    expect(parseTransfer(transferJson({ to_vessel: { name: 'no id' } }))).toBeNull();
  });

  it('treats missing rights as none, and reads the four-eyes block', () => {
    expect(parseTransfer(transferJson({ rights: undefined }))?.rights).toEqual(NO_TRANSFER_RIGHTS);
    expect(parseTransfer(transferJson({ rights: { can_edit: 'yes' } }))?.rights.canEdit).toBe(false);
    expect(parseTransfer(transferJson({ status: 'pending_approval', rights: { decide_block: 'own_submission' } }))?.decideBlock).toBe('own_submission');
    expect(parseTransfer(transferJson({ review: null }))?.review).toBeNull();
  });

  it('reads a list, dropping unreadable rows', () => {
    expect(parseTransferList([transferJson(), { id: 'x' }, transferJson({ id: 'c0000000-0000-4000-8000-0000000000t2', status: 'completed' })]).map((t) => t.status)).toEqual([
      'review',
      'completed',
    ]);
    expect(parseTransferList({ not: 'a list' })).toEqual([]);
  });

  it('names people as the server does', () => {
    expect(personNameOf({ first_name: 'Demo', preferred_name: 'Dee', last_name: 'Crew' })).toBe('Dee Crew');
    expect(personNameOf({ first_name: 'Demo', preferred_name: '  ', last_name: 'Crew' })).toBe('Demo Crew');
    expect(personNameOf({})).toBe('Crew member');
    expect(personNameOf(null)).toBe('Crew member');
  });
});

const optionsJson = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  person: { profile_id: P, user_id: 'u-1', first_name: 'Demo', last_name: 'Crew' },
  from: {
    vessel_id: 'v-dra',
    vessel_name: 'DRAAK',
    assignment_id: 'a-1',
    position_text: 'Deckhand',
    position_id: 'pos-deck',
    position_key: 'deckhand',
    join_date: '2026-10-01',
    is_master_office: false,
  },
  destinations: [
    {
      vessel_id: 'v-hyd',
      name: 'HYDRA',
      code: 'HYD',
      requires_approval: false,
      same_position_id: 'pos-deck-h',
      positions: [
        { id: 'pos-deck-h', key: 'deckhand', name: 'Deckhand', department_key: 'deck', department_label: 'Deck', rank_tier: 'rating' },
        { id: 'pos-bosun-h', key: 'bosun', name: 'Bosun', department_key: 'deck', department_label: 'Deck', rank_tier: 'officer' },
        { id: '', name: 'Unnamed' },
      ],
    },
    { name: 'No id' },
  ],
  open_transfer: null,
  blocked: null,
  ...over,
});

describe('parseTransferOptions', () => {
  it('reads the options', () => {
    const o = parseTransferOptions(optionsJson());
    expect(o?.person).toEqual({ profileId: P, userId: 'u-1', displayName: 'Demo Crew' });
    expect(o?.from.joinDate).toBe('2026-10-01');
    expect(o?.destinations.map((d) => d.vesselId)).toEqual(['v-hyd']);
    expect(o?.destinations[0].positions.map((p) => p.id)).toEqual(['pos-deck-h', 'pos-bosun-h']);
    expect(o?.destinations[0].samePositionId).toBe('pos-deck-h');
    expect(o?.openTransfer).toBeNull();
    expect(o?.blocked).toBeNull();
  });

  it('reads the open transfer and the block', () => {
    const o = parseTransferOptions(
      optionsJson({
        open_transfer: transferJson({ status: 'scheduled' }),
        blocked: { code: 'pending_placement_not_transferable', message: 'Change the pending vessel on the profile.' },
      }),
    );
    expect(o?.openTransfer?.status).toBe('scheduled');
    expect(o?.blocked).toEqual({ code: 'pending_placement_not_transferable', message: 'Change the pending vessel on the profile.' });
    expect(parseTransferOptions(optionsJson({ blocked: { code: 'surprise' } }))?.blocked).toEqual({
      code: 'unknown',
      message: 'This person cannot be transferred from here.',
    });
  });

  it('returns null without the person or the origin vessel', () => {
    expect(parseTransferOptions(null)).toBeNull();
    expect(parseTransferOptions(optionsJson({ person: null }))).toBeNull();
    expect(parseTransferOptions(optionsJson({ from: { vessel_name: 'DRAAK' } }))).toBeNull();
    expect(parseTransferOptions(optionsJson({ person: { first_name: 'No id' } }))).toBeNull();
  });
});

describe('the action list covers the machine', () => {
  it('has one entry per W9 step', () => {
    const steps: TransferAction[] = ['review', 'acknowledge', 'submit', 'approve', 'decline', 'cancel', 'complete'];
    expect([...TRANSFER_ACTIONS]).toEqual(steps);
  });
});
