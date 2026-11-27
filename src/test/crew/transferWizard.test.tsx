/**
 * The transfer wizard (X1-11; gap/04 C58, W9; D-01, D-207, D-225) through
 * TransferCrewModal, as the crew list opens it:
 *
 * - the steps: details -> transfer_crew_start + transfer_crew_review ->
 *   the review (every item ticked) -> transfer_crew_acknowledge +
 *   transfer_crew_submit -> the status (Scheduled, or pending fleet
 *   approval); approve, decline with a reason, cancel, complete;
 * - refusals: a 42501 shows the D-207 sentence as is, a 22023 with a HINT
 *   lands on its field, an unreadable answer is an error;
 * - the person's open transfer and the server's block (D-225) open as such;
 * - D-01: the transfer RPCs missing -> the legacy form with the notice;
 *   any other error -> an error with Try again; outside a vessel the
 *   legacy form without the notice;
 * - the profile header: Transfer for a holder of crew_assignments.assign,
 *   the D-225 sentence for a pending placement, and `?transfer=<id>`.
 *
 * The client is mocked at supabase.rpc; the hooks, parsers and forms are
 * the real ones.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  canAssign: true,
  scope: 'vessel' as 'vessel' | 'fleet',
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), promise: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from, functions: { invoke: vi.fn() } } };
});
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () =>
    h.scope === 'vessel'
      ? { scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }
      : { scope: 'fleet', vesselCode: null, vessel: null },
}));
vi.mock('@/lib/permissions/useCan', () => ({
  useCan: () => h.canAssign,
  useCapability: () => ({ allowed: h.canAssign, status: h.canAssign ? 'granted' : 'denied', reason: 'test' }),
}));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({
  useVessels: () => ({ vessels: [{ id: 'v-dra', name: 'DRAAK', status: 'Active', imo_number: null }, { id: 'v-hyd', name: 'HYDRA', status: 'Active', imo_number: null }] }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import TransferCrewModal from '@/modules/crew/components/TransferCrewModal';
import TransferEntry from '@/modules/crew/components/transfer/TransferEntry';
import { TRANSFER_UNAVAILABLE_NOTICE, UNREADABLE_ANSWER } from '@/modules/crew/hooks/useTransfers';
import { TRANSFER_MESSAGES } from '@/modules/crew/lib/transferSchema';
import { addDays } from '@/modules/crew/lib/transfer';
import { todayDateOnly } from '@/shared/lib/form';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';
import type { CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';
import { PENDING_TRANSFER_SENTENCE, ProfileHeader } from '@/modules/crew/components/profile/ProfileHeader';

const P = 'b0000000-0000-4000-8000-0000000000a1';
const T = 'c0000000-0000-4000-8000-0000000000b1';
const TODAY = todayDateOnly();
const D207 = 'Only an administrator who manages administrators can act on this person.';

const member: CrewMember = {
  id: P,
  user_id: 'u-1',
  email: 'crew@example.test',
  first_name: 'Demo',
  last_name: 'Crew',
  rank: 'Deckhand',
  nationality: null,
  phone: null,
  status: 'active',
  role: 'crew',
  created_at: '2026-01-01T00:00:00Z',
  current_assignment: { id: 'a-1', vessel_id: 'v-dra', vessel_name: 'DRAAK', position: 'Deckhand', join_date: '2026-10-01' },
} as CrewMember;

const reviewItems = [
  { key: 'appraisal:last', kind: 'appraisal', severity: 'info', title: 'Last appraisal', detail: 'Reviewed in June', fingerprint: 'f2' },
  { key: 'requirement:bst', kind: 'requirement', severity: 'danger', title: 'Basic safety training', detail: 'Required for Deckhand on HYDRA', fingerprint: 'f1' },
];

const transferJson = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: T,
  status: 'draft',
  profile_id: P,
  user_id: 'u-1',
  person: { first_name: 'Demo', last_name: 'Crew' },
  from_vessel: { id: 'v-dra', name: 'DRAAK', code: 'DRA' },
  to_vessel: { id: 'v-hyd', name: 'HYDRA', code: 'HYD' },
  from_position: { id: 'pos-deck', name: 'Deckhand' },
  to_position: { id: 'pos-deck-h', name: 'Deckhand' },
  same_role: true,
  sign_off_date: TODAY,
  sign_on_date: addDays(TODAY, 1),
  requires_approval: false,
  review: null,
  acknowledgements: [],
  acknowledged: false,
  notes: null,
  created_at: `${TODAY}T08:00:00Z`,
  created_by_name: 'Demo Officer',
  rights: { can_edit: true, can_submit: false, can_decide: false, can_cancel: true, can_complete: false },
  ...over,
});

const reviewed = (over: Record<string, unknown> = {}) =>
  transferJson({ status: 'review', review: { generated_at: `${TODAY}T08:01:00Z`, items: reviewItems }, rights: { can_edit: true, can_submit: true, can_cancel: true }, ...over });

const optionsJson = (over: Record<string, unknown> = {}) => ({
  person: { profile_id: P, user_id: 'u-1', first_name: 'Demo', last_name: 'Crew' },
  from: { vessel_id: 'v-dra', vessel_name: 'DRAAK', assignment_id: 'a-1', position_text: 'Deckhand', position_id: 'pos-deck', position_key: 'deckhand', join_date: '2026-10-01', is_master_office: false },
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
      ],
    },
  ],
  open_transfer: null,
  blocked: null,
  ...over,
});

type Answer = { data: unknown; error: unknown };
let answers: Record<string, Answer | ((args: Record<string, unknown>) => Answer)>;
const ok = (data: unknown): Answer => ({ data, error: null });
const fail = (error: Record<string, unknown>): Answer => ({ data: null, error });
const callsTo = (fn: string) => h.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);

let qc: QueryClient;
const onSubmit = vi.fn();
const onClose = vi.fn();

function renderModal() {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TransferCrewModal isOpen onClose={onClose} crewMember={member} onSubmit={onSubmit} isLoading={false} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  h.scope = 'vessel';
  h.canAssign = true;
  answers = { transfer_crew_options: ok(optionsJson()) };
  h.rpc.mockReset();
  h.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    const a = answers[fn];
    if (!a) return Promise.resolve(fail({ code: 'PGRST202', message: `Could not find the function public.${fn}` }));
    return Promise.resolve(typeof a === 'function' ? a(args) : a);
  });
  for (const f of Object.values(h.notify)) f.mockReset();
  onSubmit.mockReset();
  onClose.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
});
afterEach(() => qc.clear());

const wizard = () => screen.findByRole('dialog', { name: 'Transfer Demo Crew' });
const stepOf = async (step: 'details' | 'review' | 'status') => {
  await waitFor(() => expect(document.querySelector(`[data-transfer-step="${step}"]`)).not.toBeNull());
  return document.querySelector(`[data-transfer-step="${step}"]`) as HTMLElement;
};

describe('the steps', () => {
  it('details -> review -> scheduled, with the server answering each step', async () => {
    answers.transfer_crew_start = ok(transferJson());
    answers.transfer_crew_review = ok(reviewed());
    answers.transfer_crew_acknowledge = ok(reviewed({ acknowledged: true }));
    answers.transfer_crew_submit = ok(
      transferJson({ status: 'scheduled', review: { generated_at: null, items: reviewItems }, submitted_at: `${TODAY}T08:02:00Z`, submitted_by_name: 'Demo Officer', rights: { can_cancel: true, can_complete: true } }),
    );
    renderModal();
    const details = await stepOf('details');
    expect(within(await wizard()).getByText('From DRAAK · Deckhand')).toBeTruthy();
    // One destination: chosen; the same position resolves on it.
    expect(within(details).getByLabelText('Joins HYDRA')).toBeTruthy();
    expect(within(details).getAllByText('Deckhand').length).toBeGreaterThan(0);
    fireEvent.change(within(details).getByLabelText('Notes (optional)'), { target: { value: 'Relieving the bosun' } });
    fireEvent.click(within(details).getByRole('button', { name: 'Save and review' }));

    const review = await stepOf('review');
    expect(callsTo('transfer_crew_start')).toEqual([
      {
        p_profile_id: P,
        p_from_vessel_id: 'v-dra',
        p_to_vessel_id: 'v-hyd',
        p_to_position_id: null,
        p_sign_off_date: TODAY,
        p_sign_on_date: addDays(TODAY, 1),
        p_notes: 'Relieving the bosun',
      },
    ]);
    expect(callsTo('transfer_crew_review')).toEqual([{ p_transfer_id: T }]);
    // Worst first.
    const items = within(review).getAllByRole('listitem').map((li) => li.getAttribute('data-review-item'));
    expect(items).toEqual(['requirement:bst', 'appraisal:last']);
    expect(within(review).getByText('0 of 2 acknowledged · 1 need attention')).toBeTruthy();

    // Submitting without the ticks says so, and writes nothing.
    fireEvent.click(within(review).getByRole('button', { name: 'Submit and schedule' }));
    await waitFor(() => expect(within(review).getAllByText(TRANSFER_MESSAGES.tick)).toHaveLength(2));
    expect(callsTo('transfer_crew_acknowledge')).toEqual([]);

    for (const box of within(review).getAllByRole('checkbox')) fireEvent.click(box);
    fireEvent.click(within(review).getAllByRole('button', { name: 'Add a note' })[0]);
    fireEvent.change(within(review).getByLabelText('Note on Basic safety training'), { target: { value: 'Booked for the yard period' } });
    expect(within(review).getByText('2 of 2 acknowledged · 1 need attention')).toBeTruthy();
    fireEvent.click(within(review).getByRole('button', { name: 'Submit and schedule' }));

    const status = await stepOf('status');
    expect(callsTo('transfer_crew_acknowledge')).toEqual([
      {
        p_transfer_id: T,
        p_items: [
          { key: 'requirement:bst', acknowledged: true, note: 'Booked for the yard period' },
          { key: 'appraisal:last', acknowledged: true },
        ],
      },
    ]);
    expect(callsTo('transfer_crew_submit')).toEqual([{ p_transfer_id: T }]);
    expect(h.notify.success).toHaveBeenCalledWith('Transfer submitted');
    expect(within(status).getByText(/^Scheduled\. It completes on the sign-on date/)).toBeTruthy();
    expect(within(status).getByRole('button', { name: 'Complete transfer now' })).toBeTruthy();
    expect(document.querySelector('[data-transfer-wizard]')?.getAttribute('data-transfer-wizard')).toBe('status');
  });

  it('says a destination asks for fleet approval, and submits for it', async () => {
    answers.transfer_crew_options = ok(optionsJson({ destinations: [{ ...optionsJson().destinations[0], requires_approval: true }] }));
    answers.transfer_crew_start = ok(transferJson({ requires_approval: true }));
    answers.transfer_crew_review = ok(reviewed());
    renderModal();
    const details = await stepOf('details');
    expect(within(details).getByText('A fleet approver decides before the transfer is scheduled.')).toBeTruthy();
    // The timeline shows the approval step before anything is saved.
    expect(document.querySelector('[data-transfer-timeline] [data-step="pending_approval"]')).not.toBeNull();
    fireEvent.click(within(details).getByRole('button', { name: 'Save and review' }));
    const review = await stepOf('review');
    expect(within(review).getByRole('button', { name: 'Submit for fleet approval' })).toBeTruthy();
    // Before submit the server has not fixed the approval yet; the timeline keeps the destination's flag.
    expect(document.querySelector('[data-transfer-timeline] [data-step="pending_approval"]')).not.toBeNull();
  });

  it('a new position must be chosen when the destination has no same position', async () => {
    answers.transfer_crew_options = ok(optionsJson({ destinations: [{ ...optionsJson().destinations[0], same_position_id: null }] }));
    renderModal();
    const details = await stepOf('details');
    expect(within(details).getByText('Deckhand is not on this vessel’s list')).toBeTruthy();
    fireEvent.click(within(details).getByRole('button', { name: 'Save and review' }));
    await within(details).findByText(TRANSFER_MESSAGES.samePositionMissing);
    expect(callsTo('transfer_crew_start')).toEqual([]);
  });

  it('checks the dates before writing', async () => {
    renderModal();
    const details = await stepOf('details');
    fireEvent.change(within(details).getByLabelText('Joins HYDRA'), { target: { value: addDays(TODAY, -1) } });
    fireEvent.click(within(details).getByRole('button', { name: 'Save and review' }));
    await within(details).findByText(TRANSFER_MESSAGES.signOnBeforeSignOff);
    expect(callsTo('transfer_crew_start')).toEqual([]);
  });

  it('going back from the review keeps the details', async () => {
    answers.transfer_crew_start = ok(transferJson());
    answers.transfer_crew_review = ok(reviewed({ notes: 'Kept' }));
    renderModal();
    const details = await stepOf('details');
    fireEvent.click(within(details).getByRole('button', { name: 'Save and review' }));
    const review = await stepOf('review');
    fireEvent.click(within(review).getByRole('button', { name: 'Change details' }));
    const again = await stepOf('details');
    expect((within(again).getByLabelText('Notes (optional)') as HTMLTextAreaElement).value).toBe('Kept');
  });
});

describe('refusals', () => {
  it('a 42501 shows the D-207 sentence as is', async () => {
    answers.transfer_crew_start = fail({ code: '42501', message: 'manages_admins_required', details: D207 });
    renderModal();
    const details = await stepOf('details');
    fireEvent.click(within(details).getByRole('button', { name: 'Save and review' }));
    const alert = await within(details).findByRole('alert');
    expect(alert.textContent).toBe(D207);
    expect(callsTo('transfer_crew_review')).toEqual([]);
  });

  it('a 22023 with a HINT lands on its field', async () => {
    answers.transfer_crew_start = fail({ code: '22023', message: 'sign_off_before_join', details: 'The sign-off date is before they joined this vessel.', hint: 'sign_off_date' });
    renderModal();
    const details = await stepOf('details');
    fireEvent.click(within(details).getByRole('button', { name: 'Save and review' }));
    await within(details).findByText('The sign-off date is before they joined this vessel.');
    expect(within(details).getByLabelText('Signs off DRAAK').getAttribute('aria-invalid')).toBe('true');
    expect(within(details).queryByRole('alert')).toBeNull();
  });

  it('an answer that cannot be read is an error, never a success', async () => {
    answers.transfer_crew_start = ok({ id: T, status: 'draft' });
    renderModal();
    const details = await stepOf('details');
    fireEvent.click(within(details).getByRole('button', { name: 'Save and review' }));
    expect((await within(details).findByRole('alert')).textContent).toBe(UNREADABLE_ANSWER);
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('the server block opens as such (a pending placement, D-225)', async () => {
    answers.transfer_crew_options = ok(
      optionsJson({ destinations: [], blocked: { code: 'pending_placement_not_transferable', message: 'Not on board yet. Change the pending vessel on the profile.' } }),
    );
    renderModal();
    await waitFor(() => expect(document.querySelector('[data-transfer-blocked="pending_placement_not_transferable"]')).not.toBeNull());
    expect(screen.getByText('Not on board yet. Change the pending vessel on the profile.')).toBeTruthy();
    expect(document.querySelector('[data-transfer-step]')).toBeNull();
  });
});

describe('an open transfer', () => {
  it('opens where it stands: approve as a fleet approver', async () => {
    const pending = transferJson({
      status: 'pending_approval',
      requires_approval: true,
      review: { generated_at: null, items: [] },
      submitted_at: `${TODAY}T08:02:00Z`,
      submitted_by_name: 'Demo Officer',
      rights: { can_decide: true, can_cancel: true },
    });
    answers.transfer_crew_options = ok(optionsJson({ open_transfer: pending }));
    answers.transfer_crew_decide = ok(transferJson({ ...pending, status: 'scheduled', approved_at: `${TODAY}T09:00:00Z`, approved_by_name: 'Fleet Approver', rights: { can_cancel: true } }));
    renderModal();
    const status = await stepOf('status');
    expect(within(status).getByText('Waiting for fleet approval.')).toBeTruthy();
    fireEvent.click(within(status).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(callsTo('transfer_crew_decide')).toEqual([{ p_transfer_id: T, p_decision: 'approve', p_reason: null }]));
    await within(status).findByText(/Fleet Approver/);
    expect(h.notify.success).toHaveBeenCalledWith('Decision saved');
  });

  it('a decline needs a reason', async () => {
    const pending = transferJson({ status: 'pending_approval', requires_approval: true, submitted_at: `${TODAY}T08:02:00Z`, rights: { can_decide: true } });
    answers.transfer_crew_options = ok(optionsJson({ open_transfer: pending }));
    answers.transfer_crew_decide = ok(transferJson({ ...pending, status: 'cancelled', decline_reason: 'Short-handed', cancelled_at: `${TODAY}T09:00:00Z`, rights: {} }));
    renderModal();
    const status = await stepOf('status');
    fireEvent.click(within(status).getByRole('button', { name: 'Decline' }));
    fireEvent.click(within(status).getByRole('button', { name: 'Decline transfer' }));
    await within(status).findByText(TRANSFER_MESSAGES.reasonRequired);
    expect(callsTo('transfer_crew_decide')).toEqual([]);
    fireEvent.change(within(status).getByLabelText('Why is it declined?'), { target: { value: 'Short-handed' } });
    fireEvent.click(within(status).getByRole('button', { name: 'Decline transfer' }));
    await waitFor(() => expect(callsTo('transfer_crew_decide')).toEqual([{ p_transfer_id: T, p_decision: 'decline', p_reason: 'Short-handed' }]));
    await within(status).findByText('Cancelled.');
  });

  it('the submitter sees why another approver decides (four eyes)', async () => {
    answers.transfer_crew_options = ok(
      optionsJson({ open_transfer: transferJson({ status: 'pending_approval', requires_approval: true, rights: { can_cancel: true, decide_block: 'own_submission' } }) }),
    );
    renderModal();
    const status = await stepOf('status');
    expect(within(status).getByText('You submitted this transfer, so another fleet approver decides it.')).toBeTruthy();
    expect(within(status).queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('cancelling a scheduled transfer needs a reason; completing it calls the one completion definer', async () => {
    const scheduled = transferJson({ status: 'scheduled', submitted_at: `${TODAY}T08:02:00Z`, rights: { can_cancel: true, can_complete: true } });
    answers.transfer_crew_options = ok(optionsJson({ open_transfer: scheduled }));
    answers.transfer_crew = ok(transferJson({ ...scheduled, status: 'completed', completed_at: `${TODAY}T10:00:00Z`, rights: {} }));
    renderModal();
    const status = await stepOf('status');
    fireEvent.click(within(status).getByRole('button', { name: 'Cancel transfer' }));
    fireEvent.click(within(status).getByRole('button', { name: 'Cancel transfer' }));
    await within(status).findByText(TRANSFER_MESSAGES.reasonRequired);
    expect(callsTo('transfer_crew_cancel')).toEqual([]);
    fireEvent.click(within(status).getByRole('button', { name: 'Back' }));
    fireEvent.click(within(status).getByRole('button', { name: 'Complete transfer now' }));
    await waitFor(() => expect(callsTo('transfer_crew')).toEqual([{ p_transfer_id: T }]));
    await within(status).findByText('Completed. The person is on the new vessel’s crew.');
    expect(h.notify.success).toHaveBeenCalledWith('Transfer completed');
  });

  it('an open review reopens on the review with the ticks that still hold', async () => {
    answers.transfer_crew_options = ok(
      optionsJson({ open_transfer: reviewed({ acknowledgements: [{ key: 'appraisal:last', fingerprint: 'f2', note: null }, { key: 'requirement:bst', fingerprint: 'stale' }] }) }),
    );
    renderModal();
    const review = await stepOf('review');
    expect(within(review).getByText('1 of 2 acknowledged · 1 need attention')).toBeTruthy();
  });

  it('cancelling a review takes no reason', async () => {
    answers.transfer_crew_options = ok(optionsJson({ open_transfer: reviewed() }));
    answers.transfer_crew_cancel = ok(reviewed({ status: 'cancelled', cancelled_at: `${TODAY}T09:00:00Z`, rights: {} }));
    renderModal();
    const review = await stepOf('review');
    fireEvent.click(within(review).getByRole('button', { name: 'Cancel transfer' }));
    await waitFor(() => expect(callsTo('transfer_crew_cancel')).toEqual([{ p_transfer_id: T, p_reason: null }]));
    await within(await stepOf('status')).findByText('Cancelled.');
    expect(h.notify.success).toHaveBeenCalledWith('Transfer cancelled');
  });

  it('someone who may not change it sees where it stands', async () => {
    answers.transfer_crew_options = ok(optionsJson({ open_transfer: reviewed({ rights: {} }) }));
    renderModal();
    const status = await stepOf('status');
    expect(within(status).getByText('Waiting for the review to be acknowledged and submitted.')).toBeTruthy();
    expect(within(status).queryByRole('button', { name: 'Cancel transfer' })).toBeNull();
  });
});

describe('D-01 and errors', () => {
  it('the transfer RPCs missing: the legacy form with the notice', async () => {
    answers = {};
    renderModal();
    await waitFor(() => expect(document.querySelector('[data-transfer-fallback]')).not.toBeNull());
    expect(screen.getByText(TRANSFER_UNAVAILABLE_NOTICE)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Transfer Crew Member' })).toBeTruthy();
    expect(callsTo('transfer_crew_options')).toHaveLength(1);
  });

  it('a 42883 naming the function is the same fallback', async () => {
    answers.transfer_crew_options = fail({ code: '42883', message: 'function public.transfer_crew_options(uuid, uuid) does not exist' });
    renderModal();
    await waitFor(() => expect(document.querySelector('[data-transfer-fallback]')).not.toBeNull());
  });

  it('any other error is an error with Try again, never the fallback', async () => {
    let n = 0;
    answers.transfer_crew_options = () => {
      n += 1;
      return n <= 2 ? fail({ code: '57014', message: 'canceling statement due to statement timeout' }) : ok(optionsJson());
    };
    renderModal();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent?.length).toBeGreaterThan(0);
    expect(document.querySelector('[data-transfer-fallback]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await stepOf('details');
  });

  it('no access reads as such', async () => {
    answers.transfer_crew_options = fail({ code: '42501', message: 'out_of_reach', details: 'This person is outside your reach.' });
    renderModal();
    expect((await screen.findByRole('alert')).textContent).toBe('This person is outside your reach.');
    expect(document.querySelector('[data-transfer-step]')).toBeNull();
  });

  it('outside a vessel: the legacy form, without the notice, and no transfer read', async () => {
    h.scope = 'fleet';
    renderModal();
    await screen.findByRole('dialog', { name: 'Transfer Crew Member' });
    expect(document.querySelector('[data-transfer-fallback]')).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('the deep link', () => {
  it('opens one transfer by id (crew_transfer_submitted)', async () => {
    answers.transfer_crew_detail = ok(transferJson({ status: 'pending_approval', requires_approval: true, rights: { can_decide: true } }));
    render(
      <QueryClientProvider client={qc}>
        <TransferEntry open onClose={onClose} vessel={{ id: 'v-dra', companyId: 'c-1' }} profileId={P} personName="Demo Crew" transferId={T} />
      </QueryClientProvider>,
    );
    const status = await stepOf('status');
    expect(callsTo('transfer_crew_detail')).toEqual([{ p_transfer_id: T }]);
    expect(callsTo('transfer_crew_options')).toEqual([]);
    expect(within(status).getByRole('button', { name: 'Approve' })).toBeTruthy();
  });

  it('a transfer that cannot be found says so', async () => {
    answers.transfer_crew_detail = fail({ code: 'P0002', message: 'transfer_not_found', details: 'This transfer could not be found.' });
    render(
      <QueryClientProvider client={qc}>
        <TransferEntry open onClose={onClose} vessel={{ id: 'v-dra', companyId: 'c-1' }} profileId={P} personName="Demo Crew" transferId={T} />
      </QueryClientProvider>,
    );
    expect((await screen.findByRole('alert')).textContent).toBe('This transfer could not be found.');
  });
});

// ---------------------------------------------------------------- the profile header

const summary = (over: Partial<CrewProfileSummary> = {}): CrewProfileSummary => ({
  profileId: P,
  userId: 'u-1',
  firstName: 'Demo',
  lastName: 'Crew',
  preferredName: null,
  displayName: 'Demo Crew',
  avatarUrl: null,
  crewNumber: null,
  positionName: 'Deckhand',
  positionText: 'Deckhand',
  departmentKey: 'deck',
  departmentLabel: 'Deck',
  rankTier: null,
  onVessel: true,
  placementKind: 'assignment',
  assignmentId: 'a-1',
  joinDate: '2026-10-01',
  leaveDate: null,
  status: 'on_board',
  statusDetail: null,
  transferVesselId: null,
  leaveCode: null,
  loginState: 'active',
  prev: null,
  next: null,
  memberIndex: null,
  memberCount: null,
  isOwn: false,
  canEdit: false,
  canEditSelf: false,
  tabs: null,
  source: 'server',
  ...over,
});

let lastSearch = '';
const SearchProbe: React.FC = () => {
  lastSearch = useLocation().search;
  return null;
};

function renderHeader(s: CrewProfileSummary, initial = '/v/dra/crew/people/p/personal') {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <ProfileHeader
          summary={s}
          vesselName="DRAAK"
          nameOfVessel={() => null}
          scopedPath={(rel) => `/v/dra/${rel}`}
          pathFor={(id) => `/v/dra/crew/people/${id}/personal`}
          editPath={null}
          today={TODAY}
        />
        <SearchProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('the profile header', () => {
  it('Transfer opens the wizard for someone on this vessel', async () => {
    renderHeader(summary());
    expect(h.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }));
    await stepOf('details');
    expect(callsTo('transfer_crew_options')).toEqual([{ p_profile_id: P, p_from_vessel_id: 'v-dra' }]);
  });

  it('a pending placement says why not (D-225)', () => {
    renderHeader(summary({ placementKind: 'pending_placement', assignmentId: null }));
    const button = screen.getByRole('button', { name: 'Transfer' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(PENDING_TRANSFER_SENTENCE, { selector: '#profile-transfer-unavailable' })).toBeTruthy();
    fireEvent.click(button);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('no Transfer without the capability, on one’s own profile, off the crew or on the fallback', () => {
    h.canAssign = false;
    const { unmount } = renderHeader(summary());
    expect(screen.queryByRole('button', { name: 'Transfer' })).toBeNull();
    unmount();
    h.canAssign = true;
    for (const over of [{ isOwn: true }, { onVessel: false }, { source: 'fallback' as const }]) {
      const r = renderHeader(summary(over));
      expect(screen.queryByRole('button', { name: 'Transfer' }), JSON.stringify(over)).toBeNull();
      r.unmount();
    }
  });

  it('?transfer=<id> opens that transfer; closing it drops the parameter', async () => {
    answers.transfer_crew_detail = ok(transferJson({ status: 'pending_approval', requires_approval: true, rights: { can_decide: true } }));
    h.canAssign = false;
    renderHeader(summary(), `/v/dra/crew/people/p/personal?transfer=${T}`);
    const status = await stepOf('status');
    expect(callsTo('transfer_crew_detail')).toEqual([{ p_transfer_id: T }]);
    fireEvent.click(within(status).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(lastSearch).toBe(''));
    expect(document.querySelector('[data-transfer-step]')).toBeNull();
  });
});
