/**
 * /settings/branding on a reload or deep link (D-59, D-54; D-04): while the
 * profile is still loading the page shows its frame with a loading state and
 * never denies; once the role is known, DPA and shore management get the
 * form, anyone else is told once and sent to their profile in one hop
 * (replace, no double redirect through /settings).
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';

const h = vi.hoisted(() => ({
  auth: {
    user: { id: 'user-dpa' } as { id: string } | null,
    profile: null as { role: string } | null,
    loading: false,
  },
  warning: vi.fn(),
}));

// PROFILE_GRACE_MS lives beside the scope access hook, which reaches the app client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/shared/hooks/useBranding', () => ({
  canManageBranding: (role: string | undefined) => role === 'dpa' || role === 'shore_management',
  useBranding: () => ({
    branding: null,
    isLoading: false,
    updateBranding: { mutateAsync: vi.fn(async () => undefined) },
    uploadLogo: vi.fn(async () => null),
    deleteLogo: vi.fn(async () => undefined),
  }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, warning: h.warning } };
});

import BrandingSettings, { BRANDING_DENIED_TOAST_ID } from '@/modules/settings/pages/BrandingSettings';
import { PERSONAL_HOME } from '@/config/personalNav';
import { PROFILE_GRACE_MS } from '@/app/router/useScopeAccess';

const Location: React.FC = () => {
  const location = useLocation();
  const type = useNavigationType();
  return <output data-testid="location" data-nav-type={type}>{location.pathname}</output>;
};

function renderBranding() {
  return render(
    <MemoryRouter initialEntries={['/me/profile', '/settings/branding']} initialIndex={1}>
      <Routes>
        <Route path="/settings/branding" element={<BrandingSettings />} />
        <Route path="/settings" element={<p>Settings index</p>} />
        <Route path={PERSONAL_HOME} element={<p>My profile</p>} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.auth = { user: { id: 'user-dpa' }, profile: null, loading: false };
  h.warning.mockReset();
});

describe('branding settings on a reload', () => {
  it('waits for a late profile instead of denying, then shows the form to a DPA', () => {
    const view = renderBranding();
    expect(screen.getByText('Checking your access…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Branding Settings');
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/branding');
    expect(h.warning).not.toHaveBeenCalled();

    h.auth = { ...h.auth, profile: { role: 'dpa' } };
    view.rerender(
      <MemoryRouter initialEntries={['/me/profile', '/settings/branding']} initialIndex={1}>
        <Routes>
          <Route path="/settings/branding" element={<BrandingSettings />} />
          <Route path={PERSONAL_HOME} element={<p>My profile</p>} />
        </Routes>
        <Location />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/branding');
    expect(screen.getByLabelText('Display Name (optional)')).toBeInTheDocument();
    expect(screen.queryByText('Checking your access…')).toBeNull();
    expect(h.warning).not.toHaveBeenCalled();
  });

  it('also waits while auth itself is loading', () => {
    h.auth = { user: null, profile: null, loading: true };
    renderBranding();
    expect(screen.getByText('Checking your access…')).toBeInTheDocument();
    expect(h.warning).not.toHaveBeenCalled();
  });

  it('sends a role without branding access to the profile, replacing the entry, with one toast', () => {
    h.auth = { ...h.auth, profile: { role: 'crew' } };
    renderBranding();
    expect(screen.getByTestId('location')).toHaveTextContent(PERSONAL_HOME);
    expect(screen.getByTestId('location')).toHaveAttribute('data-nav-type', 'REPLACE');
    expect(screen.getByText('My profile')).toBeInTheDocument();
    expect(screen.queryByText('Settings index')).toBeNull();
    expect(h.warning).toHaveBeenCalledTimes(1);
    expect(h.warning).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ id: BRANDING_DENIED_TOAST_ID }));
  });

  it('fails closed once the profile never arrives within the grace period', () => {
    vi.useFakeTimers();
    try {
      renderBranding();
      expect(screen.getByText('Checking your access…')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(PROFILE_GRACE_MS + 10);
      });
      expect(screen.getByTestId('location')).toHaveTextContent(PERSONAL_HOME);
      expect(h.warning).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
