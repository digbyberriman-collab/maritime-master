/**
 * The two-step add-document dialog (X1-04B; gap/04 C25, C26; gap/08 UP1):
 *
 * - step 1: search over name, code and abbreviation across every tab (each
 *   result says where it is filed, T-185), categories with their counts, the
 *   Added tiles, a category to open on;
 * - step 2: the fields of the type's field_schema, the "No expiry" tick
 *   clearing the date, a required expiry or tick, the passport rules (issuing
 *   country and issue date required, "Use this passport in crew report" one
 *   per person), issuing-office suggestions (T-170);
 * - saving through crew_document_save with the affected-row check, refusals
 *   at their field or in a toast; the file checked at once, previewed,
 *   uploaded to the person's prefix first, removed again when the save fails,
 *   and never saved when the upload fails;
 * - edit: only the changed fields, the type kept, the re-verification note,
 *   "Nothing changed"; D-01: no storage helper, no file.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { CrewDocumentRpcRow } from '@/modules/crew/types/db.pending';

type Answer = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  rpc: {} as Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  uploads: [] as string[],
  removes: [] as string[],
  uploadError: null as unknown,
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const result = (): Answer =>
      table === 'ref_countries'
        ? {
            data: [
              { iso2: 'GB', iso3: 'GBR', name: 'United Kingdom', demonym: 'British', dial_code: '44', flag_emoji: null, sort_name: 'United Kingdom' },
              { iso2: 'MT', iso3: 'MLT', name: 'Malta', demonym: 'Maltese', dial_code: '356', flag_emoji: null, sort_name: 'Malta' },
            ],
            error: null,
          }
        : { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => {
    h.rpcCalls.push({ fn, args });
    return Promise.resolve(h.rpc[fn] ? h.rpc[fn](args) : { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });
  };
  const storage = {
    from: () => ({
      upload: (path: string) => {
        h.uploads.push(path);
        return Promise.resolve({ data: h.uploadError ? null : { path }, error: h.uploadError });
      },
      remove: (paths: string[]) => {
        h.removes.push(...paths);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  };
  return { supabase: { from, rpc, storage } };
});
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import { AddDocumentDialog, REVERIFY_NOTE, type AddDocumentDialogMode } from '@/modules/crew/components/documents/AddDocumentDialog';
import { documentFromServer, type CrewDocumentView } from '@/modules/crew/hooks/useCrewDocuments';
import type { DocumentCatalogue, DocumentType } from '@/modules/crew/hooks/useDocumentTypes';
import { UPLOADS_UNAVAILABLE_NOTICE } from '@/modules/crew/lib/documentUpload';

const PROFILE = 'b0000000-0000-4000-8000-000000000015';
const COMPANY = 'c0000000-0000-4000-8000-000000000001';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const t = (over: Partial<DocumentType>): DocumentType => ({
  id: 't', companyId: null, categoryKey: 'passports', tab: 'documents', key: 'k', name: 'N', code: null, abbreviation: null, stcwReference: null,
  fieldSchema: {}, defaultValidityMonths: null, endorsementIntervalMonths: null, itemType: 'crew_document', isIdentity: false, isMedicalFitness: false,
  isActive: true, sortOrder: 10, ...over,
});
const TYPES: DocumentType[] = [
  t({ id: 't-pp', key: 'passport', name: 'Passport', code: 'PASSPORT', abbreviation: 'PP', itemType: 'passport', isIdentity: true, fieldSchema: { issuing_office: 'optional' }, defaultValidityMonths: 120 }),
  t({ id: 't-visa', key: 'visa_us', categoryKey: 'visas', name: 'United States visitor visa', abbreviation: 'B1/B2', itemType: 'visa', fieldSchema: { entries: 'optional', issuing_office: 'optional' } }),
  t({ id: 't-eng1', key: 'eng1', categoryKey: 'medical_fitness', name: 'ENG1 seafarer medical certificate', code: 'ENG1', itemType: 'medical', isMedicalFitness: true }),
  t({ id: 't-bst', key: 'bst', categoryKey: 'stcw_basic', tab: 'stcw', name: 'Basic safety training', abbreviation: 'BST', stcwReference: 'STCW A-VI/1', itemType: 'crew_qualification' }),
  t({ id: 't-pst', key: 'pst', categoryKey: 'stcw_basic', tab: 'stcw', name: 'Personal survival techniques', abbreviation: 'PST', itemType: 'crew_qualification' }),
  t({ id: 't-old', key: 'old', categoryKey: 'visas', name: 'Retired visa', isActive: false }),
];
const CATALOGUE: DocumentCatalogue = {
  categories: [
    { key: 'passports', label: 'Passports', tab: 'documents', sortOrder: 10, isActive: true },
    { key: 'visas', label: 'Visas', tab: 'documents', sortOrder: 30, isActive: true },
    { key: 'medical_fitness', label: 'Medical fitness', tab: 'documents', sortOrder: 50, isActive: true },
    { key: 'stcw_basic', label: 'STCW basic training', tab: 'stcw', sortOrder: 100, isActive: true },
  ],
  types: TYPES,
  byId: new Map(TYPES.map((x) => [x.id, x])),
};

const passportRow = (over: Partial<CrewDocumentRpcRow> = {}): CrewDocumentRpcRow => ({
  id: 'd-pp', profile_id: PROFILE, user_id: null, document_type_id: 't-pp', type_key: 'passport', type_name: 'Passport', type_code: 'PASSPORT', type_abbreviation: 'PP',
  stcw_reference: null, category_key: 'passports', category_label: 'Passports', tab: 'documents', expiry_item_type: 'passport', is_identity: true, is_medical_fitness: false,
  field_schema: { issuing_office: 'optional' }, legacy_type: null, legacy_name: null, number: 'X1234567', issuing_country_code: 'GB', issuing_office: 'Passport office',
  issuing_authority: null, issue_date: '2020-03-01', expiry_date: '2030-03-01', no_expiry: false, endorsement_due_date: null, use_in_crew_report: true, details: {},
  notes: null, has_file: true, file_path: `${COMPANY}/crew/${PROFILE}/documents/u-passport.pdf`, file_url: null, file_name: 'passport.pdf', file_mime: 'application/pdf',
  file_size: 182000, verification_status: 'verified', verified_by: 'u9', verified_by_name: 'Demo Master', verified_at: '2026-11-01T10:00:00Z', verification_note: null,
  alerts_muted: false, muted_by: null, muted_at: null, muted_reason: null, source: 'manual', created_by: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  window_days: 270, bucket: 'valid', days_remaining: 1200, endorsement_state: null, state: 'valid', can_edit: true, can_delete: false, ...over,
});
const HELD: CrewDocumentView[] = [documentFromServer(passportRow())];

const saved = (id = 'new-doc') => () => ({ data: { id }, error: null });

beforeEach(() => {
  h.rpc = {
    crew_document_save: saved(),
    crew_document_issuing_suggestions: () => ({ data: [{ issuing_office: 'Passport office', uses: 3 }, { issuing_office: 'Consular section', uses: 1 }], error: null }),
  };
  h.rpcCalls = [];
  h.uploads = [];
  h.removes = [];
  h.uploadError = null;
  for (const fn of Object.values(h.notify)) fn.mockReset();
  (URL as unknown as { createObjectURL: (f: unknown) => string }).createObjectURL = () => 'blob:preview';
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;
});

const onOpenChange = vi.fn();
const onSaved = vi.fn();

const renderDialog = (mode: AddDocumentDialogMode, opts: { documents?: CrewDocumentView[]; uploadsReady?: boolean } = {}) => {
  onOpenChange.mockReset();
  onSaved.mockReset();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AddDocumentDialog
          mode={mode}
          profileId={PROFILE}
          companyId={COMPANY}
          personName="Demo Chief Stew"
          catalogue={CATALOGUE}
          documents={opts.documents ?? HELD}
          uploadsReady={opts.uploadsReady ?? true}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole('dialog');
};

const tile = (dialog: HTMLElement, key: string) => dialog.querySelector(`[data-document-type="${key}"]`) as HTMLElement | null;
const saveCalls = () => h.rpcCalls.filter((c) => c.fn === 'crew_document_save');
const pick = (dialog: HTMLElement, key: string) => {
  const el = tile(dialog, key);
  if (!el) throw new Error(`no tile ${key}`);
  fireEvent.click(el);
};
const field = (dialog: HTMLElement, label: RegExp | string) => within(dialog).getByLabelText(label) as HTMLInputElement;

describe('step 1: choose the type', () => {
  it('opens on the tab it was started from, with its categories and their counts', () => {
    const dialog = renderDialog({ kind: 'add', tab: 'stcw' });
    expect(within(dialog).getByText('Step 1 of 2')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Add a document' })).toBeInTheDocument();
    const tabs = within(dialog).getByRole('group', { name: 'Profile tab' });
    expect(within(tabs).getByRole('button', { name: 'STCW, 2 types' })).toHaveAttribute('aria-pressed', 'true');
    // The retired type is not offered.
    expect(within(tabs).getByRole('button', { name: 'Documents, 3 types' })).toBeInTheDocument();
    const categories = within(dialog).getByRole('group', { name: 'Category' });
    expect(within(categories).getAllByRole('button').map((b) => b.textContent)).toEqual(['All categories2', 'STCW basic training2']);
    expect(tile(dialog, 'bst')).not.toBeNull();
    expect(tile(dialog, 'passport')).toBeNull();
  });

  it('searches name, code and abbreviation across every tab and says where each is filed', () => {
    const dialog = renderDialog({ kind: 'add', tab: 'stcw' });
    const search = within(dialog).getByLabelText('Search document types');
    fireEvent.change(search, { target: { value: 'eng1' } });
    expect(tile(dialog, 'eng1')).not.toBeNull();
    expect(within(tile(dialog, 'eng1') as HTMLElement).getByText('ENG1 · Documents · Medical fitness')).toBeInTheDocument();
    expect(within(dialog).getByText('1 type matches across all tabs.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'PST' } });
    expect(tile(dialog, 'pst')).not.toBeNull();
    expect(tile(dialog, 'bst')).toBeNull();
    fireEvent.change(search, { target: { value: 'b1/b2' } });
    expect(tile(dialog, 'visa_us')).not.toBeNull();
    fireEvent.change(search, { target: { value: 'retired' } });
    expect(within(dialog).getByText('No document type matches “retired”.')).toBeInTheDocument();
  });

  it('marks the types the person holds as Added, and opens on a category from its + Add', () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents', categoryKey: 'passports' });
    const pp = tile(dialog, 'passport') as HTMLElement;
    expect(pp).toHaveAttribute('data-added', 'true');
    expect(within(pp).getByText('Added')).toBeInTheDocument();
    expect(tile(dialog, 'visa_us')).toBeNull();
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Category' })).getByRole('button', { name: 'All categories 3' }));
    expect(tile(dialog, 'visa_us')).not.toBeNull();
  });

  it('picking a type goes to step 2; Back goes back to the types', () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'visa_us');
    expect(dialog).toHaveAttribute('data-step', 'details');
    expect(within(dialog).getByText('Step 2 of 2')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Add United States visitor visa' })).toBeInTheDocument();
    expect(dialog.querySelector('[data-document-type-summary]')).toHaveTextContent('United States visitor visa · Visas · shown on the Documents tab');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to the document types' }));
    expect(dialog).toHaveAttribute('data-step', 'pick');
  });
});

describe('step 2: the type\'s fields', () => {
  it('shows the field_schema fields: a visa has entries and issuing office, no crew-report flag', () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'visa_us');
    expect(within(dialog).getByText('Entries')).toBeInTheDocument();
    expect(field(dialog, /Issuing office or authority/)).toBeInTheDocument();
    expect(within(dialog).queryByText('Use this passport in crew report')).toBeNull();
  });

  it('a type without issuing office has none', () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'eng1');
    expect(within(dialog).queryByLabelText(/Issuing office/)).toBeNull();
    expect(field(dialog, /^Number/)).toBeInTheDocument();
  });

  it('an expiry date or the No expiry tick is required; nothing is sent until then', async () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'eng1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    expect(await within(dialog).findByText('Enter the expiry date, or tick No expiry.')).toBeInTheDocument();
    expect(saveCalls()).toEqual([]);
  });

  it('the No expiry tick clears and locks the date, and saves with no date', async () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'eng1');
    const expiry = field(dialog, /^Expiry date/);
    fireEvent.change(expiry, { target: { value: '2028-01-01' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /No expiry/ }));
    await waitFor(() => expect(field(dialog, /^Expiry date/)).toBeDisabled());
    expect(field(dialog, /^Expiry date/).value).toBe('');
    fireEvent.change(field(dialog, /^Number/), { target: { value: 'M-77' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('new-doc'));
    expect(saveCalls()).toHaveLength(1);
    const args = saveCalls()[0].args;
    expect(args.p_id).toBeNull();
    expect(args.p_profile_id).toBe(PROFILE);
    expect(args.p_document_type_id).toBe('t-eng1');
    expect(args.p_payload).toMatchObject({ number: 'M-77', no_expiry: true, expiry_date: null });
    expect(args.p_payload).not.toHaveProperty('file_path');
    expect(h.notify.success).toHaveBeenCalledWith('ENG1 seafarer medical certificate added');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('suggests the expiry date from the default validity; the person confirms it', async () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' }, { documents: [] });
    pick(dialog, 'passport');
    fireEvent.change(field(dialog, /^Issue date/), { target: { value: '2024-05-10' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Use this date' }));
    await waitFor(() => expect(field(dialog, /^Expiry date/).value).toBe('2034-05-10'));
  });

  it('offers earlier issuing offices of the type in one tap (T-170)', async () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'visa_us');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Consular section' }));
    await waitFor(() => expect(field(dialog, /Issuing office or authority/).value).toBe('Consular section'));
    expect(h.rpcCalls.find((c) => c.fn === 'crew_document_issuing_suggestions')?.args).toEqual({ p_document_type_id: 't-visa' });
  });
});

describe('the passport rules (C26)', () => {
  it('a passport needs its issuing country and issue date', async () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' }, { documents: [] });
    pick(dialog, 'passport');
    expect(field(dialog, /^Passport number/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /No expiry/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    expect(await within(dialog).findByText('Enter the issuing country.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the issue date.')).toBeInTheDocument();
    expect(saveCalls()).toEqual([]);
  });

  it('"Use this passport in crew report" is one per person: off and explained while another holds it', () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'passport');
    const box = within(dialog).getByRole('checkbox', { name: 'Use this passport in crew report' });
    expect(box).toBeDisabled();
    expect(within(dialog).getByText('Passport X1234567 is used in the crew report. Untick it there first: one passport per person.')).toBeInTheDocument();
  });

  it('a first passport can be flagged, and saves with its country, dates and flag', async () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' }, { documents: [] });
    pick(dialog, 'passport');
    fireEvent.change(field(dialog, /^Passport number/), { target: { value: 'P123' } });
    const country = within(dialog).getByRole('combobox', { name: 'Issuing country' });
    await waitFor(() => expect(country).toBeEnabled());
    fireEvent.click(country);
    fireEvent.click(await screen.findByRole('option', { name: /Malta/ }));
    fireEvent.change(field(dialog, /^Issue date/), { target: { value: '2024-05-10' } });
    fireEvent.change(field(dialog, /^Expiry date/), { target: { value: '2034-05-09' } });
    const box = within(dialog).getByRole('checkbox', { name: 'Use this passport in crew report' });
    expect(box).toBeEnabled();
    fireEvent.click(box);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0].args.p_payload).toMatchObject({
      number: 'P123',
      issuing_country_code: 'MT',
      issue_date: '2024-05-10',
      expiry_date: '2034-05-09',
      no_expiry: false,
      use_in_crew_report: true,
    });
  });
});

describe('saving honestly', () => {
  const fillEng1 = (dialog: HTMLElement) => {
    pick(dialog, 'eng1');
    fireEvent.change(field(dialog, /^Expiry date/), { target: { value: '2028-01-01' } });
  };

  it('a save that comes back without the row is not a success', async () => {
    h.rpc.crew_document_save = () => ({ data: null, error: null });
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    fillEng1(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(h.notify.error).toHaveBeenCalledWith('The document was not saved. Try again.', { title: 'The document was not saved' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('a refusal naming a field lands on that field', async () => {
    h.rpc.crew_document_save = () => ({ data: null, error: { code: '22023', message: 'field_invalid', details: 'The issue date cannot be in the future.', hint: 'issue_date' } });
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    fillEng1(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    expect(await within(dialog).findByText('The issue date cannot be in the future.')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('a 42501 refusal shows its sentence (D-225)', async () => {
    h.rpc.crew_document_save = () => ({
      data: null,
      error: { code: '42501', message: 'crew_not_permitted', details: "You don't have permission to add documents for this person." },
    });
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    fillEng1(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    await waitFor(() =>
      expect(h.notify.error).toHaveBeenCalledWith("You don't have permission to add documents for this person.", { title: 'The document was not saved' }),
    );
  });

  it('the server\'s one-passport refusal lands on the flag', async () => {
    h.rpc.crew_document_save = () => ({
      data: null,
      error: { code: '22023', message: 'crew_report_passport_exists', details: 'Another passport is already used in the crew report. Turn it off there first.', hint: 'use_in_crew_report' },
    });
    const dialog = renderDialog({ kind: 'edit', document: HELD[0] });
    fireEvent.change(field(dialog, /^Passport number/), { target: { value: 'Y1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('Another passport is already used in the crew report. Turn it off there first.')).toBeInTheDocument();
  });
});

describe('the file', () => {
  const choose = (dialog: HTMLElement, file: File) => {
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  };
  const pdf = () => new File(['%PDF-1.4'], 'eng1 scan.pdf', { type: 'application/pdf' });

  it('a refused file says why at once and is not kept', () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'eng1');
    const big = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 80 * 1024 * 1024 });
    choose(dialog, big);
    expect(dialog.querySelector('[data-document-file-error]')).toHaveTextContent('"huge.pdf" is 80 MB. Crew documents can be up to 50 MB.');
    expect(dialog.querySelector('[data-document-file-chosen]')).toBeNull();
    choose(dialog, new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(dialog.querySelector('[data-document-file-error]')).toHaveTextContent(/is not a file type STORM accepts/);
  });

  it('a PDF previews, uploads to the person\'s prefix on Save, and the row gets its path', async () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'eng1');
    fireEvent.change(field(dialog, /^Expiry date/), { target: { value: '2028-01-01' } });
    choose(dialog, pdf());
    expect(dialog.querySelector('[data-document-file-chosen]')).toHaveTextContent('eng1 scan.pdf');
    expect(await within(dialog).findByTitle('Preview of eng1 scan.pdf')).toHaveAttribute('src', 'blob:preview');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0]).toMatch(new RegExp(`^${COMPANY}/crew/${PROFILE}/documents/[0-9a-f-]{36}-eng1_scan.pdf$`));
    expect(saveCalls()[0].args.p_payload).toMatchObject({ file_path: h.uploads[0], file_name: 'eng1 scan.pdf', file_mime: 'application/pdf' });
    expect(h.removes).toEqual([]);
  });

  it('a refused save removes the uploaded file again', async () => {
    h.rpc.crew_document_save = () => ({ data: null, error: { code: '22023', message: 'field_invalid', details: 'Check the expiry date.', hint: 'expiry_date' } });
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'eng1');
    fireEvent.change(field(dialog, /^Expiry date/), { target: { value: '2028-01-01' } });
    choose(dialog, pdf());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    expect(await within(dialog).findByText('Check the expiry date.')).toBeInTheDocument();
    expect(h.uploads).toHaveLength(1);
    expect(h.removes).toEqual(h.uploads);
  });

  it('a refused upload saves nothing and says why at the file', async () => {
    h.uploadError = { statusCode: '403', message: 'new row violates row-level security policy' };
    const dialog = renderDialog({ kind: 'add', tab: 'documents' });
    pick(dialog, 'eng1');
    fireEvent.change(field(dialog, /^Expiry date/), { target: { value: '2028-01-01' } });
    choose(dialog, pdf());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(dialog.querySelector('[data-document-file-error]')).toHaveTextContent('The file was not stored. You may not store documents for this person.'));
    expect(saveCalls()).toEqual([]);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('D-01: without the storage helper the file field is off and says why', () => {
    const dialog = renderDialog({ kind: 'add', tab: 'documents' }, { uploadsReady: false });
    pick(dialog, 'eng1');
    expect(within(dialog).getByText(UPLOADS_UNAVAILABLE_NOTICE)).toBeInTheDocument();
    expect(dialog.querySelector('input[type="file"]')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: /Choose file/ })).toBeDisabled();
  });
});

describe('edit', () => {
  it('opens on the details of its type, notes the re-verification, and sends only what changed', async () => {
    h.rpc.crew_document_save = saved('d-pp');
    const dialog = renderDialog({ kind: 'edit', document: HELD[0] });
    expect(dialog).toHaveAttribute('data-step', 'details');
    expect(within(dialog).queryByText(/Step \d of 2/)).toBeNull();
    expect(within(dialog).getByRole('heading', { name: 'Edit Passport' })).toBeInTheDocument();
    expect(within(dialog).getByText(REVERIFY_NOTE)).toBeInTheDocument();
    expect(field(dialog, /^Passport number/).value).toBe('X1234567');
    expect(within(dialog).getByText('passport.pdf')).toBeInTheDocument();
    // Its own crew-report flag stays editable (the rule counts the other documents).
    expect(within(dialog).getByRole('checkbox', { name: 'Use this passport in crew report' })).toBeEnabled();
    fireEvent.change(field(dialog, /^Passport number/), { target: { value: 'X7654321' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0].args).toEqual({ p_id: 'd-pp', p_profile_id: PROFILE, p_document_type_id: null, p_payload: { number: 'X7654321' } });
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Passport saved'));
  });

  it('nothing changed: says so, sends nothing', async () => {
    const dialog = renderDialog({ kind: 'edit', document: HELD[0] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(h.notify.info).toHaveBeenCalledWith('Nothing changed'));
    expect(saveCalls()).toEqual([]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('an edit whose answer is another row is not a success', async () => {
    h.rpc.crew_document_save = saved('other-id');
    const dialog = renderDialog({ kind: 'edit', document: HELD[0] });
    fireEvent.change(field(dialog, /^Passport number/), { target: { value: 'Z1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(h.notify.error).toHaveBeenCalledWith('The document was not saved. Try again.', { title: 'The document was not saved' }));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
