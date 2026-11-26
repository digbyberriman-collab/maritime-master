/**
 * The crew document hooks (X1-04; gap/04 C23, C24, C26; DECISIONS D-01):
 *
 * - fetchCrewDocuments / useCrewDocuments: the server rows with the state the
 *   server computed; the D-01 fallback (the RPC missing as PGRST202, a 42883
 *   naming it, or a missing catalogue table) to the person's legacy rows by
 *   login, explicit columns, read-only, state from documentState.ts with the
 *   legacy status ignored, the catalogue-missing notice; a person without a
 *   login reads nothing; any other error is an error with Retry; disabled
 *   sends nothing;
 * - rights, saving and removing (affected-row checks, refusals as sent, the
 *   not-applied notice), issuing suggestions;
 * - useDocumentTypes: the catalogue in category order with tabs, not set up
 *   (D-01), errors; keys carry the company; search and grouping.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  rpc: {} as Record<string, Result>,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  tables: {} as Record<string, Result>,
  selects: {} as Record<string, string>,
  filters: [] as Array<[string, string, unknown]>,
  fromCalls: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const result = (): Result => h.tables[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    chain.select = (columns: string) => {
      h.selects[table] = columns;
      return chain;
    };
    chain.eq = (column: string, value: unknown) => {
      h.filters.push([table, column, value]);
      return chain;
    };
    for (const m of ['in', 'order', 'limit']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  const rpc = (fn: string, args: unknown) => {
    h.rpcCalls.push({ fn, args });
    return Promise.resolve(h.rpc[fn] ?? { data: null, error: null });
  };
  return { supabase: { from, rpc } };
});

import {
  CrewDocumentWriteError,
  LEGACY_DOCUMENT_COLUMNS,
  deleteCrewDocument,
  fetchCrewDocuments,
  fetchIssuingSuggestions,
  saveCrewDocument,
  useCrewDocumentRights,
  useCrewDocuments,
} from '@/modules/crew/hooks/useCrewDocuments';
import { crewDocumentKeys, searchDocumentTypes, typesByCategory, useDocumentTypes, type DocumentType } from '@/modules/crew/hooks/useDocumentTypes';
import { CATALOGUE_MISSING_NOTICE, SAVE_UNAVAILABLE_NOTICE } from '@/modules/crew/lib/crewDocumentSchema';
import type { CrewDocumentRpcRow } from '@/modules/crew/types/db.pending';

const PROFILE = 'b0000000-0000-4000-8000-000000000015';
const USER = 'a0000000-0000-4000-8000-000000000015';
const COMPANY = 'c0000000-0000-4000-8000-000000000001';
const TODAY = '2026-11-22';

const serverRow = (over: Partial<CrewDocumentRpcRow>): CrewDocumentRpcRow => ({
  id: 'd1', profile_id: PROFILE, user_id: USER,
  document_type_id: 't1', type_key: 'eng1', type_name: 'ENG1 seafarer medical certificate', type_code: 'ENG1', type_abbreviation: 'ENG1', stcw_reference: 'STCW I/9',
  category_key: 'medical_fitness', category_label: 'Medical fitness', tab: 'documents', expiry_item_type: 'medical', is_identity: false, is_medical_fitness: true,
  field_schema: { limitations: 'optional', issuing_office: 'optional', colour: 'x' }, legacy_type: 'Medical', legacy_name: 'ENG1',
  number: 'M-1', issuing_country_code: 'GB', issuing_office: null, issuing_authority: 'Approved doctor',
  issue_date: '2025-01-01', expiry_date: '2027-01-01', no_expiry: false, endorsement_due_date: null, use_in_crew_report: false,
  details: {}, notes: null, has_file: true, file_path: null, file_url: 'legacy/eng1.pdf', file_name: 'eng1.pdf', file_mime: null, file_size: 10,
  verification_status: 'verified', verified_by: 'u9', verified_by_name: 'Demo Master', verified_at: '2026-11-01T10:00:00Z', verification_note: null,
  alerts_muted: false, muted_by: null, muted_at: null, muted_reason: null, source: 'manual', created_by: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  window_days: 90, bucket: 'valid', days_remaining: 405, endorsement_state: null, state: 'valid', can_edit: true, can_delete: false,
  ...over,
});

const legacyRow = (over: Record<string, unknown>) => ({
  id: 'l1', user_id: USER, certificate_type: 'Passport', certificate_name: 'Passport', certificate_number: 'P1', issuing_authority: 'Passport office',
  issue_date: '2020-01-01', expiry_date: '2027-08-19', file_url: 'legacy/p.pdf', file_name: 'p.pdf', file_size: 3, notes: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', status: 'Expired', ...over,
});

const MISSING_RPC = { code: 'PGRST202', message: 'Could not find the function public.crew_documents_for_profile(p_profile_id) in the schema cache' };

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.rpc = {};
  h.rpcCalls = [];
  h.tables = {};
  h.selects = {};
  h.filters = [];
  h.fromCalls = [];
});

describe('fetchCrewDocuments', () => {
  it('reads the server rows with the state the server computed', async () => {
    h.rpc.crew_documents_for_profile = { data: [serverRow({}), serverRow({ id: 'd2', state: 'missing_date', bucket: null, days_remaining: null, type_name: null, legacy_name: 'Old course', tab: 'qualifications' })], error: null };
    const r = await fetchCrewDocuments(PROFILE, USER, TODAY);
    expect(h.rpcCalls).toEqual([{ fn: 'crew_documents_for_profile', args: { p_profile_id: PROFILE } }]);
    expect(h.fromCalls).toEqual([]);
    expect(r.source).toBe('server');
    expect(r.documents[0]).toMatchObject({
      id: 'd1', name: 'ENG1 seafarer medical certificate', tab: 'documents', isMedicalFitness: true, issuingOffice: 'Approved doctor',
      fieldSchema: { limitations: 'optional', issuing_office: 'optional' }, verifiedByName: 'Demo Master', canEdit: true, canDelete: false, legacy: false,
      state: { state: 'valid', bucket: 'valid', daysRemaining: 405, windowDays: 90, needsAttention: false },
    });
    expect(r.documents[1]).toMatchObject({ name: 'Old course', tab: 'qualifications', state: { state: 'missing_date', bucket: null, incomplete: true } });
  });

  it.each([
    ['PGRST202', MISSING_RPC],
    ['a 42883 naming the function', { code: '42883', message: 'function public.crew_documents_for_profile(uuid) does not exist' }],
    ['a missing catalogue table', { code: '42P01', message: 'relation "public.crew_document_types" does not exist' }],
  ])('falls back to the legacy rows by login when the server is not applied (%s)', async (_label, error) => {
    h.rpc.crew_documents_for_profile = { data: null, error };
    h.tables.crew_certificates = {
      data: [
        legacyRow({}),
        legacyRow({ id: 'l2', certificate_type: 'Medical', certificate_name: 'ENG1 Medical Certificate', expiry_date: null, status: 'Valid' }),
        legacyRow({ id: 'l3', certificate_type: 'STCW Basic Safety Training (VI/1)', certificate_name: 'BST', expiry_date: '2026-12-01', file_url: null }),
      ],
      error: null,
    };
    const r = await fetchCrewDocuments(PROFILE, USER, TODAY);
    expect(r.source).toBe('fallback');
    expect(h.selects.crew_certificates).toBe(LEGACY_DOCUMENT_COLUMNS);
    expect(LEGACY_DOCUMENT_COLUMNS).not.toMatch(/\bstatus\b|\*/);
    expect(h.filters).toContainEqual(['crew_certificates', 'user_id', USER]);
    const [passport, eng1, bst] = r.documents;
    expect(passport).toMatchObject({ tab: 'documents', itemType: 'passport', legacy: true, canEdit: false, canDelete: false, state: { state: 'expiring', windowDays: 270, daysRemaining: 270 } });
    expect(eng1).toMatchObject({ tab: 'documents', itemType: 'medical', state: { state: 'missing_date', bucket: null } });
    expect(bst).toMatchObject({ tab: 'stcw', state: { state: 'not_uploaded', bucket: 'expiring_soon' } });
  });

  it('a person without a login has no legacy rows: nothing is read', async () => {
    h.rpc.crew_documents_for_profile = { data: null, error: MISSING_RPC };
    expect(await fetchCrewDocuments(PROFILE, null, TODAY)).toEqual({ source: 'fallback', documents: [] });
    expect(h.fromCalls).toEqual([]);
  });

  it.each([
    ['a 42501 refusal', { code: '42501', message: 'crew_not_permitted', details: "You don't have permission to see this person's documents." }],
    ['an unknown person', { code: 'P0002', message: 'profile_not_found' }],
    ['a 42883 for another function', { code: '42883', message: 'function public.expiry_bucket(date, integer, date, boolean) does not exist' }],
    ['a network error', { code: '', message: 'Failed to fetch' }],
  ])('throws %s (PageError with Retry), never a fallback', async (_label, error) => {
    h.rpc.crew_documents_for_profile = { data: null, error };
    await expect(fetchCrewDocuments(PROFILE, USER, TODAY)).rejects.toBe(error);
    expect(h.fromCalls).toEqual([]);
  });

  it('a legacy read error is thrown', async () => {
    h.rpc.crew_documents_for_profile = { data: null, error: MISSING_RPC };
    const error = { code: '500', message: 'boom' };
    h.tables.crew_certificates = { data: null, error };
    await expect(fetchCrewDocuments(PROFILE, USER, TODAY)).rejects.toBe(error);
  });
});

describe('useCrewDocuments', () => {
  it('disabled (a gate loading or denied, no company): idle, nothing sent', () => {
    const { result } = renderHook(() => useCrewDocuments(PROFILE, { companyId: COMPANY, userId: USER, enabled: false }), { wrapper: wrapper() });
    expect(result.current).toEqual({ status: 'idle' });
    const { result: noCompany } = renderHook(() => useCrewDocuments(PROFILE, { companyId: null, userId: USER }), { wrapper: wrapper() });
    expect(noCompany.current.status).toBe('idle');
    expect(h.rpcCalls).toEqual([]);
  });

  it('server rows: ready, editable', async () => {
    h.rpc.crew_documents_for_profile = { data: [serverRow({})], error: null };
    const { result } = renderHook(() => useCrewDocuments(PROFILE, { companyId: COMPANY, userId: USER }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ status: 'ready', source: 'server', catalogueMissing: false, readOnly: false, notice: null });
  });

  it('the fallback: read-only with the catalogue-missing notice (Add off)', async () => {
    h.rpc.crew_documents_for_profile = { data: null, error: MISSING_RPC };
    h.tables.crew_certificates = { data: [legacyRow({})], error: null };
    const { result } = renderHook(() => useCrewDocuments(PROFILE, { companyId: COMPANY, userId: USER }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ source: 'fallback', catalogueMissing: true, readOnly: true, notice: CATALOGUE_MISSING_NOTICE });
    expect(h.rpcCalls).toHaveLength(1);
  });

  it('a refusal is an error state with Retry, not retried', async () => {
    h.rpc.crew_documents_for_profile = { data: null, error: { code: '42501', message: 'crew_not_permitted' } };
    const { result } = renderHook(() => useCrewDocuments(PROFILE, { companyId: COMPANY, userId: USER }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(h.rpcCalls).toHaveLength(1);
    h.rpc.crew_documents_for_profile = { data: [], error: null };
    if (result.current.status === 'error') result.current.retry();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});

describe('rights', () => {
  it('maps the one row', async () => {
    h.rpc.crew_document_rights = { data: [{ can_view: true, can_add: true, can_edit: false, is_own: true, uploads_enabled: true }], error: null };
    const { result } = renderHook(() => useCrewDocumentRights(PROFILE, { companyId: COMPANY }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toEqual({ status: 'ready', rights: { canView: true, canAdd: true, canEdit: false, isOwn: true, uploadsEnabled: true } });
  });

  it('not applied: unknown (Add stays off); disabled: idle', async () => {
    h.rpc.crew_document_rights = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_document_rights' } };
    const { result } = renderHook(() => useCrewDocumentRights(PROFILE, { companyId: COMPANY }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('unknown'));
    const { result: idle } = renderHook(() => useCrewDocumentRights(PROFILE, { companyId: COMPANY, enabled: false }), { wrapper: wrapper() });
    expect(idle.current.status).toBe('idle');
  });
});

describe('writes', () => {
  it('a save returns the stored id', async () => {
    h.rpc.crew_document_save = { data: { id: 'new-1' }, error: null };
    await expect(saveCrewDocument({ id: null, profileId: PROFILE, documentTypeId: 't1', payload: { number: 'X' } })).resolves.toBe('new-1');
    expect(h.rpcCalls[0]).toEqual({ fn: 'crew_document_save', args: { p_id: null, p_profile_id: PROFILE, p_document_type_id: 't1', p_payload: { number: 'X' } } });
  });

  it('no row, or another row, back: not saved (no fake success)', async () => {
    h.rpc.crew_document_save = { data: null, error: null };
    await expect(saveCrewDocument({ id: null, profileId: PROFILE, documentTypeId: 't1', payload: {} })).rejects.toBeInstanceOf(CrewDocumentWriteError);
    h.rpc.crew_document_save = { data: { id: 'other' }, error: null };
    await expect(saveCrewDocument({ id: 'd1', profileId: PROFILE, documentTypeId: null, payload: {} })).rejects.toThrow('The document was not saved. Try again.');
  });

  it('a refusal is thrown as the server sent it; not applied says so', async () => {
    const refusal = { code: '22023', message: 'crew_report_passport_exists', details: 'Another passport is already used in the crew report. Turn it off there first.', hint: 'use_in_crew_report' };
    h.rpc.crew_document_save = { data: null, error: refusal };
    await expect(saveCrewDocument({ id: null, profileId: PROFILE, documentTypeId: 't1', payload: {} })).rejects.toBe(refusal);
    h.rpc.crew_document_save = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_document_save' } };
    await expect(saveCrewDocument({ id: null, profileId: PROFILE, documentTypeId: 't1', payload: {} })).rejects.toMatchObject({ notApplied: true, message: SAVE_UNAVAILABLE_NOTICE });
  });

  it('a removal must answer the same id', async () => {
    h.rpc.crew_document_delete = { data: 'd1', error: null };
    await expect(deleteCrewDocument('d1', 'Replaced')).resolves.toBe('d1');
    expect(h.rpcCalls.at(-1)).toEqual({ fn: 'crew_document_delete', args: { p_id: 'd1', p_reason: 'Replaced' } });
    h.rpc.crew_document_delete = { data: null, error: null };
    await expect(deleteCrewDocument('d1', null)).rejects.toThrow('The document was not removed. Try again.');
    const refused = { code: '42501', message: 'crew_document_delete_refused' };
    h.rpc.crew_document_delete = { data: null, error: refused };
    await expect(deleteCrewDocument('d1', null)).rejects.toBe(refused);
  });

  it('issuing suggestions: mapped, none while not applied, other errors thrown', async () => {
    h.rpc.crew_document_issuing_suggestions = { data: [{ issuing_office: 'Training Centre North', uses: 3 }], error: null };
    await expect(fetchIssuingSuggestions('t1')).resolves.toEqual([{ office: 'Training Centre North', uses: 3 }]);
    h.rpc.crew_document_issuing_suggestions = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    await expect(fetchIssuingSuggestions('t1')).resolves.toEqual([]);
    const refused = { code: '42501', message: 'crew_not_permitted' };
    h.rpc.crew_document_issuing_suggestions = { data: null, error: refused };
    await expect(fetchIssuingSuggestions('t1')).rejects.toBe(refused);
  });
});

describe('useDocumentTypes', () => {
  const type = (over: Record<string, unknown>) => ({
    id: 't', company_id: null, category_key: 'stcw_basic', key: 'k', name: 'N', code: null, abbreviation: null, stcw_reference: null,
    field_schema: {}, default_validity_months: null, endorsement_interval_months: null, expiry_item_type: 'crew_qualification',
    is_identity: false, is_medical_fitness: false, is_active: true, sort_order: 10, ...over,
  });

  it('the catalogue in category order, each type on the tab of its category', async () => {
    h.tables.crew_document_categories = {
      data: [
        { key: 'passports', label: 'Passports', tab: 'documents', sort_order: 10, is_active: true },
        { key: 'stcw_basic', label: 'Basic safety (STCW VI/1)', tab: 'stcw', sort_order: 110, is_active: true },
      ],
      error: null,
    };
    h.tables.crew_document_types = {
      data: [
        type({ id: 'pst', key: 'stcw_pst', name: 'Personal survival techniques', abbreviation: 'PST', sort_order: 20 }),
        type({ id: 'bst', key: 'stcw_basic_safety', name: 'Basic safety training', code: 'STCW-BST', sort_order: 10 }),
        type({ id: 'pp', key: 'passport', name: 'Passport', category_key: 'passports', expiry_item_type: 'passport', is_identity: true, field_schema: { issuing_office: 'optional' } }),
        type({ id: 'old', key: 'old', name: 'Retired', is_active: false, sort_order: 5 }),
      ],
      error: null,
    };
    const { result } = renderHook(() => useDocumentTypes(COMPANY), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('not ready');
    const { catalogue } = result.current;
    expect(catalogue.types.map((t) => t.id)).toEqual(['pp', 'old', 'bst', 'pst']);
    expect(catalogue.byId.get('pp')).toMatchObject({ tab: 'documents', itemType: 'passport', fieldSchema: { issuing_office: 'optional' } });
    expect(catalogue.byId.get('pst')?.tab).toBe('stcw');
    expect(h.selects.crew_document_types).not.toContain('*');
    expect(typesByCategory(catalogue, 'stcw').map((g) => [g.category.key, g.types.map((t) => t.id)])).toEqual([['stcw_basic', ['bst', 'pst']]]);
    expect(searchDocumentTypes(catalogue.types, 'pst').map((t) => t.id)).toEqual(['pst']);
    expect(searchDocumentTypes(catalogue.types, 'stcw bst').map((t) => t.id)).toEqual(['bst']);
    expect(searchDocumentTypes(catalogue.types, '').map((t) => t.id)).not.toContain('old');
  });

  it.each([
    ['42P01', { code: '42P01', message: 'relation "public.crew_document_categories" does not exist' }],
    ['PGRST205', { code: 'PGRST205', message: 'Could not find the table public.crew_document_types in the schema cache' }],
  ])('not set up while the catalogue is missing (%s)', async (_label, error) => {
    h.tables.crew_document_categories = { data: null, error };
    const { result } = renderHook(() => useDocumentTypes(COMPANY), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('not_set_up'));
  });

  it('another error: error with Retry; no company: idle', async () => {
    h.tables.crew_document_types = { data: null, error: { code: '42703', message: 'column crew_document_types.code does not exist' } };
    const { result } = renderHook(() => useDocumentTypes(COMPANY), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    const { result: idle } = renderHook(() => useDocumentTypes(null), { wrapper: wrapper() });
    expect(idle.current.status).toBe('idle');
  });

  it('every key carries the company', () => {
    expect(crewDocumentKeys.catalogue(COMPANY)).toEqual(['crew', 'company', COMPANY, 'documents', 'catalogue']);
    expect(crewDocumentKeys.person(COMPANY, PROFILE)).toEqual(['crew', 'company', COMPANY, 'documents', 'person', PROFILE]);
    expect(crewDocumentKeys.rights('x', PROFILE)[2]).toBe('x');
    expect(crewDocumentKeys.suggestions(COMPANY, null)).toEqual(['crew', 'company', COMPANY, 'documents', 'suggestions', 'none']);
  });

  it('search folds accents and case', () => {
    const types = [{ id: 'a', name: 'Sécurité', code: null, abbreviation: null, stcwReference: null, isActive: true }] as unknown as DocumentType[];
    expect(searchDocumentTypes(types, 'SECURITE')).toHaveLength(1);
  });
});
