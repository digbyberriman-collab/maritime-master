/**
 * Document verification, alerts off, renewal and history on the crew
 * profile's document tabs (X1-05; gap/04 C27, C28, C30, W4; D-01):
 *
 * - the review line of each row: Verify (documents that need review),
 *   Review again, Renew, Alerts, History, each behind the server's review
 *   rights and, for verifying and alerts, useCan on the vessel (false while
 *   it loads: nothing shows); why an approver of another department cannot
 *   verify; the "Needs review" chip counting and filtering;
 * - D-01: the review RPC missing keeps the badges read-only with the notice;
 *   any other error is an error with Try again;
 * - VerifyDialog: a decision is required, a note for a condition or a
 *   rejection, the condition's end written into the note, the answer must
 *   carry the decision (no fake success), a 42501 reads as the server wrote
 *   it and a note refusal lands on the note, not applied at save;
 * - AlertsOffMenu: the muted line with the real state, turning alerts off
 *   with a reason (trimmed), turning them back on;
 * - VersionHistoryDrawer: earlier versions with who replaced them and why,
 *   an earlier version's file in the viewer;
 * - Renew: the new document's details, saved through crew_document_renew;
 *   ReverifyWarning on an edit of a verified document.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { CrewDocumentCategoryRow, CrewDocumentRpcRow, CrewDocumentTypeRow, CrewDocumentVersionRow } from '@/modules/crew/types/db.pending';

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  rpc: {} as Record<string, (args: unknown) => { data: unknown; error: unknown }>,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  signed: [] as string[],
  caps: new Set<string>(),
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
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
    return Promise.resolve(h.rpc[fn] ? h.rpc[fn](args) : { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });
  };
  const storage = {
    from: () => ({
      createSignedUrl: (path: string) => {
        h.signed.push(path);
        return Promise.resolve({ data: { signedUrl: `https://signed.example.test/${path}?token=t` }, error: null });
      },
      upload: (path: string) => Promise.resolve({ data: { path }, error: null }),
      remove: () => Promise.resolve({ data: null, error: null }),
    }),
  };
  return { supabase: { from, rpc, storage } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCan: (key: string) => h.caps.has(key),
  useCapability: (key: string) => ({ allowed: h.caps.has(key), status: h.caps.has(key) ? 'granted' : 'denied' }),
}));
vi.mock('@/modules/crew/lib/documentUpload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/crew/lib/documentUpload')>();
  return { ...actual, crewDocumentUploadsReady: () => true };
});
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import { DocumentsTab } from '@/modules/crew/components/documents/DocumentsTab';
import { REVIEW_UNAVAILABLE_NOTICE } from '@/modules/crew/hooks/useDocumentVerification';
import { REVERIFY_HINT, REVERIFY_WARNING } from '@/modules/crew/lib/verification';
import { CREW_CAPS } from '@/modules/crew/paths';
import type { CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';

const PROFILE = 'b0000000-0000-4000-8000-000000000015';
const USER = 'a0000000-0000-4000-8000-000000000015';
const COMPANY = 'c0000000-0000-4000-8000-000000000001';
const VESSEL = { id: 'v-dra', companyId: COMPANY, name: 'DRAAK' };

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
// jsdom has no PointerEvent; Radix menus open on pointerdown (button 0).
if (!('PointerEvent' in window)) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const category = (key: string, label: string, tab: CrewDocumentCategoryRow['tab'], sort_order: number): CrewDocumentCategoryRow => ({
  key, label, tab, sort_order, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});
const typeRow = (over: Partial<CrewDocumentTypeRow>): CrewDocumentTypeRow => ({
  id: 't', company_id: null, category_key: 'passports', key: 'k', name: 'N', code: null, abbreviation: null, stcw_reference: null,
  field_schema: {}, default_validity_months: null, endorsement_interval_months: null, expiry_item_type: 'crew_document',
  is_identity: false, is_medical_fitness: false, is_active: true, sort_order: 10, created_by: null, updated_by: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
});
const CATEGORIES = [category('passports', 'Passports', 'documents', 10), category('visas', 'Visas', 'documents', 30), category('medical_fitness', 'Medical fitness', 'documents', 50)];
const TYPES = [
  typeRow({ id: 't-pp', key: 'passport', name: 'Passport', code: 'PASSPORT', abbreviation: 'PP', expiry_item_type: 'passport', is_identity: true, field_schema: { issuing_office: 'optional' } }),
  typeRow({ id: 't-visa', key: 'visa_us', category_key: 'visas', name: 'United States visitor visa', expiry_item_type: 'visa', field_schema: { entries: 'optional' } }),
  typeRow({ id: 't-eng1', key: 'eng1', category_key: 'medical_fitness', name: 'ENG1 seafarer medical certificate', code: 'ENG1', expiry_item_type: 'medical', is_medical_fitness: true }),
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
    category_label: 'Visas', expiry_item_type: 'visa', is_identity: false, number: 'V-77', issuing_country_code: 'US', use_in_crew_report: false, expiry_date: '2026-12-08',
    bucket: 'expiring_soon', days_remaining: 12, state: 'expiring_soon', verification_status: 'unverified', verified_by: null, verified_by_name: null, verified_at: null,
    field_schema: { entries: 'optional' },
  }),
  row({
    id: 'd-eng1', document_type_id: 't-eng1', type_key: 'eng1', type_name: 'ENG1 seafarer medical certificate', type_code: 'ENG1', type_abbreviation: 'ENG1', category_key: 'medical_fitness',
    category_label: 'Medical fitness', expiry_item_type: 'medical', is_identity: false, number: 'M-1', use_in_crew_report: false, expiry_date: '2026-10-01', bucket: 'expired',
    days_remaining: -56, state: 'expired', alerts_muted: true, muted_at: '2026-11-03T08:00:00Z', muted_reason: 'Renewal booked', field_schema: {},
    verification_status: 'unverified', verified_by: null, verified_by_name: null, verified_at: null,
  }),
];
const RIGHTS = { can_view: true, can_add: true, can_edit: true, is_own: false, uploads_enabled: false };
const REVIEW = { can_verify: true, verify_block: null, can_mute: true, can_renew: true };

const version = (over: Partial<CrewDocumentVersionRow>): Partial<CrewDocumentVersionRow> => ({
  id: 'v', crew_document_id: 'd-pp', version_no: 1, number: 'X0000001', issue_date: '2010-03-01', expiry_date: '2020-03-01', no_expiry: false, issuing_country_code: 'GB',
  issuing_office: 'Passport office', file_path: `${COMPANY}/crew/${PROFILE}/documents/u-old-passport.pdf`, file_url: null, file_name: 'old passport.pdf', file_mime: 'application/pdf',
  verification_status: 'verified', verified_by: 'u-master', verified_at: '2019-01-10T10:00:00Z', verification_note: null, reason: 'Renewed at the consulate',
  replaced_at: '2020-02-20T09:30:00Z', replaced_by: 'u-co', ...over,
});

const summary: CrewProfileSummary = {
  profileId: PROFILE, userId: USER, firstName: 'Demo', lastName: 'Chief Stew', preferredName: null, displayName: 'Demo Chief Stew', avatarUrl: null, crewNumber: 'DRA-0015',
  positionName: 'Chief Stew', positionText: 'Chief Stew', departmentKey: 'interior', departmentLabel: 'Interior', rankTier: 'hod', onVessel: true, placementKind: 'assignment',
  assignmentId: 'a', joinDate: '2026-07-01', leaveDate: null, status: 'on_board', statusDetail: null, transferVesselId: null, leaveCode: null, loginState: 'active',
  prev: null, next: null, memberIndex: 1, memberCount: 2, isOwn: false, canEdit: true, canEditSelf: true, tabs: null, source: 'server',
};

const ALL_CAPS = [CREW_CAPS.documentsApprove, CREW_CAPS.expiryAlertsEdit, CREW_CAPS.documentsEdit];

beforeEach(() => {
  h.rpc = {
    crew_documents_for_profile: () => ({ data: ROWS, error: null }),
    crew_document_rights: () => ({ data: [RIGHTS], error: null }),
    crew_document_review_rights: () => ({ data: [REVIEW], error: null }),
  };
  h.rpcCalls = [];
  h.tables = {
    crew_document_categories: { data: CATEGORIES, error: null },
    crew_document_types: { data: TYPES, error: null },
    ref_countries: {
      data: [
        { iso2: 'GB', iso3: 'GBR', name: 'United Kingdom', demonym: 'British', dial_code: '44', flag_emoji: null, sort_name: 'United Kingdom' },
        { iso2: 'US', iso3: 'USA', name: 'United States', demonym: 'American', dial_code: '1', flag_emoji: null, sort_name: 'United States' },
      ],
      error: null,
    },
    crew_document_versions: { data: [version({ id: 'v2', version_no: 2, number: 'X0000002', reason: 'Renewed at the clinic', expiry_date: '2025-03-01' }), version({ id: 'v1' })], error: null },
    profiles: {
      data: [
        { user_id: 'u-co', first_name: 'Demo', last_name: 'Chief Officer', preferred_name: null },
        { user_id: 'u-master', first_name: 'Demo', last_name: 'Master', preferred_name: null },
      ],
      error: null,
    },
  };
  h.signed = [];
  h.caps = new Set(ALL_CAPS);
  for (const fn of Object.values(h.notify)) fn.mockReset();
});

const renderTab = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DocumentsTab tab="documents" profile={summary} vessel={VESSEL} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const ready = async () => {
  await waitFor(() => expect(document.querySelector('[data-documents-state="ready"]')).not.toBeNull());
  return document.querySelector('[data-documents-state="ready"]') as HTMLElement;
};
const docRow = (id: string) => document.querySelector(`[data-document-row="${id}"]`) as HTMLElement;
const calls = (fn: string) => h.rpcCalls.filter((c) => c.fn === fn);
const openMenu = (trigger: HTMLElement) => {
  fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0, ctrlKey: false });
  fireEvent.pointerUp(trigger, { pointerType: 'mouse', button: 0 });
  fireEvent.click(trigger);
};
const pickItem = async (name: RegExp | string) => {
  const item = await screen.findByRole('menuitem', { name });
  fireEvent.pointerMove(item, { pointerType: 'mouse' });
  fireEvent.pointerDown(item, { pointerType: 'mouse', button: 0 });
  fireEvent.pointerUp(item, { pointerType: 'mouse', button: 0 });
  fireEvent.click(item);
};
const reviewLoaded = () => waitFor(() => expect(within(docRow('d-visa')).getByRole('button', { name: 'Verify United States visitor visa' })).toBeInTheDocument());

// ---------------------------------------------------------------- the review line

describe('the review line on each row', () => {
  it('Verify on a document that needs review, Review again on a reviewed one; Renew, Alerts and History follow the rights', async () => {
    renderTab();
    await ready();
    await reviewLoaded();
    expect(within(docRow('d-visa')).getByRole('button', { name: 'Verify United States visitor visa' })).toHaveTextContent('Verify');
    expect(within(docRow('d-pp')).getByRole('button', { name: 'Verify Passport' })).toHaveTextContent('Review again');
    expect(within(docRow('d-pp')).getByRole('button', { name: 'Renew Passport' })).toBeInTheDocument();
    expect(within(docRow('d-visa')).getByRole('button', { name: 'Alerts for United States visitor visa' })).toBeInTheDocument();
    await waitFor(() => expect(within(docRow('d-pp')).getByRole('button', { name: 'History of Passport' })).toHaveTextContent('History (2)'));
    expect(within(docRow('d-visa')).queryByRole('button', { name: /^History/ })).toBeNull();
    expect(calls('crew_document_review_rights')[0]?.args).toEqual({ p_profile_id: PROFILE });
  });

  it('the badge carries who reviewed it, and the review lines stay under the row', async () => {
    renderTab();
    await ready();
    const badge = docRow('d-pp').querySelector('[data-verification="verified"]') as HTMLElement;
    expect(badge).toHaveTextContent('Verified');
    expect(badge).toHaveAttribute('title', 'Reviewed by Demo Master on 1 Nov 2026');
    expect(within(docRow('d-pp')).getByText('Reviewed by Demo Master on 1 Nov 2026')).toBeInTheDocument();
  });

  it('the Needs review chip counts the tab\'s documents waiting for a verifier and filters to them', async () => {
    renderTab();
    const panel = await ready();
    await reviewLoaded();
    const chip = within(panel).getByRole('button', { name: /Needs review/ });
    expect(chip).toHaveAttribute('data-needs-review', '2');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(docRow('d-pp')).toBeNull();
    expect(docRow('d-visa')).not.toBeNull();
    expect(docRow('d-eng1')).not.toBeNull();
    fireEvent.click(chip);
    expect(docRow('d-pp')).not.toBeNull();
  });

  it('useCan loading or denied: no Verify and no Alerts even when the server says yes; Renew follows the server, as Edit does', async () => {
    h.caps = new Set();
    renderTab();
    await ready();
    await waitFor(() => expect(within(docRow('d-pp')).getByRole('button', { name: 'Renew Passport' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^Verify / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Alerts/ })).toBeNull();
  });

  it('an approver of another department reads why they cannot verify this person\'s documents', async () => {
    h.rpc.crew_document_review_rights = () => ({ data: [{ ...REVIEW, can_verify: false, verify_block: 'out_of_department' }], error: null });
    renderTab();
    const panel = await ready();
    await waitFor(() => expect(panel.querySelector('[data-verify-block]')).toHaveTextContent('As a head of department you verify the documents of your own department only.'));
    expect(screen.queryByRole('button', { name: /^Verify / })).toBeNull();
  });

  it('nothing to say to a reader who may not verify for another reason', async () => {
    h.rpc.crew_document_review_rights = () => ({ data: [{ can_verify: false, verify_block: 'not_permitted', can_mute: false, can_renew: false }], error: null });
    renderTab();
    const panel = await ready();
    await waitFor(() => expect(calls('crew_document_review_rights')).toHaveLength(1));
    await waitFor(() => expect(panel.querySelector('[data-needs-review]')).not.toBeNull());
    expect(panel.querySelector('[data-verify-block]')).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Verify|Renew|Alerts) / })).toBeNull();
  });

  it('a muted document says since when and why, with its real state', async () => {
    renderTab();
    await ready();
    expect(docRow('d-eng1').querySelector('[data-alerts-off-note]')).toHaveTextContent('Alerts off since 3 Nov 2026: Renewal booked. Real state: Expired 56 days ago.');
    await waitFor(() => expect(within(docRow('d-eng1')).getByRole('button', { name: /Alerts off for ENG1/ })).toHaveTextContent('Alerts off'));
  });

  it('D-01: the review RPC missing keeps the badges read-only, with the notice', async () => {
    delete h.rpc.crew_document_review_rights;
    renderTab();
    const panel = await ready();
    await waitFor(() => expect(panel.querySelector('[data-review-notice]')).toHaveTextContent(REVIEW_UNAVAILABLE_NOTICE));
    expect(within(docRow('d-pp')).getByText('Verified')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Verify|Renew|Alerts|History) / })).toBeNull();
    expect(panel.querySelector('[data-needs-review]')).toBeNull();
    expect(calls('crew_document_versions')).toEqual([]);
  });

  it('any other error of the rights is an error with Try again', async () => {
    let n = 0;
    h.rpc.crew_document_review_rights = () => {
      n += 1;
      return n <= 2 ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: [REVIEW], error: null };
    };
    renderTab();
    await ready();
    await waitFor(() => expect(screen.getByText('The verification details could not load')).toBeInTheDocument(), { timeout: 4000 });
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await reviewLoaded();
  });

  it('390 px: the review line wraps', async () => {
    renderTab();
    await ready();
    await reviewLoaded();
    const line = docRow('d-pp').querySelector('[data-document-review] > div') as HTMLElement;
    expect(line.className).toMatch(/flex-wrap/);
  });
});

// ---------------------------------------------------------------- VerifyDialog

describe('VerifyDialog', () => {
  const openVerify = async (name = 'Verify United States visitor visa') => {
    renderTab();
    await ready();
    await reviewLoaded();
    fireEvent.click(screen.getByRole('button', { name }));
    return screen.findByRole('dialog');
  };
  const choose = (dialog: HTMLElement, label: string) => fireEvent.click(within(dialog).getByRole('radio', { name: new RegExp(`^${label}`) }));

  it('shows the document\'s details and asks for a decision; a rejection needs a reason; nothing is sent until then', async () => {
    const dialog = await openVerify();
    expect(within(dialog).getByRole('heading', { name: 'United States visitor visa' })).toBeInTheDocument();
    expect(within(dialog).getByText('V-77')).toBeInTheDocument();
    expect(within(dialog).getByText('United States')).toBeInTheDocument();
    expect(within(dialog).getByText('Nobody has reviewed it yet.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record decision' }));
    await waitFor(() => expect(within(dialog).getByText('Choose a decision.')).toBeInTheDocument());
    choose(dialog, 'Rejected');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(within(dialog).getByText('Say why the document is rejected.')).toBeInTheDocument());
    expect(calls('crew_document_verify')).toEqual([]);
  });

  it('a conditional approval sends the condition with its end, and closes once the server answers with it', async () => {
    h.rpc.crew_document_verify = () => ({ data: { id: 'd-visa', verification_status: 'conditionally_approved', alerts_muted: false }, error: null });
    const dialog = await openVerify();
    choose(dialog, 'Conditionally approved');
    fireEvent.change(within(dialog).getByLabelText('Condition'), { target: { value: 'Valid with corrective lenses' } });
    fireEvent.change(within(dialog).getByLabelText('Until (optional)'), { target: { value: '2099-03-01' } });
    expect(dialog.querySelector('[data-note-preview]')).toHaveTextContent('Saved as: Valid with corrective lenses. Until 1 Mar 2099.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve with condition' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('United States visitor visa approved with a condition'));
    expect(calls('crew_document_verify')[0].args).toEqual({ p_id: 'd-visa', p_decision: 'conditionally_approved', p_note: 'Valid with corrective lenses. Until 1 Mar 2099.' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(calls('crew_documents_for_profile').length).toBeGreaterThan(1));
  });

  it('a condition that ended already is refused before sending', async () => {
    const dialog = await openVerify();
    choose(dialog, 'Conditionally approved');
    fireEvent.change(within(dialog).getByLabelText('Condition'), { target: { value: 'Lenses' } });
    fireEvent.change(within(dialog).getByLabelText('Until (optional)'), { target: { value: '2001-01-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve with condition' }));
    await waitFor(() => expect(within(dialog).getByText('The condition has to end today or later.')).toBeInTheDocument());
    expect(calls('crew_document_verify')).toEqual([]);
  });

  it('an answer in another state is not reported as recorded', async () => {
    h.rpc.crew_document_verify = () => ({ data: { id: 'd-visa', verification_status: 'unverified', alerts_muted: false }, error: null });
    const dialog = await openVerify();
    choose(dialog, 'Verified');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(dialog.querySelector('[data-verify-refusal]')).toHaveTextContent('The decision was not recorded. Try again.'));
    expect(h.notify.success).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a 42501 reads as the server wrote it; a note refusal lands on the note', async () => {
    h.rpc.crew_document_verify = () => ({
      data: null,
      error: { code: '42501', message: 'own_document', details: "You can't verify your own documents. Someone else on board or in the office checks them." },
    });
    const dialog = await openVerify();
    choose(dialog, 'Verified');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(dialog.querySelector('[data-verify-refusal]')).toHaveTextContent("You can't verify your own documents."));
    h.rpc.crew_document_verify = () => ({ data: null, error: { code: '22023', message: 'note_required', details: 'Say why the document is rejected, so it can be put right.', hint: 'note' } });
    choose(dialog, 'Verified');
    fireEvent.change(within(dialog).getByLabelText('Remark (optional)'), { target: { value: ' ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(within(dialog).getByText('Say why the document is rejected, so it can be put right.')).toBeInTheDocument());
  });

  it('D-01 at save: the RPC missing says so, and nothing is reported as recorded', async () => {
    const dialog = await openVerify();
    choose(dialog, 'Verified');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(dialog.querySelector('[data-verify-refusal]')).toHaveTextContent(REVIEW_UNAVAILABLE_NOTICE));
    expect(h.notify.success).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- alerts off

describe('AlertsOffMenu', () => {
  it('turning alerts off asks for a reason and sends it trimmed; the answer must say they are off', async () => {
    h.rpc.crew_document_mute = () => ({ data: { id: 'd-visa', verification_status: 'unverified', alerts_muted: true }, error: null });
    renderTab();
    await ready();
    await reviewLoaded();
    openMenu(within(docRow('d-visa')).getByRole('button', { name: 'Alerts for United States visitor visa' }));
    await pickItem(/Turn alerts off/);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/keeps showing its real state \(Expires in 12 days\)/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn alerts off' }));
    await waitFor(() => expect(within(dialog).getByText('Say why alerts are turned off for this document.')).toBeInTheDocument());
    expect(calls('crew_document_mute')).toEqual([]);
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: '  Renewal booked  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn alerts off' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Alerts are off for United States visitor visa'));
    expect(calls('crew_document_mute')[0].args).toEqual({ p_id: 'd-visa', p_reason: 'Renewal booked' });
  });

  it('a refused mute reads as the server wrote it', async () => {
    h.rpc.crew_document_mute = () => ({ data: null, error: { code: '42501', message: 'own_document', details: "You can't turn off alerts for your own documents." } });
    renderTab();
    await ready();
    await reviewLoaded();
    openMenu(within(docRow('d-visa')).getByRole('button', { name: 'Alerts for United States visitor visa' }));
    await pickItem(/Turn alerts off/);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'x' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn alerts off' }));
    await waitFor(() => expect(dialog.querySelector('[data-mute-refusal]')).toHaveTextContent("You can't turn off alerts for your own documents."));
  });

  it('turning alerts back on', async () => {
    h.rpc.crew_document_unmute = () => ({ data: { id: 'd-eng1', verification_status: 'unverified', alerts_muted: false }, error: null });
    renderTab();
    await ready();
    await reviewLoaded();
    openMenu(within(docRow('d-eng1')).getByRole('button', { name: /Alerts off for ENG1/ }));
    await pickItem('Turn alerts back on');
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Alerts are back on for ENG1 seafarer medical certificate'));
    expect(calls('crew_document_unmute')[0].args).toEqual({ p_id: 'd-eng1' });
  });

  it('an answer that still says muted is not a success', async () => {
    h.rpc.crew_document_unmute = () => ({ data: { id: 'd-eng1', verification_status: 'unverified', alerts_muted: true }, error: null });
    renderTab();
    await ready();
    await reviewLoaded();
    openMenu(within(docRow('d-eng1')).getByRole('button', { name: /Alerts off for ENG1/ }));
    await pickItem('Turn alerts back on');
    await waitFor(() => expect(h.notify.error).toHaveBeenCalledWith('Alerts were not turned back on. Try again.', { title: 'Alerts were not turned back on' }));
    expect(h.notify.success).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- history

describe('VersionHistoryDrawer', () => {
  it('lists the earlier versions newest first with who replaced them and why; an old file opens in the viewer', async () => {
    renderTab();
    await ready();
    const history = await waitFor(() => within(docRow('d-pp')).getByRole('button', { name: 'History of Passport' }));
    fireEvent.click(history);
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveAttribute('data-version-history');
    const items = [...sheet.querySelectorAll('[data-version]')].map((el) => el.getAttribute('data-version'));
    expect(items).toEqual(['current', '2', '1']);
    const v2 = sheet.querySelector('[data-version="2"]') as HTMLElement;
    expect(within(v2).getByText(/Replaced 20 Feb 2020, \d\d:\d\d by Demo Chief Officer · Renewed at the clinic/)).toBeInTheDocument();
    expect(within(v2).getByText('X0000002')).toBeInTheDocument();
    expect(within(v2).getByText('Reviewed by Demo Master on 10 Jan 2019')).toBeInTheDocument();
    fireEvent.click(within(sheet.querySelector('[data-version="1"]') as HTMLElement).getByRole('button', { name: 'Open the file of version 1' }));
    await waitFor(() => expect(h.signed).toEqual([`${COMPANY}/crew/${PROFILE}/documents/u-old-passport.pdf`]));
  });

  it('a version table missing reads as not set up (D-01); a document with none says so', async () => {
    h.tables.crew_document_versions = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.crew_document_versions' in the schema cache" } };
    renderTab();
    await ready();
    await reviewLoaded();
    expect(screen.queryByRole('button', { name: /^History/ })).toBeNull();
  });
});

// ---------------------------------------------------------------- renew and re-verification

describe('Renew and the re-verification warning', () => {
  it('Renew opens on the new document\'s details and saves through crew_document_renew', async () => {
    h.rpc.crew_document_renew = () => ({ data: { id: 'd-pp', verification_status: 'unverified', alerts_muted: false }, error: null });
    renderTab();
    await ready();
    await reviewLoaded();
    fireEvent.click(within(docRow('d-pp')).getByRole('button', { name: 'Renew Passport' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Renew Passport' })).toBeInTheDocument();
    expect(dialog.querySelector('[data-renew-note]')).toHaveTextContent('The current one (X1234567, expires 1 Mar 2030) is kept in the history. The new document waits for verification.');
    expect((within(dialog).getByLabelText(/^Passport number/) as HTMLInputElement).value).toBe('');
    fireEvent.change(within(dialog).getByLabelText(/^Passport number/), { target: { value: 'X7654321' } });
    fireEvent.change(within(dialog).getByLabelText(/^Issue date/), { target: { value: '2026-11-01' } });
    fireEvent.change(within(dialog).getByLabelText(/^Expiry date/), { target: { value: '2036-11-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save the renewal' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Passport renewed'));
    const args = calls('crew_document_renew')[0].args as { p_id: string; p_payload: Record<string, unknown> };
    expect(args.p_id).toBe('d-pp');
    expect(args.p_payload).toMatchObject({ number: 'X7654321', issue_date: '2026-11-01', expiry_date: '2036-11-01', no_expiry: false, issuing_country_code: 'GB', use_in_crew_report: true });
    expect(calls('crew_document_save')).toEqual([]);
  });

  it('a renewal whose answer is not back to unverified is not a success', async () => {
    h.rpc.crew_document_renew = () => ({ data: { id: 'd-pp', verification_status: 'verified', alerts_muted: false }, error: null });
    renderTab();
    await ready();
    await reviewLoaded();
    fireEvent.click(within(docRow('d-pp')).getByRole('button', { name: 'Renew Passport' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Issue date/), { target: { value: '2026-11-01' } });
    fireEvent.change(within(dialog).getByLabelText(/^Expiry date/), { target: { value: '2036-11-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save the renewal' }));
    await waitFor(() => expect(h.notify.error).toHaveBeenCalledWith('The document was not renewed. Try again.', { title: 'The document was not saved' }));
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('editing a verified document: the hint, then the warning once something material changes', async () => {
    renderTab();
    await ready();
    await waitFor(() => expect(within(docRow('d-pp')).getByRole('button', { name: 'Edit Passport' })).toBeInTheDocument());
    fireEvent.click(within(docRow('d-pp')).getByRole('button', { name: 'Edit Passport' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('[data-reverify="hint"]')).toHaveTextContent(REVERIFY_HINT);
    fireEvent.change(within(dialog).getByLabelText(/^Notes/), { target: { value: 'Kept in the safe' } });
    expect(dialog.querySelector('[data-reverify="hint"]')).not.toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Passport number/), { target: { value: 'X7654321' } });
    await waitFor(() => expect(dialog.querySelector('[data-reverify="warning"]')).toHaveTextContent(REVERIFY_WARNING));
  });

  it('editing an unverified document shows neither', async () => {
    renderTab();
    await ready();
    await waitFor(() => expect(within(docRow('d-visa')).getByRole('button', { name: 'Edit United States visitor visa' })).toBeInTheDocument());
    fireEvent.click(within(docRow('d-visa')).getByRole('button', { name: 'Edit United States visitor visa' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: 'V-78' } });
    expect(dialog.querySelector('[data-reverify]')).toBeNull();
  });
});
