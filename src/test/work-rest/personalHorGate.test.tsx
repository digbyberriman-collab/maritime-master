/**
 * The Hours of rest month gated on the vessel it writes to (PersonalHorGate,
 * D-109, D-X1-21; gap/10 W4, D-63, D-04, D-86, D-01): /me/hours-of-rest and
 * the legacy /crew/work-rest render MyWorkRestMonth, which logs against one
 * vessel. The gate follows the vessel route gate, which checks both `crew`
 * and `crew_hor`:
 *
 * - the whole Crew module off (or switched on from a later date): "Hours of
 *   rest is off for DRAAK", nothing to edit, and the month is never opened
 *   (its read creates the draft submission) (D-X1-21, the Phase 1 round 3
 *   open item);
 * - Hours of Rest off (or switched on from a later date): ModuleOff;
 * - loading: the loading state, nothing to edit;
 * - an error: Try again, which reads again;
 * - on, or no settings table yet: the month.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ monthOpened: [] as string[] }));

vi.mock('@/integrations/supabase/client', async () => {
  const { fakeSupabase } = await import('../shell/fakeSupabase');
  // The month's reads also filter by range (gte / lte); the fake keeps every row.
  const from = (table: string) => {
    const b = fakeSupabase.from(table) as ReturnType<typeof fakeSupabase.from> & { gte?: () => unknown; lte?: () => unknown };
    b.gte = () => b;
    b.lte = () => b;
    return b;
  };
  return { supabase: { ...fakeSupabase, from, rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) } };
});
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useVessel: () => shellState.vessel };
});
vi.mock('@/modules/auth/store/permissionsStore', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { usePermissionsStore: (selector: (s: object) => unknown) => selector(shellState.perm) };
});
// No shell around the page here: the layout passes through.
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
// The month's data stubbed; the hook records each vessel it opens.
vi.mock('@/modules/work-rest/hooks/useMonthlyWorkRest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/work-rest/hooks/useMonthlyWorkRest')>();
  const { calculateCompliance } = await import('@/modules/work-rest/lib/complianceEngine');
  const { DEFAULT_RULE_SET } = await import('@/modules/work-rest/types');
  const submission = { id: 'sub-1', crew_id: 'u-officer', vessel_id: 'v-dra', period_year: 2026, period_month: 11, status: 'draft' };
  return {
    ...actual,
    loadMonthlyWorkRest: async () => ({ submission, ruleSet: DEFAULT_RULE_SET, records: [], context: [], nonConformities: [], signatures: [] }),
    useMonthlyWorkRest: ({ vesselId }: { vesselId: string }) => {
      h.monthOpened.push(vesselId);
      return {
        submission: { ...submission, vessel_id: vesselId },
        records: [],
        compliance: calculateCompliance([], DEFAULT_RULE_SET),
        ruleSet: DEFAULT_RULE_SET,
        nonConformities: [],
        signatures: [],
        loading: false,
        saving: false,
        error: null,
        isLocked: false,
        isOpen: true,
        isDirty: false,
        savePath: 'unknown',
        save: async () => undefined,
        refresh: async () => undefined,
        setDayBlocks: () => undefined,
      };
    },
  };
});
vi.mock('@/modules/work-rest/components/SignOffPanel', () => ({ SignOffPanel: () => <button type="button">Submit month</button> }));
vi.mock('@/modules/work-rest/components/NonConformityList', () => ({ NonConformityList: () => null }));
vi.mock('@/modules/work-rest/components/AuditLogPanel', () => ({ AuditLogPanel: () => null }));

import { PersonalHorGate } from '@/modules/work-rest/components/PersonalHorGate';
import MyWorkRestMonth from '@/modules/work-rest/pages/MyWorkRestMonth';
import { fakeDb, resetFakeDb } from '../shell/fakeSupabase';
import { DRAAK, USER_ID, asVesselMaster, renderShell, resetShellState } from '../shell/shellFakes';

const personalScope = { scope: 'personal' as const };

const setting = (module_key: string, extra: Record<string, unknown> = {}) => ({
  vessel_id: DRAAK.id, module_key, enabled: true, enabled_from: null, label_override: null, ...extra,
});
const horRow = (extra: Record<string, unknown> = {}) => setting('crew_hor', extra);
const crewRow = (extra: Record<string, unknown> = {}) => setting('crew', extra);

const renderGate = () =>
  renderShell(
    <PersonalHorGate vesselId={DRAAK.id} vesselName="DRAAK">
      <h1>Hours of rest</h1>
      <button type="button">Save</button>
    </PersonalHorGate>,
    { path: '/me/hours-of-rest', scope: personalScope },
  );

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  asVesselMaster([DRAAK]);
  h.monthOpened = [];
});

describe('PersonalHorGate: Hours of Rest (crew_hor)', () => {
  it('off: ModuleOff for the vessel, and no Save', async () => {
    fakeDb.tables.vessel_module_settings = [horRow({ enabled: false })];
    renderGate();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hours of Rest is switched off for DRAAK' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('switched on from a date still to come counts as off (D-63)', async () => {
    fakeDb.tables.vessel_module_settings = [horRow({ enabled_from: '2999-01-01' })];
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Hours of Rest is switched off for DRAAK' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it("off: the vessel's own name for the module", async () => {
    fakeDb.tables.vessel_module_settings = [horRow({ enabled: false, label_override: 'Rest hours' })];
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Rest hours is switched off for DRAAK' })).toBeInTheDocument();
  });
});

describe('PersonalHorGate: the whole Crew module (D-X1-21)', () => {
  it('Crew off closes the personal page too, though crew_hor is on', async () => {
    fakeDb.tables.vessel_module_settings = [crewRow({ enabled: false }), horRow()];
    renderGate();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hours of rest is off for DRAAK' })).toBeInTheDocument();
    expect(screen.getByText(/Crew is switched off for this vessel, and its hours of rest with it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('Crew switched on from a date still to come is off (D-63)', async () => {
    fakeDb.tables.vessel_module_settings = [crewRow({ enabled_from: '2999-01-01' })];
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Hours of rest is off for DRAAK' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it("Crew off names the vessel's own name for the Crew module", async () => {
    fakeDb.tables.vessel_module_settings = [crewRow({ enabled: false, label_override: 'People' })];
    renderGate();
    expect(await screen.findByText(/People is switched off for this vessel/)).toBeInTheDocument();
  });

  it('both off: the Crew rule speaks first', async () => {
    fakeDb.tables.vessel_module_settings = [crewRow({ enabled: false }), horRow({ enabled: false })];
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Hours of rest is off for DRAAK' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /switched off for DRAAK/ })).toBeNull();
  });

  it('Crew on and Hours of Rest on: the children', async () => {
    fakeDb.tables.vessel_module_settings = [crewRow(), horRow()];
    renderGate();
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('PersonalHorGate: loading, errors and a missing table', () => {
  it('loading: the loading state, and no Save', async () => {
    fakeDb.delayMs = 60_000;
    renderGate();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeNull());
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByText('Hours of rest')).toBeNull();
  });

  it('an error: the error with Try again, which reads again; no Save', async () => {
    fakeDb.failures.vessel_module_settings = { code: '57014', message: 'canceling statement due to statement timeout' };
    renderGate();
    const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 });
    expect(screen.getByRole('heading', { level: 1, name: "This vessel's modules could not load" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fakeDb.failures.vessel_module_settings = undefined;
    fakeDb.tables.vessel_module_settings = [];
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('on (no settings row): the children', async () => {
    fakeDb.tables.vessel_module_settings = [];
    renderGate();
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('on: the settings table does not exist yet (D-01)', async () => {
    fakeDb.failures.vessel_module_settings = { code: '42P01', message: 'relation "public.vessel_module_settings" does not exist' };
    renderGate();
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('MyWorkRestMonth (/me/hours-of-rest, /crew/work-rest)', () => {
  const renderPage = () => renderShell(<MyWorkRestMonth />, { path: '/me/hours-of-rest', scope: personalScope });

  beforeEach(() => {
    fakeDb.tables.crew_assignments = [
      { id: 'a-1', user_id: USER_ID, vessel_id: DRAAK.id, department: 'Deck', position: 'Master', join_date: '2026-01-01', start_date: null, leave_date: null, end_date: null, is_current: true },
    ];
  });

  it('crew_hor off on the vessel: ModuleOff, no Submit, and the month is never opened', async () => {
    fakeDb.tables.vessel_module_settings = [horRow({ enabled: false })];
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hours of Rest is switched off for DRAAK' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit|Sign|Save|Fill/ })).toBeNull();
    expect(h.monthOpened).toEqual([]);
  });

  it('Crew off on the vessel (D-X1-21): closed the same way, the month never opened', async () => {
    fakeDb.tables.vessel_module_settings = [crewRow({ enabled: false })];
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hours of rest is off for DRAAK' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit|Sign|Save|Fill/ })).toBeNull();
    expect(h.monthOpened).toEqual([]);
  });

  it('both on: the month, for the vessel of the assignment', async () => {
    fakeDb.tables.vessel_module_settings = [crewRow(), horRow()];
    renderPage();
    await waitFor(() => expect(h.monthOpened).toContain(DRAAK.id));
    expect(new Set(h.monthOpened)).toEqual(new Set([DRAAK.id]));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hours of rest' })).toBeInTheDocument();
  });
});
