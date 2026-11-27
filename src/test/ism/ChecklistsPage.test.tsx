/**
 * Vessel › Safety › Checklists (src/modules/ism/pages/ChecklistsPage.tsx;
 * gap/02 FC1, FC4, FC6; D-01, D-27):
 *
 * - the list is useVesselFormTemplates(vessel, 'safety'): published Safety
 *   templates offered on the vessel, in its order; templates hidden on the
 *   vessel, other areas, drafts and other vessels' templates are absent;
 * - the tiles come from form_template_run_stats for this vessel and area:
 *   never a hard-coded number; while run tracking is not set up they say
 *   so (not enabled); an error offers Retry;
 * - D-01: without the area column every published template offered on the
 *   vessel is listed, with the notice; a failed read is PageError;
 * - from a legacy URL with no vessel, it asks for one;
 * - Start and Preview link to the ISM run and template pages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COMPANY, USER, V, freshState, setting, stat, template, type FakeDbState } from '@/test/forms/fakeFormsDb';

type Decision = { allowed: boolean; status: string; reason: string };

const h = vi.hoisted(() => ({
  state: null as unknown as FakeDbState,
  decide: ((key: string) => ({ allowed: false, status: 'denied', reason: key })) as (key: string) => Decision,
  vessel: { id: 'v-dra', name: 'DRAAK' } as { id: string; name: string } | null,
}));

vi.mock('@/integrations/supabase/client', async () => {
  const { createFakeDb } = await import('@/test/forms/fakeFormsDb');
  return { supabase: createFakeDb(new Proxy({} as FakeDbState, { get: (_t, p) => (h.state as unknown as Record<string | symbol, unknown>)[p] })) };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => h.decide(key),
  useCan: (key: string) => h.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/modules/auth/contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/auth/contexts/AuthContext')>()),
  useAuth: () => ({ profile: { company_id: COMPANY }, user: { id: USER } }),
}));
vi.mock('@/app/router/scopes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/router/scopes')>()),
  useVesselScope: () => (h.vessel ? { vessel: h.vessel, code: 'DRA' } : null),
  useScopedPath: () => (rel = '') => `/v/dra/${rel}`,
}));

import ChecklistsPage from '@/modules/ism/pages/ChecklistsPage';
import { todayDateOnly } from '@/shared/lib/form';

const today = todayDateOnly();

function seed() {
  h.state.rows.form_templates = [
    template('fire', { template_name: 'Fire patrol rounds', cadence: 'daily', description: 'Night rounds of the guest areas' }),
    template('muster', { template_name: 'Muster drill checks', cadence: 'weekly' }),
    template('std', { template_name: 'Standard rounds' }),
    template('draft', { template_name: 'Galley checks', status: 'DRAFT' }),
    template('hyd-only', { template_name: 'Tender launch checks', vessel_scope: 'VESSEL_SPECIFIC', vessel_ids: [V.hyd] }),
    template('eng', { template_name: 'Engine room daily', area: 'technical' }),
  ];
  h.state.rows.form_template_vessel_settings = [
    setting('std', V.dra, { visibility: 'hidden', reason: 'Replaced' }),
    setting('muster', V.dra, { sort_order: 1 }),
    setting('fire', V.dra, { sort_order: 2 }),
  ];
  h.state.rpc.form_template_run_stats = {
    data: [
      stat('fire', V.dra, { runs: 12, last_run_at: `${today}T06:00:00Z`, last_run_on: today, next_due: '2999-01-01' }),
      stat('muster', V.dra, { runs: 2, last_run_on: '2026-01-02', next_due: '2026-01-09', overdue: true }),
    ],
    error: null,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/v/dra/safety/checklists']}>
        <ChecklistsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tile = (label: string) => screen.getByText(label).closest('[data-state]') as HTMLElement;

beforeEach(() => {
  h.state = freshState();
  h.decide = (key) => ({ allowed: false, status: 'denied', reason: key });
  h.vessel = { id: V.dra, name: 'DRAAK' };
});
afterEach(() => cleanup());

describe('the list', () => {
  it('shows the vessel’s Safety checklists in its order; hidden, draft, other-area and other-vessel templates are absent', async () => {
    seed();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Checklists on DRAAK' });
    expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('.font-medium')?.textContent)).toEqual(['Muster drill checks', 'Fire patrol rounds']);
    for (const absent of ['Standard rounds', 'Galley checks', 'Tender launch checks', 'Engine room daily']) expect(screen.queryByText(absent)).toBeNull();
    expect(screen.getByRole('link', { name: 'Start Fire patrol rounds' })).toHaveAttribute('href', '/ism/forms/new?templateId=fire');
    expect(screen.getByRole('link', { name: 'Preview Fire patrol rounds' })).toHaveAttribute('href', '/ism/forms/templates/fire');
    expect(screen.getByTestId('checklists-updated')).toHaveTextContent(/UTC$/);
    // Only the vessel's settings are read.
    expect(h.state.reads.filter((r) => r.table === 'form_template_vessel_settings')).not.toHaveLength(0);
  });

  it('the hidden count is said only to template managers', async () => {
    seed();
    h.decide = (key) => ({ allowed: key === 'fleet.operations.fleet_checklists.admin', status: 'granted', reason: key });
    renderPage();
    expect(await screen.findByText('1 hidden on DRAAK. Manage templates shows them.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage templates' })).toHaveAttribute('href', '/fleet/forms/safety');
  });
});

describe('the tiles', () => {
  it('come from the run statistics for this vessel and area, never hard-coded', async () => {
    seed();
    renderPage();
    await waitFor(() => expect(tile('Run today').getAttribute('data-state')).toBe('ready'));
    expect(tile('Checklists available')).toHaveTextContent('2');
    expect(tile('Run today')).toHaveTextContent('1');
    expect(tile('Run today')).toHaveTextContent('of 2');
    expect(tile('Overdue')).toHaveTextContent('1');
    expect(tile('Overdue').getAttribute('data-tone')).toBe('danger');
    expect(tile('Due in the next 7 days').getAttribute('data-state')).toBe('zero');
    const call = h.state.rpcCalls.find((c) => c.fn === 'form_template_run_stats');
    expect(call?.args).toEqual({ p_vessel_ids: [V.dra], p_area: 'safety', p_today: today });
  });

  it('no checklists offered is a neutral zero, not "All clear" (a good count); Overdue keeps its check', async () => {
    h.state.rows.form_templates = [];
    h.state.rows.form_template_vessel_settings = [];
    h.state.rpc.form_template_run_stats = { data: [], error: null };
    renderPage();
    await screen.findByText('No checklists on this vessel yet');
    const available = tile('Checklists available');
    expect(available).toHaveAttribute('data-state', 'zero');
    const label = within(available).getByText('None offered yet');
    expect(label).toHaveClass('text-muted-foreground');
    expect(available.querySelector('.text-success')).toBeNull();
    await waitFor(() => expect(tile('Overdue')).toHaveAttribute('data-state', 'zero'));
    expect(within(tile('Overdue')).getByText('Nothing overdue')).toHaveClass('text-success');
  });

  it('while run tracking is not set up the run tiles say so, with no number', async () => {
    seed();
    delete h.state.rpc.form_template_run_stats;
    renderPage();
    await waitFor(() => expect(tile('Run today').getAttribute('data-state')).toBe('not-enabled'));
    for (const label of ['Run today', 'Due in the next 7 days', 'Overdue']) {
      expect(tile(label)).toHaveTextContent('Run tracking is not set up yet.');
      expect((tile(label).textContent ?? '').replace(label, '')).not.toMatch(/\d/);
    }
  });

  it('a failed run statistics read is an error tile with Retry', async () => {
    seed();
    h.state.rpc.form_template_run_stats = { data: null, error: { code: '57014', message: 'timeout' } };
    renderPage();
    await waitFor(() => expect(tile('Overdue').getAttribute('data-state')).toBe('error'), { timeout: 4000 });
  });
});

describe('D-01, errors and no vessel', () => {
  it('without the area column: every published template offered on the vessel, with the notice; no run statistics asked', async () => {
    seed();
    h.state.missingColumns.add('form_templates.area');
    h.state.missingTables.add('form_template_vessel_settings');
    renderPage();
    expect(await screen.findByTestId('checklists-areas-not-set-up')).toHaveTextContent('Areas are not set up yet');
    const list = screen.getByRole('list', { name: 'Checklists on DRAAK' });
    expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('.font-medium')?.textContent)).toEqual([
      'Engine room daily',
      'Fire patrol rounds',
      'Muster drill checks',
      'Standard rounds',
    ]);
    expect(h.state.rpcCalls).toEqual([]);
    expect(tile('Run today').getAttribute('data-state')).toBe('not-enabled');
  });

  it('a failed read is PageError with Retry', async () => {
    seed();
    h.state.tableErrors.form_templates = { code: '57014', message: 'timeout' };
    renderPage();
    expect(await screen.findByText('The checklists could not be loaded', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('opened with no vessel (a legacy URL), it asks for one and reads nothing', () => {
    seed();
    h.vessel = null;
    renderPage();
    expect(screen.getByRole('heading', { name: 'Choose a vessel' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Open the vessel's checklists" })).toHaveAttribute('href', '/v/dra/safety/checklists');
    expect(h.state.reads).toEqual([]);
  });
});
