/**
 * The Hours of rest month gated on the vessel it writes to (PersonalHorGate,
 * D-109; gap/10 W4, D-63, D-04, D-86, D-01): /me/hours-of-rest and the legacy
 * /crew/work-rest render MyWorkRestMonth, which logs against one vessel.
 *
 * - off (or switched on from a later date): ModuleOff, nothing to edit, and
 *   the month is never opened (its read creates the draft submission);
 * - loading: the loading state, nothing to edit;
 * - an error: Try again, which reads again;
 * - on, or no settings table yet: the month.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ monthOpened: [] as string[] }));

vi.mock('@/integrations/supabase/client', async () => (await import('../shell/fakeSupabase')).fakeSupabaseModule);
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
// The month's data and panels stubbed; the hook records each vessel it opens.
vi.mock('@/modules/work-rest/hooks/useMonthlyWorkRest', () => ({
  useMonthlyWorkRest: ({ vesselId }: { vesselId: string }) => {
    h.monthOpened.push(vesselId);
    return {
      records: [], compliance: { is_compliant: true }, ruleSet: null, signatures: [], submission: null, isLocked: false,
      loading: false, saving: false, nonConformities: [], save: async () => undefined, refresh: () => undefined, setDayBlocks: () => undefined,
    };
  },
}));
vi.mock('@/modules/work-rest/components/CompliancePanel', () => ({ CompliancePanel: () => null }));
vi.mock('@/modules/work-rest/components/MonthCalendar', () => ({ MonthCalendar: () => null }));
vi.mock('@/modules/work-rest/components/NonConformityList', () => ({ NonConformityList: () => null }));
vi.mock('@/modules/work-rest/components/SignOffPanel', () => ({ SignOffPanel: () => <button type="button">Sign as crew</button> }));
vi.mock('@/modules/work-rest/components/AuditLogPanel', () => ({ AuditLogPanel: () => null }));
vi.mock('@/modules/auth/hooks/useUserRoles', () => ({ useActiveRoles: () => ({ roles: [], isLoading: false }) }));

import { PersonalHorGate } from '@/modules/work-rest/components/PersonalHorGate';
import MyWorkRestMonth from '@/modules/work-rest/pages/MyWorkRestMonth';
import { fakeDb, resetFakeDb } from '../shell/fakeSupabase';
import { DRAAK, asVesselMaster, renderShell, resetShellState } from '../shell/shellFakes';

const personalScope = { scope: 'personal' as const };

const horRow = (extra: Record<string, unknown> = {}) => ({
  vessel_id: DRAAK.id, module_key: 'crew_hor', enabled: true, enabled_from: null, label_override: null, ...extra,
});

const renderGate = () =>
  renderShell(
    <PersonalHorGate vesselId={DRAAK.id} vesselName="DRAAK">
      <h1>Hours of Work &amp; Rest</h1>
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

describe('PersonalHorGate', () => {
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

  it('loading: the loading state, and no Save', async () => {
    fakeDb.delayMs = 60_000;
    renderGate();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeNull());
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByText('Hours of Work & Rest')).toBeNull();
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

  it('crew_hor off on the selected vessel: ModuleOff, no Save, Submit or Sign, and the month is never opened', async () => {
    fakeDb.tables.vessel_module_settings = [horRow({ enabled: false })];
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hours of Rest is switched off for DRAAK' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit|Sign/ })).toBeNull();
    expect(h.monthOpened).toEqual([]);
  });

  it('crew_hor on: the month, with Save, for the selected vessel', async () => {
    fakeDb.tables.vessel_module_settings = [horRow()];
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hours of Work & Rest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    await waitFor(() => expect(h.monthOpened).toContain(DRAAK.id));
    expect(new Set(h.monthOpened)).toEqual(new Set([DRAAK.id]));
  });
});
