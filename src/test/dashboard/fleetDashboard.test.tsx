/**
 * Fleet dashboard (/fleet/dashboard; Phase 1 S7, gap/10 C.2 item 8, DS13).
 *
 * - The gradient "Welcome" hero is gone: the page heading is one PageHeader
 *   (title "Fleet dashboard", the company's display name as eyebrow).
 * - The KPI row is KpiTile with honest states: skeletons while loading, an
 *   error with retry, "0 · All clear" only for a real zero, a plain 0 where
 *   zero is not good news (vessels, crew), and "not tracked" for sources the
 *   fleet summary does not have. No fake "System Status: Online" tile and no
 *   made-up alert counts.
 * - Until L1c lands, the shell's PageLocationHeader still renders its own h1
 *   (spec §7): this asserts the page itself brings exactly one PageHeader.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

const ready = <T,>(data: T): QueryLike<T> => ({ data, isPending: false, isError: false, refetch: vi.fn(async () => undefined) });
const loading = <T,>(): QueryLike<T> => ({ data: undefined, isPending: true, isError: false, refetch: vi.fn(async () => undefined) });
const failed = <T,>(): QueryLike<T> => ({ data: undefined, isPending: false, isError: true, refetch: vi.fn(async () => undefined) });

type AlertState =
  | { status: 'loading'; counts: null; retry: () => void }
  | { status: 'error'; reason: 'read' | 'no-company'; counts: null; retry: () => void }
  | { status: 'ready'; counts: { RED: number; ORANGE: number; YELLOW: number; GREEN: number; total: number }; retry: () => void };

const state = vi.hoisted(() => ({
  role: 'dpa' as string,
  vesselCount: null as unknown,
  crewCount: null as unknown,
  overdueCapas: null as unknown,
  pendingDocs: null as unknown,
  recentChanges: null as unknown,
  alerts: null as unknown,
  branding: { clientDisplayName: 'Ocean Fleet' as string | null, companyName: 'Ocean Fleet Ltd' as string | null },
}));

vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, profile: { role: state.role, company_id: 'co-1', first_name: 'Demo' } }),
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/shared/contexts/BrandingContext', () => ({ useBrandingContext: () => state.branding }));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({ useVesselCount: () => state.vesselCount }));
vi.mock('@/modules/crew/hooks/useCrew', () => ({
  useCrewCount: () => state.crewCount,
  useRecentCrewChanges: () => state.recentChanges,
}));
vi.mock('@/modules/analytics/hooks/useCAPAAnalytics', () => ({
  useOverdueCAPAs: () => state.overdueCapas,
  useRecentIncidents: () => ({ data: [] }),
}));
vi.mock('@/modules/auth/hooks/useAcknowledgments', () => ({
  useMandatoryDocumentsPending: () => state.pendingDocs,
  useAcknowledgmentStats: () => ({ data: [] }),
}));
// The hook is a fake; the tile helper (alertKpiTileProps) stays real, so its
// module loads, with a client that is never called.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/dashboard/hooks/useOpenAlertCounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/dashboard/hooks/useOpenAlertCounts')>()),
  useOpenAlertCounts: () => state.alerts,
}));
vi.mock('@/modules/dashboard/hooks/useDashboardLayout', () => ({
  useDashboardLayout: (defs: Array<{ id: string; defaultOrder: number; defaultVisible: boolean; defaultColSpan: number }>) => {
    const widgets = defs.map((d) => ({ widget_id: d.id, sort_order: d.defaultOrder, is_visible: d.defaultVisible, column_span: d.defaultColSpan }));
    return {
      orderedWidgets: widgets,
      visibleWidgets: widgets,
      allWidgets: widgets,
      loading: false,
      editMode: false,
      setEditMode: vi.fn(),
      toggleVisibility: vi.fn(),
      moveWidget: vi.fn(),
      toggleColSpan: vi.fn(),
      resetToDefaults: vi.fn(async () => undefined),
    };
  },
}));
vi.mock('@/modules/red-room/components/RedRoomPanel', () => ({ default: () => <div data-testid="red-room" /> }));
vi.mock('@/modules/dashboard/components/MaintenanceWidgets', () => ({ default: () => <div data-testid="maintenance" /> }));

import Dashboard from '@/modules/dashboard/pages/Dashboard';
import FleetKPITiles from '@/modules/dashboard/components/fleet/FleetKPITiles';

const alertsReady = (counts: { RED: number; ORANGE: number; YELLOW: number; GREEN?: number }): AlertState => {
  const full = { GREEN: 0, ...counts };
  return { status: 'ready', counts: { ...full, total: full.RED + full.ORANGE + full.YELLOW + full.GREEN }, retry: vi.fn() };
};

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/fleet/dashboard']}>
      <Dashboard />
    </MemoryRouter>,
  );
}

/** The KPI tile whose eyebrow label is `label`. */
function tile(label: string): HTMLElement {
  const indicators = screen.getByRole('region', { name: 'Fleet indicators' });
  const eyebrow = within(indicators).getByText(label);
  const el = eyebrow.closest<HTMLElement>('[data-state]');
  if (!el) throw new Error(`no tile for ${label}`);
  return el;
}

beforeEach(() => {
  state.role = 'dpa';
  state.vesselCount = ready(7);
  state.crewCount = ready(13);
  state.overdueCapas = ready([{ id: 'c-1' }]);
  state.pendingDocs = ready([]);
  state.recentChanges = ready([]);
  state.alerts = alertsReady({ RED: 2, ORANGE: 1, YELLOW: 3 });
  state.branding = { clientDisplayName: 'Ocean Fleet', companyName: 'Ocean Fleet Ltd' };
});

describe.each(['dpa', 'superadmin'])('fleet dashboard heading (%s)', (role) => {
  beforeEach(() => {
    state.role = role;
  });

  it('renders exactly one PageHeader with the page title and the company as eyebrow', () => {
    const { container } = renderDashboard();
    const headers = container.querySelectorAll('[data-page-heading]');
    expect(headers).toHaveLength(1);
    const h1 = within(headers[0] as HTMLElement).getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Fleet dashboard');
    expect(headers[0]).toHaveTextContent('Ocean Fleet');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('has no hero banner and no fake system-status tile', () => {
    const { container } = renderDashboard();
    expect(container.querySelector('.gradient-primary, [class*="gradient"]')).toBeNull();
    expect(screen.queryByText(/Welcome,/)).toBeNull();
    expect(screen.queryByText(/System Status/i)).toBeNull();
    expect(screen.queryByText(/All systems operational/i)).toBeNull();
    expect(screen.queryByText(/^Online$/)).toBeNull();
  });

  it('falls back to the company name, then "Fleet", for the eyebrow', () => {
    state.branding = { clientDisplayName: null, companyName: 'Ocean Fleet Ltd' };
    const first = renderDashboard();
    expect(first.container.querySelector('[data-page-heading]')).toHaveTextContent('Ocean Fleet Ltd');
    first.unmount();
    state.branding = { clientDisplayName: '  ', companyName: null };
    const second = renderDashboard();
    expect(second.container.querySelector('[data-page-heading] p')).toHaveTextContent(/^Fleet$/);
  });
});

describe('DPA KPI row', () => {
  it('shows the real alert counts by severity, with alert tones', () => {
    renderDashboard();
    expect(tile('Red alerts')).toHaveAttribute('data-state', 'ready');
    expect(tile('Red alerts')).toHaveAttribute('data-tone', 'danger');
    expect(tile('Red alerts')).toHaveTextContent('2');
    expect(tile('Orange alerts')).toHaveAttribute('data-tone', 'orange');
    expect(tile('Yellow alerts')).toHaveTextContent('3');
    expect(tile('Overdue CAPAs')).toHaveAttribute('data-tone', 'danger');
    // The old row invented "5 yellow" and "45 compliant items".
    expect(screen.queryByText(/Compliant Items/i)).toBeNull();
    expect(screen.queryByText('45')).toBeNull();
  });

  it('shows skeletons while loading, never a 0', () => {
    state.alerts = { status: 'loading', counts: null, retry: vi.fn() };
    state.vesselCount = loading();
    renderDashboard();
    for (const label of ['Red alerts', 'Orange alerts', 'Yellow alerts', 'Vessels']) {
      expect(tile(label)).toHaveAttribute('data-state', 'loading');
      expect(tile(label)).toHaveAttribute('aria-busy', 'true');
      expect(tile(label).querySelector('[data-kpi-value]')).toBeNull();
    }
  });

  it('says it could not load, with a retry, when the read fails', () => {
    const retry = vi.fn();
    state.alerts = { status: 'error', reason: 'read', counts: null, retry };
    renderDashboard();
    const red = tile('Red alerts');
    expect(red).toHaveAttribute('data-state', 'error');
    expect(red).toHaveTextContent('Could not load');
    fireEvent.click(within(red).getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('says the account has no company, with no Retry that cannot help (D-103)', () => {
    state.alerts = { status: 'error', reason: 'no-company', counts: null, retry: vi.fn() };
    renderDashboard();
    for (const label of ['Red alerts', 'Orange alerts', 'Yellow alerts']) {
      expect(tile(label)).toHaveAttribute('data-state', 'error');
      expect(tile(label)).toHaveTextContent('No company on your account');
      expect(tile(label)).not.toHaveTextContent('Could not load');
      expect(within(tile(label)).queryByRole('button', { name: /try again/i })).toBeNull();
    }
  });

  it('shows "All clear" only for a real zero, and a plain 0 for vessels and crew', () => {
    state.alerts = alertsReady({ RED: 0, ORANGE: 0, YELLOW: 0 });
    state.overdueCapas = ready([]);
    state.vesselCount = ready(0);
    state.crewCount = ready(0);
    renderDashboard();
    expect(tile('Red alerts')).toHaveAttribute('data-state', 'zero');
    expect(tile('Red alerts')).toHaveTextContent('All clear');
    expect(tile('Overdue CAPAs')).toHaveAttribute('data-state', 'zero');
    expect(tile('Vessels')).toHaveAttribute('data-state', 'ready');
    expect(tile('Vessels')).not.toHaveTextContent('All clear');
    expect(tile('Active crew')).not.toHaveTextContent('All clear');
  });

  it('links each tile to its list', () => {
    renderDashboard();
    expect(tile('Overdue CAPAs').closest('a')).toHaveAttribute('href', '/fleet/reports/capa-tracker');
    expect(tile('Vessels').closest('a')).toHaveAttribute('href', '/fleet/admin/vessels');
  });

  it('puts the overdue-CAPA banner on the critical tokens', () => {
    renderDashboard();
    const banner = screen.getByRole('region', { name: 'Overdue corrective actions' });
    expect(banner).toHaveAttribute('data-tone', 'danger');
    expect(banner.className).toContain('bg-critical-muted');
    expect(banner.className).not.toMatch(/bg-destructive\/\d|red-|yellow-/);
  });
});

describe('fleet overview KPI row (other fleet roles)', () => {
  beforeEach(() => {
    state.role = 'superadmin';
  });

  it('puts the acknowledgement banner on the warning tokens', () => {
    state.pendingDocs = ready([
      { id: 'd-1', title: 'Safety Management Manual' },
      { id: 'd-2', title: 'Enclosed Space Entry' },
    ]);
    renderDashboard();
    const banner = screen.getByRole('region', { name: 'Documents to acknowledge' });
    expect(banner).toHaveAttribute('data-tone', 'warn');
    expect(banner.className).toContain('bg-warning-muted');
    expect(banner).toHaveTextContent('2 mandatory documents');
    expect(tile('To acknowledge')).toHaveAttribute('data-tone', 'warn');
  });

  it('reads open alerts with the red / orange / yellow breakdown', () => {
    renderDashboard();
    const alerts = tile('Open alerts');
    expect(alerts).toHaveTextContent('6');
    expect(alerts).toHaveTextContent('2 red · 1 orange · 3 yellow');
    expect(alerts).toHaveAttribute('data-tone', 'danger');
  });

  it('Open alerts says the account has no company, with no Retry', () => {
    state.alerts = { status: 'error', reason: 'no-company', counts: null, retry: vi.fn() };
    renderDashboard();
    const alerts = tile('Open alerts');
    expect(alerts).toHaveAttribute('data-state', 'error');
    expect(alerts).toHaveTextContent('No company on your account');
    expect(within(alerts).queryByRole('button', { name: /try again/i })).toBeNull();
  });
});

describe.each(['dpa', 'superadmin'])('recent crew changes (%s)', (role) => {
  beforeEach(() => {
    state.role = role;
  });

  const card = () => {
    const title = screen.getByText('Recent crew changes', { selector: '[class*="type-subtitle"]' });
    const el = title.closest<HTMLElement>('.h-full');
    if (!el) throw new Error('no crew changes card');
    return el;
  };

  it('a failed read says so with Retry, never the first-use empty state (D-04)', () => {
    const query = failed<unknown[]>();
    state.recentChanges = query;
    renderDashboard();
    const alert = within(card()).getByRole('alert');
    expect(alert).toHaveTextContent('Crew changes could not load');
    expect(screen.queryByText('No recent crew changes')).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('a real empty answer still shows the first-use empty state', () => {
    state.recentChanges = ready([]);
    renderDashboard();
    expect(within(card()).getByText('No recent crew changes')).toBeInTheDocument();
    expect(within(card()).queryByRole('alert')).toBeNull();
  });

  it('shows skeletons while loading', () => {
    state.recentChanges = loading();
    renderDashboard();
    expect(within(card()).getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('No recent crew changes')).toBeNull();
  });
});

describe('FleetKPITiles (vessel dashboard, fleet view)', () => {
  const kpi = {
    documentAlerts: { value: 4, sub: '4 expiring within 90 days' },
    safety: { value: 0, sub: '0 red alerts · 0 open CAPAs' },
    technical: { value: 2, sub: '1 overdue · 1 critical defects' },
  };
  const renderTiles = (props: React.ComponentProps<typeof FleetKPITiles>) =>
    render(
      <MemoryRouter>
        <FleetKPITiles {...props} />
      </MemoryRouter>,
    );

  it('marks sources the fleet summary does not report as not tracked, never as 0', () => {
    renderTiles({ kpi });
    for (const label of ['Hours of rest', 'Leave overdue', 'Accounting']) {
      expect(tile(label)).toHaveAttribute('data-state', 'not-enabled');
      expect(tile(label)).toHaveTextContent('—');
      expect(tile(label)).not.toHaveTextContent('All clear');
    }
    expect(tile('Document alerts')).toHaveAttribute('data-tone', 'warn');
    expect(tile('Safety')).toHaveAttribute('data-state', 'zero');
  });

  it('loads and fails like every other tile', () => {
    const first = renderTiles({ kpi: null });
    expect(tile('Safety')).toHaveAttribute('data-state', 'loading');
    first.unmount();
    const onRetry = vi.fn();
    renderTiles({ kpi: null, error: true, onRetry });
    fireEvent.click(within(tile('Technical')).getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no raw palette colours left', () => {
    const { container } = renderTiles({ kpi });
    expect(container.innerHTML).not.toMatch(/(bg|text)-(amber|sky|emerald|rose|slate|violet)-\d/);
  });
});
