import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PermissionGate, ProtectedRoute, RequireRole, useCanAccess } from '@/modules/auth/components/PermissionGate';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';

// Mock supabase (needed by permissionsStore)
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PermissionGate', () => {
  beforeEach(() => {
    usePermissionsStore.getState().reset();
  });

  describe('loading state', () => {
    it('should show loading spinner when not initialized', () => {
      usePermissionsStore.setState({ isInitialized: false, isLoading: true });

      renderWithRouter(
        <PermissionGate moduleKey="crew">
          <div>Protected Content</div>
        </PermissionGate>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('with permissions loaded', () => {
    it('should render children when user has permission', () => {
      usePermissionsStore.setState({
        isInitialized: true,
        isLoading: false,
        permissions: [
          { module_key: 'crew', can_view: true, can_edit: false, can_admin: false } as any,
        ],
      });

      renderWithRouter(
        <PermissionGate moduleKey="crew">
          <div>Protected Content</div>
        </PermissionGate>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('should not render children when user lacks permission', () => {
      usePermissionsStore.setState({
        isInitialized: true,
        isLoading: false,
        permissions: [],
      });

      renderWithRouter(
        <PermissionGate moduleKey="crew">
          <div>Protected Content</div>
        </PermissionGate>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should render fallback when user lacks permission', () => {
      usePermissionsStore.setState({
        isInitialized: true,
        isLoading: false,
        permissions: [],
      });

      renderWithRouter(
        <PermissionGate moduleKey="crew" fallback={<div>Access Denied</div>}>
          <div>Protected Content</div>
        </PermissionGate>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    it('should check edit permission when specified', () => {
      usePermissionsStore.setState({
        isInitialized: true,
        isLoading: false,
        permissions: [
          { module_key: 'crew', can_view: true, can_edit: false, can_admin: false } as any,
        ],
      });

      renderWithRouter(
        <PermissionGate moduleKey="crew" permission="edit">
          <div>Edit Content</div>
        </PermissionGate>
      );

      expect(screen.queryByText('Edit Content')).not.toBeInTheDocument();
    });
  });
});

describe('RequireRole', () => {
  beforeEach(() => {
    usePermissionsStore.getState().reset();
  });

  it('should show loading when not initialized', () => {
    usePermissionsStore.setState({ isInitialized: false, isLoading: true });

    renderWithRouter(
      <RequireRole roles={['dpa']}>
        <div>DPA Content</div>
      </RequireRole>
    );

    expect(screen.queryByText('DPA Content')).not.toBeInTheDocument();
  });

  it('should render children when user has required role', () => {
    usePermissionsStore.setState({
      isInitialized: true,
      isLoading: false,
      userRoles: [{ role_name: 'dpa' } as any],
    });

    renderWithRouter(
      <RequireRole roles={['dpa']}>
        <div>DPA Content</div>
      </RequireRole>
    );

    expect(screen.getByText('DPA Content')).toBeInTheDocument();
  });

  it('should not render children when user lacks required role', () => {
    usePermissionsStore.setState({
      isInitialized: true,
      isLoading: false,
      userRoles: [{ role_name: 'crew' } as any],
    });

    renderWithRouter(
      <RequireRole roles={['dpa']}>
        <div>DPA Content</div>
      </RequireRole>
    );

    expect(screen.queryByText('DPA Content')).not.toBeInTheDocument();
  });

  it('should render fallback when user lacks required role', () => {
    usePermissionsStore.setState({
      isInitialized: true,
      isLoading: false,
      userRoles: [{ role_name: 'crew' } as any],
    });

    renderWithRouter(
      <RequireRole roles={['dpa']} fallback={<div>Not DPA</div>}>
        <div>DPA Content</div>
      </RequireRole>
    );

    expect(screen.getByText('Not DPA')).toBeInTheDocument();
  });

  it('should match any of the specified roles', () => {
    usePermissionsStore.setState({
      isInitialized: true,
      isLoading: false,
      userRoles: [{ role_name: 'captain' } as any],
    });

    renderWithRouter(
      <RequireRole roles={['dpa', 'captain']}>
        <div>Authorized Content</div>
      </RequireRole>
    );

    expect(screen.getByText('Authorized Content')).toBeInTheDocument();
  });
});

describe('useCanAccess', () => {
  function TestComponent({ moduleKey, permission }: { moduleKey: string; permission?: any }) {
    const canAccess = useCanAccess(moduleKey, permission);
    return <div>{canAccess ? 'Authorized' : 'Denied'}</div>;
  }

  beforeEach(() => {
    usePermissionsStore.getState().reset();
  });

  it('should return false when not initialized', () => {
    usePermissionsStore.setState({ isInitialized: false });

    renderWithRouter(<TestComponent moduleKey="crew" />);

    expect(screen.getByText('Denied')).toBeInTheDocument();
  });

  it('should return true when user has permission', () => {
    usePermissionsStore.setState({
      isInitialized: true,
      isLoading: false,
      permissions: [
        { module_key: 'crew', can_view: true, can_edit: false, can_admin: false } as any,
      ],
    });

    renderWithRouter(<TestComponent moduleKey="crew" />);

    expect(screen.getByText('Authorized')).toBeInTheDocument();
  });

  it('should return false when user lacks permission', () => {
    usePermissionsStore.setState({
      isInitialized: true,
      isLoading: false,
      permissions: [],
    });

    renderWithRouter(<TestComponent moduleKey="crew" />);

    expect(screen.getByText('Denied')).toBeInTheDocument();
  });
});
