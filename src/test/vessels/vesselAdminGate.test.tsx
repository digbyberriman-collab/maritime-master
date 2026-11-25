/**
 * The vessel write controls follow `fleet.operations.vessels.admin`
 * (DECISIONS D-124, D-224; D-01, D-04). Add Vessel, each row's Edit and
 * Delete on /fleet/admin/vessels, and Edit Profile and Edit/Add Particulars
 * on the vessel profile card show only when `has_capability` answers true,
 * or, while the function is not in the database yet (D-01), for a signed-in
 * member of that company (the legacy ALL policy still governs). Hidden while
 * the answer loads and on any other error (fail closed). The route itself
 * stays on fleet reach (D-33, D-49): only the buttons are gated.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';

type RpcAnswer =
  | { kind: 'value'; data: unknown }
  | { kind: 'error'; error: { code?: string; message: string } }
  | { kind: 'pending' };

const state = vi.hoisted(() => ({
  rpc: { kind: 'value', data: true } as RpcAnswer,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  auth: {
    user: { id: 'u-1' } as { id: string } | null,
    profile: { company_id: 'co-1' } as { company_id: string } | null,
    loading: false,
    profileResolved: true,
  },
  vessels: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      const answer = state.rpc;
      if (answer.kind === 'pending') return new Promise(() => {});
      if (answer.kind === 'error') return Promise.resolve({ data: null, error: answer.error });
      return Promise.resolve({ data: answer.data, error: null });
    },
  },
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/modules/vessels/hooks/useVessels', () => {
  const mutation = { mutate: () => {}, mutateAsync: async () => {}, isPending: false };
  return {
    useVessels: () => ({
      vessels: state.vessels,
      isLoading: false,
      error: null,
      createVessel: mutation,
      updateVessel: mutation,
      deleteVessel: mutation,
      updateVesselParticulars: mutation,
    }),
  };
});

import Vessels from '@/modules/vessels/pages/Vessels';
import VesselProfileCard from '@/modules/vessels/components/VesselProfileCard';
import { VESSELS_ADMIN_CAPABILITY, useVesselAdminGate } from '@/modules/vessels/hooks/useVesselAdminGate';

const ALPHA = {
  id: 'v1',
  company_id: 'co-1',
  name: 'Alpha',
  imo_number: '1234567',
  flag_state: 'Malta',
  vessel_type: null,
  classification_society: null,
  gross_tonnage: null,
  build_year: null,
  status: 'Active',
  created_at: '',
  updated_at: '',
  particulars: null,
};

const MISSING_FUNCTION_PGRST202 = {
  code: 'PGRST202',
  message: 'Could not find the function public.has_capability(p_company_id, p_key) in the schema cache',
};
const MISSING_FUNCTION_42883 = { code: '42883', message: 'function public.has_capability(text, uuid) does not exist' };
const OTHER_ERROR = { code: '57014', message: 'canceling statement due to statement timeout' };

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Search: React.FC = () => <div data-testid="search">{useLocation().search}</div>;

const renderPage = (initialEntry = '/fleet/admin/vessels') =>
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Vessels />
        <Search />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const renderCard = () =>
  render(
    <QueryClientProvider client={client()}>
      <VesselProfileCard vesselId="v1" />
    </QueryClientProvider>,
  );

const pageControls = () => ({
  add: screen.queryByRole('button', { name: /Add Vessel/ }),
  edit: screen.queryByRole('button', { name: 'Edit Alpha' }),
  remove: screen.queryByRole('button', { name: 'Delete Alpha' }),
});

const cardControls = () => ({
  profile: screen.queryByRole('button', { name: /Edit Profile/ }),
  particulars: screen.queryByRole('button', { name: /(Edit|Add) Particulars/ }),
});

/** Let React Query settle after the RPC answered (or retried once and failed). */
const settle = async (calls = 1) => {
  await waitFor(() => expect(state.rpcCalls.length).toBeGreaterThanOrEqual(calls), { timeout: 4000 });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
};

beforeEach(() => {
  state.rpc = { kind: 'value', data: true };
  state.rpcCalls.length = 0;
  state.auth = { user: { id: 'u-1' }, profile: { company_id: 'co-1' }, loading: false, profileResolved: true };
  state.vessels = [ALPHA];
});

describe('useVesselAdminGate', () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client()}>{children}</QueryClientProvider>
  );

  it('asks has_capability for the company, and for the vessel when one is given', async () => {
    const company = renderHook(() => useVesselAdminGate({ companyId: 'co-1' }), { wrapper });
    await waitFor(() => expect(company.result.current).toEqual({ allowed: true, loading: false }));
    const vessel = renderHook(() => useVesselAdminGate({ companyId: 'co-1', vesselId: 'v1' }), { wrapper });
    await waitFor(() => expect(vessel.result.current).toEqual({ allowed: true, loading: false }));
    expect(state.rpcCalls).toEqual([
      { fn: 'has_capability', args: { p_key: VESSELS_ADMIN_CAPABILITY, p_company_id: 'co-1' } },
      { fn: 'has_capability', args: { p_key: VESSELS_ADMIN_CAPABILITY, p_company_id: 'co-1', p_vessel_id: 'v1' } },
    ]);
    expect(VESSELS_ADMIN_CAPABILITY).toBe('fleet.operations.vessels.admin');
  });

  it('is denied for false and for anything that is not true', async () => {
    state.rpc = { kind: 'value', data: false };
    const denied = renderHook(() => useVesselAdminGate({ companyId: 'co-1' }), { wrapper });
    await waitFor(() => expect(denied.result.current).toEqual({ allowed: false, loading: false }));
    state.rpc = { kind: 'value', data: null };
    const nullish = renderHook(() => useVesselAdminGate({ companyId: 'co-1', vesselId: 'v2' }), { wrapper });
    await waitFor(() => expect(nullish.result.current).toEqual({ allowed: false, loading: false }));
  });

  it.each([
    ['PGRST202', MISSING_FUNCTION_PGRST202],
    ['42883', MISSING_FUNCTION_42883],
  ])('keeps the legacy rule while the function is missing (%s, D-01)', async (_label, error) => {
    state.rpc = { kind: 'error', error };
    const member = renderHook(() => useVesselAdminGate({ companyId: 'co-1' }), { wrapper });
    await waitFor(() => expect(member.result.current).toEqual({ allowed: true, loading: false }));
    // Another company's vessel: the legacy policy refuses it too.
    const other = renderHook(() => useVesselAdminGate({ companyId: 'co-2', vesselId: 'v9' }), { wrapper });
    await waitFor(() => expect(other.result.current).toEqual({ allowed: false, loading: false }));
  });

  it('fails closed on any other error, after its one retry', async () => {
    state.rpc = { kind: 'error', error: OTHER_ERROR };
    const { result } = renderHook(() => useVesselAdminGate({ companyId: 'co-1' }), { wrapper });
    expect(result.current).toEqual({ allowed: false, loading: true });
    await waitFor(() => expect(result.current).toEqual({ allowed: false, loading: false }), { timeout: 4000 });
    expect(state.rpcCalls).toHaveLength(2);
  });

  it('is denied and loading while the answer is in flight', async () => {
    state.rpc = { kind: 'pending' };
    const { result } = renderHook(() => useVesselAdminGate({ companyId: 'co-1' }), { wrapper });
    await waitFor(() => expect(state.rpcCalls).toHaveLength(1));
    expect(result.current).toEqual({ allowed: false, loading: true });
  });

  it('asks nothing without a signed-in user or a company', async () => {
    state.auth = { ...state.auth, user: null };
    const signedOut = renderHook(() => useVesselAdminGate({ companyId: 'co-1' }), { wrapper });
    expect(signedOut.result.current).toEqual({ allowed: false, loading: false });
    state.auth = { user: { id: 'u-1' }, profile: null, loading: false, profileResolved: true };
    const noCompany = renderHook(() => useVesselAdminGate({ companyId: undefined }), { wrapper });
    expect(noCompany.result.current).toEqual({ allowed: false, loading: false });
    state.auth = { user: { id: 'u-1' }, profile: null, loading: false, profileResolved: false };
    const profilePending = renderHook(() => useVesselAdminGate({ companyId: undefined }), { wrapper });
    expect(profilePending.result.current).toEqual({ allowed: false, loading: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe('/fleet/admin/vessels: Add, Edit and Delete', () => {
  it('shows them when has_capability is true', async () => {
    renderPage();
    await waitFor(() => expect(pageControls().add).toBeInTheDocument());
    expect(pageControls().edit).toBeInTheDocument();
    expect(pageControls().remove).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(state.rpcCalls).toEqual([{ fn: 'has_capability', args: { p_key: VESSELS_ADMIN_CAPABILITY, p_company_id: 'co-1' } }]);
  });

  it('hides them when has_capability is false, and the list still renders', async () => {
    state.rpc = { kind: 'value', data: false };
    renderPage();
    await settle();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(pageControls()).toEqual({ add: null, edit: null, remove: null });
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it.each([
    ['PGRST202', MISSING_FUNCTION_PGRST202],
    ['42883', MISSING_FUNCTION_42883],
  ])('shows them while the function is missing (%s, D-01)', async (_label, error) => {
    state.rpc = { kind: 'error', error };
    renderPage();
    await waitFor(() => expect(pageControls().add).toBeInTheDocument());
    expect(pageControls().edit).toBeInTheDocument();
    expect(pageControls().remove).toBeInTheDocument();
  });

  it('hides them on any other error', async () => {
    state.rpc = { kind: 'error', error: OTHER_ERROR };
    renderPage();
    await settle(2);
    expect(pageControls()).toEqual({ add: null, edit: null, remove: null });
  });

  it('hides them while the answer loads', async () => {
    state.rpc = { kind: 'pending' };
    renderPage();
    await settle();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(pageControls()).toEqual({ add: null, edit: null, remove: null });
  });

  it('opens the add form for ?new=true only with the capability', async () => {
    renderPage('/fleet/admin/vessels?new=true');
    expect(await screen.findByRole('dialog')).toHaveTextContent('Add Vessel');
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/));
  });

  it('drops ?new=true without opening anything when denied', async () => {
    state.rpc = { kind: 'value', data: false };
    renderPage('/fleet/admin/vessels?new=true');
    await settle();
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the empty-state copy honest without the capability', async () => {
    state.vessels = [];
    state.rpc = { kind: 'value', data: false };
    renderPage();
    await settle();
    expect(screen.getByText('No vessels added yet')).toBeInTheDocument();
    expect(screen.queryByText(/Click "Add Vessel"/)).not.toBeInTheDocument();
  });
});

describe('VesselProfileCard: Edit Profile and Particulars', () => {
  it('shows them when has_capability is true for the vessel', async () => {
    renderCard();
    await waitFor(() => expect(cardControls().profile).toBeInTheDocument());
    expect(cardControls().particulars).toHaveTextContent('Add Particulars');
    expect(state.rpcCalls).toEqual([
      { fn: 'has_capability', args: { p_key: VESSELS_ADMIN_CAPABILITY, p_company_id: 'co-1', p_vessel_id: 'v1' } },
    ]);
  });

  it('labels the particulars button Edit when particulars exist', async () => {
    state.vessels = [{ ...ALPHA, particulars: { loa: '50 m' } }];
    renderCard();
    await waitFor(() => expect(cardControls().particulars).toHaveTextContent('Edit Particulars'));
  });

  it('hides them when has_capability is false', async () => {
    state.rpc = { kind: 'value', data: false };
    renderCard();
    await settle();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(cardControls()).toEqual({ profile: null, particulars: null });
    expect(screen.getByText('No particulars recorded yet.')).toBeInTheDocument();
  });

  it.each([
    ['PGRST202', MISSING_FUNCTION_PGRST202],
    ['42883', MISSING_FUNCTION_42883],
  ])('shows them while the function is missing (%s, D-01)', async (_label, error) => {
    state.rpc = { kind: 'error', error };
    renderCard();
    await waitFor(() => expect(cardControls().profile).toBeInTheDocument());
    expect(cardControls().particulars).toBeInTheDocument();
  });

  it('hides them while the function is missing for a vessel of another company', async () => {
    state.rpc = { kind: 'error', error: MISSING_FUNCTION_PGRST202 };
    state.vessels = [{ ...ALPHA, company_id: 'co-2' }];
    renderCard();
    await settle();
    expect(cardControls()).toEqual({ profile: null, particulars: null });
  });

  it('hides them on any other error', async () => {
    state.rpc = { kind: 'error', error: OTHER_ERROR };
    renderCard();
    await settle(2);
    expect(cardControls()).toEqual({ profile: null, particulars: null });
  });

  it('hides them while the answer loads', async () => {
    state.rpc = { kind: 'pending' };
    renderCard();
    await settle();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(cardControls()).toEqual({ profile: null, particulars: null });
  });
});
