import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderHrisPage, setupAccess, setupSupabase, baseFixtures } from '@/test/hris/harness';
import type { SupabaseCall } from '@/test/hris/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const s = await import('@/test/hris/state');
  return { supabase: s.supabaseProxy };
});
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const s = await import('@/test/hris/state');
  return { useAuth: () => s.authState.value, AuthProvider: ({ children }: { children: React.ReactNode }) => children };
});

import PersonalDetailsPage from '@/modules/hris/pages/PersonalDetailsPage';

const ROUTE = '/hris/employee-records/personal-details';

describe('PersonalDetailsPage', () => {
  let calls: SupabaseCall[];

  beforeEach(() => {
    ({ calls } = setupSupabase(baseFixtures()));
  });

  it('asks HR to pick a crew member when none is selected', async () => {
    setupAccess('admin');
    renderHrisPage(PersonalDetailsPage, { route: ROUTE });
    expect(screen.getByRole('heading', { name: 'Personal Details' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Select a crew member')).toBeInTheDocument());
    expect(screen.getByText(/Use the picker above/)).toBeInTheDocument();
    // The crew picker is the combobox in the toolbar.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('shows the selected crew member with sensitive fields and expiry badges for HR', async () => {
    setupAccess('admin');
    renderHrisPage(PersonalDetailsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ana Bosun' })).toBeInTheDocument());
    // Rank · department line and the vessel from the directory join.
    expect(screen.getByText('Bosun · Deck')).toBeInTheDocument();
    expect(screen.getByText('M/Y Draak')).toBeInTheDocument();
    // Sensitive fields are visible to HR viewers.
    expect(screen.getByText('P222')).toBeInTheDocument();
    expect(screen.getByText('Passport number')).toBeInTheDocument();
    // Passport, medical and contract-end expiry badges.
    expect(screen.getAllByText(/d remaining|Expired \d+d ago|Expires today/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    // Audit trail rendered (no fixture rows).
    await waitFor(() => expect(screen.getByText('No changes recorded yet.')).toBeInTheDocument());
  });

  it('lets an HR editor change the phone number and writes the update plus an audit row', async () => {
    setupAccess('admin');
    renderHrisPage(PersonalDetailsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const phone = await screen.findByLabelText('Phone');
    expect(phone).toBeInstanceOf(HTMLInputElement);
    expect((phone as HTMLInputElement).value).toBe('+31 6');

    fireEvent.change(phone, { target: { value: '+31 6 555 1234' } });
    const save = screen.getByRole('button', { name: /save changes/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => {
      const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
      expect(update).toBeDefined();
    });
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update') as SupabaseCall;
    expect(update.payload).toMatchObject({ phone: '+31 6 555 1234' });
    expect(update.filters).toContainEqual({ kind: 'eq', column: 'id', value: 'p1' });
    // Only the changed column (plus updated_at) is written.
    expect(Object.keys(update.payload as object).sort()).toEqual(['phone', 'updated_at']);

    await waitFor(() => expect(calls.find((c) => c.table === 'audit_logs' && c.op === 'insert')).toBeDefined());
    const audit = calls.find((c) => c.table === 'audit_logs' && c.op === 'insert') as SupabaseCall;
    expect(audit.payload).toMatchObject({
      entity_type: 'crew_profile',
      entity_id: 'p1',
      action: 'UPDATE',
      actor_user_id: 'u-dpa',
      changed_fields: { phone: true },
      old_values: { phone: '+31 6' },
      new_values: { phone: '+31 6 555 1234' },
    });

    // Back in read mode with the new value shown.
    await waitFor(() => expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument());
    expect(screen.getAllByText('+31 6 555 1234').length).toBeGreaterThanOrEqual(1);
  });

  it('hides the Edit action from HR viewers', async () => {
    setupAccess('view');
    renderHrisPage(PersonalDetailsPage, { route: `${ROUTE}?crew=p1` });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ana Bosun' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    // Viewers still see the sensitive fields.
    expect(screen.getByText('P222')).toBeInTheDocument();
    // No avatar upload for viewers either.
    expect(screen.queryByLabelText('Upload profile photo')).not.toBeInTheDocument();
  });

  it('pins a crew member to their own record and only unlocks self-service fields', async () => {
    setupAccess('self');
    renderHrisPage(PersonalDetailsPage, { route: ROUTE });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cal Crew' })).toBeInTheDocument());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Self-service')).toBeInTheDocument();
    expect(screen.getByText('Your personal record.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    // Phone is editable...
    const phone = await screen.findByLabelText('Phone');
    expect(phone).toBeInstanceOf(HTMLInputElement);
    expect(phone).toBeEnabled();
    // ...preferred name too...
    expect(screen.getByLabelText('Preferred name')).toBeInstanceOf(HTMLInputElement);
    // ...but rank and the rest stay locked.
    expect(screen.queryByLabelText('Rank')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Not editable with your access level').length).toBeGreaterThan(0);
    expect(screen.getByText('Rank')).toBeInTheDocument();
  });

  it('renders an imported crew member who has no login account', async () => {
    setupAccess('admin');
    renderHrisPage(PersonalDetailsPage, { route: `${ROUTE}?crew=p2` });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Benny Deckhand' })).toBeInTheDocument());
    expect(screen.getByText('No login account yet')).toBeInTheDocument();
    expect(screen.getByText('Not Invited')).toBeInTheDocument();
    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('No current vessel')).toBeInTheDocument();
    // HR can still edit an imported record.
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });
});
