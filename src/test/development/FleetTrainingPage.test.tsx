/**
 * Fleet › Training (`/fleet/training/:tab`; X5-07B; gap/02 TR1–TR3, TR6;
 * D-01, D-04, D-88):
 *
 * - the gate fails closed: nothing is read while access loads, and denied
 *   is AccessDenied with no read;
 * - an unknown tab lands on the overview;
 * - the overview lists applications awaiting approval for more than 7 days
 *   with the approver level, longest first, says when stage tracking is not
 *   set up, and keeps drafts and voided applications out of every count;
 * - by vessel keeps spend per currency (never converted);
 * - the applications register reads its filters from the URL, opens a row
 *   with the viewer's fleet training parts, exports the rows shown as
 *   personal data, and says why Export is unavailable without the key;
 * - a failed read is an error with Retry, never sample rows.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COMPANY, V, application, createTrainingDb, daysAgo, freshTrainingState, vesselsReady, type TrainingDbState } from './fakeTrainingDb';

const h = vi.hoisted(() => ({
  state: null as unknown as TrainingDbState,
  access: { status: 'allowed', allowed: true } as { status: string; allowed: boolean },
  caps: {} as Record<string, boolean>,
  wide: true,
  vessels: null as unknown,
  exports: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', async () => {
  const { createTrainingDb: create } = await import('./fakeTrainingDb');
  return {
    supabase: {
      from: (t: string) => create(h.state).from(t),
      rpc: (fn: string, args: Record<string, unknown>) => create(h.state).rpc(fn, args),
    },
  };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' }, profile: { company_id: 'co-1' } }) }));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => h.access,
  useCan: (key: string) => Boolean(h.caps[key]),
}));
vi.mock('@/modules/fleet', () => ({ useFleetVesselsShown: () => h.vessels }));
vi.mock('@/shared/components/data/useMinWidth', () => ({ useMinWidth: () => h.wide, TABLET_MIN_WIDTH: 768 }));
vi.mock('@/lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/export')>();
  return {
    ...actual,
    runExport: async (options: Record<string, unknown>) => {
      h.exports.push(options);
      return { status: 'ok', value: { fileName: 'FLEET_Training_applications.csv', rowCount: 0, logged: true, jobId: 'j1' } };
    },
  };
});
vi.mock('@/modules/development/components/ApplicationDetailModal', () => ({
  default: ({ open, application, viewerRoles }: { open: boolean; application: { course_name: string } | null; viewerRoles?: string[] }) =>
    open && application ? (
      <div role="dialog" aria-label="Application">
        {application.course_name} · {(viewerRoles ?? []).join(',')}
      </div>
    ) : null,
}));

import FleetTrainingPage from '@/modules/development/pages/FleetTrainingPage';

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/fleet/training/:tab" element={<FleetTrainingPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const APPS = () => [
  application('1', { course_name: 'Advanced firefighting', status: 'hod_review', stage_entered_at: daysAgo(12), crew_member: { first_name: 'Demo', last_name: 'Bosun', department: 'Deck' } }),
  application('2', { course_name: 'Silver service', status: 'captain_purser_review', captain_decision: 'approved', stage_entered_at: daysAgo(9), vessel_id: V.hyd }),
  application('3', { course_name: 'Yachtmaster offshore', status: 'hod_review', stage_entered_at: daysAgo(3) }),
  application('4', {
    course_name: 'Wine and spirits',
    status: 'approved',
    vessel_id: V.hyd,
    application_currency: 'EUR',
    tuition_local_amount: 800,
    travel_local_amount: 100,
    accommodation_local_amount: 0,
    estimated_food_per_diem_usd: 0,
  }),
  application('5', { course_name: 'High voltage', status: 'reimbursed', category: 'professional', clawback_end_date: '2099-01-01' }),
];

beforeEach(() => {
  h.state = freshTrainingState();
  h.state.rows.development_applications = APPS();
  h.state.rows.program_settings = [{ id: 'ps', company_id: COMPANY, final_approval_mode: 'both', category_labels: {}, fx_overrides: {} }];
  h.state.rows.development_expenses = [];
  h.access = { status: 'allowed', allowed: true };
  h.caps = { 'fleet.operations.fleet_training.view': true };
  h.wide = true;
  h.vessels = vesselsReady();
  h.exports = [];
});

describe('the gate', () => {
  it('reads nothing while access loads', () => {
    h.access = { status: 'loading', allowed: false };
    renderAt('/fleet/training/overview');
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Training' })).toBeNull();
    expect(h.state.reads).toEqual([]);
    expect(h.state.rpcCalls).toEqual([]);
  });

  it('is AccessDenied without the view key, and reads nothing', () => {
    h.access = { status: 'denied', allowed: false };
    renderAt('/fleet/training/applications');
    expect(screen.getByText(/Fleet training needs access to fleet training/)).toBeInTheDocument();
    expect(h.state.reads).toEqual([]);
  });
});

describe('tabs', () => {
  it('lands an unknown tab on the overview', async () => {
    renderAt('/fleet/training/budget');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/fleet/training/overview'));
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('links every tab by its own URL', async () => {
    renderAt('/fleet/training/overview');
    const nav = screen.getByRole('navigation', { name: 'Training views' });
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/fleet/training/overview',
      '/fleet/training/by-vessel',
      '/fleet/training/applications',
      '/fleet/training/catalogue',
      '/fleet/training/settings',
    ]);
  });
});

describe('overview', () => {
  it('lists the applications waiting more than 7 days, longest first, with who they wait for', async () => {
    renderAt('/fleet/training/overview');
    const heading = await screen.findByRole('heading', { name: 'Awaiting approval for more than 7 days' });
    const section = heading.closest('section') as HTMLElement;
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Advanced firefighting');
    expect(items[0]).toHaveTextContent('With the head of department');
    expect(items[0]).toHaveTextContent('12 days at this stage');
    expect(items[1]).toHaveTextContent('Silver service');
    expect(items[1]).toHaveTextContent('With the Purser');
    expect(within(section).queryByText('Yachtmaster offshore')).toBeNull();
  });

  it('opens a waiting application with the viewer’s fleet training parts', async () => {
    h.caps['fleet.operations.fleet_training.admin'] = true;
    renderAt('/fleet/training/overview');
    fireEvent.click(await screen.findByRole('button', { name: /Open Advanced firefighting/ }));
    expect(await screen.findByRole('dialog', { name: 'Application' })).toHaveTextContent('Advanced firefighting · training_admin,training_editor');
    expect(screen.getByTestId('where').textContent).toContain('application=1');
  });

  it('says when stage tracking is not set up, and still counts from submission', async () => {
    h.state.missingColumns.add('development_applications.stage_entered_at');
    h.state.rows.development_applications = [application('9', { status: 'submitted', stage_entered_at: undefined, submitted_at: daysAgo(10) })];
    renderAt('/fleet/training/overview');
    expect(await screen.findByTestId('training-stage-not-set-up')).toBeInTheDocument();
    expect(screen.getByText('Course 9')).toBeInTheDocument();
  });

  it('never counts drafts or voided applications', async () => {
    h.state.rows.development_applications = [application('1', { status: 'draft' }), application('2', { status: 'voided' }), application('3', { status: 'approved' })];
    renderAt('/fleet/training/overview');
    const tile = (await screen.findByText('Submitted, not voided')).closest('a') as HTMLElement;
    expect(tile).toHaveTextContent(/Applications\s*1/);
    // The register query itself leaves them out too.
    const read = h.state.reads.find((r) => r.table === 'development_applications');
    expect(read?.filters).toEqual(expect.arrayContaining([['eq', 'company_id', COMPANY], ['neq', 'status', 'voided'], ['neq', 'status', 'draft']]));
  });

  it('is an error with Retry when the applications cannot be read', async () => {
    h.state.tableErrors.development_applications = { code: '500', message: 'boom' };
    renderAt('/fleet/training/overview');
    expect(await screen.findByText('The training applications could not be loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('by vessel', () => {
  it('keeps spend per currency and links counts to the filtered register', async () => {
    renderAt('/fleet/training/by-vessel');
    const table = await screen.findByRole('table', { name: 'Training by vessel' });
    const hydra = within(table).getByText('HYDRA').closest('tr') as HTMLElement;
    expect(hydra).toHaveTextContent('EUR 900');
    expect(within(hydra).getAllByRole('link', { name: '1' }).map((a) => a.getAttribute('href'))).toEqual([
      '/fleet/training/applications?vessel=hyd&status=awaiting',
      '/fleet/training/applications?vessel=hyd&status=approved',
    ]);
    expect(screen.getByTestId('training-spend-note')).toHaveTextContent('never converted');
  });
});

describe('applications register', () => {
  it('reads the vessel and status filters from the URL', async () => {
    renderAt('/fleet/training/applications?vessel=hyd&status=approved');
    const table = await screen.findByRole('table', { name: 'Training applications' });
    expect(within(table).getByText('Wine and spirits')).toBeInTheDocument();
    expect(within(table).queryByText('Silver service')).toBeNull();
    expect(within(table).queryByText('Advanced firefighting')).toBeNull();
  });

  it('keeps nothing for a vessel code outside the reader’s list, and says so', async () => {
    renderAt('/fleet/training/applications?vessel=zzz');
    expect(await screen.findByTestId('training-unknown-vessel')).toHaveTextContent('ZZZ');
  });

  it('filters clawback-active applications from the switch, into the URL', async () => {
    renderAt('/fleet/training/applications');
    await screen.findByRole('table', { name: 'Training applications' });
    fireEvent.click(screen.getByRole('switch', { name: 'Clawback active' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('clawback=active'));
    const table = screen.getByRole('table', { name: 'Training applications' });
    expect(within(table).getByText('High voltage')).toBeInTheDocument();
    expect(within(table).queryByText('Wine and spirits')).toBeNull();
  });

  it('says why Export is unavailable without the export key', async () => {
    renderAt('/fleet/training/applications');
    await screen.findByRole('table', { name: 'Training applications' });
    expect(screen.getByRole('button', { name: /Export/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Exporting needs training export access')).toBeInTheDocument();
  });

  it('exports the rows shown as personal data, filters logged as codes', async () => {
    h.caps['fleet.operations.fleet_training.export'] = true;
    renderAt('/fleet/training/applications?status=approved');
    await screen.findByRole('table', { name: 'Training applications' });
    const trigger = screen.getByRole('button', { name: /Export/ });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /CSV/ }));
    await waitFor(() => expect(h.exports).toHaveLength(1));
    const options = h.exports[0] as { personalData: boolean; sourceKey: string; rows: Array<{ id: string }>; params: Record<string, unknown> };
    expect(options.personalData).toBe(true);
    expect(options.sourceKey).toBe('development.fleet_training_applications');
    expect(options.rows.map((r) => r.id)).toEqual(['4']);
    expect(options.params).toEqual({ vessel: null, category: null, status: 'approved', clawback_active: false, searched: false });
  });

  it('folds into cards below 768 px, each opening its application', async () => {
    h.wide = false;
    renderAt('/fleet/training/applications');
    const cards = await screen.findByRole('list', { name: 'Training applications' });
    fireEvent.click(within(cards).getByRole('button', { name: /Open Wine and spirits/ }));
    expect(await screen.findByRole('dialog', { name: 'Application' })).toHaveTextContent('Wine and spirits');
  });
});
