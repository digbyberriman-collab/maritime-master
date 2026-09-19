import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderHrisPage, setupAccess, setupSupabase, baseFixtures, COMPANY_ID } from '@/test/hris/harness';
import type { SupabaseCall } from '@/test/hris/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const s = await import('@/test/hris/state');
  return { supabase: s.supabaseProxy };
});
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const s = await import('@/test/hris/state');
  return { useAuth: () => s.authState.value, AuthProvider: ({ children }: { children: React.ReactNode }) => children };
});

import ContractsPage from '@/modules/hris/pages/ContractsPage';

const ROUTE = '/hris/employee-records/contracts';

const DRAAK = { name: 'M/Y Draak' };
const ANA = { user_id: 'u1', first_name: 'Ana', last_name: 'Bosun', preferred_name: null };
const CAL = { user_id: 'u-crew', first_name: 'Cal', last_name: 'Crew', preferred_name: null };
const DANA = { user_id: 'u-dpa', first_name: 'Dana', last_name: 'Admin', preferred_name: null };

const contract = (overrides: Record<string, unknown>) => ({
  company_id: COMPANY_ID,
  contract_type: 'rotational',
  status: 'active',
  contract_number: null,
  vessel_id: 'v1',
  position: null,
  department: null,
  rank: null,
  start_date: '2026-01-01',
  end_date: null,
  probation_end_date: null,
  rotation_pattern: null,
  notice_period_days: null,
  sea_reference: null,
  flag_state: null,
  governing_law: null,
  wage_currency: null,
  base_wage_minor: null,
  wage_frequency: null,
  signed_by_crew_at: null,
  signed_by_company_at: null,
  notes: null,
  document_path: null,
  document_name: null,
  supersedes_contract_id: null,
  terminated_at: null,
  termination_reason: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  vessels: DRAAK,
  ...overrides,
});

/**
 * Today is 2026-09-17 in this suite's fixtures: Ana's contract ends within 90
 * days (not 30), Cal and Dana are on open-ended contracts, Ben (imported) has
 * nothing on record.
 */
const fixtures = () => ({
  ...baseFixtures(),
  crew_contracts: [
    contract({
      id: 'c1', profile_id: 'p1', profiles: ANA, contract_number: 'SEA-2026-014', position: 'Bosun', rank: 'Bosun', department: 'Deck',
      start_date: '2026-01-01', end_date: '2026-11-30', probation_end_date: '2026-04-01', rotation_pattern: '2:2', notice_period_days: 30,
      wage_currency: 'EUR', base_wage_minor: 450000, wage_frequency: 'monthly', signed_by_crew_at: '2025-12-20T00:00:00Z', signed_by_company_at: '2025-12-21T00:00:00Z',
    }),
    contract({
      id: 'c0', profile_id: 'p1', profiles: ANA, status: 'superseded', contract_number: 'SEA-2024-003', position: 'Deckhand', rank: 'Deckhand',
      start_date: '2024-03-01', end_date: '2025-12-31', wage_currency: 'EUR', base_wage_minor: 320000, wage_frequency: 'monthly', created_at: '2024-03-01T00:00:00Z',
    }),
    contract({ id: 'c2', profile_id: 'p-crew', profiles: CAL, contract_type: 'permanent', start_date: '2026-02-01', wage_currency: 'GBP', base_wage_minor: 300000, wage_frequency: 'monthly' }),
    contract({ id: 'c-dpa', profile_id: 'p-dpa', profiles: DANA, contract_type: 'permanent', start_date: '2025-01-01' }),
  ],
  hr_expiry_items: [
    { company_id: COMPANY_ID, crew_name: 'Ana Bosun', days_remaining: 74, due_date: '2026-11-30', item_type: 'contract', label: 'rotational', profile_id: 'p1', record_id: 'c1', user_id: 'u1', vessel_id: 'v1' },
  ],
});

/** Reads the number shown on a KPI tile by its label. */
const tileValue = (label: string): string => {
  const tile = screen.getByText(label).closest('button');
  if (!tile) throw new Error(`No KPI tile labelled "${label}"`);
  return within(tile).getByText(/^\d+$/).textContent ?? '';
};

/** Radix DropdownMenu toggles on pointerdown (button 0) rather than click. */
const openMoreActions = () => {
  fireEvent.pointerDown(screen.getByRole('button', { name: /more actions/i }), { button: 0, ctrlKey: false });
};

const findCall = (calls: SupabaseCall[], table: string, op: SupabaseCall['op']) => calls.find((c) => c.table === table && c.op === op);

describe('ContractsPage', () => {
  let mock: ReturnType<typeof setupSupabase>;

  beforeEach(() => {
    // The fixtures state dates relative to 2026-09-17, and the page derives
    // "74d remaining" and the expiry tiles from the current date, so the
    // clock is frozen rather than the expectations being recomputed.
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-09-17T09:00:00Z') });
    mock = setupSupabase(fixtures());
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('shows HR admins the company overview with KPIs, expiries and the contract table', async () => {
    setupAccess('admin');
    renderHrisPage(ContractsPage, { route: ROUTE });
    expect(screen.getByText('Contracts & Employment')).toBeInTheDocument();
    expect(screen.getByText(/Contract coverage and upcoming renewals/)).toBeInTheDocument();

    await waitFor(() => expect(tileValue('Active contracts')).toBe('3'));
    expect(tileValue('Expiring within 30 days')).toBe('0');
    expect(tileValue('Expiring within 90 days')).toBe('1');
    expect(tileValue('Crew without a contract')).toBe('1');
    expect(tileValue('Probation ending ≤30 days')).toBe('0');

    // Expiring table lists Ana's contract; the company table lists every contract.
    await waitFor(() => expect(screen.getAllByText('Ana Bosun').length).toBeGreaterThanOrEqual(3));
    // Once in the expiry table, once on the contract row.
    expect(screen.getAllByText('74d remaining')).toHaveLength(2);
    expect(screen.getByText('Cal Crew')).toBeInTheDocument();
    expect(screen.getByText('Dana Admin')).toBeInTheDocument();
    expect(screen.getByText('SEA-2026-014')).toBeInTheDocument();
    expect(screen.getByText('SEA-2024-003')).toBeInTheDocument();

    // The "missing" tile reveals Ben, the imported crew member with no contract.
    fireEvent.click(screen.getByText('Crew without a contract'));
    expect(await screen.findByText('Benny Deckhand')).toBeInTheDocument();
    expect(screen.getByText('Imported')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show contracts/i }));

    // Clicking Ana's row switches to crew mode for her.
    const anaCells = await screen.findAllByText('Ana Bosun');
    fireEvent.click(anaCells[anaCells.length - 1]);
    await waitFor(() => expect(screen.getByText('Rotational contract')).toBeInTheDocument());
    expect(screen.getByText(/Employment contract, terms and history/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all crew/i })).toBeInTheDocument();
  });

  it('shows the active contract card, wage and history to an HR admin', async () => {
    setupAccess('admin');
    renderHrisPage(ContractsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByText('Rotational contract')).toBeInTheDocument());

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('01 Jan 2026')).toBeInTheDocument();
    expect(screen.getByText('30 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('74d remaining')).toBeInTheDocument();
    expect(screen.getByText('01 Apr 2026')).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('2:2')).toBeInTheDocument();
    expect(screen.getAllByText('M/Y Draak').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Bosun / Bosun')).toBeInTheDocument();
    expect(screen.getByText('Fully signed')).toBeInTheDocument();
    // Wage is visible to HR editors (major units, with frequency).
    expect(screen.getByText('€4,500.00 / monthly')).toBeInTheDocument();
    expect(screen.queryByText('Restricted')).not.toBeInTheDocument();

    // History lists the superseded contract with its wage column.
    expect(screen.getByText('Superseded')).toBeInTheDocument();
    expect(screen.getByText('SEA-2024-003')).toBeInTheDocument();
    expect(screen.getByText('Replaced by a newer contract')).toBeInTheDocument();
    expect(screen.getByText('€3,200.00')).toBeInTheDocument();

    // Actions.
    expect(screen.getByRole('button', { name: /new contract/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    openMoreActions();
    expect(await screen.findByText('Terminate contract')).toBeInTheDocument();
    expect(screen.getByText('Delete contract')).toBeInTheDocument();
    expect(screen.getByText('Upload signed document')).toBeInTheDocument();
  });

  it('lets an HR editor create a contract and writes an audit entry', async () => {
    setupAccess('edit');
    renderHrisPage(ContractsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByText('Rotational contract')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /new contract/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('New contract')).toBeInTheDocument();
    expect(within(dialog).getByText(/Employment contract for Ana Bosun/)).toBeInTheDocument();

    // Prefilled from the crew directory entry.
    expect(within(dialog).getByLabelText('Position')).toHaveValue('Bosun');
    expect(within(dialog).getByLabelText('Department')).toHaveValue('Deck');

    fireEvent.change(within(dialog).getByLabelText('Contract number'), { target: { value: 'SEA-2027-001' } });
    fireEvent.change(within(dialog).getByLabelText('Start date'), { target: { value: '2027-01-01' } });
    fireEvent.change(within(dialog).getByLabelText('End date'), { target: { value: '2027-12-31' } });
    fireEvent.change(within(dialog).getByLabelText('Base wage'), { target: { value: '4750' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /create contract/i }));

    await waitFor(() => expect(findCall(mock.calls, 'crew_contracts', 'insert')).toBeDefined());
    const insert = findCall(mock.calls, 'crew_contracts', 'insert')!;
    expect(insert.payload).toMatchObject({
      profile_id: 'p1',
      company_id: COMPANY_ID,
      contract_type: 'rotational',
      status: 'draft',
      contract_number: 'SEA-2027-001',
      vessel_id: 'v1',
      position: 'Bosun',
      rank: 'Bosun',
      department: 'Deck',
      start_date: '2027-01-01',
      end_date: '2027-12-31',
      wage_currency: 'EUR',
      base_wage_minor: 475000,
      wage_frequency: 'monthly',
      created_by: 'u-dpa',
    });

    await waitFor(() => expect(findCall(mock.calls, 'audit_logs', 'insert')).toBeDefined());
    expect(findCall(mock.calls, 'audit_logs', 'insert')!.payload).toMatchObject({
      entity_type: 'crew_contract',
      action: 'CREATE',
      actor_user_id: 'u-dpa',
      new_values: { contract_number: 'SEA-2027-001', status: 'draft', base_wage_minor: 475000 },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('rejects a contract whose end date is before its start date', async () => {
    setupAccess('edit');
    renderHrisPage(ContractsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByText('Rotational contract')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /new contract/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Start date'), { target: { value: '2027-06-01' } });
    fireEvent.change(within(dialog).getByLabelText('End date'), { target: { value: '2027-01-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /create contract/i }));
    expect(await within(dialog).findByText('End date must be on or after the start date')).toBeInTheDocument();
    expect(findCall(mock.calls, 'crew_contracts', 'insert')).toBeUndefined();
  });

  it('terminates the active contract with a reason and date', async () => {
    setupAccess('edit');
    renderHrisPage(ContractsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByText('Rotational contract')).toBeInTheDocument());

    openMoreActions();
    fireEvent.click(await screen.findByText('Terminate contract'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/This ends the rotational contract that started 01 Jan 2026/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Termination date'), { target: { value: '2026-09-30' } });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Resignation – moving ashore' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^terminate$/i }));

    await waitFor(() => expect(findCall(mock.calls, 'crew_contracts', 'update')).toBeDefined());
    const update = findCall(mock.calls, 'crew_contracts', 'update')!;
    expect(update.filters).toContainEqual({ kind: 'eq', column: 'id', value: 'c1' });
    expect(update.payload).toMatchObject({ status: 'terminated', termination_reason: 'Resignation – moving ashore', terminated_at: '2026-09-30', updated_by: 'u-dpa' });

    await waitFor(() => expect(findCall(mock.calls, 'audit_logs', 'insert')).toBeDefined());
    expect(findCall(mock.calls, 'audit_logs', 'insert')!.payload).toMatchObject({
      entity_type: 'crew_contract',
      entity_id: 'c1',
      action: 'UPDATE',
      old_values: { status: 'active' },
      new_values: { status: 'terminated', termination_reason: 'Resignation – moving ashore' },
    });
    // The store was mutated, so the refetched card now shows the termination.
    await waitFor(() => expect(screen.getByText('Terminated 30 Sep 2026')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the wage and every action from HR viewers', async () => {
    setupAccess('view');
    renderHrisPage(ContractsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByText('Rotational contract')).toBeInTheDocument());

    expect(screen.getByText('Restricted')).toBeInTheDocument();
    expect(screen.queryByText('€4,500.00 / monthly')).not.toBeInTheDocument();
    expect(screen.queryByText('€3,200.00')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new contract/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit contract/i })).not.toBeInTheDocument();
    // Still allowed to browse other crew.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('pins crew self-service to their own contract and shows their own wage', async () => {
    setupAccess('self');
    renderHrisPage(ContractsPage, { route: ROUTE });
    await waitFor(() => expect(screen.getByText('Permanent contract')).toBeInTheDocument());

    expect(screen.getByText('£3,000.00 / monthly')).toBeInTheDocument();
    expect(screen.queryByText('Restricted')).not.toBeInTheDocument();
    expect(screen.getByText('Open-ended')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /all crew/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new contract/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    // Never someone else's contract.
    expect(screen.queryByText('Rotational contract')).not.toBeInTheDocument();
    const crewReads = mock.calls.filter((c) => c.table === 'crew_contracts' && c.op === 'select');
    expect(crewReads.every((c) => c.filters.some((f) => f.column === 'profile_id' && f.value === 'p-crew'))).toBe(true);
  });

  it('shows the empty state with a create action for imported crew without a contract', async () => {
    setupAccess('edit');
    renderHrisPage(ContractsPage, { route: `${ROUTE}?crew=p2` });
    await waitFor(() => expect(screen.getByText('No contract on record for Benny Deckhand')).toBeInTheDocument());
    expect(screen.getByText(/Create a contract to track dates, terms and the signed SEA/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /new contract/i })).toHaveLength(2);
    expect(screen.getByText('No previous contracts on record.')).toBeInTheDocument();
  });

  it('tells HR viewers an editor must add the missing contract', async () => {
    setupAccess('view');
    renderHrisPage(ContractsPage, { route: `${ROUTE}?crew=p2` });
    await waitFor(() => expect(screen.getByText('No contract on record for Benny Deckhand')).toBeInTheDocument());
    expect(screen.getByText('An HR editor can add one.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new contract/i })).not.toBeInTheDocument();
  });
});
