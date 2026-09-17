import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderHrisPage, setupAccess, setupSupabase, baseFixtures, COMPANY_ID } from '@/test/hris/harness';

vi.mock('@/integrations/supabase/client', async () => {
  const s = await import('@/test/hris/state');
  return { supabase: s.supabaseProxy };
});
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const s = await import('@/test/hris/state');
  return { useAuth: () => s.authState.value, AuthProvider: ({ children }: { children: React.ReactNode }) => children };
});

import NextOfKinPage from '@/modules/hris/pages/NextOfKinPage';

const ROUTE = '/hris/employee-records/next-of-kin-emergency';

const fixtures = () => ({
  ...baseFixtures(),
  crew_next_of_kin: [
    { id: 'k1', company_id: COMPANY_ID, profile_id: 'p1', full_name: 'Maria Bosun', relationship: 'Spouse/Partner', phone_primary: '+31 6 1234', phone_secondary: null, email: 'maria@example.com', address_line1: null, address_line2: null, city: 'Rotterdam', postal_code: null, country: 'NL', language: 'Dutch', is_primary: true, is_emergency_contact: true, notes: null, consent_obtained_at: '2026-01-01T00:00:00Z', created_by: null, updated_by: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'k2', company_id: COMPANY_ID, profile_id: 'p1', full_name: 'Pieter Bosun', relationship: 'Parent', phone_primary: '+31 6 9999', phone_secondary: null, email: null, address_line1: null, address_line2: null, city: null, postal_code: null, country: null, language: null, is_primary: false, is_emergency_contact: true, notes: null, consent_obtained_at: null, created_by: null, updated_by: null, created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
    { id: 'k3', company_id: COMPANY_ID, profile_id: 'p-crew', full_name: 'Sam Crew', relationship: 'Sibling', phone_primary: '+44 7', phone_secondary: null, email: null, address_line1: null, address_line2: null, city: null, postal_code: null, country: null, language: null, is_primary: true, is_emergency_contact: true, notes: null, consent_obtained_at: null, created_by: null, updated_by: null, created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z' },
  ],
});

describe('NextOfKinPage', () => {
  beforeEach(() => {
    setupSupabase(fixtures());
  });

  it('shows HR the crew who have nobody recorded when no crew is selected', async () => {
    setupAccess('admin');
    renderHrisPage(NextOfKinPage, { route: ROUTE });
    expect(screen.getByText('Next of Kin / Emergency')).toBeInTheDocument();
    // Ben (p2) has no contact; Ana (p1) does.
    await waitFor(() => expect(screen.getByText(/Ben|Benny/)).toBeInTheDocument());
    expect(screen.queryByText(/Ana Bosun/)).not.toBeInTheDocument();
  });

  it('shows the primary contact first for the selected crew member', async () => {
    setupAccess('admin');
    renderHrisPage(NextOfKinPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByText('Maria Bosun')).toBeInTheDocument());
    expect(screen.getByText(/In case of emergency, call/i)).toBeInTheDocument();
    expect(screen.getByText('Pieter Bosun')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add contact/i })).toBeInTheDocument();
  });

  it('lets HR editors add a contact when none exists', async () => {
    setupAccess('edit');
    renderHrisPage(NextOfKinPage, { route: `${ROUTE}?crew=p2` });
    await waitFor(() => expect(screen.getByText(/No emergency contact recorded/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /add contact/i })).toBeInTheDocument();
  });

  it('hides edit actions from HR viewers', async () => {
    setupAccess('view');
    renderHrisPage(NextOfKinPage, { route: `${ROUTE}?crew=p2` });
    await waitFor(() => expect(screen.getByText(/No emergency contact recorded/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /add contact/i })).not.toBeInTheDocument();
  });

  it('pins a crew member to their own record without a picker', async () => {
    setupAccess('self');
    renderHrisPage(NextOfKinPage, { route: ROUTE });
    await waitFor(() => expect(screen.getByText('Sam Crew')).toBeInTheDocument());
    expect(screen.queryByText(/All crew — pick someone/)).not.toBeInTheDocument();
    // Own record is editable.
    expect(screen.getByRole('button', { name: /add contact/i })).toBeInTheDocument();
  });
});
