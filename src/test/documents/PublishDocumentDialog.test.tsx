/**
 * Publishing a fleet document (src/modules/documents/components/
 * PublishDocumentDialog.tsx, hooks/usePublishFleetDocument.ts; gap/02 FD3,
 * FD4, W1; X5 spec X5-04B; D-01, D-X5-17):
 *
 * - the flow runs fleet_document_create (draft) → the upload (the
 *   document as the file's entity, no envelope) → fleet_document_add_version
 *   → fleet_document_set_targets → fleet_document_publish, in that order,
 *   and publishes against the updated_at the flow itself last produced;
 * - an upload refusal stops the flow: the draft is left, the dialog says so
 *   and offers to delete it; Try again resumes without creating a second
 *   draft;
 * - a publish refusal is mapped to the server's sentence; no success toast
 *   without the returned row (a row for another document is not a save);
 * - a draft to finish keeps its file; a new version needs one; the form is
 *   checked before any request; the tick helpers tick vessels by flag.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UploadRecordFileRequest, UploadRecordFileResult } from '@/lib/records/services/attachments';

type Answer = { data: unknown; error: { code?: string; message: string } | null };
type Call = { name: string; args: Record<string, unknown> };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  rpc: {} as Record<string, (args: Record<string, unknown>) => Answer>,
  tables: {} as Record<string, Answer>,
  upload: null as null | ((request: UploadRecordFileRequest) => Promise<UploadRecordFileResult>),
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'in']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.tables[table] ?? { data: [], error: null }).then(resolve, reject);
    return chain;
  };
  const rpc = (name: string, args: Record<string, unknown>) => {
    state.calls.push({ name, args });
    const answer = state.rpc[name]?.(args) ?? { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } };
    return Promise.resolve(answer);
  };
  return { supabase: { from, rpc } };
});
vi.mock('@/lib/records/services/attachments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/records/services/attachments')>();
  return {
    ...actual,
    uploadRecordFile: vi.fn((request: UploadRecordFileRequest) => {
      state.calls.push({ name: 'upload', args: { scope: request.scope, file: request.file.name, envelopeId: request.envelopeId, signal: !!request.signal } });
      request.onProgress?.({ loaded: 512, total: 1024 });
      return state.upload ? state.upload(request) : Promise.resolve(uploaded(request));
    }),
  };
});
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, success: vi.fn(), error: vi.fn(), info: vi.fn() } };
});

import { PublishDocumentDialog, type PublishDocumentDialogProps } from '@/modules/documents/components/PublishDocumentDialog';
import { runPublishFlow, type PublishFlowDeps } from '@/modules/documents/hooks/usePublishFleetDocument';
import { EMPTY_PUBLISH_STATE, type PublishFlowState } from '@/modules/documents/lib/fleetDocumentSchema';
import type { LibraryRow } from '@/modules/documents/lib/fleetDocumentLibrary';
import { notify } from '@/shared/lib/notify';
import { todayDateOnly } from '@/shared/lib/form';

const CO = 'co-1';
const stamp = '2026-11-20T10:00:00.123456+00:00';

function uploaded(request: UploadRecordFileRequest): UploadRecordFileResult {
  return {
    status: 'ok',
    value: {
      file: {
        id: 'file-1',
        company_id: request.scope.companyId,
        vessel_id: request.scope.vesselId,
        bucket: 'records',
        storage_path: 'p',
        module_key: request.scope.moduleKey,
        entity_type: request.scope.entityType,
        entity_id: request.scope.entityId,
        original_name: request.file.name,
        mime_type: 'application/pdf',
        size_bytes: request.file.size,
        sha256: null,
        width: null,
        height: null,
        uploaded_by: 'u-1',
        uploaded_at: stamp,
        source: 'upload',
        removed_at: null,
        removed_by: null,
        removal_reason: null,
        legal_hold: false,
        created_at: stamp,
        updated_at: stamp,
      } as never,
      attachment: null,
    },
  };
}

const docRow = (extra: Record<string, unknown> = {}) => ({
  id: 'd-new',
  company_id: CO,
  type_id: 't-manual',
  title: 'Safety Management Manual',
  description: null,
  status: 'draft',
  target_mode: 'selected',
  ack_required: true,
  ack_due_days: 14,
  current_version_id: null,
  published_at: null,
  published_by: null,
  withdrawn_at: null,
  withdrawn_by: null,
  withdrawn_reason: null,
  created_by: 'u-1',
  updated_by: 'u-1',
  created_at: 'u1',
  updated_at: 'u1',
  ...extra,
});

/** Answers as the definers give them: create a draft, add a version, set the targets, publish. */
function serverAnswers() {
  state.rpc = {
    fleet_document_create: (a) => ({ data: docRow({ type_id: a.p_type_id, title: a.p_title }), error: null }),
    fleet_document_add_version: (a) => ({
      data: {
        id: 'ver-1',
        company_id: CO,
        document_id: a.p_document_id,
        version_no: 1,
        version_label: (a.p_version_label as string | null) ?? 'v1',
        version_kind: a.p_version_kind,
        effective_date: a.p_effective_date,
        file_object_id: a.p_file_object_id,
        file_name: 'Safety manual.pdf',
        state: 'draft',
        change_summary: a.p_change_summary,
        updated_at: 'u2',
      },
      error: null,
    }),
    fleet_document_set_targets: (a) => ({ data: docRow({ id: a.p_document_id, target_mode: a.p_target_mode, updated_at: 'u3' }), error: null }),
    fleet_document_publish: (a) => ({
      data: docRow({ id: a.p_document_id, status: 'published', current_version_id: a.p_version_id, updated_at: 'u4' }),
      error: null,
    }),
    fleet_document_delete_draft: (a) => ({ data: docRow({ id: a.p_document_id }), error: null }),
  };
}

const SECTIONS = [
  { id: 's-safety', company_id: CO, name: 'Safety management', sort_order: 1, updated_at: stamp },
  { id: 's-ops', company_id: CO, name: 'Operations', sort_order: 2, updated_at: stamp },
];
const type = (id: string, section: string, name: string, kind: 'major' | 'minor' = 'major') => ({
  id,
  company_id: CO,
  section_id: section,
  name,
  sort_order: 1,
  ack_required_default: true,
  ack_due_days_default: 14,
  version_kind_default: kind,
  hide_when_empty: false,
  updated_at: stamp,
});
const TYPES = [type('t-manual', 's-safety', 'Safety manual'), type('t-proc', 's-ops', 'Procedures', 'minor')];
const VESSELS = [
  { id: 'v-dag', name: 'DAGON', code: 'DAG', counted: true, flagState: 'Cayman Islands', classificationSociety: "Lloyd's Register", fleetGroupId: null },
  { id: 'v-dra', name: 'DRAAK', code: 'DRA', counted: true, flagState: 'Cayman Islands', classificationSociety: "Lloyd's Register", fleetGroupId: null },
  { id: 'v-hyd', name: 'HYDRA', code: 'HYD', counted: true, flagState: 'Malta', classificationSociety: 'DNV', fleetGroupId: null },
  { id: 'v-xip', name: 'XIPHIAS', code: 'XIP', counted: false, flagState: 'Bermuda', classificationSociety: 'ABS', fleetGroupId: null },
];

const libraryRow = (extra: Partial<LibraryRow> = {}): LibraryRow => ({
  id: 'd-moor',
  title: 'Mooring procedure',
  description: null,
  status: 'draft',
  typeId: 't-proc',
  typeName: 'Procedures',
  sectionId: 's-ops',
  sectionName: 'Operations',
  current: null,
  draft: { id: 'ver-moor-1', versionNo: 1, label: 'v1', kind: 'major', effectiveDate: '2026-11-20', fileName: 'Mooring.pdf' },
  targetMode: 'selected',
  targetVesselIds: ['v-dra'],
  vesselsLabel: '1 of 3',
  vesselCount: 1,
  ackRequired: true,
  withdrawnReason: null,
  updatedAt: 'base',
  ...extra,
});

const historyTables = (doc: Record<string, unknown>, versions: Record<string, unknown>[], targets: string[]) => {
  state.tables = {
    fleet_documents: { data: [docRow({ id: 'd-moor', type_id: 't-proc', title: 'Mooring procedure', updated_at: 'base', ...doc })], error: null },
    fleet_document_versions: { data: versions, error: null },
    fleet_document_vessel_targets: { data: targets.map((vessel_id) => ({ vessel_id })), error: null },
    profiles: { data: [], error: null },
  };
};
const versionRow = (extra: Record<string, unknown> = {}) => ({
  id: 'ver-moor-1',
  document_id: 'd-moor',
  version_no: 1,
  version_label: 'v1',
  version_kind: 'major',
  effective_date: '2026-11-20',
  state: 'draft',
  file_object_id: 'file-moor',
  file_name: 'Mooring.pdf',
  mime_type: 'application/pdf',
  size_bytes: 4096,
  change_summary: null,
  published_at: null,
  published_by: null,
  superseded_at: null,
  created_at: stamp,
  created_by: 'u-1',
  updated_at: 'base',
  ...extra,
});

const pdf = (name = 'Safety manual.pdf', type = 'application/pdf', size = 2048) => new File([new Uint8Array(size)], name, { type });

function renderDialog(props: Partial<PublishDocumentDialogProps> = {}) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PublishDocumentDialog
        open
        onOpenChange={onOpenChange}
        companyId={CO}
        types={TYPES}
        sections={SECTIONS}
        vessels={VESSELS}
        fleetGroups={[]}
        document={null}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

const dialog = () => screen.getByRole('dialog');
const names = () => state.calls.map((c) => c.name);
const call = (name: string) => state.calls.find((c) => c.name === name)?.args ?? {};

function fillNewDocument(file: File | null = pdf()) {
  fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 't-manual' } });
  fireEvent.change(screen.getByLabelText('Title crew see'), { target: { value: '  Safety Management Manual ' } });
  if (file) fireEvent.change(screen.getByLabelText('File to publish'), { target: { files: [file] } });
}
const publish = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Publish' }));

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.calls = [];
  state.rpc = {};
  state.tables = {};
  state.upload = null;
  vi.mocked(notify.success).mockClear();
});

describe('publishing a new document', () => {
  it('creates the draft, uploads the file to the document, adds the version, sets the vessels and publishes, in that order', async () => {
    serverAnswers();
    const { onOpenChange } = renderDialog();
    expect(screen.getByRole('heading', { name: 'Publish a document' })).toBeInTheDocument();
    fillNewDocument();
    expect(screen.getByText('Crew acknowledge it within 14 days of publishing, or of joining the vessel.')).toBeInTheDocument();
    publish();
    await waitFor(() => expect(notify.success).toHaveBeenCalledTimes(1));
    expect(names()).toEqual(['fleet_document_create', 'upload', 'fleet_document_add_version', 'fleet_document_set_targets', 'fleet_document_publish']);
    expect(call('fleet_document_create')).toMatchObject({ p_type_id: 't-manual', p_title: 'Safety Management Manual', p_description: null });
    // An entity attachment: the document is the file's entity, no envelope (D-X5-17).
    expect(call('upload')).toEqual({
      scope: { companyId: CO, vesselId: null, moduleKey: 'documents', entityType: 'fleet_document', entityId: 'd-new' },
      file: 'Safety manual.pdf',
      envelopeId: undefined,
      signal: true,
    });
    expect(call('fleet_document_add_version')).toMatchObject({
      p_document_id: 'd-new',
      p_file_object_id: 'file-1',
      p_version_label: null,
      p_version_kind: 'major',
      p_effective_date: todayDateOnly(),
    });
    expect(call('fleet_document_set_targets')).toEqual({ p_document_id: 'd-new', p_target_mode: 'all_including_future', p_vessel_ids: null });
    // Published against the updated_at the flow's own last change produced.
    expect(call('fleet_document_publish')).toEqual({ p_document_id: 'd-new', p_version_id: 'ver-1', p_expected_updated_at: 'u3' });
    expect(notify.success).toHaveBeenCalledWith('Safety Management Manual published', { description: 'Crew on every vessel, also ones added later see it in Safety, Fleet documents.' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('saves a draft without publishing it', async () => {
    serverAnswers();
    const { onOpenChange } = renderDialog();
    fillNewDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalled());
    expect(names()).toEqual(['fleet_document_create', 'upload', 'fleet_document_add_version', 'fleet_document_set_targets']);
    expect(notify.success).toHaveBeenCalledWith('Draft saved: Safety Management Manual', { description: 'Crew do not see it until it is published.' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('checks the form before any request', async () => {
    serverAnswers();
    renderDialog();
    publish();
    expect(await screen.findByText('Choose the document type')).toBeInTheDocument();
    expect(screen.getByText('Enter the title crew will see')).toBeInTheDocument();
    expect(screen.getByText('Choose the file to publish')).toBeInTheDocument();
    fillNewDocument(pdf('notes.txt', 'text/plain'));
    publish();
    expect(await screen.findByText('This file type cannot be attached. Use a PDF, an image or an Office document.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('File to publish'), { target: { files: [pdf()] } });
    fireEvent.click(screen.getByRole('radio', { name: /Chosen vessels/ }));
    publish();
    expect(await screen.findByText('Tick at least one vessel, or publish to all vessels')).toBeInTheDocument();
    expect(state.calls).toEqual([]);
  });

  it('ticks the vessels of a flag with the helpers, and publishes to the ticked vessels', async () => {
    serverAnswers();
    renderDialog();
    fillNewDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Chosen vessels/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Tick the vessels of a flag state' }), { target: { value: 'cayman islands' } });
    expect(screen.getByText('2 of 4 vessels ticked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /HYDRA/ }));
    expect(screen.getByText('3 of 4 vessels ticked')).toBeInTheDocument();
    publish();
    await waitFor(() => expect(notify.success).toHaveBeenCalled());
    expect(call('fleet_document_set_targets')).toEqual({ p_document_id: 'd-new', p_target_mode: 'selected', p_vessel_ids: ['v-dag', 'v-dra', 'v-hyd'] });
    expect(notify.success).toHaveBeenCalledWith('Safety Management Manual published', { description: 'Crew on 3 vessels see it in Safety, Fleet documents.' });
  });
});

describe('when a step fails', () => {
  it('an upload refusal stops the flow, leaves the draft, says so, and Try again resumes without a second draft', async () => {
    serverAnswers();
    state.upload = () => Promise.resolve({ status: 'refused', code: 'storage_forbidden', message: 'You cannot add files to this record.' });
    const { onOpenChange } = renderDialog();
    fillNewDocument();
    publish();
    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('The file was not uploaded');
    expect(alert).toHaveTextContent('You cannot add files to this record.');
    expect(alert).toHaveTextContent('The draft is saved in the library and crew do not see it.');
    expect(names()).toEqual(['fleet_document_create', 'upload']);
    expect(notify.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    // The draft exists: its type and title are fixed, and it can be deleted.
    expect(screen.queryByLabelText('Document type')).toBeNull();
    expect(within(dialog()).getByRole('button', { name: 'Delete draft' })).toBeInTheDocument();

    state.upload = null;
    state.calls = [];
    publish();
    await waitFor(() => expect(notify.success).toHaveBeenCalledTimes(1));
    expect(names()).toEqual(['upload', 'fleet_document_add_version', 'fleet_document_set_targets', 'fleet_document_publish']);
  });

  it('uploads not set up yet (D-01) is a sentence, not a crash', async () => {
    serverAnswers();
    state.upload = () => Promise.resolve({ status: 'missing' });
    renderDialog();
    fillNewDocument();
    publish();
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('File uploads are not set up yet, so the file was not uploaded.');
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('a publish refusal is mapped to its sentence, and nothing is reported as published', async () => {
    serverAnswers();
    state.rpc.fleet_document_publish = () => ({ data: null, error: { code: '22023', message: 'targets_required' } });
    const { onOpenChange } = renderDialog();
    fillNewDocument();
    publish();
    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('The document was not published');
    expect(alert).toHaveTextContent('Choose at least one vessel.');
    expect(alert).toHaveTextContent('The draft is saved in the library and crew do not see it.');
    expect(notify.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('no fake success: a returned row for another document is not a save, and publish never runs', async () => {
    serverAnswers();
    state.rpc.fleet_document_set_targets = () => ({ data: docRow({ id: 'someone-else', target_mode: 'all_including_future', updated_at: 'u3' }), error: null });
    renderDialog();
    fillNewDocument();
    publish();
    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('The vessels were not saved');
    expect(alert).toHaveTextContent('The change was not saved. Refresh to see the current library, then try again.');
    expect(names()).not.toContain('fleet_document_publish');
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('a draft left by a failure can be deleted from the dialog', async () => {
    serverAnswers();
    state.upload = () => Promise.resolve({ status: 'refused', code: 'network_error', message: 'The file could not be uploaded. Check the connection and try again.' });
    const { onOpenChange } = renderDialog();
    fillNewDocument();
    publish();
    await within(dialog()).findByRole('alert');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete draft' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Delete the draft Safety Management Manual?');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Draft deleted: Safety Management Manual'));
    expect(call('fleet_document_delete_draft')).toEqual({ p_document_id: 'd-new' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('finishing a draft and versioning a published document', () => {
  it('a draft keeps its saved file: only the vessels and the publish run, against the updated_at the dialog read', async () => {
    serverAnswers();
    state.rpc.fleet_document_set_targets = (a) => ({ data: docRow({ id: a.p_document_id, target_mode: a.p_target_mode, updated_at: 'base' }), error: null });
    historyTables({ status: 'draft', target_mode: 'selected' }, [versionRow()], ['v-dra']);
    renderDialog({ document: libraryRow() });
    expect(await screen.findByRole('heading', { name: 'Finish publishing Mooring procedure' })).toBeInTheDocument();
    expect(await screen.findByText('Mooring.pdf')).toBeInTheDocument();
    expect(screen.getByText('Saved with v1; kept unless you choose another file')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /DRAAK/ })).toBeChecked();
    publish();
    await waitFor(() => expect(notify.success).toHaveBeenCalled());
    expect(names()).toEqual(['fleet_document_set_targets', 'fleet_document_publish']);
    expect(call('fleet_document_set_targets')).toEqual({ p_document_id: 'd-moor', p_target_mode: 'selected', p_vessel_ids: ['v-dra'] });
    expect(call('fleet_document_publish')).toEqual({ p_document_id: 'd-moor', p_version_id: 'ver-moor-1', p_expected_updated_at: 'base' });
  });

  it('a stale document is refused by the server and offers to load the latest', async () => {
    serverAnswers();
    state.rpc.fleet_document_set_targets = (a) => ({ data: docRow({ id: a.p_document_id, target_mode: a.p_target_mode, updated_at: 'someone-else' }), error: null });
    state.rpc.fleet_document_publish = () => ({ data: null, error: { code: '22023', message: 'stale_document' } });
    historyTables({ status: 'draft', target_mode: 'selected' }, [versionRow()], ['v-dra']);
    renderDialog({ document: libraryRow() });
    await screen.findByText('Mooring.pdf');
    publish();
    const alert = await within(dialog()).findByRole('alert');
    // The targets did not change, so the flow kept the updated_at it read: the server sees the other change.
    expect(call('fleet_document_publish')).toMatchObject({ p_expected_updated_at: 'base' });
    expect(alert).toHaveTextContent('Someone changed this document after you opened it.');
    expect(within(alert).getByRole('button', { name: /Load the latest/ })).toBeInTheDocument();
  });

  it('a new version of a published document needs a file; its label is numbered when left blank', async () => {
    serverAnswers();
    historyTables(
      { status: 'published', target_mode: 'all_including_future', current_version_id: 'ver-moor-1' },
      [versionRow({ state: 'published', published_at: stamp })],
      [],
    );
    renderDialog({ document: libraryRow({ status: 'published', draft: null, current: { id: 'ver-moor-1', versionNo: 1, label: 'v1', kind: 'major', effectiveDate: '2026-11-20', fileName: 'Mooring.pdf' }, targetMode: 'all_including_future', targetVesselIds: [] }) });
    expect(await screen.findByRole('heading', { name: 'New version of Mooring procedure' })).toBeInTheDocument();
    expect(await screen.findByText('Left blank, it is v2.')).toBeInTheDocument();
    // The type's default kind is minor: earlier acknowledgements carry over.
    expect(screen.getByRole('radio', { name: /Minor/ })).toBeChecked();
    expect(screen.getByText('Acknowledgements of the version before carry over.')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Publish version' }));
    expect(await screen.findByText('Choose the file to publish')).toBeInTheDocument();
    expect(state.calls).toEqual([]);
  });

  it('a withdrawn document cannot be published again', async () => {
    renderDialog({ document: libraryRow({ status: 'withdrawn', draft: null }) });
    expect(await screen.findByText('This document has been withdrawn and can no longer be changed.')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('button', { name: 'Publish' })).toBeNull();
  });
});

describe('runPublishFlow', () => {
  const file = pdf();
  const base: PublishFlowState = {
    documentId: 'd-1',
    expectedUpdatedAt: 'read',
    targets: { mode: 'selected', vesselIds: ['v-1'] },
    uploaded: null,
    draftVersion: { id: 'ver-1', versionNo: 1, fileObjectId: 'file-1', fileName: 'a.pdf', label: 'v1', kind: 'major', effectiveDate: '2026-11-20', changeSummary: null },
  };
  const request = {
    intent: 'publish' as const,
    typeId: 't-1',
    title: 'Doc',
    description: null,
    file: null,
    version: { label: null, kind: 'major' as const, effectiveDate: '2026-11-20', changeSummary: null },
    targetMode: 'selected' as const,
    vesselIds: ['v-1'],
  };
  const deps = (over: Partial<PublishFlowDeps> = {}): PublishFlowDeps => ({
    createDocument: vi.fn(),
    uploadRecordFile: vi.fn(),
    addVersion: vi.fn(),
    setTargets: vi.fn(async () => docRow({ id: 'd-1', target_mode: 'selected', updated_at: 'changed-by-someone' }) as never),
    publishDocument: vi.fn(async () => docRow({ id: 'd-1', status: 'published', current_version_id: 'ver-1', updated_at: 'after' }) as never),
    ...over,
  });

  it('a set_targets that changes nothing keeps the updated_at the flow expects', async () => {
    const d = deps();
    const result = await runPublishFlow({ companyId: CO, state: base, request }, d);
    expect(result.status).toBe('done');
    expect(d.publishDocument).toHaveBeenCalledWith(CO, { documentId: 'd-1', versionId: 'ver-1', expectedUpdatedAt: 'read' });
  });

  it('a real target change is the flow’s own: publish uses its updated_at', async () => {
    const d = deps();
    await runPublishFlow({ companyId: CO, state: base, request: { ...request, vesselIds: ['v-1', 'v-2'] } }, d);
    expect(d.publishDocument).toHaveBeenCalledWith(CO, { documentId: 'd-1', versionId: 'ver-1', expectedUpdatedAt: 'changed-by-someone' });
  });

  it('refuses an upload it cannot confirm (another entity), and stops before the version', async () => {
    const d = deps({
      uploadRecordFile: vi.fn(async (req: UploadRecordFileRequest) => {
        const ok = uploaded(req);
        if (ok.status === 'ok') (ok.value.file as { entity_id: string }).entity_id = 'other-doc';
        return ok;
      }),
    });
    const result = await runPublishFlow({ companyId: CO, state: { ...base, draftVersion: null }, request: { ...request, file } }, d);
    expect(result).toMatchObject({ status: 'failed', step: 'upload' });
    expect(result.status === 'failed' && (result.error as Error).message).toMatch(/could not confirm/);
    expect(d.addVersion).not.toHaveBeenCalled();
    expect(result.state.uploaded).toBeNull();
  });

  it('stops before the next step once cancelled, and has nothing to publish without a file or a draft', async () => {
    const abort = new AbortController();
    abort.abort();
    const d = deps();
    const stopped = await runPublishFlow({ companyId: CO, state: base, request, signal: abort.signal }, d);
    expect(stopped).toMatchObject({ status: 'failed', step: 'set_targets' });
    expect(d.setTargets).not.toHaveBeenCalled();
    const nothing = await runPublishFlow({ companyId: CO, state: EMPTY_PUBLISH_STATE, request }, d);
    expect(nothing.status).toBe('failed');
    expect(d.createDocument).not.toHaveBeenCalled();
  });
});
