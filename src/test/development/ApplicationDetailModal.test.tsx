/**
 * The training application dialog (X5-07A, X5-07B; gap/02 W3, TR4–TR6;
 * D-X5-20): it offers only the steps the machine and the viewer's part
 * allow, sends each one through development_transition with what the
 * server needs (comment, reason, completion day, the office for a
 * dual-office person, the updated_at it loaded), keeps Return and Reject
 * distinct (a reject and a void are confirmed in their own dialog with a
 * reason), lets approvers correct details (edit_fields, only what changed),
 * shows the history with its field diffs, never offers the applicant a
 * review of their own application, and, while development_transition is
 * missing, leaves only the applicant's submit and cancel of a draft
 * working: every other step reads "Not set up yet".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  userId: 'user-1',
  support: 'unknown' as 'unknown' | 'available' | 'missing',
  mode: 'both' as 'both' | 'either',
  isAdmin: false,
  lifecycle: null as Record<string, unknown> | null,
  events: { status: 'not_set_up' } as Record<string, unknown>,
  mutateAsync: vi.fn(),
}));

vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.userId } }) }));
vi.mock('@/lib/permissions/useCan', () => ({ useCan: () => h.isAdmin }));
vi.mock('@/modules/development/hooks/useDevelopmentMutations', () => ({
  useApplicationTransition: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
  useTransitionSupport: () => h.support,
}));
vi.mock('@/modules/development/hooks/useProgramSettings', async () => {
  const { DEFAULT_CATEGORY_LABELS } = await import('@/modules/development/lib/settingsSchema');
  return {
    usePolicyExtras: () => ({ data: { final_approval_mode: h.mode, notSetUp: false } }),
    useCategoryLabels: () => DEFAULT_CATEGORY_LABELS,
  };
});
vi.mock('@/modules/development/hooks/useApplicationLifecycle', () => ({
  useApplicationLifecycle: () => ({ data: h.lifecycle }),
}));
vi.mock('@/modules/development/components/training/useFleetTrainingData', () => ({
  useApplicationEvents: () => h.events,
}));

import ApplicationDetailModal, { type DetailApplication } from '@/modules/development/components/ApplicationDetailModal';
import { TRANSITION_NOT_SET_UP } from '@/modules/development/lib/applicationMachine';

const APPLICANT = 'user-1';
const REVIEWER = 'user-2';

const application = (over: Partial<DetailApplication> = {}): DetailApplication => ({
  id: 'app-1',
  status: 'draft',
  crew_member_id: APPLICANT,
  application_number: 'CDA-20261126-0001',
  course_name: 'Advanced firefighting',
  category: 'mandatory',
  estimated_total_usd: 1200,
  updated_at: '2026-11-26T09:00:00Z',
  crew_member: { first_name: 'Deck', last_name: 'Rating' },
  ...over,
});

function renderModal(props: Partial<Parameters<typeof ApplicationDetailModal>[0]> & { application: DetailApplication }) {
  const onOpenChange = vi.fn();
  render(<ApplicationDetailModal open onOpenChange={onOpenChange} {...props} />);
  return { onOpenChange };
}

const actionsRegion = () => {
  const heading = screen.queryByRole('heading', { name: 'Next step' });
  return heading ? (heading.closest('section') as HTMLElement) : null;
};
const buttonNames = () => {
  const region = actionsRegion();
  return region ? within(region).getAllByRole('button').map((b) => b.textContent?.split(':')[0].trim()) : [];
};

beforeEach(() => {
  h.userId = APPLICANT;
  h.support = 'unknown';
  h.mode = 'both';
  h.isAdmin = false;
  h.lifecycle = null;
  h.events = { status: 'not_set_up' };
  h.mutateAsync.mockReset();
  h.mutateAsync.mockResolvedValue({ mode: 'rpc' });
});

describe('the applicant', () => {
  it('submits or cancels their draft, through the transition, with the time it loaded', async () => {
    const { onOpenChange } = renderModal({ application: application() });
    expect(buttonNames()).toEqual(['Submit for approval', 'Cancel application']);
    expect(screen.getByText('Waiting for you to submit it')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(h.mutateAsync).toHaveBeenCalledWith({
      applicationId: 'app-1',
      action: 'submit',
      payload: {},
      expectedUpdatedAt: '2026-11-26T09:00:00Z',
      currentStatus: 'draft',
      actingAs: 'applicant',
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('is never offered a review of their own application', () => {
    renderModal({ application: application({ status: 'hod_review' }), canReview: true, reviewStage: 'hod' });
    expect(buttonNames()).toEqual(['Cancel application']);
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
  });

  it('records the completion day of an enrolled course', async () => {
    renderModal({ application: application({ status: 'enrolled' }) });
    expect(buttonNames()).toEqual(['Record completion']);
    fireEvent.change(screen.getByLabelText('Completed on'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText('Certificate number (optional)'), { target: { value: 'AFF-77' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record completion' }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      action: 'complete',
      payload: { completed_on: '2026-11-20', certificate_number: 'AFF-77' },
      actingAs: 'applicant',
    });
  });

  it('shows why a rejected application ended, and offers nothing', () => {
    renderModal({ application: application({ status: 'rejected', denial_reason: 'The course is not on the approved list.' }) });
    expect(within(screen.getByRole('note')).getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('The course is not on the approved list.')).toBeInTheDocument();
    expect(actionsRegion()).toBeNull();
  });

  it('shows the void reason from the lifecycle columns', () => {
    h.lifecycle = { void_reason: 'Entered twice', notSetUp: false };
    renderModal({ application: application({ status: 'voided' }) });
    expect(within(screen.getByRole('note')).getByText('Entered twice')).toBeInTheDocument();
  });
});

describe('the head of department', () => {
  beforeEach(() => {
    h.userId = REVIEWER;
  });

  it('approves, returns with a comment, or rejects with a reason: distinct steps', async () => {
    renderModal({ application: application({ status: 'hod_review' }), canReview: true, reviewStage: 'hod' });
    expect(buttonNames()).toEqual(['Approve', 'Return for changes', 'Reject']);
    const returnButton = screen.getByRole('button', { name: /Return for changes/ });
    expect(returnButton).toBeDisabled();
    expect(returnButton).toHaveTextContent('What needs to change is needed');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Comment or reason'), { target: { value: 'Add the course dates' } });
    expect(returnButton).toBeEnabled();
    fireEvent.click(returnButton);
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({ action: 'hod_return', payload: { comment: 'Add the course dates' }, actingAs: 'hod' });

    // Reject is its own confirmation, with its own reason: never the return comment.
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const confirm = await screen.findByRole('dialog', { name: 'Reject this application' });
    expect(confirm).toHaveTextContent('it cannot be resubmitted');
    const send = within(confirm).getByRole('button', { name: 'Reject application' });
    expect(send).toBeDisabled();
    fireEvent.change(within(confirm).getByLabelText('Why it is rejected'), { target: { value: 'Not on the approved list' } });
    fireEvent.click(send);
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(2));
    expect(h.mutateAsync.mock.calls[1][0]).toMatchObject({ action: 'reject', payload: { reason: 'Not on the approved list' }, actingAs: 'hod' });
  });

  it('keeps the reject confirmation open when the server refuses it', async () => {
    h.mutateAsync.mockRejectedValue(new Error('stale_application'));
    const { onOpenChange } = renderModal({ application: application({ status: 'hod_review' }), canReview: true, reviewStage: 'hod' });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const confirm = await screen.findByRole('dialog', { name: 'Reject this application' });
    fireEvent.change(within(confirm).getByLabelText('Why it is rejected'), { target: { value: 'Duplicate' } });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Reject application' }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(screen.getByRole('dialog', { name: 'Reject this application' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('corrects details through edit_fields, sending only what changed', async () => {
    renderModal({ application: application({ status: 'hod_review', course_provider: 'Sea School' }), canReview: true, reviewStage: 'hod' });
    fireEvent.click(screen.getByRole('button', { name: /Correct details/ }));
    const form = await screen.findByRole('dialog', { name: 'Correct details' });
    fireEvent.change(within(form).getByLabelText('Provider'), { target: { value: 'Ocean Academy' } });
    fireEvent.change(within(form).getByLabelText('Note for the applicant (optional)'), { target: { value: 'Provider changed' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save corrections' }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      action: 'edit_fields',
      payload: { fields: { course_provider: 'Ocean Academy' }, comment: 'Provider changed' },
      expectedUpdatedAt: '2026-11-26T09:00:00Z',
      actingAs: 'hod',
    });
  });

  it('never offers corrections to the applicant', () => {
    h.userId = APPLICANT;
    renderModal({ application: application({ status: 'hod_review' }), canReview: true, reviewStage: 'hod' });
    expect(screen.queryByRole('button', { name: /Correct details/ })).toBeNull();
  });

  it('keeps the dialog open when the step is refused', async () => {
    h.mutateAsync.mockRejectedValue(new Error('not_permitted'));
    const { onOpenChange } = renderModal({ application: application({ status: 'hod_review' }), canReview: true, reviewStage: 'hod' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('the final approvers', () => {
  beforeEach(() => {
    h.userId = REVIEWER;
  });

  it("waits for the Purser once the Captain has approved ('both')", () => {
    renderModal({
      application: application({ status: 'captain_purser_review', captain_decision: 'approved', captain_reviewer_id: 'user-3' }),
      canReview: true,
      reviewStage: 'captain',
    });
    expect(screen.getByText('Waiting for the Purser')).toBeInTheDocument();
    expect(buttonNames()).not.toContain('Approve');
    expect(buttonNames()).toContain('Return for changes');
  });

  it('voids an application in its own dialog, with a reason', async () => {
    renderModal({ application: application({ status: 'approved' }), viewerRoles: ['training_admin'] });
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    const confirm = await screen.findByRole('dialog', { name: 'Void this application' });
    expect(confirm).toHaveTextContent('leaves every register and total');
    fireEvent.change(within(confirm).getByLabelText('Why it is voided'), { target: { value: 'Entered twice' } });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Void application' }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({ action: 'void', payload: { reason: 'Entered twice' }, actingAs: 'training_admin' });
  });

  it('asks a person holding both offices which one they act in, and sends it', async () => {
    renderModal({ application: application({ status: 'captain_purser_review' }), viewerRoles: ['captain', 'purser'] });
    expect(buttonNames()).toEqual(['Approve', 'Approve as discretionary', 'Return for changes', 'Reject', 'Void']);
    fireEvent.click(screen.getByLabelText('Act as the Purser'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({ action: 'final_approve', payload: { role: 'purser' } });
  });

  it('needs a justification for a discretionary approval', () => {
    renderModal({ application: application({ status: 'captain_purser_review' }), canReview: true, reviewStage: 'captain' });
    expect(screen.getByRole('button', { name: /Approve as discretionary/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Comment or reason'), { target: { value: 'Needed for the yard period' } });
    expect(screen.getByRole('button', { name: /Approve as discretionary/ })).toBeEnabled();
  });
});

describe('while development_transition is missing (D-X5-20)', () => {
  beforeEach(() => {
    h.support = 'missing';
  });

  it("keeps the applicant's submit and cancel of a draft", () => {
    renderModal({ application: application() });
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel application' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(TRANSITION_NOT_SET_UP);
  });

  it('shows every other step as not set up yet', () => {
    h.userId = REVIEWER;
    renderModal({ application: application({ status: 'hod_review' }), canReview: true, reviewStage: 'hod' });
    for (const name of ['Approve', 'Return for changes', 'Reject']) {
      const button = screen.getByRole('button', { name: new RegExp(`^${name}`) });
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Not set up yet');
    }
  });

  it("does not let the applicant cancel once the application is past draft", () => {
    renderModal({ application: application({ status: 'hod_review' }) });
    expect(screen.getByRole('button', { name: /Cancel application/ })).toBeDisabled();
  });
});

describe('history (TR5)', () => {
  it('says when the step-by-step history is not set up yet', () => {
    renderModal({ application: application() });
    expect(screen.getByTestId('dev-app-history-not-set-up')).toBeInTheDocument();
  });

  it('lists every step with who, from and to, the comment and the field diffs', () => {
    h.events = {
      status: 'ready',
      events: [
        { id: 'e1', action: 'submit', fromStatus: 'draft', toStatus: 'hod_review', actorRole: 'applicant', actorName: 'Deck Rating', comment: null, fieldDiff: null, createdAt: '2026-11-20T09:00:00Z' },
        {
          id: 'e2',
          action: 'edit_fields',
          fromStatus: 'hod_review',
          toStatus: 'hod_review',
          actorRole: 'hod',
          actorName: null,
          comment: 'Provider moved the dates',
          fieldDiff: { course_end_date: { from: '2026-12-03', to: '2026-12-04' }, estimated_tuition_usd: { from: 900, to: 950 } },
          createdAt: '2026-11-21T09:00:00Z',
        },
      ],
    };
    renderModal({ application: application({ status: 'hod_review' }) });
    const history = screen.getByRole('list', { name: 'Application history' });
    const items = within(history).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Submitted for approval');
    expect(items[0]).toHaveTextContent('By Applicant, Deck Rating');
    expect(items[1]).toHaveTextContent('Details corrected');
    expect(items[1]).toHaveTextContent('By Head of department, name not available');
    const diff = within(items[1]).getByLabelText('What changed');
    expect(diff).toHaveTextContent('End2026-12-03');
    expect(diff).toHaveTextContent('2026-12-04');
    expect(diff).toHaveTextContent('Tuition (USD)900');
    expect(diff).toHaveTextContent('950');
  });
});
