/**
 * The template builder (src/modules/forms/pages/FormTemplateBuilderPage.tsx;
 * gap/02 FC3, W2; D-01, D-04, D-X5-20):
 *
 * - gates: `.create` for a new template, `.edit` for a draft; nothing is
 *   read while they load; denied is AccessDenied;
 * - Add several adds one item per pasted line;
 * - Save draft inserts a company DRAFT (code made from the name, the area
 *   from ?area=, the sections and items as form_schema) and opens it; an
 *   edit sends the updated_at it loaded; without the catalogue columns the
 *   insert leaves them out and the fields say why (D-01);
 * - Publish shows what stops it (the server's checks) before calling
 *   anything; a refusal is shown in words and never falls back; only a
 *   missing form_template_publish uses today's write (D-X5-20);
 * - a published template is not edited in place; an unknown one is "Template
 *   not found"; publishing needs fleet_checklists.admin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COMPANY, USER, freshState, shownReady, template, type FakeDbState } from './fakeFormsDb';

type Decision = { allowed: boolean; status: string; reason: string };

const h = vi.hoisted(() => ({
  state: null as unknown as FakeDbState,
  decide: ((key: string) => ({ allowed: true, status: 'granted', reason: key })) as (key: string) => Decision,
  shown: null as unknown,
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
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => h.shown,
}));

import FormTemplateBuilderPage from '@/modules/forms/pages/FormTemplateBuilderPage';

// Radix measures switches and radios; jsdom has no ResizeObserver.
class NoResize {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoResize as unknown as typeof ResizeObserver;

const granted = (): Decision => ({ allowed: true, status: 'granted', reason: '' });
const STAMP = '2026-11-21T09:30:00.000Z';

function Marker({ kind }: { kind: string }) {
  const params = useParams();
  const location = useLocation();
  return <p data-testid="route">{`${kind} ${Object.values(params).join('/')} ${location.search}`}</p>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/fleet/forms/new" element={<FormTemplateBuilderPage />} />
          <Route path="/fleet/forms/:templateId/edit" element={<FormTemplateBuilderPage />} />
          <Route path="/fleet/forms/:area" element={<Marker kind="area" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const draftRow = (over: Record<string, unknown> = {}) =>
  template('d1', { status: 'DRAFT', template_name: 'Fire patrol rounds', template_code: 'SAF_FIRE', updated_at: STAMP, published_at: null, ...over });

beforeEach(() => {
  h.state = freshState();
  h.decide = granted;
  h.shown = shownReady();
  h.state.rows.form_templates = [template('other', { template_code: 'SAF_FIRE_PATROL_ROUNDS' })];
});
afterEach(() => cleanup());

describe('gates', () => {
  it('a new template: reads nothing while fleet_checklists.create loads; denied is AccessDenied', () => {
    h.decide = (key) => (key.endsWith('.create') ? { allowed: false, status: 'loading', reason: '' } : granted());
    const { unmount } = renderAt('/fleet/forms/new');
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(h.state.reads).toEqual([]);
    unmount();
    h.decide = (key) => (key.endsWith('.create') ? { allowed: false, status: 'denied', reason: '' } : granted());
    renderAt('/fleet/forms/new');
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(h.state.reads).toEqual([]);
  });

  it('a draft needs fleet_checklists.edit', () => {
    h.decide = (key) => (key.endsWith('.edit') ? { allowed: false, status: 'denied', reason: '' } : granted());
    renderAt('/fleet/forms/d1/edit');
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(h.state.reads).toEqual([]);
  });
});

describe('a new template', () => {
  it('Add several adds one item per line; Save draft inserts a company draft and opens it', async () => {
    h.state.writeAnswers.push({ data: { id: 'new-1', company_id: COMPANY, status: 'DRAFT', updated_at: STAMP }, error: null });
    renderAt('/fleet/forms/new?area=safety');
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Fire patrol rounds' } });
    fireEvent.change(screen.getByLabelText('Section 1 title'), { target: { value: 'Guest areas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add several' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add several items' });
    fireEvent.change(within(dialog).getByLabelText('Items'), { target: { value: '- Fire doors closed\n\n2. Escape routes clear\n• Extinguishers in date' } });
    expect(within(dialog).getByText('3 items will be added')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 3 items' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add several items' })).toBeNull());
    const items = screen.getByRole('list', { name: 'Items of Guest areas' });
    expect(within(items).getAllByPlaceholderText('What crews check or answer').map((i) => (i as HTMLInputElement).value)).toEqual([
      'Fire doors closed',
      'Escape routes clear',
      'Extinguishers in date',
    ]);
    expect(screen.getByTestId('builder-readiness')).toHaveTextContent('Ready to publish');

    // The server now holds the draft the builder opens next.
    h.state.rows.form_templates.push(draftRow({ id: 'new-1', template_name: 'Fire patrol rounds' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    expect(await screen.findByText('A draft: crews do not see it until it is published.')).toBeInTheDocument();
    const insert = h.state.writes.find((w) => w.kind === 'insert');
    expect(insert?.table).toBe('form_templates');
    expect(insert?.values).toMatchObject({
      company_id: COMPANY,
      created_by: USER,
      status: 'DRAFT',
      template_name: 'Fire patrol rounds',
      // SAF_FIRE_PATROL_ROUNDS is taken, so the next one.
      template_code: 'SAF_FIRE_PATROL_ROUNDS_2',
      form_type: 'CHECKLIST',
      vessel_scope: 'FLEET',
      vessel_ids: null,
      area: 'safety',
      form_kind: 'checklist',
      cadence: 'none',
      requires_completion_signature: false,
    });
    const fields = (insert?.values.form_schema as { fields: Array<Record<string, unknown>> }).fields;
    expect(fields.map((f) => [f.type, f.label, f.required])).toEqual([
      ['section', 'Guest areas', false],
      ['yes_no', 'Fire doors closed', true],
      ['yes_no', 'Escape routes clear', true],
      ['yes_no', 'Extinguishers in date', true],
    ]);
    expect(insert?.values).not.toHaveProperty('version_label');
  });

  it('a refused insert (the server says the code is taken) keeps the form and says why', async () => {
    h.state.writeAnswers.push({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    renderAt('/fleet/forms/new?area=safety');
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Rounds' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    await waitFor(() => expect(h.state.writes).toHaveLength(1));
    expect(screen.queryByTestId('route')).toBeNull();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rounds');
  });

  it('a blank name is refused before any request', async () => {
    renderAt('/fleet/forms/new');
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    expect(await screen.findByText('Give the template a name')).toBeInTheDocument();
    expect(h.state.writes).toEqual([]);
  });

  it('D-01: without the catalogue columns the insert leaves them out and the fields say why', async () => {
    h.state.missingColumns.add('form_templates.area');
    h.state.writeAnswers.push({ data: { id: 'new-2', company_id: COMPANY, status: 'DRAFT', updated_at: STAMP }, error: null });
    renderAt('/fleet/forms/new?area=safety');
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Rounds' } });
    expect(screen.getByText(/Areas are not set up yet, so the area, how often it is run and the completion signature cannot be saved/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Signature on completion' })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    await waitFor(() => expect(h.state.writes).toHaveLength(1));
    const values = h.state.writes[0].values;
    for (const column of ['area', 'form_kind', 'cadence', 'requires_completion_signature']) expect(values).not.toHaveProperty(column);
  });
});

describe('publishing', () => {
  beforeEach(() => {
    h.state.rows.form_templates.push(draftRow());
  });

  it('shows what stops a publish first, and calls nothing', async () => {
    h.state.rows.form_templates = [draftRow({ form_schema: { fields: [{ id: 's1', type: 'section', label: 'Engine', required: false }, { id: 's2', type: 'section', label: '', required: false }, { id: 'f1', type: 'yes_no', label: '', required: true }] } })];
    renderAt('/fleet/forms/d1/edit');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Publish' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Not ready to publish' });
    const problems = within(dialog).getByRole('list', { name: 'What stops it' });
    expect(within(problems).getAllByRole('listitem').map((li) => li.firstChild?.textContent)).toEqual([
      'A section has no items. Add an item to it or remove the section.',
      'Every section needs a title.',
      'Every item needs a label.',
    ]);
    expect(within(dialog).queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(h.state.rpcCalls).toEqual([]);
    expect(h.state.writes).toEqual([]);
  });

  it('publishes through the definer with the version number typed and the updated_at loaded, then opens the area', async () => {
    h.state.rpc.form_template_publish = (args) => ({ data: { id: args.p_template_id, company_id: COMPANY, status: 'PUBLISHED', version_label: args.p_version_label }, error: null });
    renderAt('/fleet/forms/d1/edit');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Publish' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Publish this template' });
    fireEvent.change(within(dialog).getByLabelText('Version number (optional)'), { target: { value: 'SMS-CL-014 Rev 3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByTestId('route')).toHaveTextContent('area safety');
    expect(h.state.rpcCalls.find((c) => c.fn === 'form_template_publish')?.args).toEqual({ p_template_id: 'd1', p_version_label: 'SMS-CL-014 Rev 3', p_expected_updated_at: STAMP });
    // Nothing was unsaved, so nothing was written before the publish.
    expect(h.state.writes).toEqual([]);
  });

  it('a refusal is shown in words and never falls back to the table write', async () => {
    h.state.rpc.form_template_publish = { data: null, error: { code: '22023', message: 'version_label_taken' } };
    renderAt('/fleet/forms/d1/edit');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Publish' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Publish this template' });
    fireEvent.change(within(dialog).getByLabelText('Version number (optional)'), { target: { value: 'Rev 2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await within(dialog).findByText('Another version of this template already uses that version number.')).toBeInTheDocument();
    expect(h.state.writes.filter((w) => w.kind === 'update')).toEqual([]);
    expect(screen.queryByTestId('route')).toBeNull();
  });

  it('D-X5-20: only while form_template_publish is missing does today’s write publish the draft', async () => {
    // No RPC answer: the fake answers PGRST202 (function not found).
    h.state.writeAnswers.push({ data: { id: 'd1', company_id: COMPANY, status: 'PUBLISHED' }, error: null });
    renderAt('/fleet/forms/d1/edit');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Publish' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Publish this template' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByTestId('route')).toHaveTextContent('area safety');
    const update = h.state.writes.find((w) => w.kind === 'update');
    expect(update?.values).toMatchObject({ status: 'PUBLISHED', published_by: USER });
    expect(update?.filters).toEqual(expect.arrayContaining([['eq', 'id', 'd1'], ['eq', 'status', 'DRAFT']]));
  });

  it('unsaved changes are saved first (with the updated_at loaded), then published with the new one', async () => {
    h.state.writeAnswers.push({ data: { id: 'd1', status: 'DRAFT', updated_at: '2026-11-22T10:00:00.000Z' }, error: null });
    h.state.rpc.form_template_publish = (args) => ({ data: { id: args.p_template_id, company_id: COMPANY, status: 'PUBLISHED', version_label: null }, error: null });
    renderAt('/fleet/forms/d1/edit');
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Fire patrol rounds, night' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Publish this template' });
    expect(within(dialog).getByText('Your changes are saved first.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByTestId('route')).toHaveTextContent('area safety');
    const update = h.state.writes.find((w) => w.kind === 'update');
    expect(update?.values).toMatchObject({ template_name: 'Fire patrol rounds, night' });
    expect(update?.values).not.toHaveProperty('status');
    expect(update?.filters).toEqual(expect.arrayContaining([['eq', 'status', 'DRAFT'], ['eq', 'updated_at', STAMP]]));
    expect(h.state.rpcCalls.find((c) => c.fn === 'form_template_publish')?.args.p_expected_updated_at).toBe('2026-11-22T10:00:00.000Z');
  });

  it('a stale save says someone changed it (no overwrite, no publish)', async () => {
    h.state.writeAnswers.push({ data: null, error: null });
    renderAt('/fleet/forms/d1/edit');
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Renamed' } });
    // Someone else saved meanwhile.
    h.state.rows.form_templates = h.state.rows.form_templates.map((r) => (r.id === 'd1' ? { ...r, updated_at: '2026-11-23T00:00:00.000Z' } : r));
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Publish this template' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await within(dialog).findByText('Someone changed this template since you opened it. Reload it and try again.')).toBeInTheDocument();
    expect(h.state.rpcCalls.some((c) => c.fn === 'form_template_publish')).toBe(false);
  });

  it('without fleet_checklists.admin there is no Publish, and the page says an admin publishes', async () => {
    h.decide = (key) => (key.endsWith('.admin') ? { allowed: false, status: 'denied', reason: '' } : granted());
    renderAt('/fleet/forms/d1/edit');
    expect(await screen.findByText('You can build and save drafts. A fleet checklist admin publishes them to the vessels.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });
});

describe('not a draft, not found', () => {
  it('a published template is not edited in place; its next version is offered', async () => {
    h.state.rows.form_templates = [template('p1', { template_name: 'Muster checks', status: 'PUBLISHED' })];
    renderAt('/fleet/forms/p1/edit');
    expect(await screen.findByRole('heading', { name: 'Muster checks is published' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit as a new version' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('an unknown template is the in-scope "Template not found"', async () => {
    renderAt('/fleet/forms/nope/edit');
    expect(await screen.findByRole('heading', { name: 'Template not found' })).toBeInTheDocument();
  });
});
