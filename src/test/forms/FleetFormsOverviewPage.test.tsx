/**
 * Fleet › Forms & Checklists overview (src/modules/forms/pages/
 * FleetFormsOverviewPage.tsx; gap/02 FC1, FC5, FC6, FC7; D-01, D-04, D-88):
 *
 * - gate `fleet.operations.fleet_checklists.view`: nothing is read while it
 *   loads (skeleton), denied is AccessDenied;
 * - one card per area with shown / customised / hidden counts on the
 *   vessels in view, drafts for editors, the overdue count from the run
 *   statistics; each card links to its area page, keeping ?vessel=;
 * - Showing: the whole fleet (counted vessels) or one vessel (?vessel=);
 *   an unknown code says so;
 * - the Permits card says permit types are set up with Safety › Permits to
 *   Work, planned (FC7);
 * - D-01: without the catalogue columns only the Unsorted card, with
 *   "Areas are not set up yet"; without the settings table nothing is
 *   hidden; a failed read is PageError with Retry, never sample rows;
 * - one freshness stamp.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COMPANY, USER, V, freshState, setting, shownReady, stat, template, type FakeDbState } from './fakeFormsDb';

type Decision = { allowed: boolean; status: string; reason: string };

const h = vi.hoisted(() => ({
  state: null as unknown as FakeDbState,
  decide: ((key: string) => ({ allowed: true, status: 'granted', reason: key })) as (key: string) => Decision,
  shown: null as unknown,
}));

vi.mock('@/integrations/supabase/client', async () => {
  const { createFakeDb, freshState: fresh } = await import('@/test/forms/fakeFormsDb');
  h.state = fresh();
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
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => h.shown,
}));

import FleetFormsOverviewPage from '@/modules/forms/pages/FleetFormsOverviewPage';

const granted = (): Decision => ({ allowed: true, status: 'granted', reason: '' });

function seed() {
  h.state.rows.form_templates = [
    template('fire', { template_name: 'Fire patrol rounds' }),
    template('copy', { template_name: 'Fire rounds (own)', source_template_id: 'std', origin: 'company' }),
    template('std', { template_name: 'Standard rounds', origin: 'platform' }),
    template('draft', { template_name: 'Galley checks', status: 'DRAFT' }),
    template('hot', { template_name: 'Hot work permit', area: 'ptw', form_kind: 'permit', form_type: 'PERMIT_TO_WORK' }),
    template('eng', { template_name: 'Engine room daily', area: 'technical', vessel_scope: 'VESSEL_SPECIFIC', vessel_ids: [V.hyd] }),
  ];
  h.state.rows.form_template_vessel_settings = [setting('std', V.dra, { visibility: 'hidden', reason: 'Replaced by own copy' })];
  h.state.rpc.form_template_run_stats = { data: [stat('fire', V.gam, { overdue: true, next_due: '2026-11-20' })], error: null };
}

function renderPage(path = '/fleet/forms') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/fleet/forms" element={<FleetFormsOverviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const card = (label: RegExp) => screen.getByRole('link', { name: label });
/** The number beside a count's label on a card ("3 shown"). */
const countOf = (el: HTMLElement, label: string) => within(el).getByText(label).previousElementSibling?.textContent ?? null;

beforeEach(() => {
  h.state = freshState();
  h.decide = granted;
  h.shown = shownReady();
});
afterEach(() => cleanup());

describe('gate', () => {
  it('reads nothing while the capability loads (deny while loading)', () => {
    h.decide = () => ({ allowed: false, status: 'loading', reason: 'loading' });
    seed();
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Forms & Checklists' })).toBeNull();
    expect(h.state.reads).toEqual([]);
    expect(h.state.rpcCalls).toEqual([]);
  });

  it('a reader without fleet_checklists.view gets AccessDenied and nothing is read', () => {
    h.decide = (key) => (key === 'fleet.operations.fleet_checklists.view' ? { allowed: false, status: 'denied', reason: 'no' } : granted());
    seed();
    renderPage();
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(h.state.reads).toEqual([]);
  });
});

describe('the area cards', () => {
  it('counts shown, customised and hidden on the whole fleet, with drafts and overdue', async () => {
    seed();
    renderPage();
    // fire, copy, std offered fleet-wide; std hidden on DRAAK only, so still shown on the others.
    await waitFor(() => expect(countOf(card(/^Safety:/), 'hidden')).toBe('1'));
    const safety = card(/^Safety:/);
    expect(countOf(safety, 'shown')).toBe('3');
    expect(countOf(safety, 'customised')).toBe('1');
    expect(countOf(safety, 'hidden')).toBe('1');
    expect(countOf(safety, 'draft')).toBe('1');
    expect(within(safety).getByText('1 template overdue')).toBeInTheDocument();
    expect(within(safety).getByText('Crew find these in Safety › Checklists.')).toBeInTheDocument();
    expect(safety).toHaveAttribute('href', '/fleet/forms/safety');
    expect(card(/^Technical:/)).toHaveAttribute('href', '/fleet/forms/technical');
    expect(card(/^Technical forms:/)).toHaveAttribute('href', '/fleet/forms/technical-forms');
    expect(screen.queryByRole('link', { name: /^Unsorted:/ })).toBeNull();
    expect(screen.getByTestId('forms-updated')).toHaveTextContent(/^Updated \d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC$/);
    // The run statistics are asked for every area once, for every counted vessel (NULL).
    expect(h.state.rpcCalls.filter((c) => c.fn === 'form_template_run_stats').map((c) => [c.args.p_vessel_ids, c.args.p_area])).toEqual([[null, null]]);
  });

  it('one vessel (?vessel=DRA): a template hidden there is not shown, the links keep the vessel', async () => {
    seed();
    renderPage('/fleet/forms?vessel=dra');
    await waitFor(() => expect(countOf(card(/^Safety:/), 'shown')).toBe('2'));
    const safety = card(/^Safety:/);
    expect(safety).toHaveAttribute('href', '/fleet/forms/safety?vessel=DRA');
    // HYDRA's own engine room template is not on DRAAK.
    expect(within(card(/^Technical:/)).getByText('No templates yet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /on DRAAK/ })).toBeInTheDocument();
    await waitFor(() => expect(h.state.rpcCalls.some((c) => c.fn === 'form_template_run_stats' && JSON.stringify(c.args.p_vessel_ids) === JSON.stringify([V.dra]))).toBe(true));
  });

  it('an unknown vessel code says so and shows the whole fleet', async () => {
    seed();
    renderPage('/fleet/forms?vessel=zzz');
    expect(await screen.findByTestId('forms-unknown-vessel')).toHaveTextContent('No vessel with the code ZZZ is in your fleet');
    expect(screen.getByRole('heading', { name: /on the whole fleet/ })).toBeInTheDocument();
  });

  it('FC7: the Permits card says permit types are set up with Safety › Permits to Work, planned', async () => {
    seed();
    renderPage();
    const permits = await waitFor(() => card(/^Permits:/));
    expect(within(permits).getByText('Planned')).toBeInTheDocument();
    expect(within(permits).getByText(/Permit types and their checklists are set up with Safety › Permits to Work/)).toBeInTheDocument();
  });

  it('drafts are counted only for editors; New template only for creators', async () => {
    seed();
    h.decide = (key) => (key.endsWith('.edit') || key.endsWith('.create') ? { allowed: false, status: 'denied', reason: '' } : granted());
    renderPage();
    const safety = await waitFor(() => card(/^Safety:/));
    expect(within(safety).queryByText('draft')).toBeNull();
    expect(screen.queryByRole('link', { name: 'New template' })).toBeNull();
  });

  it('a template with no area makes an Unsorted card', async () => {
    seed();
    h.state.rows.form_templates.push(template('loose', { area: null }));
    renderPage();
    expect(await waitFor(() => card(/^Unsorted:/))).toHaveAttribute('href', '/fleet/forms/unsorted');
  });
});

describe('D-01 and errors', () => {
  it('without the catalogue columns only the Unsorted card, with "Areas are not set up yet"; no settings or runs read', async () => {
    seed();
    h.state.missingColumns.add('form_templates.area');
    renderPage();
    expect(await screen.findByTestId('forms-areas-not-set-up')).toHaveTextContent('Areas are not set up yet');
    const unsorted = card(/^Unsorted:/);
    expect(countOf(unsorted, 'shown')).toBe('5');
    expect(screen.queryByRole('link', { name: /^Safety:/ })).toBeNull();
    expect(h.state.reads.some((r) => r.table === 'form_template_vessel_settings')).toBe(false);
    expect(h.state.rpcCalls).toEqual([]);
  });

  it('without the settings table nothing is hidden; without the run statistics no overdue count', async () => {
    seed();
    h.state.missingTables.add('form_template_vessel_settings');
    delete h.state.rpc.form_template_run_stats;
    renderPage();
    const safety = await waitFor(() => card(/^Safety:/));
    await waitFor(() => expect(countOf(safety, 'hidden')).toBe('0'));
    expect(within(safety).queryByText(/overdue/)).toBeNull();
  });

  it('a failed catalogue read is an error with Retry, never sample rows', async () => {
    seed();
    h.state.tableErrors.form_templates = { code: '57014', message: 'canceling statement due to statement timeout' };
    renderPage();
    // One retry (the hooks retry a failed read once), then the error.
    expect(await screen.findByText('The templates could not be loaded', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Safety:/ })).toBeNull();
  });

  it('no templates at all: the first-use state with New template', async () => {
    h.state.rows.form_templates = [];
    renderPage();
    expect(await screen.findByText('No forms or checklists yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New template' }).length).toBeGreaterThan(0);
  });
});
