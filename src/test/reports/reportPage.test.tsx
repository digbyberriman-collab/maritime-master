/**
 * The report page (/fleet/reports/:reportKey; src/modules/reports/pages/
 * ReportPage.tsx; DECISIONS C12, D-04):
 *
 * - an unknown key (and a vessel-scope report) is the in-scope "Report not
 *   found", an h1 with a link back to the hub, and names the page so;
 * - the report's own capability is checked before its component is loaded:
 *   while it loads nothing of the report renders (deny while loading), and a
 *   denied reader gets AccessDenied;
 * - an allowed reader gets the registry's component with its definition;
 * - a legacy report reaching this page links to its own page (no redirect
 *   loop).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

type Decision = { allowed: boolean; status: string; reason: string };
const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  asked: [] as string[],
  rendered: vi.fn(),
  override: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => {
    state.asked.push(key);
    return state.decide(key);
  },
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/shared/components/layout/pageLocationOverride', () => ({ usePageLocationOverride: (v: unknown) => state.override(v) }));
vi.mock('@/modules/reports/reports/VesselComparisonReport', () => ({
  default: ({ definition }: { definition: { key: string; title: string } }) => {
    state.rendered(definition.key);
    return <h1>{`Report body: ${definition.title}`}</h1>;
  },
}));

import ReportPage from '@/modules/reports/pages/ReportPage';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/fleet/reports/:reportKey" element={<ReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.asked = [];
  state.rendered.mockReset();
  state.override.mockReset();
});

describe('ReportPage', () => {
  it('an unknown key is "Report not found" with a link back to the hub', () => {
    renderAt('/fleet/reports/no-such-report');
    expect(screen.getByRole('heading', { level: 1, name: 'Report not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All reports' })).toHaveAttribute('href', '/fleet/reports');
    expect(state.override).toHaveBeenCalledWith({ title: 'Report not found' });
    expect(state.asked).toEqual([]);
    expect(state.rendered).not.toHaveBeenCalled();
  });

  it('checks the report’s own capability and renders nothing of it while that loads', () => {
    state.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    renderAt('/fleet/reports/vessel-comparison');
    expect(state.asked).toContain('fleet.operations.fleet_reports.view');
    expect(screen.queryByText(/Report body/)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/Loading Vessel comparison/);
    expect(state.rendered).not.toHaveBeenCalled();
  });

  it('a denied reader gets AccessDenied, and the report is never loaded', () => {
    state.decide = () => ({ allowed: false, status: 'denied', reason: 'no' });
    renderAt('/fleet/reports/vessel-comparison');
    expect(screen.getByText(/Vessel comparison needs access to its data/)).toBeInTheDocument();
    expect(state.rendered).not.toHaveBeenCalled();
  });

  it('an allowed reader gets the registry’s component with its definition', async () => {
    renderAt('/fleet/reports/vessel-comparison');
    expect(await screen.findByRole('heading', { name: 'Report body: Vessel comparison' })).toBeInTheDocument();
    expect(state.rendered).toHaveBeenCalledWith('vessel-comparison');
  });

  it('a legacy report reaching this page links to its own page, gated by its capability', () => {
    state.decide = (key) => (key === 'vessel.safety.capa.view' ? { allowed: true, status: 'granted', reason: '' } : { allowed: false, status: 'denied', reason: '' });
    renderAt('/fleet/reports/capa-tracker');
    expect(state.asked).toEqual(expect.arrayContaining(['vessel.safety.capa.view']));
    expect(screen.getByRole('link', { name: /Open CAPA tracker/ })).toHaveAttribute('href', '/fleet/reports/capa-tracker');
  });

  it('the legacy report is denied like any other without its capability', () => {
    state.decide = () => ({ allowed: false, status: 'denied', reason: '' });
    renderAt('/fleet/reports/drill-analytics');
    expect(screen.getByText(/Drill analytics needs access to its data/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open Drill analytics/ })).toBeNull();
  });
});
