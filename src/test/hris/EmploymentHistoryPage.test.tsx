import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import EmploymentHistoryPage from '@/modules/hris/pages/EmploymentHistoryPage';

const ROUTE = '/hris/employee-records/employment-history';

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const PROFILE_JOIN: Record<string, { id: string; first_name: string; last_name: string; company_id: string }> = {
  u1: { id: 'p1', first_name: 'Ana', last_name: 'Bosun', company_id: COMPANY_ID },
  'u-crew': { id: 'p-crew', first_name: 'Cal', last_name: 'Crew', company_id: COMPANY_ID },
  u3: { id: 'p3', first_name: 'Cara', last_name: 'Chef', company_id: COMPANY_ID },
};

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
  vessels: { name: 'M/Y Draak' },
  ...overrides,
});

/**
 * Base company plus Cara (joined M/Y Draak 10 days ago, so she shows up in
 * "Recent crew movements"), a contract for Ana, one for Ben (imported, no
 * login) and the audit row for Ana's Deckhand → Bosun promotion.
 *
 * The recent-movements query filters on the joined column
 * `profiles.company_id`; the mock only matches top-level keys, so each
 * assignment row carries that key literally as well as the nested join.
 */
const fixtures = () => {
  const base = baseFixtures();
  const recentJoin = isoDaysAgo(10);
  const assignments = [
    ...base.crew_assignments,
    { id: 'a3', user_id: 'u3', vessel_id: 'v1', position: 'Chef', rank: 'Chef', department: 'Interior', join_date: recentJoin, start_date: recentJoin, leave_date: null, end_date: null, is_current: true, end_reason: null, notes: null, assignment_type: null, created_at: `${recentJoin}T00:00:00Z`, updated_at: `${recentJoin}T00:00:00Z`, created_by: null, updated_by: null, vessels: { id: 'v1', name: 'M/Y Draak' } },
  ].map((a) => ({ ...a, profiles: PROFILE_JOIN[a.user_id] ?? null, 'profiles.company_id': COMPANY_ID }));

  return {
    ...base,
    profiles: [
      ...base.profiles,
      { ...base.profiles[1], id: 'p3', user_id: 'u3', email: 'cara@example.com', first_name: 'Cara', last_name: 'Chef', rank: 'Chef', position: 'Chef', department: 'Interior', created_at: `${recentJoin}T00:00:00Z`, updated_at: `${recentJoin}T00:00:00Z` },
    ],
    crew_assignments: assignments,
    crew_contracts: [
      contract({ id: 'c1', profile_id: 'p1', contract_number: 'SEA-2026-014', position: 'Bosun', rank: 'Bosun', start_date: '2026-01-01', end_date: '2026-11-30', probation_end_date: '2026-04-01' }),
      contract({ id: 'c-ben', profile_id: 'p2', contract_type: 'fixed_term', contract_number: 'SEA-2026-002', position: 'Deckhand', rank: 'Deckhand', start_date: '2026-08-01', end_date: '2026-12-31' }),
    ],
    audit_logs: [
      { id: 'log-1', timestamp: '2024-03-01T09:00:00Z', actor_email: 'dpa@example.com', entity_type: 'crew_profile', entity_id: 'p1', action: 'UPDATE', old_values: { rank: 'Deckhand', position: 'Deckhand' }, new_values: { rank: 'Bosun', position: 'Bosun' } },
      // Same rank on both sides: must not produce an event.
      { id: 'log-2', timestamp: '2026-09-01T09:00:00Z', actor_email: 'dpa@example.com', entity_type: 'crew_profile', entity_id: 'p1', action: 'UPDATE', old_values: { rank: 'Bosun', phone: '1' }, new_values: { rank: 'Bosun', phone: '2' } },
    ],
  };
};

const findCall = (calls: SupabaseCall[], table: string, op: SupabaseCall['op']) => calls.find((c) => c.table === table && c.op === op);

/** Reads the headline value of a ServiceSummary tile by its label. */
const tileValue = (label: string): string => {
  const labelEl = screen.getByText(label);
  const value = labelEl.nextElementSibling;
  if (!value) throw new Error(`No value under tile "${label}"`);
  return value.textContent ?? '';
};

describe('EmploymentHistoryPage', () => {
  let mock: ReturnType<typeof setupSupabase>;

  beforeEach(() => {
    mock = setupSupabase(fixtures());
  });

  it('shows HR the recent crew movements when no crew is selected', async () => {
    setupAccess('admin');
    renderHrisPage(EmploymentHistoryPage, { route: ROUTE });
    expect(screen.getByText('Employment History')).toBeInTheDocument();
    expect(screen.getByText('Recent crew movements')).toBeInTheDocument();

    const cara = await screen.findByRole('button', { name: 'Cara Chef' });
    const row = cara.closest('tr')!;
    expect(within(row).getByText('Joined')).toBeInTheDocument();
    expect(within(row).getByText('M/Y Draak')).toBeInTheDocument();
    expect(within(row).getByText('Chef · Chef')).toBeInTheDocument();
    // Ana joined in 2024 and Cal in February: outside the 30-day window.
    expect(screen.queryByText('Ana Bosun')).not.toBeInTheDocument();
    expect(screen.queryByText('Cal Crew')).not.toBeInTheDocument();

    // The crew name link opens that person's history.
    fireEvent.click(cara);
    await waitFor(() => expect(screen.getByText('Timeline')).toBeInTheDocument());
    expect(screen.queryByText('Recent crew movements')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Joined M/Y Draak')).toBeInTheDocument());
  });

  it('shows summary tiles, the timeline and assignments for the selected crew member', async () => {
    setupAccess('admin');
    renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByText('Signed off M/Y Draak')).toBeInTheDocument());

    // Summary tiles.
    expect(tileValue('Vessels served')).toBe('1');
    expect(screen.getByText('Currently on M/Y Draak')).toBeInTheDocument();
    expect(tileValue('Total sea service')).toMatch(/^\d+ yr/);
    expect(screen.getByText(/^\d+ days since 10 Jan 2022$/)).toBeInTheDocument();
    expect(tileValue('Current vessel tenure')).toMatch(/yr/);
    expect(screen.getByText(/Rotational · \d+d remaining/)).toBeInTheDocument();

    // Timeline: promotion from the audit log, sign-off with its reason, joins, contract events.
    const timeline = screen.getByRole('list');
    const promotion = within(timeline).getByText('Changed by dpa@example.com').closest('li')!;
    expect(within(promotion).getByText('Promoted to Bosun')).toBeInTheDocument();
    expect(within(promotion).getByText('Promotion')).toBeInTheDocument(); // badge
    expect(within(promotion).getByText('01 Mar 2024')).toBeInTheDocument();
    const signOff = within(timeline).getByText('Signed off M/Y Draak').closest('li')!;
    expect(within(signOff).getByText('Reason:')).toBeInTheDocument();
    expect(within(signOff).getByText(/Promotion$/)).toBeInTheDocument();
    expect(within(signOff).getByText('Promoted to Bosun')).toBeInTheDocument(); // assignment notes
    expect(within(timeline).getAllByText('Joined M/Y Draak')).toHaveLength(2);
    expect(within(timeline).getByText('Started contract SEA-2026-014')).toBeInTheDocument();
    expect(within(timeline).getByText('Contract SEA-2026-014 ends')).toBeInTheDocument();
    expect(within(timeline).getByText('Planned')).toBeInTheDocument();
    expect(within(timeline).getByText('Probation period ends')).toBeInTheDocument();
    // The no-op audit row (same rank) produced nothing.
    expect(screen.queryByText(/Rank changed/)).not.toBeInTheDocument();
    expect(screen.getByText(/· 7 events/)).toBeInTheDocument();

    // Assignments table lists both rows, newest first, with the current badge.
    expect(screen.getByText('Assignments')).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const cellText = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent?.trim());
    // Vessel, Position, Rank, From, To, Days, Reason, Notes, actions
    expect(cellText(rows[0]).slice(0, 5)).toEqual(['M/Y DraakCurrent', 'Bosun', 'Bosun', '01 Mar 2024', 'On board']);
    expect(cellText(rows[0])[6]).toBe('—');
    expect(cellText(rows[1]).slice(0, 5)).toEqual(['M/Y Draak', 'Deckhand', 'Deckhand', '10 Jan 2022', '28 Feb 2024']);
    expect(cellText(rows[1])[5]).toBe('780');
    // Non-preset end reasons are humanised, matching the timeline.
    expect(cellText(rows[1])[6]).toBe('Promotion');
    expect(cellText(rows[1])[7]).toBe('Promoted to Bosun');

    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /edit assignment/i })).toHaveLength(2);
  });

  it('lets an HR editor edit an assignment inline and logs the change', async () => {
    setupAccess('edit');
    renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /edit assignment/i })).toHaveLength(2));

    // Second row is the historical Deckhand assignment (a0).
    fireEvent.click(screen.getAllByRole('button', { name: /edit assignment/i })[1]);
    const notes = await screen.findByLabelText('Notes');
    expect(notes).toHaveValue('Promoted to Bosun');
    expect(screen.getByLabelText('Leave date')).toHaveValue('2024-02-28');

    fireEvent.change(notes, { target: { value: 'Promoted to Bosun after two seasons' } });
    fireEvent.change(screen.getByLabelText('Leave date'), { target: { value: '2024-02-29' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(findCall(mock.calls, 'crew_assignments', 'update')).toBeDefined());
    const update = findCall(mock.calls, 'crew_assignments', 'update')!;
    expect(update.filters).toContainEqual({ kind: 'eq', column: 'id', value: 'a0' });
    expect(update.payload).toMatchObject({
      notes: 'Promoted to Bosun after two seasons',
      leave_date: '2024-02-29',
      end_date: '2024-02-29',
      updated_by: 'u-dpa',
    });
    expect(update.payload).not.toHaveProperty('position');
    expect(update.payload).not.toHaveProperty('is_current');

    await waitFor(() => expect(findCall(mock.calls, 'audit_logs', 'insert')).toBeDefined());
    expect(findCall(mock.calls, 'audit_logs', 'insert')!.payload).toMatchObject({
      entity_type: 'crew_assignment',
      entity_id: 'a0',
      action: 'UPDATE',
      actor_user_id: 'u-dpa',
      changed_fields: { notes: true, leave_date: true },
      old_values: { notes: 'Promoted to Bosun', leave_date: '2024-02-28' },
      new_values: { notes: 'Promoted to Bosun after two seasons', leave_date: '2024-02-29' },
    });

    // Editor closes and the refetched row shows the new values.
    await waitFor(() => expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText('Promoted to Bosun after two seasons').length).toBeGreaterThan(0));
    expect(screen.getAllByText('29 Feb 2024').length).toBeGreaterThan(0);
  });

  it('validates the inline editor before saving', async () => {
    setupAccess('edit');
    renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /edit assignment/i })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: /edit assignment/i })[1]);
    fireEvent.change(await screen.findByLabelText('Leave date'), { target: { value: '2021-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText('Leave date cannot be before the join date.')).toBeInTheDocument();
    expect(findCall(mock.calls, 'crew_assignments', 'update')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByLabelText('Leave date')).not.toBeInTheDocument());
  });

  it('hides editing from HR viewers', async () => {
    setupAccess('view');
    renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByText('Signed off M/Y Draak')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /edit assignment/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('shows a contracts-only timeline for imported crew who have contracts but no login', async () => {
    setupAccess('admin');
    renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p2` });
    await waitFor(() => expect(screen.getByText('Started contract SEA-2026-002')).toBeInTheDocument());

    expect(screen.getByText('Benny Deckhand has no account yet')).toBeInTheDocument();
    expect(screen.getByText(/Showing contract history only/)).toBeInTheDocument();
    expect(screen.queryByText(/Employment history starts once the crew member has accepted/)).not.toBeInTheDocument();
    expect(screen.getByText('Contract SEA-2026-002 ends')).toBeInTheDocument();
    expect(screen.getByText(/· 2 events/)).toBeInTheDocument();
    expect(screen.getByText(/Fixed Term · \d+d remaining/)).toBeInTheDocument();
    expect(screen.getByText('No assignments recorded')).toBeInTheDocument();
    // No assignments to list or export.
    expect(screen.queryByText('Assignments')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
    // Nothing was asked of crew_assignments for a profile without a user_id.
    expect(mock.calls.filter((c) => c.table === 'crew_assignments' && c.filters.some((f) => f.column === 'user_id' && f.value === null))).toHaveLength(0);
  });

  it('keeps the empty state for imported crew with neither login nor contracts', async () => {
    setupAccess('admin');
    mock = setupSupabase({ ...fixtures(), crew_contracts: [] });
    renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p2` });
    await waitFor(() => expect(screen.getByText('Benny Deckhand has no account yet')).toBeInTheDocument());
    expect(screen.getByText(/Employment history starts once the crew member has accepted/)).toBeInTheDocument();
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  it('shows an unknown crew id as not found', async () => {
    setupAccess('admin');
    renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=nope` });
    await waitFor(() => expect(screen.getByText('Crew member not found')).toBeInTheDocument());
  });

  it('pins crew self-service to their own timeline without a picker', async () => {
    setupAccess('self');
    renderHrisPage(EmploymentHistoryPage, { route: ROUTE });
    await waitFor(() => expect(screen.getByText('Joined M/Y Draak')).toBeInTheDocument());

    expect(screen.getByText('Your vessel assignments, contracts and sea-service record.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent crew movements')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit assignment/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(tileValue('Vessels served')).toBe('1');
    // Only their own record was read.
    const assignmentReads = mock.calls.filter((c) => c.table === 'crew_assignments' && c.op === 'select');
    expect(assignmentReads.length).toBeGreaterThan(0);
    expect(assignmentReads.every((c) => c.filters.some((f) => f.column === 'user_id' && (f.value === 'u-crew' || (Array.isArray(f.value) && f.value.every((v) => v === 'u-crew')))))).toBe(true);
    expect(screen.queryByText('Signed off M/Y Draak')).not.toBeInTheDocument();
  });
});
