/**
 * Fleet › Forms & Checklists › one area (src/modules/forms/pages/
 * FleetFormsAreaPage.tsx; gap/02 FC2, FC4, FC5, FC6; D-01, D-04):
 *
 * - gate `fleet.operations.fleet_checklists.view`: nothing is read while it
 *   loads; denied is AccessDenied; a slug that is not an area (the stored
 *   spelling `technical_forms` included) is the in-scope "Area not found";
 * - "Crew find these in …", "n of m shown", the Available / Hidden / Drafts
 *   tabs; a row's origin, "On k of n vessels", cadence, last run and where
 *   it is overdue;
 * - order on one vessel: Change order, keyboard moves (announced), one
 *   form_template_reorder with the whole list (hidden ones included);
 *   with the whole fleet in view it asks for a vessel;
 * - Customise copies through the definer and opens the copy's draft;
 *   Show again restores a hidden template on the vessel;
 * - Drafts: ready or not ready to publish (the server's checks);
 * - D-01: without the catalogue columns no hide or order controls, the
 *   notice says why; a failed read is an error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COMPANY, USER, V, freshState, setting, shownReady, stat, template, type FakeDbState } from './fakeFormsDb';

type Decision = { allowed: boolean; status: string; reason: string };

const h = vi.hoisted(() => ({
  state: null as unknown as FakeDbState,
  decide: ((key: string) => ({ allowed: true, status: 'granted', reason: key })) as (key: string, ctx?: { vesselId?: string | null }) => Decision,
  shown: null as unknown,
}));

vi.mock('@/integrations/supabase/client', async () => {
  const { createFakeDb } = await import('@/test/forms/fakeFormsDb');
  return { supabase: createFakeDb(new Proxy({} as FakeDbState, { get: (_t, p) => (h.state as unknown as Record<string | symbol, unknown>)[p] })) };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string, ctx?: { vesselId?: string | null }) => h.decide(key, ctx),
  useCan: (key: string, ctx?: { vesselId?: string | null }) => h.decide(key, ctx).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/lib/permissions/adaptor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/permissions/adaptor')>()),
  resolveCapability: (key: string, _snapshot: unknown, ctx?: { vesselId?: string | null }) => h.decide(key, ctx),
}));
vi.mock('@/modules/auth/contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/auth/contexts/AuthContext')>()),
  useAuth: () => ({ profile: { company_id: COMPANY }, user: { id: USER } }),
}));
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => h.shown,
}));

import FleetFormsAreaPage from '@/modules/forms/pages/FleetFormsAreaPage';

const granted = (): Decision => ({ allowed: true, status: 'granted', reason: '' });

function seed() {
  h.state.rows.form_templates = [
    template('fire', { template_name: 'Fire patrol rounds', cadence: 'daily', version: 2, version_label: 'SMS-CL-014 Rev 2' }),
    template('muster', { template_name: 'Muster drill checks', cadence: 'weekly' }),
    template('std', { template_name: 'Standard rounds', origin: 'platform', cadence: 'monthly' }),
    template('copy', { template_name: 'Rounds, own copy', source_template_id: 'std', vessel_scope: 'VESSEL_SPECIFIC', vessel_ids: [V.dra, V.hyd] }),
    template('draft-ok', { template_name: 'Galley checks', status: 'DRAFT' }),
    template('draft-bad', { template_name: 'Bridge checks', status: 'DRAFT', form_schema: { fields: [{ id: 's', type: 'section', label: 'Bridge', required: false }] } }),
    template('eng', { template_name: 'Engine room daily', area: 'technical' }),
  ];
  h.state.rows.form_template_vessel_settings = [
    setting('std', V.dra, { visibility: 'hidden', reason: 'Replaced by own copy', hidden_at: '2026-11-10T09:00:00Z' }),
    setting('muster', V.dra, { sort_order: 1 }),
    setting('fire', V.dra, { sort_order: 2 }),
  ];
  h.state.rpc.form_template_run_stats = {
    data: [
      stat('fire', V.dra, { runs: 30, last_run_at: '2026-11-25T08:00:00Z', last_run_on: '2026-11-25', next_due: '2026-11-26' }),
      stat('fire', V.gam, { runs: 4, last_run_at: '2026-11-20T08:00:00Z', last_run_on: '2026-11-20', next_due: '2026-11-21', overdue: true }),
    ],
    error: null,
  };
}

function EditMarker() {
  const { templateId } = useParams();
  return <p data-testid="edit-route">{`editing ${templateId}`}</p>;
}

function renderPage(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/fleet/forms/:area" element={<FleetFormsAreaPage />} />
          <Route path="/fleet/forms/:templateId/edit" element={<EditMarker />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rowOf = (name: string) => screen.getByRole('link', { name }).closest('li') as HTMLElement;

beforeEach(() => {
  h.state = freshState();
  h.decide = granted;
  h.shown = shownReady();
});
afterEach(() => cleanup());

describe('gate and the area slug', () => {
  it('reads nothing while the capability loads (deny while loading)', () => {
    h.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    seed();
    renderPage('/fleet/forms/safety');
    expect(screen.queryByRole('heading', { name: 'Safety' })).toBeNull();
    expect(h.state.reads).toEqual([]);
    expect(h.state.rpcCalls).toEqual([]);
  });

  it('denied is AccessDenied, nothing read', () => {
    h.decide = (key) => (key === 'fleet.operations.fleet_checklists.view' ? { allowed: false, status: 'denied', reason: '' } : granted());
    seed();
    renderPage('/fleet/forms/safety');
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(h.state.reads).toEqual([]);
  });

  it.each(['deck', 'technical_forms', 'Safety', 'forms'])('an unknown area (%s) is the in-scope "Area not found", nothing read', (slug) => {
    seed();
    renderPage(`/fleet/forms/${slug}`);
    expect(screen.getByRole('heading', { name: 'Area not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All forms and checklists' })).toHaveAttribute('href', '/fleet/forms');
    expect(h.state.reads).toEqual([]);
  });

  it('technical-forms is the Technical forms area', async () => {
    seed();
    renderPage('/fleet/forms/technical-forms');
    expect(await screen.findByRole('heading', { name: 'Technical forms' })).toBeInTheDocument();
  });
});

describe('Available, on the whole fleet', () => {
  it('says where crews find them and how many are shown; each row tells origin, vessels, cadence and last run', async () => {
    seed();
    renderPage('/fleet/forms/safety');
    expect(await screen.findByText('Crew find these in Safety › Checklists.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('forms-area-summary')).toHaveTextContent('4 of 4 templates shown on the whole fleet'));
    const fire = rowOf('Fire patrol rounds');
    expect(within(fire).getByText('Company')).toBeInTheDocument();
    expect(within(fire).getByText('SMS-CL-014 Rev 2')).toBeInTheDocument();
    expect(within(fire).getByText('On 3 of 3 vessels')).toBeInTheDocument();
    expect(within(fire).getByText('Daily')).toBeInTheDocument();
    await waitFor(() => expect(within(rowOf('Fire patrol rounds')).getByText('Overdue on GAME CHANGER')).toBeInTheDocument());
    const copy = rowOf('Rounds, own copy');
    expect(within(copy).getByText('Customised')).toBeInTheDocument();
    expect(within(copy).getByText('On 2 of 3 vessels')).toBeInTheDocument();
    expect(within(copy).getByText('No recorded runs')).toBeInTheDocument();
    const std = rowOf('Standard rounds');
    expect(within(std).getByText('Standard')).toBeInTheDocument();
    expect(within(std).getByText('Hidden on 1 vessel')).toBeInTheDocument();
    // Drafts and other areas are not on the Available tab.
    expect(screen.queryByRole('link', { name: 'Galley checks' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Engine room daily' })).toBeNull();
  });

  it('with the whole fleet in view, ordering asks for a vessel', async () => {
    seed();
    renderPage('/fleet/forms/safety');
    expect(await screen.findByText('To change the order crews see on a vessel, choose that vessel in Showing.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change order' })).toBeNull();
  });
});

describe('one vessel: order and hiding', () => {
  it('lists the vessel order, leaves the hidden template out of Available', async () => {
    seed();
    renderPage('/fleet/forms/safety?vessel=DRA');
    await waitFor(() => expect(screen.getByTestId('forms-area-summary')).toHaveTextContent('3 of 4 templates shown on DRAAK'));
    const list = screen.getByRole('list', { name: 'Safety templates' });
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(['Muster drill checks', 'Fire patrol rounds', 'Rounds, own copy']);
    expect(within(rowOf('Fire patrol rounds')).getByText('Shown')).toBeInTheDocument();
  });

  it('keyboard reorder: the arrow keys move a template, the move is announced, Save order sends the whole list once', async () => {
    seed();
    h.state.rpc.form_template_reorder = (args) => ({
      data: (args.p_template_ids as string[]).map((id, i) => ({ template_id: id, vessel_id: args.p_vessel_id, company_id: COMPANY, sort_order: i + 1, visibility: 'shown' })),
      error: null,
    });
    renderPage('/fleet/forms/safety?vessel=DRA');
    fireEvent.click(await screen.findByRole('button', { name: 'Change order' }));
    const order = screen.getByRole('list', { name: 'Order on DRAAK' });
    // Every published Safety template on DRAAK, the hidden one included.
    expect(within(order).getAllByRole('listitem').map((li) => li.querySelector('.truncate')?.textContent)).toEqual([
      'Muster drill checks',
      'Fire patrol rounds',
      'Rounds, own copy',
      'Standard rounds',
    ]);
    expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled();
    const handle = screen.getByRole('button', { name: 'Move Muster drill checks, position 1 of 4' });
    handle.focus();
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(screen.getByTestId('reorder-announcement')).toHaveTextContent('Muster drill checks moved to position 2 of 4.');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Standard rounds, position 4 of 4' }), { key: 'Home' });
    expect(within(order).getAllByRole('listitem').map((li) => li.querySelector('.truncate')?.textContent)).toEqual([
      'Standard rounds',
      'Fire patrol rounds',
      'Muster drill checks',
      'Rounds, own copy',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(h.state.rpcCalls.filter((c) => c.fn === 'form_template_reorder')).toHaveLength(1));
    expect(h.state.rpcCalls.find((c) => c.fn === 'form_template_reorder')?.args).toEqual({
      p_vessel_id: V.dra,
      p_area: 'safety',
      p_template_ids: ['std', 'fire', 'muster', 'copy'],
    });
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Order on DRAAK' })).toBeNull());
  });

  it('Cancel drops the changes and sends nothing', async () => {
    seed();
    renderPage('/fleet/forms/safety?vessel=DRA');
    fireEvent.click(await screen.findByRole('button', { name: 'Change order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Fire patrol rounds up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.state.rpcCalls.some((c) => c.fn === 'form_template_reorder')).toBe(false);
  });

  it('no Change order without the right to manage the vessel', async () => {
    seed();
    h.decide = (key, ctx) => (key.endsWith('.admin') || (key.endsWith('.edit') && ctx?.vesselId) ? { allowed: false, status: 'denied', reason: '' } : granted());
    renderPage('/fleet/forms/safety?vessel=DRA');
    await screen.findByTestId('forms-area-summary');
    await waitFor(() => expect(screen.getByRole('list', { name: 'Safety templates' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Change order' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Customise/ })).toBeNull();
  });

  it('the Hidden tab says where and why, and Show again restores it on the vessel', async () => {
    seed();
    h.state.rpc.form_template_set_visibility = (args) => ({
      data: { template_id: args.p_template_id, vessel_id: args.p_vessel_id, company_id: COMPANY, visibility: args.p_visibility, reason: null, sort_order: null },
      error: null,
    });
    renderPage('/fleet/forms/safety?vessel=DRA&tab=hidden');
    const list = await screen.findByRole('list', { name: 'Hidden Safety templates' });
    const row = within(list).getByRole('link', { name: 'Standard rounds' }).closest('li') as HTMLElement;
    expect(within(row).getByText('Hidden on DRAAK')).toBeInTheDocument();
    expect(row).toHaveTextContent('since 10 Nov 2026: Replaced by own copy');
    fireEvent.click(within(row).getByRole('button', { name: 'Show again' }));
    await waitFor(() =>
      expect(h.state.rpcCalls.find((c) => c.fn === 'form_template_set_visibility')?.args).toEqual({
        p_template_id: 'std',
        p_vessel_id: V.dra,
        p_visibility: 'shown',
        p_reason: null,
      }),
    );
  });
});

describe('Customise and drafts', () => {
  it('Customise copies through the definer and opens the copy', async () => {
    seed();
    h.state.rpc.form_template_customise = {
      data: { id: 'new-copy', company_id: COMPANY, status: 'DRAFT', source_template_id: 'std', origin: 'company', template_code: 'STD_CUSTOM1', template_name: 'Standard rounds' },
      error: null,
    };
    renderPage('/fleet/forms/safety');
    fireEvent.click(await screen.findByRole('button', { name: 'Customise Standard rounds' }));
    expect(await screen.findByTestId('edit-route')).toHaveTextContent('editing new-copy');
    expect(h.state.rpcCalls.find((c) => c.fn === 'form_template_customise')?.args).toEqual({ p_source_template_id: 'std' });
  });

  it('a refused Customise stays on the page and says why (no navigation)', async () => {
    seed();
    h.state.rpc.form_template_customise = { data: null, error: { code: '42501', message: 'not_permitted' } };
    renderPage('/fleet/forms/safety');
    fireEvent.click(await screen.findByRole('button', { name: 'Customise Standard rounds' }));
    await waitFor(() => expect(h.state.rpcCalls.some((c) => c.fn === 'form_template_customise')).toBe(true));
    expect(screen.queryByTestId('edit-route')).toBeNull();
  });

  it('the Drafts tab says which drafts are ready to publish', async () => {
    seed();
    renderPage('/fleet/forms/safety?tab=drafts');
    const list = await screen.findByRole('list', { name: 'Safety drafts' });
    await waitFor(() => expect(within(list).getByText('Ready to publish')).toBeInTheDocument());
    expect(within(list).getByText("Not ready to publish: Add at least one item before publishing.")).toBeInTheDocument();
    expect(within(list).getAllByRole('link', { name: 'Edit' }).map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/fleet/forms/draft-ok/edit', '/fleet/forms/draft-bad/edit']),
    );
  });

  it('no Drafts tab without fleet_checklists.edit', async () => {
    seed();
    h.decide = (key) => (key.endsWith('.edit') || key.endsWith('.admin') ? { allowed: false, status: 'denied', reason: '' } : granted());
    renderPage('/fleet/forms/safety?tab=drafts');
    await screen.findByTestId('forms-area-summary');
    expect(screen.queryByRole('tab', { name: /Drafts/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Available/ })).toHaveAttribute('data-state', 'active');
  });
});

describe('D-01 and errors', () => {
  it('without the catalogue columns: the notice, everything Unsorted, no hide or order controls', async () => {
    seed();
    h.state.missingColumns.add('form_templates.area');
    renderPage('/fleet/forms/unsorted?vessel=DRA');
    expect(await screen.findByTestId('forms-areas-not-set-up')).toHaveTextContent('Areas are not set up yet');
    await waitFor(() => expect(screen.getByRole('list', { name: 'Unsorted templates' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Change order' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Customise/ })).toBeNull();
    fireEvent.pointerDown(screen.getAllByRole('button', { name: /^More for/ })[0], { button: 0, ctrlKey: false });
    await act(async () => undefined);
    expect(screen.queryByRole('menuitem', { name: /Hide on|Change where hidden|Move to another area/ })).toBeNull();
    expect(h.state.reads.some((r) => r.table === 'form_template_vessel_settings')).toBe(false);
    expect(h.state.rpcCalls.some((c) => c.fn === 'form_template_run_stats')).toBe(false);
  });

  it('the safety area is empty without the catalogue columns', async () => {
    seed();
    h.state.missingColumns.add('form_templates.area');
    renderPage('/fleet/forms/safety');
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });

  it('a failed catalogue read is an error with Retry', async () => {
    seed();
    h.state.tableErrors.form_templates = { code: '57014', message: 'canceling statement due to statement timeout' };
    renderPage('/fleet/forms/safety');
    expect(await screen.findByText('The templates could not be loaded', undefined, { timeout: 4000 })).toBeInTheDocument();
  });
});
