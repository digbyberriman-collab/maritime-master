/**
 * The HRIS Employment history page at phone width (Phase 2 round 7 items 5
 * and 6; X1-11B; gap/04 C59):
 *
 * - item 6, layout: the page and its grid never grow wider than the screen.
 *   The grid is one minmax(0, 1fr) column until the extra-wide layout,
 *   every grid item may shrink (min-width 0), and the assignments table
 *   scrolls inside its card, in the read view and with an edit row open
 *   (the lock sentence stays pinned to the card's left edge, Save and
 *   Cancel to its right edge). jsdom does not
 *   lay out, so this pins the class contract that makes it so; the visual
 *   harness measures the real 390 px page (routes.d/crew.json
 *   hris-employment-history-edit).
 * - item 5, the editor's own row: Position and Rank are disabled before
 *   Save without users-access admin of the vessel, with D-218's sentence,
 *   instead of the guard's refusal after Save; someone else's rows are not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderHrisPage, setupAccess, setupSupabase, baseFixtures, COMPANY_ID, DPA_USER } from '@/test/hris/harness';
import type { SupabaseCall } from '@/test/hris/supabaseMock';
import { OWN_POSITION_MESSAGE } from '@/modules/crew/lib/crewUpdateErrors';

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

const PROFILE_JOIN: Record<string, { id: string; first_name: string; last_name: string; company_id: string }> = {
  u1: { id: 'p1', first_name: 'Ana', last_name: 'Bosun', company_id: COMPANY_ID },
  [DPA_USER.id]: { id: 'p-dpa', first_name: 'Dana', last_name: 'Admin', company_id: COMPANY_ID },
};

/** The base company plus the HR editor's own Purser assignment on M/Y Draak. */
const fixtures = () => {
  const base = baseFixtures();
  const own = {
    id: 'a-dpa',
    user_id: DPA_USER.id,
    vessel_id: 'v1',
    position: 'Purser',
    rank: 'Purser',
    department: 'Interior',
    join_date: '2025-01-01',
    start_date: '2025-01-01',
    leave_date: null,
    end_date: null,
    is_current: true,
    end_reason: null,
    notes: 'Own assignment',
    assignment_type: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    created_by: null,
    updated_by: null,
    vessels: { id: 'v1', name: 'M/Y Draak' },
  };
  return {
    ...base,
    crew_assignments: [...base.crew_assignments, own].map((a) => ({ ...a, profiles: PROFILE_JOIN[a.user_id] ?? null, 'profiles.company_id': COMPANY_ID })),
    crew_contracts: [],
  };
};

const findCall = (calls: SupabaseCall[], table: string, op: SupabaseCall['op']) => calls.find((c) => c.table === table && c.op === op);

let mock: ReturnType<typeof setupSupabase>;

beforeEach(() => {
  mock = setupSupabase(fixtures());
  setupAccess('edit');
});

describe('item 6: the page never grows wider than the screen', () => {
  it('the page, its grid and the grid items may shrink; the grid is one column below the extra-wide layout', async () => {
    const { container } = renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /edit assignment/i })).toHaveLength(2));

    const page = container.querySelector('[data-employment-history-page]');
    expect(page).toHaveClass('min-w-0');
    const grid = container.querySelector('[data-employment-history-grid]');
    expect(grid).toHaveClass('grid', 'min-w-0', 'grid-cols-1');
    // The two-column layout only at xl, with shrinkable tracks.
    expect(grid?.className).toContain('xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]');
    for (const item of Array.from(grid?.children ?? [])) expect(item).toHaveClass('min-w-0');
  });

  it('the assignments table scrolls inside its card', async () => {
    const { container } = renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /edit assignment/i })).toHaveLength(2));
    const card = container.querySelector('[data-assignments-table]');
    expect(card).toHaveClass('min-w-0');
    const scroll = container.querySelector('[data-assignments-scroll]');
    expect(scroll).toHaveClass('max-w-full', 'overflow-x-auto');
    expect(scroll?.querySelector('table')).not.toBeNull();
  });

  it('with an edit row open, the inputs keep a usable width and the sentences stay pinned to the card edge', async () => {
    const { container } = renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p-dpa` });
    const edit = await screen.findByRole('button', { name: /edit assignment/i });
    fireEvent.click(edit);
    const position = await screen.findByLabelText('Position');
    expect(position.className).toMatch(/min-w-\[/);
    expect(screen.getByLabelText('Join date').className).toMatch(/min-w-\[/);
    const lock = container.querySelector('[data-assignment-lock]');
    expect(lock).toHaveClass('sticky');
    // The sentence wraps inside the screen, not at a fixed desktop width.
    expect(lock?.className).toContain('max-w-[min(36rem,calc(100vw-5rem))]');
    // The edit row stays inside the scroll container.
    expect(container.querySelector('[data-assignments-scroll]')?.contains(position)).toBe(true);
    // Save and Cancel stay pinned to the card's right edge, in reach without scrolling sideways.
    const save = screen.getByRole('button', { name: /^save$/i });
    const actions = save.closest('[data-assignment-actions]');
    expect(actions).toHaveClass('sticky', 'right-0', 'bg-card');
    expect(actions?.contains(screen.getByRole('button', { name: /^cancel$/i }))).toBe(true);
  });
});

describe('item 5: the editor’s own position and rank are locked before Save', () => {
  it('on their own history, Position and Rank are disabled with D-218’s sentence; a date edit saves without a title change', async () => {
    renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p-dpa` });
    fireEvent.click(await screen.findByRole('button', { name: /edit assignment/i }));

    for (const label of ['Position', 'Rank']) {
      const input = await screen.findByLabelText(label);
      expect(input, label).toBeDisabled();
      expect(input, label).toHaveAccessibleDescription(OWN_POSITION_MESSAGE);
    }
    expect(screen.getByLabelText('Join date')).toBeEnabled();
    expect(screen.getByLabelText('Notes')).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Own assignment, updated' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(findCall(mock.calls, 'crew_assignments', 'update')).toBeDefined());
    const update = findCall(mock.calls, 'crew_assignments', 'update');
    expect(update?.filters).toContainEqual({ kind: 'eq', column: 'id', value: 'a-dpa' });
    expect(update?.payload).toMatchObject({ notes: 'Own assignment, updated' });
    expect(update?.payload).not.toHaveProperty('position');
    expect(update?.payload).not.toHaveProperty('rank');
  });

  it('on someone else’s history the title stays open to the HR editor', async () => {
    renderHrisPage(EmploymentHistoryPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /edit assignment/i })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: /edit assignment/i })[1]);
    const position = await screen.findByLabelText('Position');
    expect(position).toBeEnabled();
    expect(screen.queryByText(OWN_POSITION_MESSAGE)).toBeNull();
    const table = screen.getByRole('table');
    expect(within(table).getByLabelText('Rank')).toBeEnabled();
  });
});
