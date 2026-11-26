/**
 * Vessel › Crew › Crew Medical (src/modules/fleet/pages/VesselCrewMedicalPage.tsx;
 * gap/04 C61; X5-08): the crew medical grid for the scope's vessel.
 *
 * - no vessel in scope: "Choose a vessel";
 * - the gate is `vessel.crew.crew_medical.view` on this vessel: nothing is
 *   read while it loads, denied is AccessDenied;
 * - allowed: one read for this vessel only, the page heading names the
 *   vessel; Export needs `vessel.crew.crew_medical.export` on this vessel;
 * - not set up (D-01): "Fleet medical status is not set up yet".
 */
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string, ctx?: { vesselId?: string | null }) => Decision,
  decisions: [] as Array<{ key: string; vesselId: string | null | undefined }>,
  scope: null as unknown,
  answers: {} as Record<string, Answer>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('@/integrations/supabase/client', () => {
  state.rpc = vi.fn((fn: string) => Promise.resolve(state.answers[fn] ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } }));
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'in', 'maybeSingle']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }).then(resolve);
    return chain;
  };
  return { supabase: { rpc: state.rpc, from } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string, ctx?: { vesselId?: string | null }) => {
    state.decisions.push({ key, vesselId: ctx?.vesselId });
    return state.decide(key, ctx);
  },
  useCan: (key: string, ctx?: { vesselId?: string | null }) => {
    state.decisions.push({ key, vesselId: ctx?.vesselId });
    return state.decide(key, ctx).allowed;
  },
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/app/router/scopes', () => ({ useVesselScope: () => state.scope }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' }, profile: { company_id: 'co-1' } }) }));
vi.mock('@/shared/components/data/useMinWidth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/components/data/useMinWidth')>()),
  useMinWidth: () => true,
}));
// The vessel grid never asks for the fleet's vessels shown.
vi.mock('@/modules/fleet/hooks/useFleetVesselsShown', () => ({
  useFleetVesselsShown: () => {
    throw new Error('the vessel page must not read the vessels shown');
  },
}));

import VesselCrewMedicalPage from '@/modules/fleet/pages/VesselCrewMedicalPage';
import { FLEET_CAPS } from '@/modules/fleet/paths';

const GRANTED: Decision = { allowed: true, status: 'granted', reason: '' };
const SCOPE = { vessel: { id: 'v-dra', name: 'DRAAK' }, code: 'dra' };
const ROW = {
  profile_id: 'p-1', person_name: 'Bosun', vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', position: 'Bosun', department: 'Deck',
  is_planned: false, join_date: null, has_health_record: true, eng1_state: 'expired', eng1_expires_on: '2026-11-01', eng1_is_equivalent: false,
  vaccines_valid: 1, vaccines_expired: 0, vaccines_missing: 0, boosters_due: 0, rest_tracked: true, rest_noncompliant_30d: 0, serious_rest_breach_30d: 0,
  occ_health_state: 'ok', occ_health_due_on: null, condition_flag: false, allergy_flag: false, status: 'critical', reasons: ['eng1_expired'],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/v/dra/crew/medical']}>
        <VesselCrewMedicalPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rpcCalls = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);

afterEach(() => {
  cleanup();
  state.decide = () => GRANTED;
  state.decisions = [];
  state.scope = null;
  state.answers = {};
  state.rpc.mockClear();
});

describe('the vessel Crew Medical page', () => {
  it('asks for a vessel when there is none in scope', () => {
    renderPage();
    expect(screen.getByText('Choose a vessel')).toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('reads and shows nothing while the access check loads', async () => {
    state.scope = SCOPE;
    state.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    renderPage();
    expect(screen.getByText('Loading crew medical')).toBeInTheDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('denied is AccessDenied, decided for this vessel', () => {
    state.scope = SCOPE;
    state.decide = (key) => (key === FLEET_CAPS.crewMedicalView ? { allowed: false, status: 'denied', reason: 'no' } : GRANTED);
    renderPage();
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(state.decisions).toContainEqual({ key: FLEET_CAPS.crewMedicalView, vesselId: 'v-dra' });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('allowed: one read for this vessel, its name in the heading, export decided for this vessel', async () => {
    state.scope = SCOPE;
    state.answers = { fleet_crew_medical_status: { data: [ROW], error: null } };
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Crew Medical' })).toBeInTheDocument();
    await screen.findByRole('table');
    expect(screen.getByText('DRAAK', { selector: 'p' })).toBeInTheDocument();
    expect(rpcCalls('fleet_crew_medical_status')).toHaveLength(1);
    expect(rpcCalls('fleet_crew_medical_status')[0]).toMatchObject({ p_vessel_ids: ['v-dra'] });
    expect(state.decisions).toContainEqual({ key: FLEET_CAPS.crewMedicalExport, vesselId: 'v-dra' });
  });

  it('says it is not set up while the RPC is missing (D-01)', async () => {
    state.scope = SCOPE;
    state.answers = { fleet_crew_medical_status: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_crew_medical_status' } } };
    renderPage();
    expect(await screen.findByText('Fleet medical status is not set up yet')).toBeInTheDocument();
  });
});
