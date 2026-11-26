/**
 * The vessel's Crew Training register (`/v/:vesselCode/crew/training`;
 * X5-07B; gap/04 C62; D-X1-7):
 *
 * - it reads the scope's vessel only (the vessel id from the route, no name
 *   filter), drafts and voided applications left out;
 * - the gate fails closed: nothing is read while access loads; denied is
 *   AccessDenied; no vessel in scope asks for one;
 * - phases come from the dates; a row opens the application with the parts
 *   the viewer's vessel capabilities suggest;
 * - "Manage courses" needs fleet reach and fleet training access;
 * - the export is vessel-scoped personal data;
 * - the Crew Training leaf carries its key and status, and is hidden where
 *   the vessel's crew_training module setting is off.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildVesselNav } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { navNodeDecision } from '@/app/nav/visibility';
import { resolveModuleSettings } from '@/modules/vessels/lib/moduleSettings';
import { COMPANY, V, application, freshTrainingState, type TrainingDbState } from './fakeTrainingDb';

const h = vi.hoisted(() => ({
  state: null as unknown as TrainingDbState,
  access: { status: 'allowed', allowed: true } as { status: string; allowed: boolean },
  accessCtx: [] as unknown[],
  caps: {} as Record<string, boolean>,
  scope: null as null | { vessel: { id: string; name: string }; code: string },
  fleetReach: false,
  wide: true,
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
  useCapability: (_key: string, ctx?: unknown) => {
    h.accessCtx.push(ctx);
    return h.access;
  },
  useCan: (key: string) => Boolean(h.caps[key]),
}));
vi.mock('@/app/router/scopes', () => ({ useVesselScope: () => h.scope }));
vi.mock('@/app/nav/navAccess', () => ({ useNavAccess: () => ({ fleetReach: h.fleetReach }) }));
vi.mock('@/shared/components/data/useMinWidth', () => ({ useMinWidth: () => h.wide, TABLET_MIN_WIDTH: 768 }));
vi.mock('@/lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/export')>();
  return {
    ...actual,
    runExport: async (options: Record<string, unknown>) => {
      h.exports.push(options);
      return { status: 'ok', value: { fileName: 'DRA_Crew_training.csv', rowCount: 0, logged: true, jobId: 'j1' } };
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

import CrewTraining from '@/modules/development/pages/CrewTraining';
import manifest from '@/modules/development/module';

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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/v/dra/crew/training']}>
        <CrewTraining />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const TODAY = new Date();
const day = (offset: number) => {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeEach(() => {
  h.state = freshTrainingState();
  h.state.rows.development_applications = [
    application('1', { course_name: 'Advanced firefighting', status: 'hod_review', course_start_date: day(20), course_end_date: day(22) }),
    application('2', { course_name: 'Medical first aid', status: 'enrolled', course_start_date: day(-1), course_end_date: day(2) }),
    application('3', { course_name: 'Wine and spirits', status: 'completed', course_start_date: day(-40), course_end_date: day(-38) }),
    application('4', { course_name: 'Elsewhere course', vessel_id: V.hyd }),
    application('5', { course_name: 'Voided course', status: 'voided' }),
  ];
  h.state.rows.program_settings = [{ id: 'ps', company_id: COMPANY, final_approval_mode: 'both', category_labels: {}, fx_overrides: {} }];
  h.access = { status: 'allowed', allowed: true };
  h.accessCtx = [];
  h.caps = { 'vessel.crew.crew_training.view': true };
  h.scope = { vessel: { id: V.dra, name: 'DRAAK' }, code: 'dra' };
  h.fleetReach = false;
  h.wide = true;
  h.exports = [];
});

const table = () => screen.findByRole('table', { name: 'Crew training on DRAAK' });

describe('the vessel in scope', () => {
  it('reads this vessel’s applications only, by its id', async () => {
    renderPage();
    const t = await table();
    expect(within(t).getByText('Advanced firefighting')).toBeInTheDocument();
    expect(within(t).queryByText('Elsewhere course')).toBeNull();
    expect(within(t).queryByText('Voided course')).toBeNull();
    const read = h.state.reads.find((r) => r.table === 'development_applications');
    expect(read?.filters).toEqual(expect.arrayContaining([['eq', 'company_id', COMPANY], ['eq', 'vessel_id', V.dra], ['neq', 'status', 'draft'], ['neq', 'status', 'voided']]));
    expect(h.accessCtx).toContainEqual({ vesselId: V.dra });
  });

  it('asks for a vessel when the scope has none, and reads nothing', () => {
    h.scope = null;
    renderPage();
    expect(screen.getByText('Choose a vessel')).toBeInTheDocument();
    expect(h.state.reads).toEqual([]);
  });
});

describe('the gate', () => {
  it('reads nothing while access loads', () => {
    h.access = { status: 'loading', allowed: false };
    renderPage();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(h.state.reads).toEqual([]);
  });

  it('is AccessDenied without the vessel key', () => {
    h.access = { status: 'denied', allowed: false };
    renderPage();
    expect(screen.getByText(/Crew training needs access to this vessel’s crew training|Crew training needs access to this vessel's crew training/)).toBeInTheDocument();
    expect(h.state.reads).toEqual([]);
  });
});

describe('the register', () => {
  it('chips the courses by phase', async () => {
    renderPage();
    await table();
    fireEvent.click(screen.getByRole('button', { name: /^In progress/ }));
    const t = await table();
    expect(within(t).getByText('Medical first aid')).toBeInTheDocument();
    expect(within(t).queryByText('Advanced firefighting')).toBeNull();
  });

  it('opens an application with the parts the viewer’s vessel keys suggest', async () => {
    h.caps['vessel.crew.crew_training.approve'] = true;
    renderPage();
    fireEvent.click(within(await table()).getByText('Advanced firefighting'));
    expect(await screen.findByRole('dialog', { name: 'Application' })).toHaveTextContent('Advanced firefighting · hod');
  });

  it('offers Manage courses only with fleet reach and fleet training access', async () => {
    h.caps['fleet.operations.fleet_training.view'] = true;
    const first = renderPage();
    await table();
    expect(screen.queryByRole('link', { name: /Manage courses/ })).toBeNull();
    first.unmount();
    h.fleetReach = true;
    renderPage();
    await table();
    expect(screen.getByRole('link', { name: /Manage courses/ })).toHaveAttribute('href', '/fleet/training/catalogue');
  });

  it('exports the rows shown, vessel-scoped, as personal data', async () => {
    h.caps['vessel.crew.crew_training.export'] = true;
    renderPage();
    await table();
    fireEvent.pointerDown(screen.getByRole('button', { name: /Export/ }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /CSV/ }));
    await waitFor(() => expect(h.exports).toHaveLength(1));
    expect(h.exports[0]).toMatchObject({ personalData: true, vesselId: V.dra, vesselCode: 'dra', sourceKey: 'development.vessel_crew_training' });
    expect((h.exports[0].rows as Array<{ id: string }>).map((r) => r.id).sort()).toEqual(['1', '2', '3']);
  });

  it('folds into cards below 768 px', async () => {
    h.wide = false;
    renderPage();
    const cards = await screen.findByRole('list', { name: 'Crew training on DRAAK' });
    expect(within(cards).getAllByRole('button')).toHaveLength(3);
  });

  it('is an error with Try again when the applications cannot be read', async () => {
    h.state.tableErrors.development_applications = { code: '500', message: 'boom' };
    renderPage();
    expect(await screen.findByText('This vessel’s training applications could not be loaded'.replace('’', "'"))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('the Crew Training leaf', () => {
  const leaf = (nodes: readonly NavChild[]): NavChild | undefined => {
    for (const n of nodes) {
      if (n.path === '/v/dra/crew/training') return n;
      const inner = n.children ? leaf(n.children) : undefined;
      if (inner) return inner;
    }
    return undefined;
  };
  const crewTree = (isModuleOn?: (k: string) => boolean) => buildVesselNav('dra', isModuleOn ? { isModuleOn } : {}).flatMap((m) => m.children);

  it('is beta, with the vessel key and the crew_training setting', () => {
    const node = leaf(crewTree());
    expect(node).toMatchObject({ label: 'Crew Training', status: 'beta', capability: 'vessel.crew.crew_training.view', moduleSetting: 'crew_training' });
    expect(manifest.nav?.find((f) => f.slot === 'vessel.crew')?.order).toBe(70);
  });

  it('is hidden where the vessel switches crew_training off, and needs the key', () => {
    const off = resolveModuleSettings(
      { status: 'ready', source: 'table', settings: new Map([['crew_training', { moduleKey: 'crew_training', enabled: false, enabledFrom: null, labelOverride: null }]]) },
      day(0),
    );
    expect(leaf(crewTree(off.isModuleOn))).toBeUndefined();
    const node = leaf(crewTree()) as NavChild;
    const ctx = { showPlanned: false, can: () => true, fleetReach: true, vesselReach: true };
    expect(navNodeDecision(node, { ...ctx, isModuleOn: off.isModuleOn })).toBe('hidden');
    expect(navNodeDecision(node, { ...ctx, isModuleOn: () => true })).toBe('visible');
    expect(navNodeDecision(node, { ...ctx, can: () => false, isModuleOn: () => true })).toBe('hidden');
  });
});
