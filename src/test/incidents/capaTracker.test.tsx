/**
 * Fleet › Reports › CAPA tracker (src/modules/incidents/pages/CAPATracker.tsx;
 * the legacy hub page the fleet dashboard and the vessel comparison link to,
 * D-381; R19 / D-384 for its export):
 *
 * - `?vessels=` naming one known vessel code seeds the Vessel filter with
 *   that vessel; more than one code keeps every vessel and says the tracker
 *   filters one vessel at a time;
 * - `?status=open` seeds "All open" (every action not closed) and
 *   `?status=overdue` seeds "Overdue", both applied to the list here while
 *   the list hook is asked for every status;
 * - no fake Export: the control is disabled with its reason beside it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type CapaRow = {
  id: string;
  action_number: string;
  description: string;
  action_type: string;
  status: string;
  due_date: string;
  created_at: string;
  assigned_to: string | null;
  incident_id: string | null;
  incident_number?: string;
  assignee_name: string;
  days_open: number;
  is_overdue: boolean;
};

const state = vi.hoisted(() => ({
  listCalls: [] as Array<Record<string, unknown>>,
  rows: [] as CapaRow[],
  toast: { info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: state.toast }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/modules/analytics/components/CAPAAgingChart', () => ({ CAPAAgingChart: () => <div data-testid="aging" /> }));
vi.mock('@/modules/analytics/hooks/useCAPAAnalytics', () => ({
  useCAPAMetrics: () => ({ data: { totalOpen: 2, overdue: 1, avgDaysToComplete: 4, completionRateThisMonth: 50, completedThisMonth: 1, totalThisMonth: 2 }, isLoading: false }),
  useCAPAList: (filters: Record<string, unknown>) => {
    state.listCalls.push(filters);
    return { data: state.rows, isLoading: false };
  },
  useCAPAAging: () => ({ data: [] }),
  useAssigneePerformance: () => ({ data: [] }),
}));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({
  useVessels: () => ({
    vessels: [
      { id: 'v-dra', name: 'DRAAK', code: 'DRA', created_at: '2024-01-01T00:00:00Z' },
      { id: 'v-hyd', name: 'HYDRA', code: 'HYD', created_at: '2024-02-01T00:00:00Z' },
    ],
  }),
}));
vi.mock('@/modules/crew/hooks/useCrew', () => ({ useCrew: () => ({ crew: [] }) }));

import CAPATracker from '@/modules/incidents/pages/CAPATracker';

const capa = (id: string, status: string, overdue: boolean): CapaRow => ({
  id,
  action_number: id,
  description: `Action ${id}`,
  action_type: 'Corrective',
  status,
  due_date: '2026-11-20',
  created_at: '2026-11-01T00:00:00Z',
  assigned_to: null,
  incident_id: null,
  assignee_name: 'Unassigned',
  days_open: 26,
  is_overdue: overdue,
});

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CAPATracker />
    </MemoryRouter>,
  );
}

const lastCall = () => state.listCalls.at(-1);
const listed = () => {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]?.textContent);
};

afterEach(() => {
  cleanup();
  state.listCalls = [];
  state.rows = [];
  state.toast.info.mockClear();
});

describe('CAPA tracker: filters from the link', () => {
  it('?vessels=<one code>&status=open: that vessel, every open action', () => {
    state.rows = [capa('CA-1', 'Open', true), capa('CA-2', 'In Progress', false), capa('CA-3', 'Closed', false)];
    renderAt('/fleet/reports/capa-tracker?vessels=dra&status=open');
    // The vessel is resolved from its code; the status is applied on the page, so the hook gets every status.
    expect(lastCall()).toMatchObject({ vesselId: 'v-dra', status: 'all' });
    expect(listed()).toEqual(['CA-1', 'CA-2']);
    const [vessel, status] = screen.getAllByRole('combobox');
    expect(vessel).toHaveTextContent('DRAAK');
    expect(status).toHaveTextContent('All open');
    expect(screen.queryByTestId('capa-vessels-note')).toBeNull();
  });

  it('?status=overdue: only the actions past their due date', () => {
    state.rows = [capa('CA-1', 'Open', true), capa('CA-2', 'In Progress', false), capa('CA-3', 'Closed', false)];
    renderAt('/fleet/reports/capa-tracker?status=overdue');
    expect(lastCall()).toMatchObject({ vesselId: 'all', status: 'all' });
    expect(listed()).toEqual(['CA-1']);
    expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('Overdue');
  });

  it('more than one vessel code: every vessel, and it says the tracker filters one at a time', () => {
    state.rows = [capa('CA-1', 'Open', false)];
    renderAt('/fleet/reports/capa-tracker?vessels=DRA,HYD');
    expect(lastCall()).toMatchObject({ vesselId: 'all' });
    expect(screen.getByTestId('capa-vessels-note')).toHaveTextContent('Showing every vessel: this tracker filters one vessel at a time');
  });

  it('an unknown code or status reads as every vessel and every status', () => {
    state.rows = [capa('CA-1', 'Open', false), capa('CA-3', 'Closed', false)];
    renderAt('/fleet/reports/capa-tracker?vessels=ZZZ&status=nonsense');
    expect(lastCall()).toMatchObject({ vesselId: 'all', status: 'all' });
    expect(listed()).toEqual(['CA-1', 'CA-3']);
  });

  it('with no query: every vessel, status, type and assignee', () => {
    renderAt('/fleet/reports/capa-tracker');
    expect(lastCall()).toMatchObject({ vesselId: 'all', status: 'all', type: 'all', assignedTo: 'all' });
  });
});

describe('CAPA tracker: export (R19, D-384)', () => {
  it('shows Export disabled with its reason, never a control that pretends to work', () => {
    renderAt('/fleet/reports/capa-tracker');
    const exportButton = screen.getByRole('button', { name: /export/i });
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAccessibleDescription('Export is not available for this report yet');
    fireEvent.click(exportButton);
    expect(state.toast.info).not.toHaveBeenCalled();
  });
});
