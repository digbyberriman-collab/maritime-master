/**
 * Template status writes go through the definers (X5-06A; gap/02 W2;
 * D-X5-13, D-X5-20; 20261124040500_fleet_form_templates.sql):
 *
 * - source: no ISM page or hook writes a template status, version, publish
 *   or archive date, or deletes a template, directly; inserts are drafts;
 *   today's publish / archive writes live only in the Forms & Checklists
 *   fallback and run only when the definer is missing;
 * - Draft templates: Publish calls form_template_publish (the fallback
 *   write only on a missing definer, never on a refusal); a draft that
 *   fails the publish checks says why and cannot be published; Delete
 *   calls form_template_delete_draft after a confirmation; a failed read is
 *   an error, not "no drafts";
 * - Form templates: the actions follow the status and the capability;
 *   restore of an archived template is a new version; duplicate is a
 *   Customise copy; delete goes through the definer and offers archiving
 *   when the server says the template must be kept;
 * - the hooks: create inserts a draft and publishes through the definer;
 *   update never writes a status; duplicate and archive use the definers.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';

type Answer = { data: unknown; error: { code?: string; message: string } | null };
type Op = { method: string; args: unknown[] };
type Chain = { table: string; ops: Op[] };

const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  readError: null as Answer['error'],
  /** Answers for writes (insert / update / delete) and single-row reads, in call order. */
  queue: [] as Answer[],
  rpcAnswers: {} as Record<string, Answer>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
  chains: [] as Chain[],
  can: true,
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: h.success, error: h.error, info: vi.fn(), warning: vi.fn(), dismiss: vi.fn(), promise: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => {
  h.rpc = vi.fn((fn: string) => Promise.resolve(h.rpcAnswers[fn] ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } }));
  const from = (table: string) => {
    const chain: Chain = { table, ops: [] };
    h.chains.push(chain);
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'or', 'order', 'gte']) {
      builder[m] = (...args: unknown[]) => {
        chain.ops.push({ method: m, args });
        return builder;
      };
    }
    const single = () => Promise.resolve(h.queue.shift() ?? { data: null, error: { message: 'no queued answer' } });
    builder.single = single;
    builder.maybeSingle = single;
    builder.then = (resolve: (a: Answer) => unknown) => resolve(h.readError ? { data: null, error: h.readError } : { data: h.rows[table] ?? [], error: null });
    return builder;
  };
  return { supabase: { rpc: h.rpc, from } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { company_id: 'co-1', id: 'p-1' }, user: { id: 'user-1' } }),
}));
vi.mock('@/lib/permissions/useCan', () => ({
  useCan: () => h.can,
  useCapability: () => ({ allowed: h.can, status: h.can ? 'granted' : 'denied', reason: '' }),
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({ useVessel: () => ({ selectedVesselId: null }) }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/modules/crew/components/AdminPinModal', () => ({
  default: ({ open, onConfirmed }: { open: boolean; onConfirmed: () => void }) =>
    open ? (
      <button type="button" onClick={onConfirmed}>
        Confirm admin PIN
      </button>
    ) : null,
}));

import DraftTemplates from '@/modules/ism/forms/pages/DraftTemplates';
import FormTemplates from '@/modules/ism/forms/pages/FormTemplates';
import { useArchiveFormTemplate, useCreateFormTemplate, useDuplicateFormTemplate, useUpdateFormTemplate } from '@/modules/ism/forms/hooks/useFormTemplates';
import { formTemplateRefusal } from '@/modules/forms';

const ROOT = process.cwd();
const MISSING = (fn: string) => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}(p_template_id) in the schema cache` } });
const refused = (message: string, code = '22023') => ({ data: null, error: { code, message } });

const READY = { type: 'checkbox', label: 'Lifejackets stowed' };
const template = (over: Record<string, unknown>) => ({
  id: 't-1', company_id: 'co-1', template_code: 'DECK', template_name: 'Deck rounds', description: null, category_id: null, form_type: 'CHECKLIST',
  vessel_scope: 'FLEET', vessel_ids: null, version: 1, status: 'DRAFT', form_schema: { fields: [READY] }, initiation_mode: 'MANUAL',
  published_at: null, updated_at: '2026-11-20T10:00:00Z', created_at: '2026-11-01T10:00:00Z', ...over,
});

beforeAll(() => {
  if (!window.PointerEvent) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

afterEach(() => {
  cleanup();
  h.rows = {};
  h.readError = null;
  h.queue = [];
  h.rpcAnswers = {};
  h.chains = [];
  h.can = true;
  h.rpc.mockClear();
  h.success.mockReset();
  h.error.mockReset();
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const renderPage = (page: ReactNode) =>
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );

/** Every write the page or hook made on a table. */
const writes = (table = 'form_templates') =>
  h.chains.filter((c) => c.table === table && c.ops.some((o) => ['insert', 'update', 'delete'].includes(o.method)));

const openMenu = async (name: RegExp, index = 0) => {
  fireEvent.pointerDown(screen.getAllByRole('button', { name })[index], { button: 0, ctrlKey: false });
  return screen.findByRole('menu');
};

// ─── Source ─────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('source: no direct status write in the ISM template pages', () => {
  const files = walk(join(ROOT, 'src/modules/ism/forms')).map((f) => ({ file: f.replace(`${ROOT}/`, ''), text: readFileSync(f, 'utf8') }));
  /** Each `from('form_templates')` statement, up to its end. */
  const statements = files.flatMap(({ file, text }) =>
    [...text.matchAll(/\.from\('form_templates'\)[\s\S]*?;/g)].map((m) => ({ file, text: m[0] })),
  );

  it('finds the template statements (parser sanity)', () => {
    expect(statements.length).toBeGreaterThanOrEqual(8);
  });

  it('never deletes a template and never updates one with a status', () => {
    expect(statements.filter((s) => /\.delete\(/.test(s.text)).map((s) => s.file)).toEqual([]);
    const updates = statements.filter((s) => /\.update\(/.test(s.text));
    expect(updates.map((s) => s.file)).toEqual(['src/modules/ism/forms/hooks/useFormTemplates.ts']);
    expect(updates[0].text).not.toMatch(/status/);
  });

  it('inserts drafts only: no other status and no publish date in any ISM template writer', () => {
    const writers = ['hooks/useFormTemplates.ts', 'pages/CreateTemplate.tsx', 'pages/FormTemplates.tsx', 'pages/DraftTemplates.tsx'];
    const all = files.filter((f) => writers.some((w) => f.file.endsWith(w))).map((f) => f.text).join('\n');
    expect(all.length).toBeGreaterThan(1000);
    expect(all).not.toMatch(/status:\s*'(PUBLISHED|ARCHIVED|SUPERSEDED)'/);
    expect(all).not.toMatch(/status:\s*publish\s*\?/);
    expect(all).not.toMatch(/\b(published_at|published_by|archived_at|supersedes_template_id):(?!\s*(string|null)\b)/);
    const inserts = statements.filter((s) => /\.insert\(/.test(s.text)).map((s) => s.file).sort();
    expect(inserts).toEqual(['src/modules/ism/forms/hooks/useFormTemplates.ts', 'src/modules/ism/forms/pages/CreateTemplate.tsx']);
    for (const file of inserts) expect(files.find((f) => f.file === file)?.text).toContain("status: 'DRAFT'");
  });

  it('dropped the client cast on the CreateTemplate insert', () => {
    const create = files.find((f) => f.file.endsWith('pages/CreateTemplate.tsx'))?.text ?? '';
    expect(create).not.toMatch(/\.insert\([^)]*as any/);
    expect(create).toContain('publishTemplateWithFallback(');
  });

  it('keeps today\'s publish / archive writes only in the fallback, reached only on a missing definer', () => {
    const mutations = readFileSync(join(ROOT, 'src/modules/forms/hooks/useFormTemplateMutations.ts'), 'utf8');
    for (const fn of ['legacyPublishWrite', 'legacyArchiveWrite']) {
      const calls = [...mutations.matchAll(new RegExp(`await ${fn}\\(`, 'g'))];
      expect(calls).toHaveLength(1);
    }
    expect(mutations).toMatch(/if \(!isFormTemplateNotSetUp\(error\)\) throw error;\s*const row = await legacyPublishWrite\(/);
    expect(mutations).toMatch(/if \(!isFormTemplateNotSetUp\(error\)\) throw error;\s*const row = await legacyArchiveWrite\(/);
    for (const { text } of files) expect(text).not.toMatch(/legacy(Publish|Archive)Write\(/);
  });
});

// ─── Draft templates ────────────────────────────────────────────────────────

describe('Draft templates', () => {
  const drafts = () => [
    template({ id: 't-ready', template_name: 'Deck rounds' }),
    template({ id: 't-gap', template_name: 'Engine rounds', template_code: 'ENG', form_schema: { fields: [{ type: 'section', label: 'Engine' }, { type: 'section', label: 'Steering' }, READY] } }),
  ];

  it('says what stops a draft from publishing and only offers Publish for a ready one', async () => {
    h.rows.form_templates = drafts();
    renderPage(<DraftTemplates />);
    expect(await screen.findByText('Engine rounds')).toBeInTheDocument();
    expect(screen.getAllByText('Ready to publish')).toHaveLength(2);
    expect(screen.getByText(`Not ready to publish: ${formTemplateRefusal('empty_section')}`)).toBeInTheDocument();
    const publish = screen.getAllByRole('button', { name: /Publish/ });
    expect(publish[0]).toBeEnabled();
    expect(publish[1]).toBeDisabled();
  });

  it('publishes through the definer, with no table write', async () => {
    h.rows.form_templates = drafts();
    h.rpcAnswers.form_template_publish = { data: template({ id: 't-ready', status: 'PUBLISHED' }), error: null };
    renderPage(<DraftTemplates />);
    await screen.findByText('Engine rounds');
    fireEvent.click(screen.getAllByRole('button', { name: /Publish/ })[0]);
    await waitFor(() => expect(h.success).toHaveBeenCalledWith('Template published', {}));
    expect(h.rpc).toHaveBeenCalledWith('form_template_publish', { p_template_id: 't-ready', p_version_label: null, p_expected_updated_at: '2026-11-20T10:00:00Z' });
    expect(writes()).toEqual([]);
  });

  it('uses today\'s write only when the definer is missing (D-X5-20)', async () => {
    h.rows.form_templates = drafts();
    h.rpcAnswers.form_template_publish = MISSING('form_template_publish');
    renderPage(<DraftTemplates />);
    await screen.findByText('Engine rounds');
    h.queue = [{ data: drafts()[0], error: null }, { data: { ...drafts()[0], status: 'PUBLISHED' }, error: null }];
    fireEvent.click(screen.getAllByRole('button', { name: /Publish/ })[0]);
    await waitFor(() => expect(h.success).toHaveBeenCalledWith('Template published', {}));
    const [write] = writes();
    const update = write.ops.find((o) => o.method === 'update')?.args[0] as Record<string, unknown>;
    expect(update).toMatchObject({ status: 'PUBLISHED', published_by: 'user-1' });
    expect(write.ops.filter((o) => o.method === 'eq').map((o) => o.args)).toContainEqual(['status', 'DRAFT']);
  });

  it('never falls back on a refusal: the sentence, no write, no success', async () => {
    h.rows.form_templates = drafts();
    h.rpcAnswers.form_template_publish = refused('not_permitted', '42501');
    renderPage(<DraftTemplates />);
    await screen.findByText('Engine rounds');
    fireEvent.click(screen.getAllByRole('button', { name: /Publish/ })[0]);
    await waitFor(() => expect(h.error).toHaveBeenCalledWith('Template not published', { description: formTemplateRefusal('not_permitted') }));
    expect(h.success).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it('deletes through the definer after a confirmation', async () => {
    h.rows.form_templates = drafts();
    h.rpcAnswers.form_template_delete_draft = { data: template({ id: 't-ready' }), error: null };
    renderPage(<DraftTemplates />);
    await screen.findByText('Engine rounds');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Deck rounds' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(h.rpc).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('form_template_delete_draft', { p_template_id: 't-ready' }));
    await waitFor(() => expect(h.success).toHaveBeenCalledWith('Draft deleted', { description: 'Deck rounds' }));
    expect(writes()).toEqual([]);
  });

  it('offers no publish or delete without the capability', async () => {
    h.can = false;
    h.rows.form_templates = drafts();
    renderPage(<DraftTemplates />);
    await screen.findByText('Engine rounds');
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('shows a failed read as an error, not as no drafts', async () => {
    h.readError = { code: '08006', message: 'connection lost' };
    renderPage(<DraftTemplates />);
    expect(await screen.findByText('Drafts could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText('No draft templates')).toBeNull();
  });
});

// ─── Form templates ─────────────────────────────────────────────────────────

describe('Form templates', () => {
  const rows = () => [
    template({ id: 't-draft', template_name: 'Guest arrival', template_code: 'CHR_GUEST', status: 'DRAFT' }),
    template({ id: 't-pub', template_name: 'Fire patrol', template_code: 'SAF_FIRE', status: 'PUBLISHED', version: 2, version_label: 'SMS-CL-014 Rev 2', area: 'safety' }),
    template({ id: 't-old', template_name: 'Fire patrol', template_code: 'SAF_FIRE', status: 'SUPERSEDED', version: 1 }),
    template({ id: 't-arch', template_name: 'Cabin inspection', template_code: 'CREW_CABIN', status: 'ARCHIVED' }),
  ];
  const showAll = async () => {
    renderPage(<FormTemplates />);
    await screen.findByRole('list', { name: 'Templates' });
  };

  it('offers the actions the status allows', async () => {
    h.rows.form_templates = rows();
    await showAll();
    expect(screen.getByText('SMS-CL-014 Rev 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Publish$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restore as a new draft/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Start form' })).toHaveLength(1);

    let menu = await openMenu(/More actions for Fire patrol/, 0);
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['New version', 'Duplicate as a copy', 'Archive']);
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    menu = await openMenu(/More actions for Fire patrol/, 1);
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Duplicate as a copy', 'Archive']);
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    menu = await openMenu(/More actions for Cabin inspection/);
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Duplicate as a copy']);
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    menu = await openMenu(/More actions for Guest arrival/);
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Archive', 'Delete draft (admin PIN)']);
  });

  it('restores an archived template as a new draft version, never by flipping its status', async () => {
    h.rows.form_templates = rows();
    h.rpcAnswers.form_template_new_version = { data: template({ id: 't-new', status: 'DRAFT', version: 2, supersedes_template_id: 't-arch' }), error: null };
    await showAll();
    fireEvent.click(screen.getByRole('button', { name: /Restore as a new draft/ }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('form_template_new_version', { p_template_id: 't-arch' }));
    await waitFor(() => expect(h.success).toHaveBeenCalled());
    expect(writes()).toEqual([]);
  });

  it('duplicates as a Customise copy', async () => {
    h.rows.form_templates = rows();
    h.rpcAnswers.form_template_customise = { data: template({ id: 't-copy', status: 'DRAFT', source_template_id: 't-pub', origin: 'company', template_code: 'SAF_FIRE_CUSTOM1' }), error: null };
    await showAll();
    const menu = await openMenu(/More actions for Fire patrol/, 0);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Duplicate as a copy' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('form_template_customise', { p_source_template_id: 't-pub' }));
    expect(writes()).toEqual([]);
  });

  it('deletes a draft through the definer after the PIN, and offers archiving when the server keeps it', async () => {
    h.rows.form_templates = rows();
    h.rpcAnswers.form_template_delete_draft = refused('template_has_runs');
    h.rpcAnswers.form_template_archive = { data: template({ id: 't-draft', status: 'ARCHIVED' }), error: null };
    await showAll();
    const menu = await openMenu(/More actions for Guest arrival/);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete draft (admin PIN)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm admin PIN' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('form_template_delete_draft', { p_template_id: 't-draft' }));
    expect(await within(dialog).findByText(formTemplateRefusal('template_has_runs') as string)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive instead' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('form_template_archive', { p_template_id: 't-draft', p_reason: null }));
    expect(writes()).toEqual([]);
    expect(writes('form_schedules')).toEqual([]);
    expect(writes('form_ai_extraction_jobs')).toEqual([]);
  });

  it('offers no template action without the capability', async () => {
    h.can = false;
    h.rows.form_templates = rows();
    await showAll();
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Publish$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Restore as a new draft/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Start form' })).toHaveLength(1);
  });

  it('shows a failed read as an error with Retry', async () => {
    h.readError = { code: '08006', message: 'connection lost' };
    renderPage(<FormTemplates />);
    expect(await screen.findByText('Templates could not be loaded')).toBeInTheDocument();
  });
});

// ─── The hooks ──────────────────────────────────────────────────────────────

describe('the template hooks', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>;
  const schema = { pages: [], fields: [] };

  it('create inserts a draft, then publishes it through the definer', async () => {
    h.queue = [
      { data: template({ id: 't-new', updated_at: '2026-11-26T09:00:00Z' }), error: null },
      { data: template({ id: 't-new', status: 'PUBLISHED', version_label: '1.0' }), error: null },
    ];
    h.rpcAnswers.form_template_publish = { data: template({ id: 't-new', status: 'PUBLISHED' }), error: null };
    const { result } = renderHook(() => useCreateFormTemplate(), { wrapper });
    let created: { status?: string; version_label?: string | null } | undefined;
    await act(async () => {
      created = await result.current.mutateAsync({ template_code: 'NEW', template_name: 'New', form_type: 'CHECKLIST', vessel_scope: 'FLEET', initiation_mode: 'MANUAL', form_schema: schema, status: 'PUBLISHED' });
    });
    // What the server stored after the definer, re-read, not the status asked for.
    expect(created).toMatchObject({ status: 'PUBLISHED', version_label: '1.0' });
    const insert = writes()[0].ops.find((o) => o.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(insert.status).toBe('DRAFT');
    expect(insert).not.toHaveProperty('published_at');
    expect(insert).not.toHaveProperty('published_by');
    expect(h.rpc).toHaveBeenCalledWith('form_template_publish', { p_template_id: 't-new', p_version_label: null, p_expected_updated_at: '2026-11-26T09:00:00Z' });
    expect(h.success).toHaveBeenCalledWith('Template published', { description: 'Deck rounds' });
  });

  it('update writes content only; a status goes through the definers; a draft status is refused', async () => {
    h.queue = [{ data: template({ id: 't-1', template_name: 'Renamed' }), error: null }, { data: template({ id: 't-1', status: 'PUBLISHED' }), error: null }];
    h.rpcAnswers.form_template_publish = { data: template({ id: 't-1', status: 'PUBLISHED' }), error: null };
    const { result } = renderHook(() => useUpdateFormTemplate(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ templateId: 't-1', updates: { template_name: 'Renamed', status: 'PUBLISHED' } });
    });
    const update = writes()[0].ops.find((o) => o.method === 'update')?.args[0] as Record<string, unknown>;
    expect(update).toEqual({ template_name: 'Renamed' });
    expect(h.rpc).toHaveBeenCalledWith('form_template_publish', expect.objectContaining({ p_template_id: 't-1' }));

    h.chains = [];
    h.rpc.mockClear();
    await act(async () => {
      await result.current.mutateAsync({ templateId: 't-1', updates: { status: 'DRAFT' } }).catch(() => undefined);
    });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it('duplicate and archive use the definers', async () => {
    h.rpcAnswers.form_template_customise = { data: template({ id: 't-copy', status: 'DRAFT', source_template_id: 't-1', origin: 'company', template_code: 'DECK_CUSTOM1' }), error: null };
    h.rpcAnswers.form_template_archive = { data: template({ id: 't-1', status: 'ARCHIVED' }), error: null };
    const duplicate = renderHook(() => useDuplicateFormTemplate(), { wrapper });
    const archive = renderHook(() => useArchiveFormTemplate(), { wrapper });
    await act(async () => {
      expect((await duplicate.result.current.mutateAsync('t-1')).id).toBe('t-copy');
      await archive.result.current.mutateAsync('t-1');
    });
    expect(h.rpc).toHaveBeenCalledWith('form_template_customise', { p_source_template_id: 't-1' });
    expect(h.rpc).toHaveBeenCalledWith('form_template_archive', { p_template_id: 't-1', p_reason: null });
    expect(writes()).toEqual([]);
  });
});
