/**
 * The crew profile's Documents, STCW and Qualifications tabs (X1-04B;
 * gap/04 C24, C26; D-31; D-01):
 *
 * - why Add is off (catalogue or rights not applied, storage helper
 *   missing, still loading, failed) or hidden (no right), and the category
 *   groups in catalogue order, unclassified last;
 * - the tab: only its own documents (the tab is the type's, T-185), category
 *   groups with counts and "+ Add", the legend with counts, each row's pills
 *   (the expiry, "Expiry unknown" for a missing date, no file, alerts off),
 *   number, issuing country, expiry or "No expiry", the read-only
 *   verification pill and "Reviewed by … on …", View only with a file, Edit
 *   only with the rights;
 * - View asks for a signed URL of the stored path (never a public URL);
 * - D-01: the legacy fallback rows read-only with the notice and Add off;
 *   the storage helper missing keeps Add off with its sentence; any other
 *   error is an error with Try again; 42501 reads as no access;
 * - the layout folds at 390 px (rows wrap, the facts grid has two columns).
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { CrewDocumentCategoryRow, CrewDocumentRpcRow, CrewDocumentTypeRow } from '@/modules/crew/types/db.pending';

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  rpc: {} as Record<string, () => { data: unknown; error: unknown }>,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  signed: [] as string[],
  uploadsReady: true,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const result = (): Result => h.tables[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'is']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  const rpc = (fn: string, args: unknown) => {
    h.rpcCalls.push({ fn, args });
    return Promise.resolve(h.rpc[fn] ? h.rpc[fn]() : { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });
  };
  const storage = {
    from: () => ({
      createSignedUrl: (path: string) => {
        h.signed.push(path);
        return Promise.resolve({ data: { signedUrl: `https://signed.example.test/${path}?token=t` }, error: null });
      },
    }),
  };
  return { supabase: { from, rpc, storage } };
});
vi.mock('@/modules/crew/lib/documentUpload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/crew/lib/documentUpload')>();
  return { ...actual, crewDocumentUploadsReady: () => h.uploadsReady };
});

import { DocumentsTab, UNCLASSIFIED_GROUP_KEY, UNCLASSIFIED_GROUP_LABEL } from '@/modules/crew/components/documents/DocumentsTab';
import { ScopeContext, type ScopeValue } from '@/app/router/scopeContext';
import { CATALOGUE_MISSING_NOTICE } from '@/modules/crew/lib/crewDocumentSchema';
import { UPLOADS_UNAVAILABLE_NOTICE } from '@/modules/crew/lib/documentUpload';
import { DOCUMENT_LEGEND_KEYS } from '@/modules/crew/lib/documentState';
import type { CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';

const PROFILE = 'b0000000-0000-4000-8000-000000000015';
const USER = 'a0000000-0000-4000-8000-000000000015';
const COMPANY = 'c0000000-0000-4000-8000-000000000001';
const VESSEL = { id: 'v-dra', companyId: COMPANY, name: 'DRAAK' };

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;

const category = (key: string, label: string, tab: CrewDocumentCategoryRow['tab'], sort_order: number): CrewDocumentCategoryRow => ({
  key, label, tab, sort_order, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});
const CATEGORIES = [
  category('passports', 'Passports', 'documents', 10),
  category('visas', 'Visas', 'documents', 30),
  category('medical_fitness', 'Medical fitness', 'documents', 50),
  category('stcw_basic', 'STCW basic training', 'stcw', 100),
  category('culinary', 'Culinary', 'qualifications', 300),
];
const typeRow = (over: Partial<CrewDocumentTypeRow>): CrewDocumentTypeRow => ({
  id: 't', company_id: null, category_key: 'passports', key: 'k', name: 'N', code: null, abbreviation: null, stcw_reference: null,
  field_schema: {}, default_validity_months: null, endorsement_interval_months: null, expiry_item_type: 'crew_document',
  is_identity: false, is_medical_fitness: false, is_active: true, sort_order: 10, created_by: null, updated_by: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
});
const TYPES = [
  typeRow({ id: 't-pp', key: 'passport', name: 'Passport', code: 'PASSPORT', abbreviation: 'PP', expiry_item_type: 'passport', is_identity: true, field_schema: { issuing_office: 'optional' } }),
  typeRow({ id: 't-visa', key: 'visa_us', category_key: 'visas', name: 'United States visitor visa', expiry_item_type: 'visa', field_schema: { entries: 'optional' } }),
  typeRow({ id: 't-eng1', key: 'eng1', category_key: 'medical_fitness', name: 'ENG1 seafarer medical certificate', code: 'ENG1', expiry_item_type: 'medical', is_medical_fitness: true }),
  typeRow({ id: 't-bst', key: 'bst', category_key: 'stcw_basic', name: 'Basic safety training', abbreviation: 'BST', stcw_reference: 'STCW A-VI/1', expiry_item_type: 'crew_qualification' }),
  typeRow({ id: 't-food', key: 'food', category_key: 'culinary', name: 'Food hygiene', expiry_item_type: 'crew_qualification' }),
];

const row = (over: Partial<CrewDocumentRpcRow>): CrewDocumentRpcRow => ({
  id: 'd', profile_id: PROFILE, user_id: USER, document_type_id: 't-pp', type_key: 'passport', type_name: 'Passport', type_code: 'PASSPORT', type_abbreviation: 'PP',
  stcw_reference: null, category_key: 'passports', category_label: 'Passports', tab: 'documents', expiry_item_type: 'passport', is_identity: true, is_medical_fitness: false,
  field_schema: { issuing_office: 'optional' }, legacy_type: null, legacy_name: null, number: 'X1234567', issuing_country_code: 'GB', issuing_office: 'Passport office',
  issuing_authority: null, issue_date: '2020-03-01', expiry_date: '2030-03-01', no_expiry: false, endorsement_due_date: null, use_in_crew_report: true, details: {},
  notes: null, has_file: true, file_path: `${COMPANY}/crew/${PROFILE}/documents/u-passport.pdf`, file_url: null, file_name: 'passport.pdf', file_mime: 'application/pdf',
  file_size: 182000, verification_status: 'verified', verified_by: 'u9', verified_by_name: 'Demo Master', verified_at: '2026-11-01T10:00:00Z', verification_note: null,
  alerts_muted: false, muted_by: null, muted_at: null, muted_reason: null, source: 'manual', created_by: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  window_days: 270, bucket: 'valid', days_remaining: 1200, endorsement_state: null, state: 'valid', can_edit: true, can_delete: false, ...over,
});

const ROWS: CrewDocumentRpcRow[] = [
  row({ id: 'd-pp' }),
  row({
    id: 'd-visa', document_type_id: 't-visa', type_key: 'visa_us', type_name: 'United States visitor visa', type_code: null, type_abbreviation: 'B1/B2', category_key: 'visas',
    category_label: 'Visas', expiry_item_type: 'visa', is_identity: false, number: null, issuing_country_code: 'US', use_in_crew_report: false, expiry_date: '2026-12-08',
    bucket: 'expiring_soon', days_remaining: 12, state: 'expiring_soon', verification_status: 'unverified', verified_by: null, verified_by_name: null, verified_at: null,
  }),
  row({
    id: 'd-eng1', document_type_id: 't-eng1', type_key: 'eng1', type_name: 'ENG1 seafarer medical certificate', type_code: 'ENG1', type_abbreviation: 'ENG1', category_key: 'medical_fitness',
    category_label: 'Medical fitness', expiry_item_type: 'medical', is_identity: false, number: 'M-1', use_in_crew_report: false, expiry_date: '2026-10-01', bucket: 'expired',
    days_remaining: -56, state: 'expired', alerts_muted: true, muted_reason: 'Renewal booked',
  }),
  row({
    id: 'd-bst', document_type_id: 't-bst', type_key: 'bst', type_name: 'Basic safety training', type_code: null, type_abbreviation: 'BST', category_key: 'stcw_basic', category_label: 'STCW basic training',
    tab: 'stcw', expiry_item_type: 'crew_qualification', is_identity: false, use_in_crew_report: false, has_file: false, file_path: null, file_name: null, state: 'not_uploaded',
    verification_status: 'unverified', verified_at: null, verified_by_name: null,
  }),
  row({
    id: 'd-food', document_type_id: 't-food', type_key: 'food', type_name: 'Food hygiene', type_code: null, type_abbreviation: null, category_key: 'culinary', category_label: 'Culinary',
    tab: 'qualifications', expiry_item_type: 'crew_qualification', is_identity: false, use_in_crew_report: false, no_expiry: true, expiry_date: null, bucket: 'no_expiry', days_remaining: null,
    state: 'no_expiry', issuing_country_code: null, verification_status: 'rejected', verification_note: 'Unreadable scan',
  }),
  row({
    id: 'd-old', document_type_id: null, type_key: null, type_name: null, type_code: null, type_abbreviation: null, category_key: null, category_label: null, tab: 'qualifications',
    legacy_type: 'Other', legacy_name: 'Old certificate', expiry_item_type: 'crew_qualification', is_identity: false, use_in_crew_report: false, expiry_date: null, bucket: null,
    days_remaining: null, state: 'missing_date', has_file: false, file_path: null, issuing_country_code: null, verification_status: 'unverified', verified_at: null, verified_by_name: null,
  }),
];

const RIGHTS = { can_view: true, can_add: true, can_edit: true, is_own: false, uploads_enabled: false };

const summary: CrewProfileSummary = {
  profileId: PROFILE, userId: USER, firstName: 'Demo', lastName: 'Chief Stew', preferredName: null, displayName: 'Demo Chief Stew', avatarUrl: null, crewNumber: 'DRA-0015',
  positionName: 'Chief Stew', positionText: 'Chief Stew', departmentKey: 'interior', departmentLabel: 'Interior', rankTier: 'hod', onVessel: true, placementKind: 'assignment',
  assignmentId: 'a', joinDate: '2026-07-01', leaveDate: null, status: 'on_board', statusDetail: null, transferVesselId: null, leaveCode: null, loginState: 'active',
  prev: null, next: null, memberIndex: 1, memberCount: 2, isOwn: false, canEdit: true, canEditSelf: true, tabs: null, source: 'server',
};

const setServer = () => {
  h.rpc.crew_documents_for_profile = () => ({ data: ROWS, error: null });
  h.rpc.crew_document_rights = () => ({ data: [RIGHTS], error: null });
  h.tables.crew_document_categories = { data: CATEGORIES, error: null };
  h.tables.crew_document_types = { data: TYPES, error: null };
  h.tables.ref_countries = {
    data: [
      { iso2: 'GB', iso3: 'GBR', name: 'United Kingdom', demonym: 'British', dial_code: '44', flag_emoji: null, sort_name: 'United Kingdom' },
      { iso2: 'US', iso3: 'USA', name: 'United States', demonym: 'American', dial_code: '1', flag_emoji: null, sort_name: 'United States' },
    ],
    error: null,
  };
};

beforeEach(() => {
  h.rpc = {};
  h.rpcCalls = [];
  h.tables = {};
  h.signed = [];
  h.uploadsReady = true;
  setServer();
});

const renderTab = (tab: 'documents' | 'stcw' | 'qualifications' = 'documents') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DocumentsTab tab={tab} profile={summary} vessel={VESSEL} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const ready = async () => {
  await waitFor(() => expect(document.querySelector('[data-documents-state="ready"]')).not.toBeNull());
  return document.querySelector('[data-documents-state="ready"]') as HTMLElement;
};
const docRow = (id: string) => document.querySelector(`[data-document-row="${id}"]`) as HTMLElement;

// ---------------------------------------------------------------- grouping, Add, row text

describe('grouping', () => {
  it('groups by category in catalogue order, unclassified last, names sorted inside a group with the latest expiry first', async () => {
    h.rpc.crew_documents_for_profile = () => ({
      data: [ROWS[2], ROWS[0], ROWS[1], row({ id: 'd-pp2', expiry_date: '2033-01-01', use_in_crew_report: false }), row({ ...ROWS[5], tab: 'documents' })],
      error: null,
    });
    renderTab('documents');
    const panel = await ready();
    const groups = [...panel.querySelectorAll('[data-document-group]')].map((g) => [
      g.getAttribute('data-document-group'),
      [...g.querySelectorAll('[data-document-row]')].map((r) => r.getAttribute('data-document-row')),
    ]);
    expect(groups).toEqual([
      ['passports', ['d-pp2', 'd-pp']],
      ['visas', ['d-visa']],
      ['medical_fitness', ['d-eng1']],
      [UNCLASSIFIED_GROUP_KEY, ['d-old']],
    ]);
    expect(within(panel.querySelector(`[data-document-group="${UNCLASSIFIED_GROUP_KEY}"]`) as HTMLElement).getByText(UNCLASSIFIED_GROUP_LABEL)).toBeInTheDocument();
  });

  it('without the catalogue the groups take each row\'s own category label', async () => {
    h.tables.crew_document_categories = { data: null, error: { code: 'XX000', message: 'boom' } };
    renderTab('documents');
    const panel = await ready();
    await waitFor(() => expect(within(panel).getByRole('button', { name: /Load the document types again/ })).toBeInTheDocument(), { timeout: 4000 });
    expect([...panel.querySelectorAll('[data-document-group] h3, [data-document-group] [class*="type-subtitle"]')].map((e) => e.textContent?.replace(/\d+$/, ''))).toEqual([
      'Passports',
      'Visas',
      'Medical fitness',
    ]);
  });
});

describe('when Add is offered', () => {
  const addButton = (panel: HTMLElement) => within(panel).queryByRole('button', { name: 'Add document' });

  it('waits while the rights load (no text), then opens', async () => {
    let release: (v: { data: unknown; error: unknown }) => void = () => undefined;
    h.rpc.crew_document_rights = () => new Promise((resolve) => (release = resolve)) as never;
    renderTab('documents');
    const panel = await ready();
    expect(addButton(panel)).toBeDisabled();
    expect(addButton(panel)).toHaveAttribute('aria-busy', 'true');
    release({ data: [RIGHTS], error: null });
    await waitFor(() => expect(addButton(panel)).toBeEnabled());
  });

  it('a rights check that failed says so under the button', async () => {
    h.rpc.crew_document_rights = () => ({ data: null, error: { code: 'XX000', message: 'boom' } });
    renderTab('documents');
    const panel = await ready();
    await waitFor(() => expect(within(panel).getByText('Your rights to add documents could not be checked.')).toBeInTheDocument(), { timeout: 4000 });
    expect(addButton(panel)).toBeDisabled();
  });

  it('a catalogue that failed says so and offers to load it again', async () => {
    h.tables.crew_document_types = { data: null, error: { code: 'XX000', message: 'boom' } };
    renderTab('documents');
    const panel = await ready();
    await waitFor(() => expect(within(panel).getByText('The document types could not load.')).toBeInTheDocument(), { timeout: 4000 });
    expect(addButton(panel)).toBeDisabled();
    expect(within(panel).getByRole('button', { name: /Load the document types again/ })).toBeInTheDocument();
  });

  it('D-01: the catalogue tables missing keep it off with the catalogue notice', async () => {
    h.tables.crew_document_types = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.crew_document_types' in the schema cache" } };
    renderTab('documents');
    const panel = await ready();
    await waitFor(() => expect(panel.querySelector('[data-documents-notice]')).toHaveTextContent(CATALOGUE_MISSING_NOTICE));
    expect(addButton(panel)).toBeDisabled();
    // Rows stay; Edit needs the catalogue.
    expect(within(panel).queryByRole('button', { name: /^Edit / })).toBeNull();
  });
});

describe('row text and the legend', () => {
  it('the legend has the six entries of gap/04 C24, in order', async () => {
    renderTab('documents');
    const panel = await ready();
    const keys = [...(panel.querySelector('[data-document-legend]') as HTMLElement).querySelectorAll('[data-legend-key]')];
    expect(keys.map((k) => k.getAttribute('data-legend-key'))).toEqual([...DOCUMENT_LEGEND_KEYS]);
    expect(keys.map((k) => k.textContent?.replace(/\d+$/, ''))).toEqual(['Valid', 'Expiring', 'Expired', 'Missing', 'Alerts off', 'Not uploaded']);
  });

  it('reviewed by and on only once reviewed; a reviewer without a name reads "a reviewer"', async () => {
    h.rpc.crew_documents_for_profile = () => ({
      data: [ROWS[0], row({ id: 'd-pp2', verified_by_name: null, use_in_crew_report: false }), ROWS[1]],
      error: null,
    });
    renderTab('documents');
    await ready();
    expect(within(docRow('d-pp')).getByText('Reviewed by Demo Master on 1 Nov 2026')).toBeInTheDocument();
    expect(within(docRow('d-pp2')).getByText('Reviewed by a reviewer on 1 Nov 2026')).toBeInTheDocument();
    expect(docRow('d-visa').querySelector('[data-document-reviewed]')).toBeNull();
  });
});

// ---------------------------------------------------------------- the tab

describe('the Documents tab', () => {
  it('shows only its own documents, in category groups with counts and + Add', async () => {
    renderTab('documents');
    const panel = await ready();
    expect(within(panel).getByRole('heading', { level: 2, name: 'Documents' })).toBeInTheDocument();
    const groups = [...panel.querySelectorAll('[data-document-group]')].map((g) => g.getAttribute('data-document-group'));
    expect(groups).toEqual(['passports', 'visas', 'medical_fitness']);
    const passports = panel.querySelector('[data-document-group="passports"]') as HTMLElement;
    expect(within(passports).getByLabelText('1 documents')).toBeInTheDocument();
    await waitFor(() => expect(within(passports).getByRole('button', { name: 'Add to Passports' })).toBeEnabled());
    expect(docRow('d-bst')).toBeNull();
    expect(docRow('d-food')).toBeNull();
    expect(h.rpcCalls.find((c) => c.fn === 'crew_documents_for_profile')?.args).toEqual({ p_profile_id: PROFILE });
  });

  it('the legend counts this tab\'s documents (alerts off first: it raises nothing)', async () => {
    renderTab('documents');
    const panel = await ready();
    const legend = panel.querySelector('[data-document-legend]') as HTMLElement;
    const count = (key: string) => legend.querySelector(`[data-legend-key="${key}"]`)?.textContent;
    expect(count('valid')).toBe('Valid1');
    expect(count('expiring')).toBe('Expiring1');
    expect(count('expired')).toBe('Expired0');
    expect(count('alerts_off')).toBe('Alerts off1');
    expect(count('missing_date')).toBe('Missing0');
    expect(count('not_uploaded')).toBe('Not uploaded0');
  });

  it('a row: expiry pill, name and abbreviation, number, issuing country, expiry, verification and who reviewed it', async () => {
    renderTab('documents');
    await ready();
    const pp = docRow('d-pp');
    expect(within(pp).getByText('Passport')).toBeInTheDocument();
    expect(within(pp).getByText('PP')).toBeInTheDocument();
    expect(within(pp).getByText('X1234567')).toBeInTheDocument();
    await waitFor(() => expect(within(pp).getByText('United Kingdom')).toBeInTheDocument());
    expect(within(pp).getByText('1 Mar 2030')).toBeInTheDocument();
    expect(pp.querySelector('[data-bucket="valid"]')).not.toBeNull();
    expect(within(pp).getByText('Verified')).toBeInTheDocument();
    expect(within(pp).getByText('Reviewed by Demo Master on 1 Nov 2026')).toBeInTheDocument();

    const visa = docRow('d-visa');
    expect(visa.querySelector('[data-bucket="expiring_soon"]')).not.toBeNull();
    expect(within(visa).getByText('Not yet verified')).toBeInTheDocument();
    expect(within(visa).getByText('Not recorded')).toBeInTheDocument();
    expect(visa.querySelector('[data-document-reviewed]')).toBeNull();

    // Alerts off keeps the real state first.
    const eng1 = docRow('d-eng1');
    const pills = [...eng1.querySelectorAll('[data-tone]')].map((p) => p.textContent);
    expect(pills[0]).toMatch(/^Expired/);
    expect(pills).toContain('Alerts off');
  });

  it('STCW: a document without a file says so and has no View', async () => {
    renderTab('stcw');
    await ready();
    const bst = docRow('d-bst');
    expect(within(bst).getByText('No file attached')).toBeInTheDocument();
    expect(within(bst).queryByRole('button', { name: /View/ })).toBeNull();
    expect(within(bst).getByRole('button', { name: 'Edit Basic safety training' })).toBeInTheDocument();
  });

  it('Qualifications: No expiry, a missing date reads Expiry unknown, the unclassified group last, a reviewer\'s note', async () => {
    renderTab('qualifications');
    const panel = await ready();
    const food = docRow('d-food');
    expect(within(food).getAllByText('No expiry').length).toBeGreaterThanOrEqual(1);
    expect(within(food).getByText('Rejected')).toBeInTheDocument();
    expect(within(food).getByText('Note: Unreadable scan')).toBeInTheDocument();
    const old = docRow('d-old');
    expect(within(old).getByText('Expiry unknown')).toBeInTheDocument();
    expect(within(old).getByText('Expiry date missing')).toBeInTheDocument();
    expect(within(old).queryByRole('button', { name: /Edit/ })).toBeNull();
    const groups = [...panel.querySelectorAll('[data-document-group]')].map((g) => g.getAttribute('data-document-group'));
    expect(groups).toEqual(['culinary', UNCLASSIFIED_GROUP_KEY]);
    const unclassified = panel.querySelector(`[data-document-group="${UNCLASSIFIED_GROUP_KEY}"]`) as HTMLElement;
    expect(within(unclassified).queryByRole('button', { name: /Add to/ })).toBeNull();
  });

  it('View asks for a signed URL of the stored path and shows the file', async () => {
    renderTab('documents');
    await ready();
    fireEvent.click(within(docRow('d-pp')).getByRole('button', { name: 'View Passport' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByTitle('Passport, the uploaded file')).toBeInTheDocument());
    expect(h.signed).toEqual([`${COMPANY}/crew/${PROFILE}/documents/u-passport.pdf`]);
    expect(within(dialog).getByRole('link', { name: /Open in a new tab/ })).toHaveAttribute('href', expect.stringContaining('https://signed.example.test/'));
  });

  it('without the right to add or change: no Add and no Edit', async () => {
    h.rpc.crew_document_rights = () => ({ data: [{ ...RIGHTS, can_add: false, can_edit: false }], error: null });
    renderTab('documents');
    const panel = await ready();
    await waitFor(() => expect(h.rpcCalls.some((c) => c.fn === 'crew_document_rights')).toBe(true));
    await waitFor(() => expect(within(panel).queryByRole('button', { name: 'Add document' })).toBeNull());
    expect(within(panel).queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(within(panel).getAllByRole('button', { name: /^View / }).length).toBeGreaterThan(0);
  });

  it('Add opens the two-step dialog on this tab', async () => {
    renderTab('stcw');
    const panel = await ready();
    const add = within(panel).getByRole('button', { name: 'Add document' });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Step 1 of 2')).toBeInTheDocument();
    const tabs = within(dialog).getByRole('group', { name: 'Profile tab' });
    expect(within(tabs).getByRole('button', { name: /^STCW/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('an empty tab says so and offers Add', async () => {
    h.rpc.crew_documents_for_profile = () => ({ data: [ROWS[0]], error: null });
    renderTab('stcw');
    const panel = await ready();
    expect(within(panel).getByText('No STCW certificates recorded yet')).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getAllByRole('button', { name: 'Add document' })).toHaveLength(2));
  });
});

describe('states', () => {
  it('loading: a skeleton, no rows', () => {
    h.rpc.crew_documents_for_profile = () => new Promise(() => undefined) as never;
    renderTab('documents');
    expect(document.querySelector('[data-documents-state="loading"] [aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('[data-document-row]')).toBeNull();
  });

  it('D-01: the RPC missing shows the legacy rows read-only, with the notice and Add off', async () => {
    delete h.rpc.crew_documents_for_profile;
    delete h.rpc.crew_document_rights;
    h.tables.crew_certificates = {
      data: [
        {
          id: 'l-1', user_id: USER, certificate_type: 'Passport', certificate_name: 'Passport', certificate_number: 'P-9', issuing_authority: null,
          issue_date: '2019-01-01', expiry_date: '2029-01-01', file_url: 'legacy/passport.pdf', file_name: 'passport.pdf', file_size: 1, notes: null,
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    };
    renderTab('documents');
    const panel = await ready();
    expect(panel).toHaveAttribute('data-documents-source', 'fallback');
    expect(panel.querySelector('[data-documents-notice]')).toHaveTextContent(CATALOGUE_MISSING_NOTICE);
    expect(within(panel).getByRole('button', { name: 'Add document' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Add document' })).toHaveAccessibleDescription(CATALOGUE_MISSING_NOTICE);
    const legacy = docRow('l-1');
    expect(legacy).toHaveAttribute('data-legacy', 'true');
    expect(within(legacy).queryByRole('button', { name: /Edit/ })).toBeNull();
    expect(within(legacy).queryByText('Not yet verified')).toBeNull();
    expect(within(legacy).getByRole('button', { name: 'View Passport' })).toBeInTheDocument();
  });

  describe('documents STORM could not file by type (x1-stcw-fallback-empty-state)', () => {
    const legacyCert = (over: Record<string, unknown>) => ({
      id: 'l-mfa', user_id: USER, certificate_type: 'Medical_Care', certificate_name: 'Medical First Aid', certificate_number: 'STCW-4104', issuing_authority: null,
      issue_date: '2022-01-31', expiry_date: '2027-01-31', file_url: null, file_name: null, file_size: null, notes: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      ...over,
    });
    const fallbackWith = (rows: Array<Record<string, unknown>>) => {
      delete h.rpc.crew_documents_for_profile;
      delete h.rpc.crew_document_rights;
      h.tables.crew_certificates = { data: rows, error: null };
    };
    const renderInScope = (tab: 'documents' | 'stcw' | 'qualifications') => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const scope = { scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', name: 'DRAAK' } } as unknown as ScopeValue;
      return render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <ScopeContext.Provider value={scope}>
              <DocumentsTab tab={tab} profile={summary} vessel={VESSEL} />
            </ScopeContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    };

    it('a fallback row that maps to nothing: STCW does not claim nothing is recorded, and points to Qualifications', async () => {
      fallbackWith([legacyCert({})]);
      renderInScope('stcw');
      const panel = await ready();
      expect(panel).toHaveAttribute('data-documents-source', 'fallback');
      expect(panel.querySelector('[data-document-row]')).toBeNull();
      expect(within(panel).queryByText(/recorded yet/)).toBeNull();
      expect(within(panel).queryByText('None are recorded for this person on this tab.')).toBeNull();
      expect(within(panel).getByRole('heading', { name: 'No STCW certificates filed here' })).toBeInTheDocument();
      const pointer = panel.querySelector('[data-unclassified-pointer]') as HTMLElement;
      expect(pointer).toHaveTextContent('1 document STORM could not file by type is listed under Qualifications, Not classified yet.');
      expect(within(pointer).getByRole('link', { name: `Qualifications, ${UNCLASSIFIED_GROUP_LABEL}` })).toHaveAttribute(
        'href',
        `/v/dra/crew/people/${PROFILE}/qualifications`,
      );
    });

    it('the row itself is on Qualifications, Not classified yet, with no pointer there', async () => {
      fallbackWith([legacyCert({})]);
      renderInScope('qualifications');
      const panel = await ready();
      expect(panel.querySelector(`[data-document-group="${UNCLASSIFIED_GROUP_KEY}"]`)).not.toBeNull();
      expect(panel.querySelector('[data-unclassified-pointer]')).toBeNull();
    });

    it('a tab with rows of its own still says where the unfiled ones are (plural)', async () => {
      fallbackWith([
        legacyCert({}),
        legacyCert({ id: 'l-x', certificate_type: 'Other_Thing', certificate_name: 'Something else' }),
        legacyCert({ id: 'l-pp', certificate_type: 'Passport', certificate_name: 'Passport', certificate_number: 'P-9' }),
      ]);
      renderInScope('documents');
      const panel = await ready();
      expect(docRow('l-pp')).not.toBeNull();
      expect(panel.querySelector('[data-unclassified-pointer]')).toHaveTextContent('2 documents STORM could not file by type are listed under Qualifications, Not classified yet.');
    });

    it('server mode too: a row with no category and no type is pointed to from the other tabs', async () => {
      h.rpc.crew_documents_for_profile = () => ({
        data: [row({ id: 'd-unc', document_type_id: null, type_key: null, type_name: null, category_key: null, category_label: null, tab: 'qualifications', legacy_type: 'Medical_Care', legacy_name: 'Medical First Aid' })],
        error: null,
      });
      renderInScope('stcw');
      const panel = await ready();
      expect(panel).toHaveAttribute('data-documents-source', 'server');
      expect(within(panel).getByRole('heading', { name: 'No STCW certificates filed here' })).toBeInTheDocument();
      expect(panel.querySelector('[data-unclassified-pointer="1"]')).not.toBeNull();
    });

    it('a mapped STCW row files on STCW; no pointer anywhere, Qualifications keeps its own empty state', async () => {
      fallbackWith([legacyCert({ certificate_type: 'STCW Medical First Aid (VI/4)' })]);
      renderInScope('stcw');
      const panel = await ready();
      expect(docRow('l-mfa')).not.toBeNull();
      expect(panel.querySelector('[data-unclassified-pointer]')).toBeNull();
    });

    it('a mapped STCW row: the Qualifications tab shows no pointer and its usual empty state', async () => {
      fallbackWith([legacyCert({ certificate_type: 'STCW Medical First Aid (VI/4)' })]);
      renderInScope('qualifications');
      const panel = await ready();
      expect(panel.querySelector('[data-unclassified-pointer]')).toBeNull();
      expect(within(panel).getByRole('heading', { name: 'No qualifications recorded yet' })).toBeInTheDocument();
    });
  });

  it('D-01: the storage helper missing keeps Add off with its sentence', async () => {
    h.uploadsReady = false;
    renderTab('documents');
    const panel = await ready();
    await waitFor(() => expect(panel.querySelector('[data-documents-notice]')).toHaveTextContent(UPLOADS_UNAVAILABLE_NOTICE));
    expect(within(panel).getByRole('button', { name: 'Add document' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Add document' })).toHaveAccessibleDescription(UPLOADS_UNAVAILABLE_NOTICE);
    expect(within(panel).queryByRole('button', { name: /^Add to / })).toBeNull();
  });

  it('any other error is an error with Try again, which asks again', async () => {
    let calls = 0;
    h.rpc.crew_documents_for_profile = () => {
      calls += 1;
      // The hook retries once by itself; both answers fail, then Try again succeeds.
      return calls <= 2 ? { data: null, error: { code: 'XX000', message: 'database is down' } } : { data: ROWS, error: null };
    };
    renderTab('documents');
    await waitFor(() => expect(document.querySelector('[data-documents-state="error"]')).not.toBeNull(), { timeout: 4000 });
    expect(screen.getByText('The documents could not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await ready();
    expect(calls).toBe(3);
  });

  it('42501 reads as no access, never as no documents', async () => {
    h.rpc.crew_documents_for_profile = () => ({ data: null, error: { code: '42501', message: 'crew_not_permitted', details: 'No.' } });
    renderTab('documents');
    await waitFor(() => expect(document.querySelector('[data-documents-state="denied"]')).not.toBeNull());
    expect(screen.getByRole('heading', { name: "You can't see these documents" })).toBeInTheDocument();
    expect(document.querySelector('[data-document-row]')).toBeNull();
  });
});

describe('390 px', () => {
  it('rows wrap, the facts grid has two columns below sm, and nothing has a fixed width', async () => {
    renderTab('documents');
    await ready();
    const pp = docRow('d-pp');
    expect(pp.firstElementChild?.className).toMatch(/flex-wrap/);
    expect(pp.querySelector('dl')?.className).toMatch(/grid-cols-2 /);
    expect(pp.querySelector('dl')?.className).toMatch(/sm:grid-cols-3/);
    for (const el of document.querySelectorAll('[data-documents-state] *')) expect(el.getAttribute('class') ?? '').not.toMatch(/(^|\s)w-\[\d{3,}px\]/);
  });
});
