/**
 * FullCrewEditModal mirrors the Phase 2 crew guards (finding
 * crew-edit-guard-refusal-fake-success, client part), so a locked change
 * reads as locked before Save instead of as a refusal after it:
 *
 * - your own position, and a Master / Captain row, need users-access admin
 *   of the vessel (admin.access.users_access.admin with that vessel);
 * - typing Master or Captain without it is stopped in the form;
 * - position, join date and the assignment id are sent only when they
 *   changed, and a pending placement (built from imported_vessel_id) is
 *   never sent as an assignment;
 * - a pending crew member's rank, position and joining date need
 *   users-access admin of the pending vessel.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  role: 'master',
  userId: 'u-master',
  can: vi.fn((_key: string, _ctx?: { vesselId?: string | null }) => false),
}));

vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'p-viewer', company_id: 'c-1', role: h.role }, user: { id: h.userId } }),
}));
vi.mock('@/lib/permissions/useCan', () => ({
  useCan: (key: string, ctx?: { vesselId?: string | null }) => h.can(key, ctx),
}));
// Radix Select needs layout APIs jsdom lacks: a native <select> with the same contract.
vi.mock('@/components/ui/select', () => {
  type Ctx = { value?: string; disabled?: boolean; onValueChange?: (v: string) => void; items: string[]; register: (v: string) => void };
  const SelectCtx = React.createContext<Ctx>({ items: [], register: () => undefined });
  const Select = ({
    value,
    disabled,
    onValueChange,
    children,
  }: {
    value?: string;
    disabled?: boolean;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => {
    const [items, setItems] = React.useState<string[]>([]);
    const register = React.useCallback((v: string) => setItems((xs) => (xs.includes(v) ? xs : [...xs, v])), []);
    return <SelectCtx.Provider value={{ value, disabled, onValueChange, items, register }}>{children}</SelectCtx.Provider>;
  };
  const SelectTrigger = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>((props, ref) => {
    const c = React.useContext(SelectCtx);
    return (
      <select
        ref={ref}
        id={props.id}
        aria-describedby={props['aria-describedby']}
        disabled={c.disabled}
        value={c.value ?? ''}
        onChange={(e) => c.onValueChange?.(e.target.value)}
      >
        <option value="" />
        {c.items.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  });
  SelectTrigger.displayName = 'SelectTrigger';
  const SelectItem = ({ value }: { value: string }) => {
    const { register } = React.useContext(SelectCtx);
    React.useEffect(() => register(value), [register, value]);
    return null;
  };
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { Select, SelectTrigger, SelectItem, SelectContent: Passthrough, SelectValue: () => null };
});

import FullCrewEditModal from '@/modules/crew/components/FullCrewEditModal';
import type { CrewMember, UpdateCrewMemberData } from '@/modules/crew/hooks/useCrew';

const ADMIN = 'admin.access.users_access.admin';
const OWN_HINT = 'Only a users-access administrator can change your own position.';
const MASTER_HINT = 'Only a users-access administrator of the vessel can appoint or remove a Master.';
const PENDING_HINT = 'Only a users-access administrator of the pending vessel can change this.';

const member = (extra: Partial<CrewMember> = {}): CrewMember => ({
  id: 'p-crew',
  user_id: 'u-crew',
  email: 'deckhand@example.test',
  first_name: 'Deck',
  last_name: 'Hand',
  rank: 'Deckhand',
  nationality: null,
  phone: null,
  status: 'Active',
  role: 'crew',
  created_at: '2026-01-01T00:00:00Z',
  current_assignment: { id: 'a-1', vessel_id: 'v-1', vessel_name: 'DRAAK', position: 'Deckhand', join_date: '2026-01-01' },
  ...extra,
});

const pending = (): CrewMember =>
  member({
    id: 'p-pending',
    user_id: null,
    is_imported: true,
    imported_vessel_id: 'v-2',
    current_assignment: {
      id: 'imported-p-pending',
      vessel_id: 'v-2',
      vessel_name: 'ZEPHYR',
      position: 'Deckhand',
      join_date: '2026-02-01',
      pending_placement: true,
    },
  });

function open(crewMember: CrewMember) {
  const onSubmit = vi.fn(async (_data: UpdateCrewMemberData) => undefined);
  const onClose = vi.fn();
  render(<FullCrewEditModal isOpen onClose={onClose} crewMember={crewMember} onSubmit={onSubmit} isLoading={false} />);
  // Radix Tabs activate on mousedown.
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Employment' }));
  return { onSubmit, onClose };
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
const position = () => screen.getByLabelText('Position') as HTMLInputElement;

beforeEach(() => {
  h.role = 'master';
  h.userId = 'u-master';
  h.can.mockReset();
  h.can.mockImplementation(() => false);
});

describe('FullCrewEditModal position and rank locks', () => {
  it('locks your own position without users-access admin of the vessel', () => {
    open(member({ id: 'p-master', user_id: 'u-master', current_assignment: { id: 'a-9', vessel_id: 'v-1', vessel_name: 'DRAAK', position: 'Chief Officer', join_date: '2026-01-01' } }));

    expect(position()).toBeDisabled();
    expect(screen.getByText(OWN_HINT)).toBeInTheDocument();
    expect(position()).toHaveAttribute('aria-describedby', expect.stringContaining(screen.getByText(OWN_HINT).id));
    expect(h.can).toHaveBeenCalledWith(ADMIN, { vesselId: 'v-1' });
  });

  it('locks a Master row without users-access admin of the vessel', () => {
    open(member({ current_assignment: { id: 'a-2', vessel_id: 'v-1', vessel_name: 'DRAAK', position: 'Master', join_date: '2025-06-01' } }));

    expect(position()).toBeDisabled();
    expect(screen.getByText(MASTER_HINT)).toBeInTheDocument();
  });

  it('locks a Captain row too (normalised as the guard does)', () => {
    open(member({ current_assignment: { id: 'a-3', vessel_id: 'v-1', vessel_name: 'DRAAK', position: ' CAPTAIN ', join_date: '2025-06-01' } }));

    expect(position()).toBeDisabled();
  });

  it('stops a Master or Captain appointment in the form without the capability', async () => {
    const { onSubmit } = open(member());
    expect(position()).toBeEnabled();

    fireEvent.change(position(), { target: { value: 'Captain' } });
    save();

    expect(await screen.findByText(MASTER_HINT)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the position and the assignment id when an admin of the vessel changes it', async () => {
    h.can.mockImplementation((key: string, ctx?: { vesselId?: string | null }) => key === ADMIN && ctx?.vesselId === 'v-1');
    const { onSubmit, onClose } = open(member({ current_assignment: { id: 'a-2', vessel_id: 'v-1', vessel_name: 'DRAAK', position: 'Master', join_date: '2025-06-01' } }));

    expect(position()).toBeEnabled();
    expect(screen.queryByText(MASTER_HINT)).toBeNull();
    fireEvent.change(position(), { target: { value: 'Chief Officer' } });
    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ profileId: 'p-crew', userId: 'u-crew', assignmentId: 'a-2', position: 'Chief Officer' });
    expect(payload).not.toHaveProperty('joinDate');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('lets an admin of the vessel appoint a Master', async () => {
    h.can.mockImplementation((key: string) => key === ADMIN);
    const { onSubmit } = open(member());

    fireEvent.change(position(), { target: { value: 'Master' } });
    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ assignmentId: 'a-1', position: 'Master' });
  });

  it('sends no position, join date or assignment id when they did not change', async () => {
    h.can.mockImplementation(() => true);
    const { onSubmit } = open(member());

    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ profileId: 'p-crew', firstName: 'Deck' });
    expect(payload).not.toHaveProperty('position');
    expect(payload).not.toHaveProperty('joinDate');
    expect(payload).not.toHaveProperty('assignmentId');
  });

  it('keeps the form open when the save is refused', async () => {
    h.can.mockImplementation(() => true);
    const onSubmit = vi.fn(async (_data: UpdateCrewMemberData) => {
      throw new Error('Not saved');
    });
    const onClose = vi.fn();
    render(<FullCrewEditModal isOpen onClose={onClose} crewMember={member()} onSubmit={onSubmit} isLoading={false} />);

    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks a pending crew member’s rank, position and joining date without admin of the pending vessel', () => {
    h.role = 'dpa';
    open(pending());

    expect(screen.getByLabelText('Rank')).toBeDisabled();
    expect(position()).toBeDisabled();
    expect(screen.getByLabelText('Join Date')).toBeDisabled();
    expect(screen.getAllByText(PENDING_HINT)).toHaveLength(3);
    expect(h.can).toHaveBeenCalledWith(ADMIN, { vesselId: 'v-2' });
  });

  it('sends a pending crew member’s unchanged rank nowhere, and never an assignment update', async () => {
    h.role = 'dpa';
    h.can.mockImplementation((key: string, ctx?: { vesselId?: string | null }) => key === ADMIN && ctx?.vesselId === 'v-2');
    const { onSubmit } = open(pending());

    expect(screen.getByLabelText('Rank')).toBeEnabled();
    expect(position()).toBeEnabled();
    expect(screen.queryByText(PENDING_HINT)).toBeNull();

    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const unchanged = onSubmit.mock.calls[0][0];
    expect(unchanged).not.toHaveProperty('rank');
    expect(unchanged).not.toHaveProperty('assignmentId');
    expect(unchanged).not.toHaveProperty('pendingPosition');
  });

  it('writes a pending crew member’s new rank and position to the profile, not to an assignment', async () => {
    h.role = 'dpa';
    h.can.mockImplementation((key: string, ctx?: { vesselId?: string | null }) => key === ADMIN && ctx?.vesselId === 'v-2');
    const { onSubmit } = open(pending());

    fireEvent.change(screen.getByLabelText('Rank'), { target: { value: 'Bosun' } });
    fireEvent.change(position(), { target: { value: 'Bosun' } });
    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ profileId: 'p-pending', rank: 'Bosun', pendingPosition: 'Bosun' });
    expect(payload).not.toHaveProperty('assignmentId');
    expect(payload).not.toHaveProperty('position');
  });
});
