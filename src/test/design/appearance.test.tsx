/**
 * Appearance writes the theme through the provider and mirrors it to
 * user_preferences.theme; a new device adopts the profile theme (A2; W1).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { DENSITY_STORAGE_KEY, THEME_STORAGE_KEY } from '@/components/ui/theme-config';

type Result = { data?: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  preferences: { theme: 'dark', sidebar_collapsed: false, default_vessel_id: null, dashboard_widgets: ['alerts'] } as Record<string, unknown> | null,
  upsertError: null as { message: string } | null,
  upserts: [] as Record<string, unknown>[],
  selects: [] as string[],
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const chain = {
      select: (cols: string) => {
        state.selects.push(`${table}:${cols}`);
        return chain;
      },
      eq: () => chain,
      neq: () => chain,
      order: () => Promise.resolve<Result>({ data: [], error: null }),
      maybeSingle: () =>
        Promise.resolve<Result>({
          data: table === 'user_preferences' ? state.preferences : { name: 'Fleet Co', client_display_name: null, brand_color: null, client_logo_url: null },
          error: null,
        }),
      upsert: (row: Record<string, unknown>) => {
        state.upserts.push(row);
        return Promise.resolve<Result>({ error: state.upsertError });
      },
    };
    return chain;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: { company_id: 'company-1' } }),
}));

vi.mock('@/shared/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));

import AppearanceSection from '@/modules/settings/components/sections/AppearanceSection';
import { BrandingProvider } from '@/shared/contexts/BrandingContext';

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </ThemeProvider>,
  );
};

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().className = '';
  root().removeAttribute('data-density');
  state.preferences = { theme: 'dark', sidebar_collapsed: false, default_vessel_id: null, dashboard_widgets: ['alerts'] };
  state.upsertError = null;
  state.upserts = [];
  state.selects = [];
  state.toast.mockReset();
});

describe('AppearanceSection', () => {
  it('shows Abyss selected by default and applies Daylight at once through the provider', async () => {
    wrap(<AppearanceSection />);
    const abyss = await screen.findByRole('radio', { name: /Abyss/ });
    expect(abyss).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: /Daylight/ }));

    expect(root().classList.contains('light')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    await waitFor(() => expect(state.upserts).toHaveLength(1));
    expect(state.upserts[0]).toMatchObject({ user_id: 'user-1', theme: 'light' });
    expect(screen.getByRole('radio', { name: /Daylight/ })).toHaveAttribute('aria-checked', 'true');
    expect(state.toast).not.toHaveBeenCalled();
  });

  it('reports, rather than hides, a failed profile save', async () => {
    state.upsertError = { message: 'offline' };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    wrap(<AppearanceSection />);
    fireEvent.click(await screen.findByRole('radio', { name: /System/ }));
    await waitFor(() => expect(state.toast).toHaveBeenCalledTimes(1));
    expect(state.toast.mock.calls[0][0]).toMatchObject({ variant: 'destructive', title: 'Theme applied on this device only' });
    // The theme still applied locally.
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('saves the active theme with the other preferences', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    wrap(<AppearanceSection />);
    fireEvent.click(await screen.findByRole('button', { name: /Save Preferences/ }));
    await waitFor(() => expect(state.upserts).toHaveLength(1));
    expect(state.upserts[0]).toMatchObject({ user_id: 'user-1', theme: 'light', dashboard_widgets: ['alerts'] });
  });

  it('switches density on <html> and stores it on this device', async () => {
    wrap(<AppearanceSection />);
    fireEvent.click(await screen.findByRole('radio', { name: /Compact/ }));
    expect(root().getAttribute('data-density')).toBe('compact');
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('compact');
    expect(screen.getByRole('radio', { name: /Compact/ })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('profile theme on a new device', () => {
  it('adopts an explicit profile theme when this browser has none', async () => {
    state.preferences = { theme: 'light' };
    wrap(
      <BrandingProvider>
        <span>child</span>
      </BrandingProvider>,
    );
    await waitFor(() => expect(root().classList.contains('light')).toBe(true));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it("keeps this device's own choice and does not query", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    state.preferences = { theme: 'light' };
    wrap(
      <BrandingProvider>
        <span>child</span>
      </BrandingProvider>,
    );
    await screen.findByText('child');
    await waitFor(() => expect(state.selects.some((s) => s.startsWith('companies:'))).toBe(true));
    expect(state.selects.some((s) => s === 'user_preferences:theme')).toBe(false);
    expect(root().classList.contains('dark')).toBe(true);
  });

  it('ignores a legacy "system" row and stays on the Abyss default (D-DS1)', async () => {
    state.preferences = { theme: 'system' };
    wrap(
      <BrandingProvider>
        <span>child</span>
      </BrandingProvider>,
    );
    await waitFor(() => expect(state.selects).toContain('user_preferences:theme'));
    expect(root().classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
