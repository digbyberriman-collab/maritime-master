/**
 * Library settings (src/modules/documents/components/DocumentSettingsDrawer.tsx,
 * lib/documentTaxonomySchema.ts, hooks/useFleetDocumentMutations.ts;
 * gap/02 FD1, FD10, W1):
 *
 * - gate `fleet.operations.fleet_documents.edit`: nothing offered while it
 *   loads, AccessDenied without it; delete buttons need
 *   `fleet.operations.fleet_documents.delete`;
 * - the sections in order with type and document counts, each type with
 *   its defaults and counts;
 * - add / rename a section (trimmed, validated before any request, the
 *   returned row checked, refusals as sentences); reorder with the buttons
 *   and with Alt + Arrow keys; delete only while nothing is held, after a
 *   confirmation;
 * - add / edit a document type with its defaults (days 1-365, major or
 *   minor, hide while empty); delete only while it holds no document;
 * - D-01: a missing taxonomy says the library is not set up yet.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  answers: {} as Record<string, Answer | ((args: Record<string, unknown>) => Answer)>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  state.rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    const answer = state.answers[fn];
    const value = typeof answer === 'function' ? answer(args) : answer;
    return Promise.resolve(value ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } });
  });
  return { supabase: { rpc: state.rpc, from: () => ({}) } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, error: state.toastError, success: state.toastSuccess } };
});

import { DocumentSettingsDrawer } from '@/modules/documents/components/DocumentSettingsDrawer';
import type { FleetDocumentTaxonomyState } from '@/modules/documents/hooks/useFleetDocumentTaxonomy';
import { buildFleetDocumentLibrary } from '@/modules/documents/lib/fleetDocumentLibrary';
import {
  ACK_DUE_DAYS_MAX,
  documentTypeFormDefaults,
  moveInOrder,
  toSaveTypeInput,
  toSectionName,
} from '@/modules/documents/lib/documentTaxonomySchema';
import { saveSection, saveType } from '@/modules/documents/hooks/useFleetDocumentMutations';

const stamp = '2026-11-20T10:00:00Z';
const SECTIONS = [
  { id: 's-safety', company_id: 'co-1', name: 'Safety management', sort_order: 1, updated_at: stamp },
  { id: 's-ops', company_id: 'co-1', name: 'Operations', sort_order: 2, updated_at: stamp },
  { id: 's-empty', company_id: 'co-1', name: 'Empty', sort_order: 3, updated_at: stamp },
];
const TYPES = [
  {
    id: 't-manual', company_id: 'co-1', section_id: 's-safety', name: 'Safety manual', sort_order: 1,
    ack_required_default: true, ack_due_days_default: 14, version_kind_default: 'major' as const, hide_when_empty: false, updated_at: stamp,
  },
  {
    id: 't-policy', company_id: 'co-1', section_id: 's-safety', name: 'Policies', sort_order: 2,
    ack_required_default: false, ack_due_days_default: 30, version_kind_default: 'minor' as const, hide_when_empty: true, updated_at: stamp,
  },
  {
    id: 't-proc', company_id: 'co-1', section_id: 's-ops', name: 'Procedures', sort_order: 1,
    ack_required_default: true, ack_due_days_default: 7, version_kind_default: 'major' as const, hide_when_empty: false, updated_at: stamp,
  },
];
const DOCUMENTS = [
  {
    id: 'd-sms', company_id: 'co-1', type_id: 't-manual', title: 'Safety Management Manual', description: null, status: 'published' as const,
    target_mode: 'all_including_future' as const, ack_required: true, ack_due_days: 14, current_version_id: null, published_at: stamp,
    withdrawn_at: null, withdrawn_reason: null, created_at: stamp, updated_at: stamp,
  },
];

const taxonomy: FleetDocumentTaxonomyState = { state: 'ready', taxonomy: { sections: SECTIONS, types: TYPES }, updatedAt: Date.now(), refreshing: false };
const summaries = buildFleetDocumentLibrary({ sections: SECTIONS, types: TYPES, documents: DOCUMENTS, versions: [], targets: [], vessels: [] }).sections;

function renderDrawer(tax: FleetDocumentTaxonomyState = taxonomy) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DocumentSettingsDrawer open onOpenChange={() => undefined} companyId="co-1" taxonomy={tax} sections={summaries} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rpcCalls = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);
const section = (name: string) => screen.getByRole('heading', { name }).closest('li') as HTMLElement;
const echoSection = (args: Record<string, unknown>): Answer => ({
  data: { id: (args.p_id as string | null) ?? 's-new', company_id: 'co-1', name: args.p_name, sort_order: 4, created_by: null, updated_by: null, created_at: stamp, updated_at: stamp },
  error: null,
});
const echoType = (args: Record<string, unknown>): Answer => ({
  data: {
    id: (args.p_id as string | null) ?? 't-new', company_id: 'co-1', section_id: args.p_section_id, name: args.p_name, sort_order: 3,
    ack_required_default: args.p_ack_required_default, ack_due_days_default: args.p_ack_due_days_default,
    version_kind_default: args.p_version_kind_default, hide_when_empty: args.p_hide_when_empty,
    created_by: null, updated_by: null, created_at: stamp, updated_at: stamp,
  },
  error: null,
});

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
afterEach(() => {
  cleanup();
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.answers = {};
  state.rpc.mockClear();
  state.toastError.mockClear();
  state.toastSuccess.mockClear();
});

describe('taxonomy forms', () => {
  it('trims and validates names, days 1-365 and the version kind; moves an id up or down', () => {
    expect(toSectionName({ name: '  Navigation ' })).toBe('Navigation');
    expect(toSectionName({ name: '   ' })).toBeNull();
    expect(toSectionName({ name: 'x'.repeat(81) })).toBeNull();
    expect(ACK_DUE_DAYS_MAX).toBe(365);
    const defaults = documentTypeFormDefaults();
    expect(defaults).toEqual({ name: '', ackRequiredDefault: true, ackDueDaysDefault: '14', versionKindDefault: 'major', hideWhenEmpty: false });
    expect(toSaveTypeInput({ ...defaults, name: ' Permits ', ackDueDaysDefault: '21' }, { id: null, sectionId: 's-ops' })).toEqual({
      id: null, sectionId: 's-ops', name: 'Permits', ackRequiredDefault: true, ackDueDaysDefault: 21, versionKindDefault: 'major', hideWhenEmpty: false,
    });
    for (const days of ['0', '366', '1.5', '', 'ten']) expect(toSaveTypeInput({ ...defaults, name: 'A', ackDueDaysDefault: days }, { id: null, sectionId: 's' }), days).toBeNull();
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b'], 'x', 'up')).toEqual(['a', 'b']);
  });

  it('the mutation wrappers check the input first and the returned row after (no fake success)', async () => {
    await expect(saveSection('co-1', { id: null, name: '  ' })).rejects.toThrow('Enter a name.');
    expect(state.rpc).not.toHaveBeenCalled();
    state.answers.fleet_document_section_save = (args) => ({ data: { ...(echoSection(args).data as object), company_id: 'co-2' }, error: null });
    await expect(saveSection('co-1', { id: null, name: 'Bridge' })).rejects.toThrow(/was not saved/);
    state.answers.fleet_document_section_save = { data: null, error: { code: '22023', message: 'section_name_taken' } };
    await expect(saveSection('co-1', { id: null, name: 'Bridge' })).rejects.toThrow('There is already a section with this name.');
    state.answers.fleet_document_section_save = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_document_section_save' } };
    await expect(saveSection('co-1', { id: null, name: 'Bridge' })).rejects.toThrow('Fleet documents are not set up yet, so nothing was saved.');
    state.answers.fleet_document_type_save = (args) => ({ data: { ...(echoType(args).data as object), hide_when_empty: !args.p_hide_when_empty }, error: null });
    await expect(
      saveType('co-1', { id: 't-proc', sectionId: 's-ops', name: 'Procedures', ackRequiredDefault: true, ackDueDaysDefault: 7, versionKindDefault: 'major', hideWhenEmpty: false }),
    ).rejects.toThrow(/was not saved/);
    await expect(
      saveType('co-1', { id: null, sectionId: 's-ops', name: 'A', ackRequiredDefault: true, ackDueDaysDefault: 0, versionKindDefault: 'major', hideWhenEmpty: false }),
    ).rejects.toThrow('Enter a number of days from 1 to 365.');
  });
});

describe('Library settings drawer', () => {
  it('offers nothing while the access loads, and denies a reader without edit', async () => {
    state.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    renderDrawer();
    expect(await screen.findByRole('dialog', { name: 'Library settings' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New section name' })).toBeNull();
    cleanup();
    state.decide = (key) => ({ allowed: key !== 'fleet.operations.fleet_documents.edit', status: 'denied', reason: '' });
    renderDrawer();
    expect(await screen.findByText(/needs the fleet documents edit permission/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New section name' })).toBeNull();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('says the library is not set up yet while the taxonomy is missing (D-01)', async () => {
    renderDrawer({ state: 'not_set_up' });
    expect(await screen.findByRole('heading', { name: 'Fleet documents are not set up yet' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New section name' })).toBeNull();
  });

  it('lists the sections in order with their counts, and each type with its defaults and counts', async () => {
    renderDrawer();
    const list = await screen.findByRole('list', { name: 'Sections, in the order vessels see them' });
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Safety management', 'Operations', 'Empty']);
    expect(within(section('Safety management')).getByTestId('section-counts')).toHaveTextContent('2 types · 1 document');
    expect(within(section('Empty')).getByTestId('section-counts')).toHaveTextContent('0 types · 0 documents');
    const types = within(section('Safety management')).getByRole('list', { name: 'Document types in Safety management' });
    const [manual, policy] = within(types).getAllByRole('listitem');
    expect(manual).toHaveTextContent('Acknowledge within 14 days · Major versions');
    expect(manual).toHaveTextContent('1 document · 1 published');
    expect(policy).toHaveTextContent('No acknowledgement · Minor versions · Hidden on vessels while empty');
    expect(policy).toHaveTextContent('Nothing published yet');
  });

  it('adds a section: validated first, trimmed, the returned row checked; a refusal is a sentence under the field', async () => {
    renderDrawer();
    const form = await screen.findByRole('form', { name: 'New section name' });
    fireEvent.click(within(form).getByRole('button', { name: 'Add section' }));
    expect(await within(form).findByText('Enter a name')).toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
    state.answers.fleet_document_section_save = { data: null, error: { code: '22023', message: 'section_name_taken' } };
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: '  Operations  ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add section' }));
    expect(await within(form).findByText('There is already a section with this name.')).toBeInTheDocument();
    expect(rpcCalls('fleet_document_section_save')).toEqual([{ p_id: null, p_name: 'Operations' }]);
    expect(state.toastError).toHaveBeenCalled();
    state.answers.fleet_document_section_save = echoSection;
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: ' Navigation ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add section' }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith('Section Navigation added'));
    await waitFor(() => expect(within(form).getByRole('textbox')).toHaveValue(''));
  });

  it('renames a section in place (Escape cancels)', async () => {
    state.answers.fleet_document_section_save = echoSection;
    renderDrawer();
    await screen.findByRole('list', { name: 'Sections, in the order vessels see them' });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Operations' }));
    const form = screen.getByRole('form', { name: 'Rename Operations' });
    fireEvent.keyDown(within(form).getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('form', { name: 'Rename Operations' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Operations' }));
    const again = screen.getByRole('form', { name: 'Rename Operations' });
    fireEvent.change(within(again).getByRole('textbox'), { target: { value: 'Deck operations' } });
    fireEvent.click(within(again).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rpcCalls('fleet_document_section_save')).toEqual([{ p_id: 's-ops', p_name: 'Deck operations' }]));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith('Section renamed to Deck operations'));
  });

  it('reorders with the buttons and with Alt + Arrow keys on the handle; the ends cannot move further', async () => {
    state.answers.fleet_document_sections_reorder = (args) => ({
      data: (args.p_ids as string[]).map((id, i) => ({ ...SECTIONS.find((s) => s.id === id), sort_order: i + 1 })),
      error: null,
    });
    renderDrawer();
    await screen.findByRole('list', { name: 'Sections, in the order vessels see them' });
    expect(screen.getByRole('button', { name: 'Move Safety management up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Empty down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Operations up' }));
    await waitFor(() => expect(rpcCalls('fleet_document_sections_reorder')).toEqual([{ p_ids: ['s-ops', 's-safety', 's-empty'] }]));
    const handle = screen.getByRole('button', { name: /^Reorder Safety management/ });
    await waitFor(() => expect(handle).not.toBeDisabled());
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(rpcCalls('fleet_document_sections_reorder')).toHaveLength(1);
    fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(rpcCalls('fleet_document_sections_reorder')[1]).toEqual({ p_ids: ['s-ops', 's-safety', 's-empty'] }));
  });

  it('deletes only what holds no document, after a confirmation; without delete rights there is no delete button', async () => {
    state.answers.fleet_document_section_delete = (args) => ({ data: { ...SECTIONS.find((s) => s.id === args.p_id) }, error: null });
    renderDrawer();
    await screen.findByRole('list', { name: 'Sections, in the order vessels see them' });
    const busy = screen.getByRole('button', { name: 'Delete Safety management' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveAttribute('title', 'This section cannot be deleted while any of its document types holds a document.');
    fireEvent.click(busy);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete Safety manual' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Delete Policies' })).not.toHaveAttribute('aria-disabled');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Empty' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Empty?' });
    expect(dialog).toHaveTextContent('It has no document types.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(rpcCalls('fleet_document_section_delete')).toEqual([{ p_id: 's-empty' }]));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith('Section Empty deleted'));
    cleanup();
    state.decide = (key) => ({ allowed: key !== 'fleet.operations.fleet_documents.delete', status: 'granted', reason: '' });
    renderDrawer();
    await screen.findByRole('list', { name: 'Sections, in the order vessels see them' });
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rename Empty' })).toBeInTheDocument();
  });

  it('adds a document type with its defaults; days are checked before any request', async () => {
    state.answers.fleet_document_type_save = echoType;
    renderDrawer();
    await screen.findByRole('list', { name: 'Sections, in the order vessels see them' });
    fireEvent.click(within(section('Operations')).getByRole('button', { name: 'Add document type' }));
    const form = screen.getByRole('form', { name: 'New document type' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: ' Permits ' } });
    fireEvent.change(within(form).getByLabelText('Days to acknowledge'), { target: { value: '400' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add type' }));
    expect(await within(form).findByText('Must be 365 or less')).toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('Days to acknowledge'), { target: { value: '21' } });
    fireEvent.click(within(form).getByRole('switch', { name: 'Hide on vessels while nothing is published' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Add type' }));
    await waitFor(() =>
      expect(rpcCalls('fleet_document_type_save')).toEqual([
        {
          p_id: null,
          p_section_id: 's-ops',
          p_name: 'Permits',
          p_ack_required_default: true,
          p_ack_due_days_default: 21,
          p_version_kind_default: 'major',
          p_hide_when_empty: true,
        },
      ]),
    );
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith('Document type Permits added'));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'New document type' })).toBeNull());
  });

  it('edits a type: its values prefill the form and the change is saved with its id', async () => {
    state.answers.fleet_document_type_save = echoType;
    renderDrawer();
    await screen.findByRole('list', { name: 'Sections, in the order vessels see them' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Policies' }));
    const form = screen.getByRole('form', { name: 'Edit Policies' });
    expect(within(form).getByLabelText('Name')).toHaveValue('Policies');
    expect(within(form).getByLabelText('Days to acknowledge')).toHaveValue('30');
    expect(within(form).getByLabelText('Days to acknowledge')).toBeDisabled();
    expect(within(form).getByRole('switch', { name: 'Crew acknowledge documents of this type' })).not.toBeChecked();
    fireEvent.click(within(form).getByRole('switch', { name: 'Crew acknowledge documents of this type' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Save type' }));
    await waitFor(() =>
      expect(rpcCalls('fleet_document_type_save')).toEqual([
        {
          p_id: 't-policy',
          p_section_id: 's-safety',
          p_name: 'Policies',
          p_ack_required_default: true,
          p_ack_due_days_default: 30,
          p_version_kind_default: 'minor',
          p_hide_when_empty: true,
        },
      ]),
    );
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith('Policies saved'));
  });

  it('a refused type save stays open with the sentence', async () => {
    state.answers.fleet_document_type_save = { data: null, error: { code: '22023', message: 'type_name_taken' } };
    renderDrawer();
    await screen.findByRole('list', { name: 'Sections, in the order vessels see them' });
    fireEvent.click(within(section('Operations')).getByRole('button', { name: 'Add document type' }));
    const form = screen.getByRole('form', { name: 'New document type' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Procedures' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add type' }));
    expect(await within(form).findByText('This section already has a document type with this name.')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'New document type' })).toBeInTheDocument();
  });
});
