/**
 * Shared fakes for the shell tests: the signed-in user, their vessels and
 * roles, and a render helper with the providers the shell reads (router,
 * React Query, nav access, scope). Each test file wires the module mocks to
 * `shellState` (vi.mock factories import this module), then shapes the state
 * per test with the helpers below.
 */
import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { assignVesselCodes, resolveVesselByCode } from '@/modules/vessels/lib/vesselCode';
import type { Vessel } from '@/modules/vessels/contexts/VesselContext';
import { NavAccessContext, type NavAccess, FAIL_CLOSED_NAV_ACCESS } from '@/app/nav/navAccess';
import { ScopeContext, LEGACY_SCOPE, type ScopeValue } from '@/app/router/scopeContext';
import { TooltipProvider } from '@/components/ui/tooltip';

export const USER_ID = 'u-officer';
export const COMPANY_ID = 'c-1';

export const vessel = (id: string, name: string, extra: Partial<Vessel> = {}): Vessel => ({
  id,
  company_id: COMPANY_ID,
  name,
  imo_number: null,
  flag_state: null,
  vessel_type: null,
  classification_society: null,
  gross_tonnage: null,
  build_year: null,
  status: 'Active',
  created_at: '2023-01-01T00:00:00Z',
  ...extra,
});

export const DRAAK = vessel('v-dra', 'DRAAK', { imo_number: '9416202', created_at: '2023-01-01T00:00:00Z', fleet_group_id: 'g-med' });
export const HYDRA = vessel('v-hyd', 'HYDRA', { imo_number: '9123456', created_at: '2023-02-01T00:00:00Z', fleet_group_id: 'g-carib' });
export const XIPHIAS = vessel('v-xip', 'XIPHIAS', { imo_number: '9555555', created_at: '2023-03-01T00:00:00Z', fleet_group_id: null });

interface PermState {
  isInitialized: boolean;
  isLoading: boolean;
  loadedFor: string | null;
  hasFleetAccess: boolean;
  userRoles: { role_name: string; vessel_id?: string | null }[];
  permissions: unknown[];
  error: string | null;
  loadPermissions: () => Promise<void>;
  hasPermission: (module: string, level?: string) => boolean;
  setCurrentVessel: (id: string | null) => void;
}

function vesselContext(vessels: Vessel[], selectedId: string | null, loading = false) {
  const codes = assignVesselCodes(vessels);
  return {
    vessels,
    companyVessels: vessels,
    vesselCodes: codes,
    loading,
    selectedVesselId: selectedId,
    selectedVessel: vessels.find((v) => v.id === selectedId) ?? null,
    isAllVessels: false,
    canAccessAllVessels: false,
    loadedForUserId: loading ? null : USER_ID,
    setSelectedVessel: () => undefined,
    setSelectedVesselById: () => undefined,
    setAllVessels: () => undefined,
    refreshVessels: async () => undefined,
    getVesselCodeById: (id: string | null | undefined) => (id ? codes.get(id) ?? null : null),
    findVesselByCode: (code: string | null | undefined) => resolveVesselByCode(code, vessels),
  };
}

export const shellState = {
  auth: {
    user: { id: USER_ID } as { id: string } | null,
    profile: {
      id: 'p1',
      user_id: USER_ID,
      company_id: COMPANY_ID,
      first_name: 'Test',
      last_name: 'Officer',
      role: 'dpa',
      job_title: 'Fleet Manager',
    } as Record<string, unknown> | null,
    loading: false,
    profileResolved: true,
    signOut: async () => undefined,
    canAccessModule: (_module: string) => true,
    practitionerDisciplines: [] as string[],
    practitionerDisciplinesLoaded: true,
  },
  vessel: vesselContext([DRAAK, HYDRA, XIPHIAS], DRAAK.id),
  perm: {
    isInitialized: true,
    isLoading: false,
    loadedFor: USER_ID,
    hasFleetAccess: true,
    userRoles: [{ role_name: 'dpa' }],
    permissions: [],
    error: null,
    loadPermissions: async () => undefined,
    hasPermission: () => true,
    setCurrentVessel: () => undefined,
  } as PermState,
  branding: {
    clientDisplayName: 'Demo Fleet' as string | null,
    clientLogoUrl: null as string | null,
    brandColor: '',
    tenantBrandColor: null as string | null,
    isLoading: false,
  },
  feedback: { panelOpen: false, setPanelOpen: (open: boolean) => void (shellState.feedback.panelOpen = open) },
  theme: { theme: 'dark' as string | undefined, setTheme: (next: string) => void (shellState.theme.theme = next) },
};

/** A fleet manager (legacy DPA, RBAC dpa) with three vessels, DRAAK selected. */
export function asFleetUser(vessels: Vessel[] = [DRAAK, HYDRA, XIPHIAS]): void {
  shellState.auth.user = { id: USER_ID };
  shellState.auth.profile = { ...shellState.auth.profile, role: 'dpa' };
  shellState.auth.loading = false;
  shellState.vessel = vesselContext(vessels, vessels[0]?.id ?? null);
  shellState.perm = { ...shellState.perm, isInitialized: true, isLoading: false, loadedFor: USER_ID, hasFleetAccess: true, userRoles: [{ role_name: 'dpa' }], error: null };
}

/**
 * A vessel-only user: legacy role master, RBAC master on one vessel, no
 * fleet-wide role, no "All vessels". The legacy module map still lets
 * `canAccessModule('fleet')` through, which is what deferred item 1 was about.
 */
export function asVesselMaster(vessels: Vessel[] = [DRAAK]): void {
  shellState.auth.user = { id: USER_ID };
  shellState.auth.profile = { ...shellState.auth.profile, role: 'master', job_title: 'Master' };
  shellState.auth.loading = false;
  shellState.auth.canAccessModule = () => true;
  shellState.vessel = vesselContext(vessels, vessels[0]?.id ?? null);
  shellState.perm = {
    ...shellState.perm,
    isInitialized: true,
    isLoading: false,
    loadedFor: USER_ID,
    hasFleetAccess: false,
    userRoles: [{ role_name: 'master', vessel_id: vessels[0]?.id ?? null }],
    error: null,
  };
}

/** Access still loading: roles not in, vessels loading. */
export function asLoading(): void {
  shellState.vessel = vesselContext([], null, true);
  shellState.perm = { ...shellState.perm, isInitialized: false, isLoading: true, loadedFor: null, hasFleetAccess: false, userRoles: [] };
}

export function resetShellState(): void {
  shellState.auth.canAccessModule = () => true;
  shellState.branding = { clientDisplayName: 'Demo Fleet', clientLogoUrl: null, brandColor: '', tenantBrandColor: null, isLoading: false };
  shellState.feedback.panelOpen = false;
  shellState.theme.theme = 'dark';
  asFleetUser();
}

export const FLEET_ACCESS: NavAccess = {
  ready: true,
  legacyRole: 'dpa',
  rbacRoles: ['dpa'],
  can: () => true,
  fleetReach: true,
  vesselReach: true,
};

export const VESSEL_ONLY_ACCESS: NavAccess = {
  ready: true,
  legacyRole: 'master',
  rbacRoles: ['master'],
  can: () => false,
  fleetReach: false,
  vesselReach: true,
};

export { FAIL_CLOSED_NAV_ACCESS };

/** Shows the current location, so a test can assert where a click went. */
export const LocationProbe: React.FC = () => {
  const location = useLocation();
  return React.createElement('output', { 'data-testid': 'location' }, `${location.pathname}${location.search}${location.hash}`);
};

export interface RenderShellOptions {
  path?: string;
  /** Route pattern for the element (default `*`), e.g. `/v/:vesselCode/*`. */
  route?: string;
  access?: NavAccess | null;
  scope?: ScopeValue;
  queryClient?: QueryClient;
}

export function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
}

/** Render `ui` inside the providers the shell reads. `access: null` uses the real (fail-closed) default. */
export function renderShell(ui: React.ReactElement, options: RenderShellOptions = {}): RenderResult & { queryClient: QueryClient } {
  const { path = '/', route = '*', access = FLEET_ACCESS, scope = LEGACY_SCOPE } = options;
  const queryClient = options.queryClient ?? testQueryClient();
  const withScope = React.createElement(ScopeContext.Provider, { value: scope }, ui, React.createElement(LocationProbe));
  const withAccess = access ? React.createElement(NavAccessContext.Provider, { value: access }, withScope) : withScope;
  const tree = React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(
      TooltipProvider,
      null,
      React.createElement(
        MemoryRouter,
        { initialEntries: [path], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
        React.createElement(Routes, null, React.createElement(Route, { path: route, element: withAccess })),
      ),
    ),
  );
  return Object.assign(render(tree), { queryClient });
}
