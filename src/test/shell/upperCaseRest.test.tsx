/**
 * An upper-case path after the vessel prefix (`/v/dra/CREW/list`) is the page
 * the router renders (React Router matches case-insensitively; D-111 keeps
 * the rest as written), so the shell judges it the same way: the vessel
 * sidebar shows the Crew tab's leaves with Crew List current, the crumbs read
 * DRAAK › Crew › Crew List and the document title is the page's, exactly as
 * for `/v/dra/crew/list`. The tab row and the route gate are covered in
 * moduleTabBar.test.tsx and moduleOff.test.tsx.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useVessel: () => shellState.vessel };
});
vi.mock('@/modules/auth/store/permissionsStore', async () => {
  const { shellState } = await import('./shellFakes');
  return { usePermissionsStore: (selector: (s: object) => unknown) => selector(shellState.perm) };
});
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({ useSidebarBadgeCounts: () => ({ data: undefined }) }));

import PageLocationHeader from '@/shared/components/layout/PageLocationHeader';
import { PageLocationOverrideProvider } from '@/shared/components/layout/PageLocationOverrideProvider';
import ShellSidebar from '@/shared/components/layout/ShellSidebar';
import { useShellSidebar } from '@/shared/components/layout/useShellSidebar';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import type { ScopeValue } from '@/app/router/scopeContext';
import { resetFakeDb } from './fakeSupabase';
import { DRAAK, renderShell, resetShellState } from './shellFakes';

const VESSEL: ScopeValue = { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' };

/** The vessel sidebar beside the shell's main with its header, as AppShell renders them. */
const Shell: React.FC = () => {
  const model = useShellSidebar('vessel');
  return (
    <>
      {model.available ? <ShellSidebar model={model} collapsed={false} /> : <p>No sidebar</p>}
      <main data-testid={SHELL_TEST_IDS.main}>
        <PageLocationOverrideProvider>
          <PageLocationHeader />
        </PageLocationOverrideProvider>
      </main>
    </>
  );
};

/** The breadcrumb's items, as text, and the current one. */
const trail = () => {
  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  const items = within(crumbs)
    .getAllByRole('listitem')
    .filter((li) => !li.classList.contains('sm:hidden'))
    .map((li) => li.textContent ?? '');
  const current = crumbs.querySelector('[aria-current="page"]')?.textContent ?? null;
  return { items, current };
};

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
});
afterEach(() => {
  document.title = '';
});

describe('an upper-case vessel rest (D-111)', () => {
  it.each(['/v/dra/crew/list', '/v/dra/CREW/list', '/v/dra/Crew/List'])(
    '%s draws the Crew sidebar with Crew List current, the Crew crumbs and the page title',
    async (path) => {
      renderShell(<Shell />, { path, scope: VESSEL });
      const nav = await screen.findByRole('navigation', { name: 'Crew folders' });
      const current = await within(nav).findByRole('link', { name: /^Crew List, current page/ });
      expect(current).toHaveAttribute('aria-current', 'page');
      expect(current).toHaveAttribute('href', '/v/dra/crew/list');
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      await waitFor(() => expect(trail()).toEqual({ items: ['DRAAK', 'Crew', 'Crew List'], current: 'Crew List' }));
      expect(screen.getByTestId(SHELL_TEST_IDS.fallbackHeading)).toHaveTextContent('Crew List');
      await waitFor(() => expect(document.title).toBe('Crew List | STORM'));
      expect(screen.getByTestId('location').textContent).toBe(path);
    },
  );

  it('a detail segment keeps its own case in the last crumb', async () => {
    renderShell(<Shell />, { path: '/v/dra/CREW/list/AbC-Def', scope: VESSEL });
    await waitFor(() => expect(trail().items).toEqual(['DRAAK', 'Crew', 'Crew List', 'AbC Def']));
  });
});
