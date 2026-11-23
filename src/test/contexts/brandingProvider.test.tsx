/**
 * The real BrandingProvider under the real TenantLogo (gap/10 top bar
 * element 1; D-04, D-DS4):
 *
 * - the plate's 1 px edge takes the tenant's own colour, and stays
 *   transparent when the tenant set none (never the pre-Abyss navy the PDF
 *   exports fall back to);
 * - while auth, the profile or the company row is loading the logo is a
 *   skeleton, never the STORM wordmark of a tenant that has not loaded;
 * - a profile known to have no company, or one whose read failed, settles
 *   on STORM rather than a skeleton that never clears.
 *
 * Only useAuth, useScopeAccess, next-themes and the Supabase client are fakes.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

type CompanyRow = { name: string | null; client_display_name: string | null; brand_color: string | null; client_logo_url: string | null };
type Answer = { data: CompanyRow | null; error: { message: string } | null };

const h = vi.hoisted(() => ({
  auth: {
    user: { id: 'u1' } as { id: string } | null,
    profile: { user_id: 'u1', company_id: 'c1' } as { user_id: string; company_id: string | null } | null,
    loading: false,
    profileResolved: true,
  },
  company: null as CompanyRow | null,
  companyError: null as { message: string } | null,
  /** When set, the company read waits for `release`. */
  hold: false,
  release: null as null | ((answer: Answer) => void),
  companyReads: 0,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: (): Promise<Answer | { data: { theme: string | null }; error: null }> => {
        if (table !== 'companies') return Promise.resolve({ data: { theme: null }, error: null });
        h.companyReads += 1;
        if (h.hold) return new Promise<Answer>((resolve) => (h.release = resolve));
        return Promise.resolve({ data: h.company, error: h.companyError });
      },
    };
    return chain;
  };
  return { supabase: { from } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('@/app/router/useScopeAccess', () => ({ useScopeAccess: () => ({ ready: true, homePath: '/fleet/dashboard' }) }));
vi.mock('next-themes', () => ({ useTheme: () => ({ setTheme: () => undefined }) }));

import { BrandingProvider, useBrandingContext } from '@/shared/contexts/BrandingContext';
import TenantLogo from '@/shared/components/layout/topbar/TenantLogo';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';

const LOGO = 'https://example.invalid/logo.png';

const Probe: React.FC = () => {
  const { isLoading, tenantBrandColor, brandColor } = useBrandingContext();
  return <output data-testid="branding">{JSON.stringify({ isLoading, tenantBrandColor, brandColor })}</output>;
};

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BrandingProvider>
          <TenantLogo />
          <Probe />
        </BrandingProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  /** Render again with the auth fake as it now stands (a new auth state). */
  const update = () => view.rerender(tree());
  return { ...view, update };
}

const branding = () => JSON.parse(screen.getByTestId('branding').textContent ?? '{}') as { isLoading: boolean; tenantBrandColor: string | null; brandColor: string };
const logo = () => screen.getByTestId(SHELL_TEST_IDS.tenantLogo);
const isSkeleton = () => logo().textContent === '' && logo().querySelector('img') === null && logo().querySelector('span[aria-hidden="true"]') !== null;
const plate = () => logo().querySelector('img')?.parentElement as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('storm-theme', 'dark');
  h.auth = { user: { id: 'u1' }, profile: { user_id: 'u1', company_id: 'c1' }, loading: false, profileResolved: true };
  h.company = { name: 'Fleet Co', client_display_name: 'Fleet Co', brand_color: null, client_logo_url: LOGO };
  h.companyError = null;
  h.hold = false;
  h.release = null;
  h.companyReads = 0;
});

describe('tenant logo plate edge', () => {
  it.each([
    ['null', null],
    ['an empty string', ''],
    ['not a hex colour', 'navy'],
  ])('a logo with brand_color %s gets no inline edge colour (the plate stays border-transparent)', async (_name, brandColor) => {
    h.company = { ...h.company, brand_color: brandColor };
    mount();
    await waitFor(() => expect(logo().querySelector('img')).not.toBeNull());
    expect(plate()).toHaveClass('border-transparent');
    expect(plate().style.borderColor).toBe('');
    expect(branding().tenantBrandColor).toBeNull();
    // The PDF exports keep their fallback colour.
    expect(branding().brandColor).toBe('#1e3a8a');
  });

  it("the tenant's own colour edges the plate", async () => {
    h.company = { ...h.company, brand_color: ' #C0392B ' };
    mount();
    await waitFor(() => expect(logo().querySelector('img')).not.toBeNull());
    // jsdom keeps the hex (lower-cased) where a browser reports rgb(192, 57, 43).
    expect(plate().style.borderColor).toBe('#c0392b');
    expect(branding().tenantBrandColor).toBe('#C0392B');
  });
});

describe('loading', () => {
  it('a signed-in user whose profile has not resolved: loading, a skeleton, no read', async () => {
    h.auth = { user: { id: 'u1' }, profile: null, loading: false, profileResolved: false };
    mount();
    await act(async () => {});
    expect(branding().isLoading).toBe(true);
    expect(isSkeleton()).toBe(true);
    expect(logo()).not.toHaveTextContent('STORM');
    expect(h.companyReads).toBe(0);
  });

  it('auth still loading: a skeleton', async () => {
    h.auth = { user: null, profile: null, loading: true, profileResolved: false };
    mount();
    await act(async () => {});
    expect(branding().isLoading).toBe(true);
    expect(isSkeleton()).toBe(true);
  });

  it('a resolved profile with no company: not loading, the STORM wordmark', async () => {
    h.auth = { user: { id: 'u1' }, profile: { user_id: 'u1', company_id: null }, loading: false, profileResolved: true };
    mount();
    await act(async () => {});
    expect(branding().isLoading).toBe(false);
    expect(logo()).toHaveTextContent('STORM');
    expect(h.companyReads).toBe(0);
  });

  it('a company row being fetched: a skeleton, then the tenant', async () => {
    h.hold = true;
    h.company = { ...h.company, client_logo_url: null, client_display_name: 'Demo Fleet' };
    mount();
    await waitFor(() => expect(h.companyReads).toBe(1));
    expect(branding().isLoading).toBe(true);
    expect(isSkeleton()).toBe(true);
    await act(async () => h.release?.({ data: h.company, error: null }));
    await waitFor(() => expect(logo()).toHaveTextContent('Demo Fleet'));
    expect(branding().isLoading).toBe(false);
  });

  it('a profile that resolved after its read was rejected (no profile): not loading, STORM', async () => {
    h.auth = { user: { id: 'u1' }, profile: null, loading: false, profileResolved: true };
    mount();
    await act(async () => {});
    expect(branding().isLoading).toBe(false);
    expect(logo()).toHaveTextContent('STORM');
  });

  it('a failed company read settles on STORM, not an endless skeleton', async () => {
    h.company = null;
    h.companyError = { message: 'permission denied' };
    mount();
    await waitFor(() => expect(branding().isLoading).toBe(false));
    expect(logo()).toHaveTextContent('STORM');
  });

  it('the profile resolving moves the logo from the skeleton straight to the tenant, never through STORM', async () => {
    h.auth = { user: { id: 'u1' }, profile: null, loading: false, profileResolved: false };
    h.company = { ...h.company, client_logo_url: null, client_display_name: 'Demo Fleet' };
    const seen: string[] = [];
    const { update } = mount();
    const record = () => seen.push(isSkeleton() ? 'skeleton' : logo().textContent ?? '');
    record();
    h.auth = { user: { id: 'u1' }, profile: { user_id: 'u1', company_id: 'c1' }, loading: false, profileResolved: true };
    update();
    record();
    await waitFor(() => expect(logo()).toHaveTextContent('Demo Fleet'));
    record();
    expect(seen).not.toContain('STORM');
    expect(seen[0]).toBe('skeleton');
    expect(seen[seen.length - 1]).toBe('Demo Fleet');
  });
});
