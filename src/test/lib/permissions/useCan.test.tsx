import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ModulePermission, UserRole } from '@/modules/auth/types';

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'u-1' } as { id: string } | null,
    profile: { id: 'p-1', role: 'crew' } as { id: string; role: string } | null,
    loading: false,
    canAccessModule: ((_id: string) => false) as (id: string) => boolean,
    practitionerDisciplines: [] as string[],
    practitionerDisciplinesLoaded: true,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => auth.value,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { Can } from '@/lib/permissions/Can';
import { resetUnknownCapabilityWarnings } from '@/lib/permissions/adaptor';
import type { CapabilityKey } from '@/lib/permissions/types';
import ModuleRoute from '@/shared/components/ModuleRoute';

const perm = (module_key: string, level: 'view' | 'edit' | 'admin'): ModulePermission => ({
  module_key,
  module_name: module_key,
  can_view: true,
  can_edit: level !== 'view',
  can_admin: level === 'admin',
  scope: 'vessel',
  restrictions: {},
});

const role = (role_name: string): UserRole => ({
  role_id: role_name,
  role_name,
  role_display_name: role_name,
  vessel_id: null,
  vessel_name: null,
  department: null,
  is_fleet_wide: false,
});

function setRbac(state: { initialized?: boolean; loading?: boolean; permissions?: ModulePermission[]; roles?: string[] }) {
  usePermissionsStore.setState({
    isInitialized: state.initialized ?? true,
    isLoading: state.loading ?? false,
    permissions: state.permissions ?? [],
    userRoles: (state.roles ?? []).map(role),
  });
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  usePermissionsStore.getState().reset();
  resetUnknownCapabilityWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  auth.value = {
    user: { id: 'u-1' },
    profile: { id: 'p-1', role: 'crew' },
    loading: false,
    canAccessModule: () => false,
    practitionerDisciplines: [],
    practitionerDisciplinesLoaded: true,
  };
});
afterEach(() => warn.mockRestore());

describe('useCan', () => {
  it('is false while RBAC loads, then true once the permission arrives', () => {
    setRbac({ initialized: false, loading: true });
    const { result, rerender } = renderHook(() => useCapability('vessel.safety.drills.edit'));
    expect(result.current).toMatchObject({ allowed: false, status: 'loading' });

    act(() => setRbac({ permissions: [perm('drills', 'edit')] }));
    rerender();
    expect(result.current).toMatchObject({ allowed: true, status: 'granted' });
  });

  it('is false while the session itself is loading', () => {
    auth.value = { ...auth.value, loading: true };
    setRbac({ roles: ['superadmin'] });
    const { result } = renderHook(() => useCan('vessel.safety.drills.view'));
    expect(result.current).toBe(false);
  });

  it('is false for an unknown key and logs it once', () => {
    setRbac({ roles: ['superadmin'] });
    const unknown = 'vessel.safety.drill.view' as CapabilityKey;
    const { result, rerender } = renderHook(() => useCan(unknown));
    rerender();
    expect(result.current).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is false when denied and true when granted', () => {
    setRbac({ permissions: [perm('drills', 'view')] });
    const { result } = renderHook(() => ({
      view: useCan('vessel.safety.drills.view'),
      remove: useCan('vessel.safety.drills.delete'),
    }));
    expect(result.current).toEqual({ view: true, remove: false });
  });

  it('is false when signed out', () => {
    auth.value = { ...auth.value, user: null, profile: null };
    setRbac({ roles: ['superadmin'] });
    const { result } = renderHook(() => useCapability('fleet.administration.notification_center.view_own'));
    expect(result.current.status).toBe('signed_out');
  });

  it('uses the caller’s profile for view_own subject checks', () => {
    setRbac({});
    const { result } = renderHook(() => ({
      own: useCan('hris.employee_records.personal_details.view_own', { subjectProfileId: 'p-1' }),
      other: useCan('hris.employee_records.personal_details.view_own', { subjectProfileId: 'p-2' }),
    }));
    expect(result.current).toEqual({ own: true, other: false });
  });
});

describe('<Can>', () => {
  it('renders children when granted', () => {
    setRbac({ permissions: [perm('ptw', 'edit')] });
    render(
      <Can capability="vessel.safety.permit_to_work.edit" fallback={<span>no</span>}>
        <button>Edit permit</button>
      </Can>,
    );
    expect(screen.getByRole('button', { name: 'Edit permit' })).toBeInTheDocument();
  });

  it('renders the fallback when denied', () => {
    setRbac({ permissions: [perm('ptw', 'view')] });
    render(
      <Can capability="vessel.safety.permit_to_work.edit" fallback={<span>Read only</span>}>
        <button>Edit permit</button>
      </Can>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeInTheDocument();
  });

  it('renders the loading slot (or nothing) while loading', () => {
    setRbac({ initialized: false, loading: true });
    const { rerender } = render(
      <Can capability="vessel.safety.permit_to_work.edit" loading={<span>Checking…</span>}>
        <button>Edit permit</button>
      </Can>,
    );
    expect(screen.getByText('Checking…')).toBeInTheDocument();
    rerender(
      <Can capability="vessel.safety.permit_to_work.edit">
        <button>Edit permit</button>
      </Can>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing for an unknown key', () => {
    setRbac({ roles: ['superadmin'] });
    render(
      <Can capability={'vessel.safety.permits.edit' as CapabilityKey}>
        <button>Edit permit</button>
      </Can>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('<ModuleRoute capability>', () => {
  const renderRoute = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

  it('shows a spinner (not the page) while access loads', () => {
    setRbac({ initialized: false, loading: true });
    const { container } = renderRoute(
      <ModuleRoute capability="vessel.safety.drills.view">
        <p>Drills page</p>
      </ModuleRoute>,
    );
    expect(screen.queryByText('Drills page')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('renders AccessDenied when the capability is denied', () => {
    setRbac({});
    renderRoute(
      <ModuleRoute capability="vessel.safety.drills.view">
        <p>Drills page</p>
      </ModuleRoute>,
    );
    expect(screen.queryByText('Drills page')).not.toBeInTheDocument();
    expect(screen.getByText('No access to this page')).toBeInTheDocument();
  });

  it('renders AccessDenied for an unknown key, even for a superadmin', () => {
    setRbac({ roles: ['superadmin'] });
    renderRoute(
      <ModuleRoute capability={'vessel.safety.drill.view' as CapabilityKey}>
        <p>Drills page</p>
      </ModuleRoute>,
    );
    expect(screen.queryByText('Drills page')).not.toBeInTheDocument();
    expect(screen.getByText('No access to this page')).toBeInTheDocument();
  });

  it('renders the page when granted', () => {
    setRbac({ permissions: [perm('drills', 'view')] });
    renderRoute(
      <ModuleRoute capability="vessel.safety.drills.view">
        <p>Drills page</p>
      </ModuleRoute>,
    );
    expect(screen.getByText('Drills page')).toBeInTheDocument();
  });

  it('keeps the existing moduleId gate working', () => {
    setRbac({});
    auth.value = { ...auth.value, canAccessModule: (id: string) => id === 'yard' };
    const { unmount } = renderRoute(
      <ModuleRoute moduleId="yard">
        <p>Yard page</p>
      </ModuleRoute>,
    );
    expect(screen.getByText('Yard page')).toBeInTheDocument();
    unmount();

    renderRoute(
      <ModuleRoute moduleId="admin">
        <p>Admin page</p>
      </ModuleRoute>,
    );
    expect(screen.queryByText('Admin page')).not.toBeInTheDocument();
    expect(screen.getByText('Restricted area')).toBeInTheDocument();
  });

  it('requires both when moduleId and capability are given', () => {
    setRbac({ permissions: [perm('drills', 'view')] });
    auth.value = { ...auth.value, canAccessModule: (id: string) => id === 'ism' };
    const { unmount } = renderRoute(
      <ModuleRoute moduleId="ism" capability="vessel.safety.drills.edit">
        <p>Edit drills</p>
      </ModuleRoute>,
    );
    expect(screen.queryByText('Edit drills')).not.toBeInTheDocument();
    unmount();

    renderRoute(
      <ModuleRoute moduleId="ism" capability="vessel.safety.drills.view">
        <p>View drills</p>
      </ModuleRoute>,
    );
    expect(screen.getByText('View drills')).toBeInTheDocument();
  });

  it('redirects signed-out users before any capability check', () => {
    auth.value = { ...auth.value, user: null, profile: null };
    setRbac({});
    render(
      <MemoryRouter initialEntries={['/v/dra/safety/drills']}>
        <Routes>
          <Route path="/auth" element={<p>Sign in</p>} />
          <Route
            path="/v/:vesselCode/safety/drills"
            element={
              <ModuleRoute capability="vessel.safety.drills.view">
                <p>Drills page</p>
              </ModuleRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.queryByText('Drills page')).not.toBeInTheDocument();
    expect(screen.queryByText('No access to this page')).not.toBeInTheDocument();
  });
});
