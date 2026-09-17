import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { addDays, format } from 'date-fns';
import { renderHrisPage, setupAccess, setupSupabase, baseFixtures, COMPANY_ID, CREW_USER } from '@/test/hris/harness';
import { authState } from '@/test/hris/state';

vi.mock('@/integrations/supabase/client', async () => {
  const s = await import('@/test/hris/state');
  return { supabase: s.supabaseProxy };
});
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const s = await import('@/test/hris/state');
  return { useAuth: () => s.authState.value, AuthProvider: ({ children }: { children: React.ReactNode }) => children };
});

import DocumentsPage from '@/modules/hris/pages/DocumentsPage';

const ROUTE = '/hris/employee-records/documents-and-certificates';

/** yyyy-mm-dd, n days from today, so expiry labels stay stable whenever the suite runs. */
const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');

const fixtures = () => ({
  ...baseFixtures(),
  hr_expiry_items: [
    { company_id: COMPANY_ID, item_type: 'medical', record_id: 'p1', profile_id: 'p1', user_id: 'u1', crew_name: 'Ana Bosun', vessel_id: 'v1', label: 'Medical (ENG1)', due_date: inDays(8), days_remaining: 8 },
    { company_id: COMPANY_ID, item_type: 'passport', record_id: 'p1', profile_id: 'p1', user_id: 'u1', crew_name: 'Ana Bosun', vessel_id: 'v1', label: 'Passport P222', due_date: inDays(20), days_remaining: 20 },
    { company_id: COMPANY_ID, item_type: 'certificate', record_id: 'c1', profile_id: 'p1', user_id: 'u1', crew_name: 'Ana Bosun', vessel_id: 'v1', label: 'STCW Basic Safety Training (VI/1)', due_date: inDays(400), days_remaining: 400 },
    { company_id: COMPANY_ID, item_type: 'certificate', record_id: 'c2', profile_id: 'p-crew', user_id: CREW_USER.id, crew_name: 'Cal Crew', vessel_id: 'v1', label: 'Yacht Master Offshore', due_date: inDays(-10), days_remaining: -10 },
  ],
  crew_certificates: [
    { id: 'c1', user_id: 'u1', certificate_type: 'STCW Basic Safety Training (VI/1)', certificate_name: 'STCW Basic Safety Training (VI/1)', issuing_authority: 'MCA', certificate_number: 'STCW-1', issue_date: '2022-03-01', expiry_date: inDays(400), file_url: null, file_name: null, file_size: null, notes: null, status: 'Valid', created_by: 'u-dpa', updated_by: null, created_at: '2022-03-01T00:00:00Z', updated_at: '2022-03-01T00:00:00Z' },
    { id: 'c2', user_id: CREW_USER.id, certificate_type: 'Yacht Master Offshore', certificate_name: 'Yacht Master Offshore', issuing_authority: 'RYA', certificate_number: 'YM-2', issue_date: '2021-01-01', expiry_date: inDays(-10), file_url: null, file_name: null, file_size: null, notes: null, status: 'Expired', created_by: 'u-dpa', updated_by: null, created_at: '2021-01-01T00:00:00Z', updated_at: '2021-01-01T00:00:00Z' },
  ],
  crew_attachments: [
    { id: 'att1', user_id: 'u1', attachment_type: 'CV / Resume', file_name: 'ana-bosun-cv.pdf', file_url: `${COMPANY_ID}/crew/u1/attachments/1.pdf`, file_size: 20480, mime_type: 'application/pdf', description: 'Latest CV', uploaded_by: 'p-dpa', created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z', uploader: { first_name: 'Dana', last_name: 'Admin' } },
  ],
  crew_travel_documents: [
    { id: 'td1', crew_member_id: 'u1', document_type: 'passport', original_filename: 'scan001.pdf', standardised_filename: 'ANA_BOSUN_PASSPORT.pdf', original_file_path: 'u1/scan001.pdf', standardised_file_path: 'u1/ANA_BOSUN_PASSPORT.pdf', mime_type: 'application/pdf', file_size_bytes: 10240, valid_from: '2016-10-15', valid_until: '2026-10-15', verified: true, verified_at: '2026-01-01T00:00:00Z', extraction_status: 'completed', created_at: '2026-01-01T00:00:00Z' },
  ],
});

const kpiValue = (label: string): string => {
  const card = screen.getByText(label).closest('.rounded-lg') as HTMLElement;
  return within(card).getByText(/^\d+$/).textContent ?? '';
};

const openTab = (name: RegExp) => {
  // Radix tabs activate on mousedown, not click.
  fireEvent.mouseDown(screen.getByRole('tab', { name }));
};

describe('DocumentsPage', () => {
  beforeEach(() => {
    setupSupabase(fixtures());
  });

  it('shows HR the company expiry overview and drills into a crew member from a row', async () => {
    setupAccess('admin');
    renderHrisPage(DocumentsPage, { route: ROUTE });
    expect(screen.getByRole('heading', { name: 'Documents & Certificates' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Passport P222')).toBeInTheDocument());
    // KPI tiles: 1 expired, 2 within 30 days (8d + 20d), 2 within 90 days.
    expect(kpiValue('Expired')).toBe('1');
    expect(kpiValue('Due in 30 days')).toBe('2');
    expect(kpiValue('Due in 90 days')).toBe('2');
    expect(screen.getByText('Showing 4 of 4 dated items. Select a row to open that crew member.')).toBeInTheDocument();

    const row = screen.getByRole('button', { name: /Passport P222/ });
    expect(within(row).getByText('Ana Bosun')).toBeInTheDocument();
    expect(within(row).getByText('20d remaining')).toBeInTheDocument();

    // Selecting the row switches the page into crew mode (?crew=p1).
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText('Required documents')).toBeInTheDocument());
    expect(screen.getByText('Ana Bosun · Bosun · M/Y Draak')).toBeInTheDocument();
    expect(screen.queryByText('Soonest expiries')).not.toBeInTheDocument();
  });

  it("shows a crew member's compliance strip, certificates, attachments and travel documents", async () => {
    setupAccess('admin');
    renderHrisPage(DocumentsPage, { route: `${ROUTE}?crew=p1` });

    // Compliance strip from the profile row.
    await waitFor(() => expect(screen.getByText('15 Oct 2026')).toBeInTheDocument());
    expect(screen.getByText('25 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText('B1/B2')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('3 of 7 on file')).toBeInTheDocument());

    // Certificates tab is the default.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'STCW Basic Safety Training (VI/1)' })).toBeInTheDocument());
    expect(screen.getByText('Total Certificates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add certificate/i })).toBeInTheDocument();

    openTab(/attachments/i);
    await waitFor(() => expect(screen.getByText('ana-bosun-cv.pdf')).toBeInTheDocument());
    expect(screen.getByText('CV / Resume')).toBeInTheDocument();
    expect(screen.getByText('by Dana Admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload attachment/i })).toBeInTheDocument();

    openTab(/travel documents/i);
    await waitFor(() => expect(screen.getByText('ANA_BOSUN_PASSPORT.pdf')).toBeInTheDocument());
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open scan001.pdf' })).toBeInTheDocument();
  });

  it('keeps the compliance strip for imported crew and explains why documents cannot be attached yet', async () => {
    setupAccess('admin');
    renderHrisPage(DocumentsPage, { route: `${ROUTE}?crew=p2` });
    await waitFor(() => expect(screen.getByText('Benny Deckhand has not been invited yet')).toBeInTheDocument());
    // The compliance strip still renders from the profile row (nothing recorded for Ben).
    expect(screen.getByText('Required documents')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('0 of 7 on file')).toBeInTheDocument());
    expect(screen.getByText('Nationality: Australian')).toBeInTheDocument();
    expect(screen.getByText(/Certificate-based items cannot be checked/)).toBeInTheDocument();
    // Certificate / attachment components are not mounted without a user id.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('Certificates & Qualifications')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add certificate/i })).not.toBeInTheDocument();
  });

  it('shows a crew member their own documents without a picker and lets them add to them', async () => {
    setupAccess('self');
    renderHrisPage(DocumentsPage, { route: ROUTE });
    await waitFor(() => expect(screen.getByText('Cal Crew · Deckhand · M/Y Draak')).toBeInTheDocument());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('01 Jan 2029')).toBeInTheDocument());
    const cert = await screen.findByRole('heading', { name: 'Yacht Master Offshore' });
    // Status badge next to the certificate name (the stats tile also says "Expired").
    expect(within(cert.parentElement as HTMLElement).getByText('Expired')).toBeInTheDocument();
    // The subject of the record may manage their own certificates.
    expect(screen.getByRole('button', { name: /add certificate/i })).toBeInTheDocument();
    openTab(/attachments/i);
    await waitFor(() => expect(screen.getByText('No Attachments')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /upload attachment/i })).toBeInTheDocument();
  });

  it('lets an RBAC-only HR editor add certificates and attachments', async () => {
    setupAccess('edit');
    // Strip the legacy role so only the RBAC `captain` role grants HR edit.
    authState.value = { ...authState.value, profile: { ...authState.value.profile, role: 'purser' }, userRole: 'purser' };
    renderHrisPage(DocumentsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByRole('button', { name: /add certificate/i })).toBeInTheDocument());
    expect(screen.getByText('HR editor')).toBeInTheDocument();
    openTab(/attachments/i);
    await waitFor(() => expect(screen.getByRole('button', { name: /upload attachment/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /upload attachment/i })).toBeInTheDocument();
  });

  it('hides add / upload actions from HR viewers', async () => {
    setupAccess('view');
    renderHrisPage(DocumentsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'STCW Basic Safety Training (VI/1)' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /add certificate/i })).not.toBeInTheDocument();
    openTab(/attachments/i);
    await waitFor(() => expect(screen.getByText('ana-bosun-cv.pdf')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /upload attachment/i })).not.toBeInTheDocument();
  });
});
