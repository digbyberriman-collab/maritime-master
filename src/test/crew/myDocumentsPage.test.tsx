/**
 * The person's own documents at /me/documents (X1-04B; gap/04 C24-C26; X1
 * spec §4 personal row; PR-X1-J):
 *
 * - the gate: while vessel.crew.crew_certificates.view_own loads nothing is
 *   read and nothing shows; denied is AccessDenied with no request;
 * - a sign-in with no crew profile says so and reads nothing;
 * - populated: the page heading, the Documents / STCW / Qualifications tab
 *   row with counts (`?tab=`), the caller's own documents read-only (View,
 *   never Edit), Add only when the server says so (own uploads on, or crew
 *   certificate creation), and an explanation when it does not;
 * - D-01: the legacy rows read-only with the notice; any other error is an
 *   error with Try again;
 * - the tab row scrolls inside itself at 390 px.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CrewDocumentRpcRow } from '@/modules/crew/types/db.pending';

const PROFILE = 'b0000000-0000-4000-8000-000000000021';
const USER = 'a0000000-0000-4000-8000-000000000021';
const COMPANY = 'c0000000-0000-4000-8000-000000000001';

const h = vi.hoisted(() => ({
  gate: 'granted' as 'granted' | 'loading' | 'denied',
  gateKeys: [] as string[],
  profile: { id: 'b0000000-0000-4000-8000-000000000021', user_id: 'a0000000-0000-4000-8000-000000000021', company_id: 'c0000000-0000-4000-8000-000000000001' } as
    | { id: string; user_id: string; company_id: string | null }
    | null,
  rpc: {} as Record<string, () => { data: unknown; error: unknown }>,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(resolve, reject);
    return chain;
  };
  const rpc = (fn: string, args: unknown) => {
    h.rpcCalls.push({ fn, args });
    return Promise.resolve(h.rpc[fn] ? h.rpc[fn]() : { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });
  };
  return { supabase: { from, rpc, storage: { from: () => ({}) } } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => {
    h.gateKeys.push(key);
    return { allowed: h.gate === 'granted', status: h.gate, reason: 'test' };
  },
  useCan: () => h.gate === 'granted',
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.profile ? { id: h.profile.user_id, email: 'deckhand@example.test' } : { id: USER }, profile: h.profile, loading: false }),
}));

import MyDocumentsPage, { MY_DOCUMENTS_TITLE, NO_PROFILE_TITLE } from '@/modules/crew/pages/MyDocumentsPage';
import { CATALOGUE_MISSING_NOTICE } from '@/modules/crew/lib/crewDocumentSchema';
import { CREW_CAPS } from '@/modules/crew/paths';

const row = (over: Partial<CrewDocumentRpcRow>): CrewDocumentRpcRow => ({
  id: 'd', profile_id: PROFILE, user_id: USER, document_type_id: 't-pp', type_key: 'passport', type_name: 'Passport', type_code: 'PASSPORT', type_abbreviation: 'PP',
  stcw_reference: null, category_key: 'passports', category_label: 'Passports', tab: 'documents', expiry_item_type: 'passport', is_identity: true, is_medical_fitness: false,
  field_schema: {}, legacy_type: null, legacy_name: null, number: 'X1', issuing_country_code: null, issuing_office: null, issuing_authority: null, issue_date: '2020-01-01',
  expiry_date: '2030-01-01', no_expiry: false, endorsement_due_date: null, use_in_crew_report: true, details: {}, notes: null, has_file: true,
  file_path: `${COMPANY}/crew/${PROFILE}/documents/u-p.pdf`, file_url: null, file_name: 'p.pdf', file_mime: 'application/pdf', file_size: 10,
  verification_status: 'unverified', verified_by: null, verified_by_name: null, verified_at: null, verification_note: null, alerts_muted: false, muted_by: null,
  muted_at: null, muted_reason: null, source: 'manual', created_by: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', window_days: 270,
  bucket: 'valid', days_remaining: 1000, endorsement_state: null, state: 'valid', can_edit: true, can_delete: true, ...over,
});
const ROWS = [
  row({ id: 'd-pp' }),
  row({ id: 'd-bst', document_type_id: 't-bst', type_key: 'bst', type_name: 'Basic safety training', type_abbreviation: 'BST', category_key: 'stcw_basic', category_label: 'STCW basic training', tab: 'stcw', use_in_crew_report: false }),
  row({ id: 'd-pst', document_type_id: 't-pst', type_key: 'pst', type_name: 'Personal survival techniques', type_abbreviation: 'PST', category_key: 'stcw_basic', category_label: 'STCW basic training', tab: 'stcw', use_in_crew_report: false }),
];
const RIGHTS = (canAdd: boolean) => ({ data: [{ can_view: true, can_add: canAdd, can_edit: canAdd, is_own: true, uploads_enabled: canAdd }], error: null });

beforeEach(() => {
  h.gate = 'granted';
  h.gateKeys = [];
  h.profile = { id: PROFILE, user_id: USER, company_id: COMPANY };
  h.rpc = {
    crew_documents_for_profile: () => ({ data: ROWS, error: null }),
    crew_document_rights: () => RIGHTS(true),
  };
  h.rpcCalls = [];
  h.tables = {
    crew_document_categories: { data: [{ key: 'passports', label: 'Passports', tab: 'documents', sort_order: 10, is_active: true }, { key: 'stcw_basic', label: 'STCW basic training', tab: 'stcw', sort_order: 100, is_active: true }], error: null },
    crew_document_types: { data: [], error: null },
  };
});

const Where = () => {
  const l = useLocation();
  return <output data-testid="location">{`${l.pathname}${l.search}`}</output>;
};

const renderAt = (url = '/me/documents') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/me/documents"
            element={
              <>
                <MyDocumentsPage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const panel = async () => {
  await waitFor(() => expect(document.querySelector('[data-documents-state="ready"]')).not.toBeNull());
  return document.querySelector('[data-documents-state="ready"]') as HTMLElement;
};

describe('the gate', () => {
  it('asks for view_own; while it loads nothing is read and nothing shows', () => {
    h.gate = 'loading';
    renderAt();
    expect(h.gateKeys).toContain(CREW_CAPS.documentsViewOwn);
    expect(screen.queryByRole('heading', { name: MY_DOCUMENTS_TITLE })).toBeNull();
    expect(h.rpcCalls).toEqual([]);
  });

  it('denied is AccessDenied, with no request', () => {
    h.gate = 'denied';
    renderAt();
    expect(screen.getByRole('heading', { name: "You can't open your documents here" })).toBeInTheDocument();
    expect(h.rpcCalls).toEqual([]);
  });

  it('a sign-in with no crew profile says so and reads nothing', () => {
    h.profile = null;
    renderAt();
    expect(screen.getByRole('heading', { level: 1, name: MY_DOCUMENTS_TITLE })).toBeInTheDocument();
    expect(screen.getByText(NO_PROFILE_TITLE)).toBeInTheDocument();
    expect(h.rpcCalls).toEqual([]);
  });
});

describe('populated', () => {
  it('the heading, the tab row with counts, and the caller\'s own documents read-only', async () => {
    renderAt();
    expect(screen.getByRole('heading', { level: 1, name: MY_DOCUMENTS_TITLE })).toBeInTheDocument();
    const p = await panel();
    expect(h.rpcCalls.find((c) => c.fn === 'crew_documents_for_profile')?.args).toEqual({ p_profile_id: PROFILE });
    const nav = screen.getByRole('navigation', { name: 'Document tabs' });
    await waitFor(() => expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Documents1', 'STCW2', 'Qualifications0']));
    expect(within(nav).getByRole('link', { name: /^Documents/ })).toHaveAttribute('aria-current', 'page');
    expect(p.querySelector('[data-document-row="d-pp"]')).not.toBeNull();
    expect(p.querySelector('[data-document-row="d-bst"]')).toBeNull();
    // Read-only: View, never Edit, even where the server would allow the person's own edit.
    expect(within(p).getByRole('button', { name: 'View Passport' })).toBeInTheDocument();
    expect(within(p).queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(nav.querySelector('ul')?.className).toMatch(/overflow-x-auto/);
  });

  it('?tab=stcw shows the STCW documents; the tab row links keep the page', async () => {
    renderAt('/me/documents?tab=stcw');
    const p = await panel();
    expect(within(p).getByRole('heading', { level: 2, name: 'STCW' })).toBeInTheDocument();
    expect(p.querySelector('[data-document-row="d-bst"]')).not.toBeNull();
    expect(p.querySelector('[data-document-row="d-pst"]')).not.toBeNull();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Document tabs' })).getByRole('link', { name: /^Qualifications/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/me/documents?tab=qualifications'));
    await waitFor(() => expect(screen.getByText('No qualifications recorded yet')).toBeInTheDocument());
  });

  it('an unknown ?tab= opens Documents', async () => {
    renderAt('/me/documents?tab=nonsense');
    const p = await panel();
    expect(within(p).getByRole('heading', { level: 2, name: 'Documents' })).toBeInTheDocument();
  });

  it('Add is there when the server says the person may add (own uploads on)', async () => {
    renderAt();
    const p = await panel();
    await waitFor(() => expect(within(p).getByRole('button', { name: 'Add document' })).toBeEnabled());
    expect(p.querySelector('[data-own-uploads="off"]')).toBeNull();
  });

  it('without that right: no Add, and the page says who can add them', async () => {
    h.rpc.crew_document_rights = () => RIGHTS(false);
    renderAt();
    const p = await panel();
    await waitFor(() => expect(p.querySelector('[data-own-uploads="off"]')).not.toBeNull());
    expect(within(p).queryByRole('button', { name: 'Add document' })).toBeNull();
    expect(p.querySelector('[data-own-uploads="off"]')).toHaveTextContent(/not switched on for your vessel/);
  });
});

describe('states', () => {
  it('D-01: the legacy rows read-only with the notice and Add off', async () => {
    delete h.rpc.crew_documents_for_profile;
    delete h.rpc.crew_document_rights;
    h.tables.crew_certificates = {
      data: [
        {
          id: 'l-1', user_id: USER, certificate_type: 'STCW Basic Safety Training (VI/1)', certificate_name: 'Basic safety', certificate_number: null,
          issuing_authority: null, issue_date: null, expiry_date: '2029-01-01', file_url: null, file_name: null, file_size: null, notes: null,
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    };
    renderAt('/me/documents?tab=stcw');
    const p = await panel();
    expect(p).toHaveAttribute('data-documents-source', 'fallback');
    expect(p.querySelector('[data-documents-notice]')).toHaveTextContent(CATALOGUE_MISSING_NOTICE);
    expect(within(p).getByRole('button', { name: 'Add document' })).toBeDisabled();
    expect(p.querySelector('[data-document-row="l-1"]')).not.toBeNull();
  });

  it('any other error is an error with Try again', async () => {
    h.rpc.crew_documents_for_profile = () => ({ data: null, error: { code: 'XX000', message: 'database is down' } });
    renderAt();
    await waitFor(() => expect(document.querySelector('[data-documents-state="error"]')).not.toBeNull(), { timeout: 4000 });
    expect(screen.getByText('The documents could not load')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});
