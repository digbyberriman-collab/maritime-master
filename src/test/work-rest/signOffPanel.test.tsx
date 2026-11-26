/**
 * The month's sign-off (X1-07B; gap/04 C39, C43, W6; T-148; D-X1-6,
 * D-X1-11): who may act comes from capabilities on the vessel plus the
 * department rule, never role names; each step goes through
 * work_rest_month_transition (transitionMonth), with the legacy writes while
 * the engine is missing (D-01); the HoD step follows hod_step; reopen and
 * submit on behalf need a reason; refusals show the server's sentence.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  caps: new Set<string>(),
  transition: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/permissions/useCan', () => ({
  useCan: (key: string) => h.caps.has(key),
  useCapability: (key: string) => ({ allowed: h.caps.has(key), status: h.caps.has(key) ? 'granted' : 'denied', reason: 'test' }),
}));
vi.mock('@/modules/work-rest/services/workRestService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/work-rest/services/workRestService')>();
  return { ...actual, transitionMonth: (...args: unknown[]) => h.transition(...args) };
});
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import { SignOffPanel, type SignOffPanelProps } from '@/modules/work-rest/components/SignOffPanel';
import { WorkRestEngineRequired, WorkRestRefusal, type MonthlySubmission, type NonConformityListRow, type SignatureListRow } from '@/modules/work-rest/services/workRestService';
import { CREW_CAPS } from '@/modules/crew/paths';

const ME = 'u-me';
const CREW = 'u-crew';

const month = (status: string, extra: Partial<MonthlySubmission> = {}): MonthlySubmission => ({
  id: 'sub-1',
  crew_id: CREW,
  vessel_id: 'v-dra',
  period_year: 2026,
  period_month: 11,
  status: status as MonthlySubmission['status'],
  ...extra,
});

const sig = (role: string, extra: Partial<SignatureListRow> = {}): SignatureListRow => ({
  id: `sig-${role}`,
  submission_id: 'sub-1',
  signer_id: 'u-x',
  signer_role: role,
  signature_method: 'electronic',
  signature_payload: null,
  signed_at: '2026-11-25T18:00:00.000Z',
  stale_at: null,
  stale_reason: null,
  profiles: { first_name: 'Demo', last_name: role === 'crew' ? 'Deckhand' : 'Signer', email: 'signer@example.test', rank: null },
  ...extra,
});

const breach = (severity: string, extra: Partial<NonConformityListRow> = {}): NonConformityListRow =>
  ({
    id: `nc-${severity}`,
    crew_id: CREW,
    submission_id: 'sub-1',
    rule_code: 'REST_24H_MIN',
    rule_description: 'At least 10 h of rest in any 24 h',
    severity,
    window_start: '2026-11-14T00:00:00',
    window_end: '2026-11-15T00:00:00',
    measured_value: 8,
    threshold_value: 10,
    suggested_correction: null,
    status: 'open',
    justification: null,
    reviewer_id: null,
    reviewed_at: null,
    created_at: '2026-11-15T00:00:00Z',
    updated_at: '2026-11-15T00:00:00Z',
    vessel_id: 'v-dra',
    breach_day: '2026-11-14',
    is_serious: false,
    deficit_hours: 2,
    review_outcome: null,
    review_note: null,
    reviewed_by: null,
    breach_report_id: null,
    superseded_at: null,
    ...extra,
  }) as NonConformityListRow;

const onChanged = vi.fn();

function renderPanel(over: Partial<SignOffPanelProps> = {}) {
  const props: SignOffPanelProps = {
    vesselId: 'v-dra',
    vesselName: 'DRAAK',
    crewUserId: CREW,
    crewName: 'Demo Deckhand',
    year: 2026,
    month: 11,
    monthLabel: 'November 2026',
    submission: month('draft'),
    signatures: [],
    nonConformities: [],
    actorId: ME,
    isOwn: false,
    sameDepartment: true,
    inMonth: true,
    stillAboard: true,
    hodStep: 'nudge',
    missingDays: 0,
    unsavedDays: 0,
    onChanged,
    ...over,
  };
  return render(<SignOffPanel {...props} />);
}

const grant = (...keys: string[]) => keys.forEach((k) => h.caps.add(k));

// Radix's checkbox measures itself.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

beforeEach(() => {
  h.caps.clear();
  h.transition.mockReset();
  onChanged.mockReset();
  Object.values(h.notify).forEach((fn) => fn.mockReset());
});

describe('who may act: capabilities and department, no role names', () => {
  it('the crew member submits their own open month (hours_of_rest.create)', () => {
    grant(CREW_CAPS.horCreate);
    renderPanel({ isOwn: true, actorId: CREW });
    expect(screen.getByRole('button', { name: 'Submit month' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Approve|Sign as head|Reopen|Lock/ })).toBeNull();
  });

  it('without the create capability the own month offers nothing', () => {
    renderPanel({ isOwn: true, actorId: CREW });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Nothing to do on this month now.')).toBeInTheDocument();
  });

  it('nobody else submits the month (only on behalf, for a leaver)', () => {
    grant(CREW_CAPS.horCreate, CREW_CAPS.horApprove, CREW_CAPS.horFinalApprove);
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Submit month' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit on their behalf' })).toBeNull();
  });

  it('a head of department signs a submitted month of their own department (hours_of_rest.approve)', () => {
    grant(CREW_CAPS.horApprove);
    renderPanel({ submission: month('submitted') });
    expect(screen.getByRole('button', { name: 'Sign as head of department' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approve month' })).toBeNull();
  });

  it('…but not a month of another department', () => {
    grant(CREW_CAPS.horApprove);
    renderPanel({ submission: month('submitted'), sameDepartment: false });
    expect(screen.queryByRole('button', { name: 'Sign as head of department' })).toBeNull();
    expect(screen.getByText('You have no step to take on this month now.')).toBeInTheDocument();
  });

  it('…and not their own month', () => {
    grant(CREW_CAPS.horApprove, CREW_CAPS.horFinalApprove);
    renderPanel({ submission: month('submitted'), isOwn: true, actorId: CREW });
    expect(screen.queryByRole('button', { name: /Sign as head|Approve month|Reopen/ })).toBeNull();
  });

  it('the final approver approves a submitted or HoD-signed month, whatever the department', () => {
    grant(CREW_CAPS.horFinalApprove);
    renderPanel({ submission: month('hod_signed'), sameDepartment: false });
    expect(screen.getByRole('button', { name: 'Approve month' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeEnabled();
  });

  it('legacy statuses read as their new names (captain_reviewed is approved: Lock and Reopen)', () => {
    grant(CREW_CAPS.horFinalApprove);
    renderPanel({ submission: month('captain_reviewed') });
    expect(screen.getByRole('button', { name: 'Lock' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approve month' })).toBeNull();
  });
});

describe('conditions: shown, but disabled with the reason', () => {
  it('Submit waits for the changed days to be saved', () => {
    grant(CREW_CAPS.horCreate);
    renderPanel({ isOwn: true, actorId: CREW, unsavedDays: 2 });
    expect(screen.getByRole('button', { name: 'Submit month' })).toBeDisabled();
    expect(screen.getByText('Save the changed days first.')).toBeInTheDocument();
  });

  it('Submit needs an assignment to the vessel in the month', () => {
    grant(CREW_CAPS.horCreate);
    renderPanel({ isOwn: true, actorId: CREW, inMonth: false });
    expect(screen.getByRole('button', { name: 'Submit month' })).toBeDisabled();
    expect(screen.getByText('There is no assignment to this vessel in that month.')).toBeInTheDocument();
  });

  it('Approve waits for every breach but the low ones to be reviewed', () => {
    grant(CREW_CAPS.horFinalApprove);
    renderPanel({ submission: month('submitted'), nonConformities: [breach('high')] });
    expect(screen.getByRole('button', { name: 'Approve month' })).toBeDisabled();
    expect(screen.getByText('Review every breach before approving the month.')).toBeInTheDocument();
  });

  it('reviewed and superseded breaches do not block', () => {
    grant(CREW_CAPS.horFinalApprove);
    renderPanel({
      submission: month('submitted'),
      nonConformities: [breach('high', { review_outcome: 'accepted' }), breach('critical', { id: 'nc-2', superseded_at: '2026-11-20T00:00:00Z' })],
    });
    expect(screen.getByRole('button', { name: 'Approve month' })).toBeEnabled();
  });
});

describe('the HoD step follows the vessel (hod_step)', () => {
  it('off: no HoD row and no HoD sign', () => {
    grant(CREW_CAPS.horApprove, CREW_CAPS.horFinalApprove);
    renderPanel({ submission: month('submitted'), hodStep: 'off' });
    expect(screen.queryByText(/Head of department/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign as head of department' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve month' })).toBeEnabled();
  });

  it('nudge: the approver is reminded, approval stays open and the dialog says Approve anyway (T-148)', async () => {
    grant(CREW_CAPS.horFinalApprove);
    h.transition.mockResolvedValue({ mode: 'engine', result: { submission_id: 'sub-1', status: 'approved', warnings: ['hod_not_signed'], signature_id: 's' } });
    renderPanel({ submission: month('submitted'), signatures: [sig('crew')] });
    expect(screen.getByText(/Head of department \(optional\)/)).toBeInTheDocument();
    expect(screen.getByText('The head of department has not signed this month yet. You can still approve it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve month' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('The head of department has not signed this month.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve anyway' }));
    await waitFor(() => expect(h.transition).toHaveBeenCalledTimes(1));
    expect(h.transition.mock.calls[0][0]).toMatchObject({ vesselId: 'v-dra', crewId: CREW, year: 2026, month: 11, action: 'approve', legacy: { submissionId: 'sub-1', actorId: ME } });
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Month approved'));
    expect(h.notify.warning).toHaveBeenCalledWith('The head of department has not signed this month.');
    expect(onChanged).toHaveBeenCalled();
  });

  it('required: approval waits for the HoD signature', () => {
    grant(CREW_CAPS.horFinalApprove);
    renderPanel({ submission: month('submitted'), hodStep: 'required' });
    expect(screen.getByText(/Head of department \(required\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve month' })).toBeDisabled();
    expect(screen.getByText('The head of department signs the month before approval on this vessel.')).toBeInTheDocument();
  });

  it('required, signed: approval opens', () => {
    grant(CREW_CAPS.horFinalApprove);
    renderPanel({ submission: month('hod_signed'), hodStep: 'required', signatures: [sig('crew'), sig('hod')] });
    expect(screen.getByRole('button', { name: 'Approve month' })).toBeEnabled();
  });
});

describe('the steps', () => {
  it('submit signs the statement, which must be confirmed', async () => {
    grant(CREW_CAPS.horCreate);
    h.transition.mockResolvedValue({ mode: 'engine', result: { submission_id: 'sub-1', status: 'submitted', warnings: ['days_not_entered'], signature_id: 's' } });
    renderPanel({ isOwn: true, actorId: CREW, missingDays: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Submit month' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Some days of the month have no entry. (2 days)')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit and sign' }));
    expect(await within(dialog).findByText('Confirm the statement to submit')).toBeInTheDocument();
    expect(h.transition).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit and sign' }));
    await waitFor(() => expect(h.transition).toHaveBeenCalledTimes(1));
    expect(h.transition.mock.calls[0][0]).toMatchObject({
      action: 'submit',
      crewId: CREW,
      signatureText: 'I confirm these records of my hours of work and rest are accurate.',
      reason: null,
    });
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Month submitted'));
    expect(h.notify.warning).toHaveBeenCalledWith('Some days of the month have no entry.');
  });

  it('reopen needs a reason, and sends it', async () => {
    grant(CREW_CAPS.horFinalApprove);
    h.transition.mockResolvedValue({ mode: 'engine', result: { submission_id: 'sub-1', status: 'reopened', warnings: [], signature_id: null } });
    renderPanel({ submission: month('locked'), signatures: [sig('crew'), sig('captain')] });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
    expect(await within(dialog).findByText('Give a reason')).toBeInTheDocument();
    expect(h.transition).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: '  Day 6 entered on the wrong day  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(h.transition).toHaveBeenCalledTimes(1));
    expect(h.transition.mock.calls[0][0]).toMatchObject({ action: 'reopen', reason: 'Day 6 entered on the wrong day', signatureText: null });
  });

  it('submit on behalf: only for a person who has left the vessel, with a reason', async () => {
    grant(CREW_CAPS.horFinalApprove);
    h.transition.mockRejectedValue(new WorkRestEngineRequired());
    renderPanel({ stillAboard: false });
    fireEvent.click(screen.getByRole('button', { name: 'Submit on their behalf' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Signed off on 12 November' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for them' }));
    // D-01: on behalf exists only in the engine; the sentence says so and nothing is reported done.
    expect(await within(dialog).findByText('This step becomes available once the hours-of-rest update is applied.')).toBeInTheDocument();
    expect(h.notify.success).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('the legacy path (engine missing, D-01) completes the step with no server-only warnings', async () => {
    grant(CREW_CAPS.horFinalApprove);
    h.transition.mockResolvedValue({ mode: 'legacy', status: 'captain_reviewed' });
    renderPanel({ submission: month('crew_signed'), hodStep: 'off' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve month' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and sign' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Month approved'));
    expect(h.notify.warning).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it("a refusal shows the server's sentence in the dialog (crewRefusalMessage)", async () => {
    grant(CREW_CAPS.horApprove);
    h.transition.mockRejectedValue(new WorkRestRefusal('42501', 'out_of_department', 'Heads of department sign months of their own department only.', null));
    renderPanel({ submission: month('submitted') });
    fireEvent.click(screen.getByRole('button', { name: 'Sign as head of department' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign' }));
    expect(await within(dialog).findByText('Heads of department sign months of their own department only.')).toBeInTheDocument();
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('a refusal without a sentence reads the client copy for its code, never the code', async () => {
    grant(CREW_CAPS.horFinalApprove);
    h.transition.mockRejectedValue(new WorkRestRefusal('22023', 'breaches_unreviewed', null, null));
    renderPanel({ submission: month('submitted'), hodStep: 'off' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve month' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and sign' }));
    expect(await within(dialog).findByText('Review every breach before approving the month.')).toBeInTheDocument();
    expect(within(dialog).queryByText('breaches_unreviewed')).toBeNull();
  });
});

describe('the steps shown', () => {
  it('names who signed and when; stale signatures (before a reopen) do not count', () => {
    renderPanel({
      submission: month('reopened', { reopen_reason: 'Day 6 was entered on the wrong day.' }),
      signatures: [sig('crew', { stale_at: '2026-11-02T12:00:00Z' })],
    });
    const crew = document.querySelector('[data-step="crew"]') as HTMLElement;
    expect(crew).not.toHaveAttribute('data-done');
    expect(within(crew).getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('Reopened: Day 6 was entered on the wrong day.')).toBeInTheDocument();
  });

  it('a company signature reads as submitted for the crew member', () => {
    renderPanel({ submission: month('submitted'), signatures: [sig('company', { profiles: { first_name: 'Demo', last_name: 'Master', email: 'm@example.test', rank: null } })] });
    const crew = document.querySelector('[data-step="crew"]') as HTMLElement;
    expect(within(crew).getByText('Submitted for the crew member')).toBeInTheDocument();
    expect(within(crew).getByText(/Demo Master/)).toBeInTheDocument();
  });
});
