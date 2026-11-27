/**
 * The breach report dialog (BreachReportDialog; gap/04 C42, W6; T-142;
 * D-X1-14, D-X1-23, D-249; X1-08B):
 *
 * - it offers only reviewed breaches of the period that are in no report
 *   (accepted, dismissed, the legacy reviewed states), and the company's
 *   DPA and fleet HR as recipients;
 * - the form's rules (breaches, recipients, the period) before anything is
 *   sent; the quick periods read the breaches again;
 * - Create report calls work_rest_breach_report_create with exactly what
 *   was chosen, and says "Report shared in STORM with <n> people";
 * - every refusal reads as a sentence: the server's DETAIL, else the known
 *   sentence for its code, naming the breach the server's HINT points at;
 *   no access; the RPC missing (D-01); any other error;
 * - D-01: the recipients or breach list missing keeps Create off with the
 *   not-set-up sentence; no recipients and no reportable breaches say so;
 * - no copy speaks of email.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Answer = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  answers: {} as Record<string, (args: Record<string, unknown>) => Answer>,
  calls: [] as { name: string; args: Record<string, unknown> }[],
  notify: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.calls.push({ name, args });
      return Promise.resolve(h.answers[name]?.(args) ?? { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } });
    },
    from: () => {
      throw new Error('the dialog reads no table');
    },
  },
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import BreachReportDialog from '@/modules/work-rest/components/hor-board/BreachReportDialog';
import { BREACH_REPORT_NOT_SET_UP } from '@/modules/work-rest/lib/horReport';

const ok = (data: unknown): Answer => ({ data, error: null });

const breach = (id: string, over: Record<string, unknown> = {}) => ({
  nc_id: id,
  profile_id: `p-${id}`,
  crew_user_id: `u-${id}`,
  first_name: 'Bosun',
  last_name: 'Example',
  preferred_name: null,
  position_name: 'Bosun',
  department_key: 'deck',
  department_label: 'Deck',
  submission_id: 's-1',
  month_status: 'approved',
  breach_day: '2026-11-04',
  rule_code: 'REST_24H_MIN',
  rule_description: 'Minimum rest in any 24 hours',
  severity: 'high',
  is_serious: false,
  measured_value: 8,
  threshold_value: 10,
  deficit_hours: 2,
  window_start: null,
  window_end: null,
  status: 'reviewed',
  review_outcome: 'accepted',
  review_note: 'Drill at anchor.',
  reviewed_by: 'u-master',
  reviewer_name: 'Demo Master',
  reviewed_at: '2026-11-06T09:00:00Z',
  breach_report_id: null,
  can_review: true,
  ...over,
});

const BREACHES = [
  breach('nc-accepted'),
  breach('nc-dismissed', { first_name: 'Deckhand', review_outcome: 'dismissed', breach_day: '2026-11-08', is_serious: true }),
  breach('nc-legacy', { first_name: 'Steward', review_outcome: null, status: 'justified', breach_day: '2026-11-02' }),
  breach('nc-open', { first_name: 'Open', review_outcome: null, status: 'open' }),
  breach('nc-waiting', { first_name: 'Waiting', review_outcome: 'correction_requested' }),
  breach('nc-reported', { first_name: 'Reported', breach_report_id: 'r-0' }),
  breach('nc-october', { first_name: 'October', breach_day: '2026-10-20' }),
];

const RECIPIENTS = [
  { user_id: 'u-dpa', profile_id: 'p-dpa', first_name: 'Demo', last_name: 'DPA', preferred_name: null, kind: 'dpa' },
  { user_id: 'u-hr', profile_id: 'p-hr', first_name: 'Fleet', last_name: 'HR Manager', preferred_name: null, kind: 'fleet_hr' },
];

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const onClose = vi.fn();
const onCreated = vi.fn();

beforeEach(() => {
  h.calls = [];
  h.answers = {
    work_rest_vessel_breaches: () => ok(BREACHES),
    work_rest_breach_report_recipients: () => ok(RECIPIENTS),
    work_rest_breach_report_create: () => ok({ report_id: 'r-new', reference: 'HORBR-DRA-2026-002', nc_count: 2, recipient_count: 1 }),
  };
  onClose.mockReset();
  onCreated.mockReset();
  for (const fn of Object.values(h.notify)) fn.mockReset();
});

function renderDialog(over: Partial<React.ComponentProps<typeof BreachReportDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <BreachReportDialog
        vesselId="v-dra"
        vesselName="DRAAK"
        defaultFrom="2026-11-01"
        defaultTo="2026-11-26"
        today="2026-11-26"
        onClose={onClose}
        onCreated={onCreated}
        {...over}
      />
    </QueryClientProvider>,
  );
}

const dialog = () => screen.getByRole('dialog');
const choices = () => within(dialog()).getByRole('list', { name: 'Reviewed breaches' });
const loaded = () => waitFor(() => expect(within(dialog()).getByRole('list', { name: 'Reviewed breaches' })).toBeInTheDocument());
const check = (name: RegExp | string) => fireEvent.click(within(dialog()).getByRole('checkbox', { name }));
const create = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Create report' }));

describe('what it offers', () => {
  it('reviewed breaches of the period in no report, by day; the DPA and fleet HR as recipients', async () => {
    renderDialog();
    await loaded();
    const items = within(choices()).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items).toEqual([expect.stringContaining('Steward Example'), expect.stringContaining('Bosun Example'), expect.stringContaining('Deckhand Example')]);
    for (const gone of ['Open', 'Waiting', 'Reported', 'October']) expect(within(choices()).queryByText(new RegExp(`^${gone} `))).toBeNull();
    expect(within(choices()).getByText('Serious')).toBeInTheDocument();
    expect(h.calls.find((c) => c.name === 'work_rest_vessel_breaches')?.args).toEqual({ p_vessel_id: 'v-dra', p_from: '2026-11-01', p_to: '2026-11-26', p_only_open: false });
    await waitFor(() => expect(within(dialog()).getByRole('list', { name: 'DPA' })).toBeInTheDocument());
    expect(within(dialog()).getByRole('list', { name: 'Fleet HR' })).toHaveTextContent('Fleet HR Manager');
  });

  it('Select all picks every breach offered', async () => {
    renderDialog();
    await loaded();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Select every breach in the period' }));
    expect(within(dialog()).getByText('3 breaches · 0 people')).toBeInTheDocument();
  });

  it('a quick period sets the dates and reads its breaches', async () => {
    renderDialog();
    await loaded();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Last month' }));
    await waitFor(() => expect(h.calls.some((c) => c.name === 'work_rest_vessel_breaches' && c.args.p_from === '2026-10-01' && c.args.p_to === '2026-10-31')).toBe(true));
    await waitFor(() => expect(within(choices()).getByText('October Example')).toBeInTheDocument());
    expect(within(dialog()).getByLabelText('From')).toHaveValue('2026-10-01');
  });

  it('no reviewed breach in the period says how a breach becomes reportable', async () => {
    h.answers.work_rest_vessel_breaches = () => ok([BREACHES[3], BREACHES[4]]);
    renderDialog();
    await waitFor(() => expect(within(dialog()).getByText(/No reviewed breach in this period is waiting for a report/)).toBeInTheDocument());
  });

  it('nobody to share with says how to fix it', async () => {
    h.answers.work_rest_breach_report_recipients = () => ok([]);
    renderDialog();
    await waitFor(() => expect(within(dialog()).getByText(/Nobody in the company holds the fleet HR or DPA role/)).toBeInTheDocument());
  });

  it('no copy speaks of email (D-249)', async () => {
    renderDialog();
    await loaded();
    expect(dialog().textContent?.toLowerCase()).not.toMatch(/e-?mail/);
  });
});

describe('the rules before anything is sent', () => {
  it('breaches and recipients are required', async () => {
    renderDialog();
    await loaded();
    create();
    await waitFor(() => expect(within(dialog()).getByText('Choose the breaches to report.')).toBeInTheDocument());
    expect(within(dialog()).getByText('Choose who receives the report.')).toBeInTheDocument();
    expect(h.calls.some((c) => c.name === 'work_rest_breach_report_create')).toBe(false);
  });

  it('an end before the start, or a period over a year, is refused and its breaches not read', async () => {
    renderDialog();
    await loaded();
    fireEvent.change(within(dialog()).getByLabelText('To'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(within(dialog()).getByText('Choose a period of one year or less to see its breaches.')).toBeInTheDocument());
    create();
    await waitFor(() => expect(within(dialog()).getByText('The end date is before the start date.')).toBeInTheDocument());
    fireEvent.change(within(dialog()).getByLabelText('From'), { target: { value: '2025-01-01' } });
    fireEvent.change(within(dialog()).getByLabelText('To'), { target: { value: '2026-06-01' } });
    await waitFor(() => expect(within(dialog()).getByText('Choose a period of one year or less.')).toBeInTheDocument());
    expect(h.calls.some((c) => c.name === 'work_rest_vessel_breaches' && c.args.p_from === '2025-01-01')).toBe(false);
  });
});

describe('Create report', () => {
  it('sends exactly what was chosen, says it was shared in STORM, and closes', async () => {
    renderDialog();
    await loaded();
    check(/Bosun Example/);
    check(/Deckhand Example/);
    await waitFor(() => expect(within(dialog()).getByRole('checkbox', { name: 'Demo DPA' })).toBeInTheDocument());
    check('Demo DPA');
    fireEvent.change(within(dialog()).getByLabelText('Notes (optional)'), { target: { value: '  Two drills.  ' } });
    expect(within(dialog()).getByText('2 breaches · 1 person')).toBeInTheDocument();
    create();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(h.calls.find((c) => c.name === 'work_rest_breach_report_create')?.args).toEqual({
      p_vessel_id: 'v-dra',
      p_from: '2026-11-01',
      p_to: '2026-11-26',
      p_nc_ids: ['nc-accepted', 'nc-dismissed'],
      p_recipient_user_ids: ['u-dpa'],
      p_notes: 'Two drills.',
    });
    expect(h.notify.success).toHaveBeenCalledWith('Report shared in STORM with 1 person', { description: 'HORBR-DRA-2026-002: 2 breaches' });
    expect(onCreated).toHaveBeenCalledWith({ reportId: 'r-new', reference: 'HORBR-DRA-2026-002', breachCount: 2, recipientCount: 1 });
    expect(onClose).toHaveBeenCalled();
  });

  it('blank notes go as null', async () => {
    renderDialog();
    await loaded();
    check(/Bosun Example/);
    await waitFor(() => expect(within(dialog()).getByRole('checkbox', { name: 'Fleet HR Manager' })).toBeInTheDocument());
    check('Fleet HR Manager');
    create();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(h.calls.find((c) => c.name === 'work_rest_breach_report_create')?.args.p_notes).toBeNull();
  });
});

describe('refusals in words', () => {
  const fail = async (error: Record<string, unknown>) => {
    h.answers.work_rest_breach_report_create = () => ({ data: null, error });
    renderDialog();
    await loaded();
    check(/Bosun Example/);
    await waitFor(() => expect(within(dialog()).getByRole('checkbox', { name: 'Demo DPA' })).toBeInTheDocument());
    check('Demo DPA');
    create();
    await waitFor(() => expect(dialog().querySelector('[data-breach-report-error]')).not.toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(h.notify.success).not.toHaveBeenCalled();
    return dialog().querySelector('[data-breach-report-error]')?.textContent ?? '';
  };

  it("the server's DETAIL, naming the breach its HINT points at", async () => {
    expect(await fail({ code: '22023', message: 'breach_not_reviewed', details: 'Review every breach before you report it.', hint: 'nc-accepted' })).toBe(
      'Review every breach before you report it. (Bosun Example, 4 Nov 2026)',
    );
  });

  it('the known sentence when the server gave no DETAIL', async () => {
    expect(await fail({ code: '22023', message: 'recipient_not_allowed', details: null, hint: 'u-dpa' })).toBe('Send breach reports to the fleet HR or the DPA of the company only.');
  });

  it('a breach already in a report', async () => {
    expect(await fail({ code: '22023', message: 'breach_already_reported', details: '', hint: 'nc-accepted' })).toBe(
      'A breach is already in another breach report. (Bosun Example, 4 Nov 2026)',
    );
  });

  it('no access: the 42501 sentence', async () => {
    expect(await fail({ code: '42501', message: 'crew_not_permitted', details: 'Only the final approver sends hours of rest breach reports.' })).toBe(
      'Only the final approver sends hours of rest breach reports.',
    );
  });

  it('the create RPC missing (D-01)', async () => {
    expect(await fail({ code: 'PGRST202', message: 'Could not find the function public.work_rest_breach_report_create' })).toBe(BREACH_REPORT_NOT_SET_UP);
  });

  it('any other error keeps the dialog open with its message', async () => {
    expect(await fail({ code: 'XX000', message: 'The database is unwell.' })).toMatch(/\S/);
  });
});

describe('D-01: not set up', () => {
  it('the recipients RPC missing: the not-set-up sentence and Create off', async () => {
    delete h.answers.work_rest_breach_report_recipients;
    renderDialog();
    await waitFor(() => expect(within(dialog()).getByText(BREACH_REPORT_NOT_SET_UP)).toBeInTheDocument());
    expect(within(dialog()).getByRole('button', { name: 'Create report' })).toBeDisabled();
  });

  it('the breach list missing: the same', async () => {
    delete h.answers.work_rest_vessel_breaches;
    renderDialog();
    await waitFor(() => expect(within(dialog()).getByText(BREACH_REPORT_NOT_SET_UP)).toBeInTheDocument());
    expect(within(dialog()).getByRole('button', { name: 'Create report' })).toBeDisabled();
  });

  it('a recipients error is shown with Try again, which asks again', async () => {
    h.answers.work_rest_breach_report_recipients = () => ({ data: null, error: { code: 'XX000', message: 'The recipients could not load.' } });
    renderDialog();
    await waitFor(() => expect(within(dialog()).getByText(/The recipients could not load/)).toBeInTheDocument());
    const before = h.calls.filter((c) => c.name === 'work_rest_breach_report_recipients').length;
    h.answers.work_rest_breach_report_recipients = () => ok(RECIPIENTS);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(dialog()).getByRole('list', { name: 'DPA' })).toBeInTheDocument());
    expect(h.calls.filter((c) => c.name === 'work_rest_breach_report_recipients').length).toBeGreaterThan(before);
  });
});

describe('Cancel', () => {
  it('closes without sending', async () => {
    renderDialog();
    await loaded();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(h.calls.some((c) => c.name === 'work_rest_breach_report_create')).toBe(false);
  });
});
