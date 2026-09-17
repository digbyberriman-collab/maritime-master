/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { createSupabaseMock, type Fixtures, type SupabaseMockOptions } from './supabaseMock';
import { authState, setCurrentSupabase, supabaseProxy } from './state';

export { authState, supabaseProxy };

/**
 * Shared harness for HRIS page render tests.
 *
 * Test files must mock the two modules below (vi.mock is hoisted, so it has
 * to live in the test file), pointing at the mutable state exported here:
 *
 *   vi.mock('@/integrations/supabase/client', async () => {
 *     const s = await import('@/test/hris/state');   // no-dependency module: safe inside a mock factory
 *     return { supabase: s.supabaseProxy };
 *   });
 *   vi.mock('@/modules/auth/contexts/AuthContext', async () => {
 *     const s = await import('@/test/hris/state');
 *     return { useAuth: () => s.authState.value, AuthProvider: ({ children }: any) => children };
 *   });
 */

// jsdom lacks these; Radix primitives and cmdk expect them.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as any).ResizeObserver = RO;
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
if (typeof window !== 'undefined' && !(window as any).PointerEvent) {
  (window as any).PointerEvent = MouseEvent;
}

export type HrRole = 'admin' | 'edit' | 'view' | 'self' | 'none';

const LEGACY_ROLE: Record<HrRole, string> = {
  admin: 'dpa',
  edit: 'master',
  view: 'chief_officer',
  self: 'crew',
  none: 'crew',
};
const RBAC_ROLE: Record<HrRole, string | null> = {
  admin: 'dpa',
  edit: 'captain',
  view: 'chief_officer',
  self: 'crew',
  none: 'auditor',
};

export const DPA_USER = { id: 'u-dpa', email: 'dpa@example.com' };
export const CREW_USER = { id: 'u-crew', email: 'crew@example.com' };
export const COMPANY_ID = 'co-1';

export interface AuthValue {
  user: { id: string; email?: string } | null;
  session: unknown;
  profile: any;
  loading: boolean;
  userRole: string | null;
  signIn: () => Promise<{ error: null }>;
  signUp: () => Promise<{ error: null }>;
  signOut: () => Promise<void>;
  resetPassword: () => Promise<{ error: null }>;
  hasPermission: () => boolean;
  canAccessModule: () => boolean;
}

const makeAuth = (role: HrRole, profile: any): AuthValue => ({
  user: role === 'self' || role === 'none' ? CREW_USER : DPA_USER,
  session: null,
  profile: { ...profile, role: LEGACY_ROLE[role] },
  loading: false,
  userRole: LEGACY_ROLE[role],
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => undefined,
  resetPassword: async () => ({ error: null }),
  hasPermission: () => role !== 'none',
  canAccessModule: () => role !== 'none' && role !== 'self',
});

authState.value = makeAuth('admin', { id: 'p-dpa', user_id: DPA_USER.id, email: DPA_USER.email, first_name: 'Dana', last_name: 'Admin', company_id: COMPANY_ID });

export function setupSupabase(fixtures: Fixtures, options: SupabaseMockOptions = {}) {
  const mock = createSupabaseMock(fixtures, options);
  setCurrentSupabase(mock.supabase);
  return mock;
}

export function setupAccess(role: HrRole, ownProfile?: any) {
  const rbacRole = RBAC_ROLE[role];
  usePermissionsStore.getState().reset();
  usePermissionsStore.setState({
    isInitialized: true,
    isLoading: false,
    userRoles: rbacRole ? ([{ role_name: rbacRole, role_display_name: rbacRole, is_fleet_wide: role === 'admin' }] as any) : [],
    permissions: role === 'self' ? ([{ module_key: 'hr', module_name: 'HR', can_view: true, can_edit: false, can_admin: false, scope: 'self', restrictions: {} }] as any) : [],
  });
  const base = role === 'self' || role === 'none'
    ? { id: 'p-crew', user_id: CREW_USER.id, email: CREW_USER.email, first_name: 'Cal', last_name: 'Crew', company_id: COMPANY_ID }
    : { id: 'p-dpa', user_id: DPA_USER.id, email: DPA_USER.email, first_name: 'Dana', last_name: 'Admin', company_id: COMPANY_ID };
  authState.value = makeAuth(role, ownProfile ?? base);
}

export interface RenderPageOptions {
  /** Initial URL, e.g. '/hris/employee-records/next-of-kin-emergency?crew=p1' */
  route: string;
  /** Route pattern to mount the page on. Defaults to the pathname of `route`. */
  path?: string;
}

export function renderHrisPage(Page: React.ComponentType, options: RenderPageOptions): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const path = options.path ?? options.route.split('?')[0];
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route]}>
        <Routes>
          <Route path={path} element={<Page />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return Object.assign(result, { queryClient });
}

/** A small, coherent company: two crew on one vessel, one imported without a login. */
export function baseFixtures(): Fixtures {
  const profiles = [
    { id: 'p-dpa', user_id: DPA_USER.id, company_id: COMPANY_ID, email: DPA_USER.email, first_name: 'Dana', last_name: 'Admin', preferred_name: null, rank: 'Purser', position: 'Purser', department: 'Interior', status: 'active', account_status: 'active', avatar_url: null, nationality: 'British', is_imported: false, role: 'dpa', passport_number: 'P111', passport_expiry: '2030-01-01', medical_expiry: '2027-01-01', visa_status: null, visa_expiry: null, date_of_birth: '1985-05-05', phone: '+44 1', gender: null, contract_start_date: '2025-01-01', contract_end_date: null, probation_end_date: null, rotation: null, rotation_pattern: null, cabin: null, notes: null, employment_start_date: '2025-01-01', employment_status: 'active', last_login_at: null, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
    { id: 'p1', user_id: 'u1', company_id: COMPANY_ID, email: 'ana@example.com', first_name: 'Ana', last_name: 'Bosun', preferred_name: null, rank: 'Bosun', position: 'Bosun', department: 'Deck', status: 'active', account_status: 'active', avatar_url: null, nationality: 'Dutch', is_imported: false, role: 'crew', passport_number: 'P222', passport_expiry: '2026-10-15', medical_expiry: '2026-09-25', visa_status: 'B1/B2', visa_expiry: '2028-01-01', date_of_birth: '1990-02-02', phone: '+31 6', gender: 'female', contract_start_date: '2026-01-01', contract_end_date: '2026-12-31', probation_end_date: '2026-04-01', rotation: '2:2', rotation_pattern: '2:2', cabin: 'C4', notes: null, employment_start_date: '2024-03-01', employment_status: 'active', last_login_at: '2026-09-01T00:00:00Z', created_at: '2024-03-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
    { id: 'p2', user_id: null, company_id: COMPANY_ID, email: 'ben@example.com', first_name: 'Ben', last_name: 'Deckhand', preferred_name: 'Benny', rank: 'Deckhand', position: 'Deckhand', department: 'Deck', status: 'active', account_status: 'not_invited', avatar_url: null, nationality: 'Australian', is_imported: true, role: 'crew', passport_number: null, passport_expiry: null, medical_expiry: null, visa_status: null, visa_expiry: null, date_of_birth: null, phone: null, gender: null, contract_start_date: null, contract_end_date: null, probation_end_date: null, rotation: null, rotation_pattern: null, cabin: null, notes: null, employment_start_date: null, employment_status: null, last_login_at: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    { id: 'p-crew', user_id: CREW_USER.id, company_id: COMPANY_ID, email: CREW_USER.email, first_name: 'Cal', last_name: 'Crew', preferred_name: null, rank: 'Deckhand', position: 'Deckhand', department: 'Deck', status: 'active', account_status: 'active', avatar_url: null, nationality: 'British', is_imported: false, role: 'crew', passport_number: 'P333', passport_expiry: '2029-01-01', medical_expiry: '2027-06-01', visa_status: null, visa_expiry: null, date_of_birth: '1995-03-03', phone: '+44 2', gender: 'male', contract_start_date: '2026-02-01', contract_end_date: null, probation_end_date: null, rotation: null, rotation_pattern: null, cabin: 'C1', notes: null, employment_start_date: '2026-02-01', employment_status: 'active', last_login_at: null, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' },
  ];
  const vessels = [{ id: 'v1', name: 'M/Y Draak', company_id: COMPANY_ID }];
  const crew_assignments = [
    { id: 'a1', user_id: 'u1', vessel_id: 'v1', position: 'Bosun', rank: 'Bosun', department: 'Deck', join_date: '2024-03-01', start_date: '2024-03-01', leave_date: null, end_date: null, is_current: true, end_reason: null, notes: null, assignment_type: null, created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z', created_by: null, updated_by: null, vessels: { id: 'v1', name: 'M/Y Draak' } },
    { id: 'a0', user_id: 'u1', vessel_id: 'v1', position: 'Deckhand', rank: 'Deckhand', department: 'Deck', join_date: '2022-01-10', start_date: '2022-01-10', leave_date: '2024-02-28', end_date: '2024-02-28', is_current: false, end_reason: 'promotion', notes: 'Promoted to Bosun', assignment_type: null, created_at: '2022-01-10T00:00:00Z', updated_at: '2024-02-28T00:00:00Z', created_by: null, updated_by: null, vessels: { id: 'v1', name: 'M/Y Draak' } },
    { id: 'a2', user_id: CREW_USER.id, vessel_id: 'v1', position: 'Deckhand', rank: 'Deckhand', department: 'Deck', join_date: '2026-02-01', start_date: '2026-02-01', leave_date: null, end_date: null, is_current: true, end_reason: null, notes: null, assignment_type: null, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z', created_by: null, updated_by: null, vessels: { id: 'v1', name: 'M/Y Draak' } },
  ];
  return { profiles, vessels, crew_assignments, audit_logs: [] };
}
