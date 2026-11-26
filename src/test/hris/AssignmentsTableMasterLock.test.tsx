/**
 * The Employment History table mirrors the crew-assignment guard's Master
 * office lock (finding master-office-end-date-edit-unguarded, client part;
 * D-244 amending D-218 / D-237), so a locked change reads as locked before
 * Save instead of as a refusal after it:
 *
 * - on a current Master / Captain row (position or rank; a planned relief
 *   counts too) Position, Rank, Join date and Leave date need users-access
 *   admin of that row's vessel. Without it they are disabled, described by
 *   the guard's sentence, and Save sends them at their stored values;
 * - ended Master rows (history) and other rows stay open to HR editors;
 * - making another row a current Master is stopped in the form (rule e);
 * - a 42501 refusal shows the guard's DETAIL sentence, never its code.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MASTER_OFFICE_MESSAGE } from '@/modules/crew/lib/crewUpdateErrors';
import type { AssignmentPatch, AssignmentRecord } from '@/modules/hris/lib/employmentHistory';

const h = vi.hoisted(() => ({
  can: vi.fn((_key: string, _ctx?: { vesselId?: string | null }) => false),
}));

vi.mock('@/lib/permissions/useCan', () => ({
  useCan: (key: string, ctx?: { vesselId?: string | null }) => h.can(key, ctx),
}));

import { AssignmentsTable } from '@/modules/hris/components/history/AssignmentsTable';

const ADMIN_KEY = 'admin.access.users_access.admin';
const TODAY = new Date('2026-11-26T12:00:00Z');
const OFFICE_FIELDS = ['Position', 'Rank', 'Join date', 'Leave date'] as const;

/** Each row's Notes cell doubles as its handle in the table. */
const NOTE = {
  sitting: 'Sitting Master',
  captainRank: 'Captain by rank',
  relief: 'Planned relief',
  otherVessel: 'Master of the other vessel',
  ended: 'Former Master',
  deckhand: 'Deck crew',
} as const;

const row = (overrides: Partial<AssignmentRecord> & Pick<AssignmentRecord, 'id'>): AssignmentRecord => ({
  vessel_id: 'v-dra',
  vessel_name: 'DRAAK',
  position: 'Deckhand',
  rank: null,
  department: 'deck',
  join_date: '2026-10-01',
  leave_date: null,
  is_current: true,
  end_reason: null,
  notes: null,
  ...overrides,
});

const ROWS: AssignmentRecord[] = [
  row({ id: 'a-sitting', position: 'Master', join_date: '2026-10-01', notes: NOTE.sitting }),
  row({ id: 'a-captain-rank', position: 'Chief Officer', rank: 'Captain', join_date: '2026-09-01', leave_date: '2027-01-15', notes: NOTE.captainRank }),
  row({ id: 'a-relief', position: 'Master', join_date: '2026-12-20', notes: NOTE.relief }),
  row({ id: 'a-gam', vessel_id: 'v-gam', vessel_name: 'GAMMA', position: 'Master', join_date: '2026-08-01', notes: NOTE.otherVessel }),
  row({ id: 'a-ended', position: 'Master', join_date: '2026-01-01', leave_date: '2026-06-30', is_current: false, end_reason: 'end_of_contract', notes: NOTE.ended }),
  row({ id: 'a-deckhand', position: 'Deckhand', join_date: '2026-08-15', notes: NOTE.deckhand }),
];

type OnSave = (assignment: AssignmentRecord, patch: AssignmentPatch) => Promise<unknown>;

const renderTable = (onSave: OnSave = vi.fn<OnSave>().mockResolvedValue(undefined)) =>
  render(<AssignmentsTable canEdit today={TODAY} onSave={onSave} assignments={ROWS} />);

const rowOf = (note: string): HTMLElement => {
  const tr = screen.getByText(note).closest('tr');
  if (!tr) throw new Error(`No table row for "${note}"`);
  return tr;
};

const startEdit = (note: string) => fireEvent.click(within(rowOf(note)).getByRole('button', { name: 'Edit assignment' }));
const cancelEdit = () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

const expectLocked = () => {
  for (const label of OFFICE_FIELDS) {
    const input = screen.getByLabelText(label);
    expect(input, label).toBeDisabled();
    expect(input, label).toHaveAccessibleDescription(MASTER_OFFICE_MESSAGE);
  }
  expect(screen.getByLabelText('Notes')).toBeEnabled();
  expect(screen.getByText(MASTER_OFFICE_MESSAGE)).toBeVisible();
};

const expectUnlocked = () => {
  for (const label of OFFICE_FIELDS) {
    const input = screen.getByLabelText(label);
    expect(input, label).toBeEnabled();
    expect(input, label).not.toHaveAttribute('aria-describedby');
  }
  expect(screen.queryByText(MASTER_OFFICE_MESSAGE)).toBeNull();
};

beforeEach(() => {
  h.can.mockReset();
  h.can.mockImplementation(() => false);
});

describe('AssignmentsTable: Master office lock (D-244)', () => {
  it('(a) locks the sitting Master’s bounds and title for a non-admin; a Notes edit saves the stored office', async () => {
    const onSave = vi.fn<OnSave>().mockResolvedValue(undefined);
    renderTable(onSave);
    startEdit(NOTE.sitting);
    expectLocked();

    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Handover brief filed' } });
    save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [assignment, patch] = onSave.mock.calls[0];
    expect(assignment.id).toBe('a-sitting');
    expect(patch).toMatchObject({ join_date: '2026-10-01', leave_date: null, position: 'Master', rank: null, notes: 'Handover brief filed' });
  });

  it('(b) locks a Captain by rank and a planned relief Master the same way', () => {
    renderTable();
    startEdit(NOTE.captainRank);
    expectLocked();
    expect(screen.getByLabelText('Leave date')).toHaveValue('2027-01-15');
    cancelEdit();

    startEdit(NOTE.relief);
    expectLocked();
    expect(screen.getByLabelText('Join date')).toHaveValue('2026-12-20');
  });

  it('(c) asks for users-access admin of the edited row’s vessel', () => {
    renderTable();
    startEdit(NOTE.sitting);
    expect(h.can).toHaveBeenCalledWith(ADMIN_KEY, { vesselId: 'v-dra' });
  });

  it('(d) an admin of one vessel may move that vessel’s Master, not another vessel’s', async () => {
    h.can.mockImplementation((key, ctx) => key === ADMIN_KEY && ctx?.vesselId === 'v-dra');
    const onSave = vi.fn<OnSave>().mockResolvedValue(undefined);
    renderTable(onSave);

    startEdit(NOTE.sitting);
    expectUnlocked();
    fireEvent.change(screen.getByLabelText('Leave date'), { target: { value: '2026-12-20' } });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][1]).toMatchObject({ leave_date: '2026-12-20', position: 'Master' });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
    startEdit(NOTE.otherVessel);
    expect(h.can).toHaveBeenCalledWith(ADMIN_KEY, { vesselId: 'v-gam' });
    expectLocked();
  });

  it('(e) leaves an ended Master and a Deckhand open to a non-admin HR editor', async () => {
    const onSave = vi.fn<OnSave>().mockResolvedValue(undefined);
    renderTable(onSave);

    startEdit(NOTE.ended);
    expectUnlocked();
    fireEvent.change(screen.getByLabelText('Leave date'), { target: { value: '2026-07-15' } });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].id).toBe('a-ended');
    expect(onSave.mock.calls[0][1]).toMatchObject({ leave_date: '2026-07-15', position: 'Master' });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
    startEdit(NOTE.deckhand);
    expectUnlocked();
    fireEvent.change(screen.getByLabelText('Leave date'), { target: { value: '2026-12-31' } });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].id).toBe('a-deckhand');
    expect(onSave.mock.calls[1][1]).toMatchObject({ leave_date: '2026-12-31', position: 'Deckhand' });
  });

  it('(f) stops a non-admin appointing a Master on another row; an admin may', async () => {
    const onSave = vi.fn<OnSave>().mockResolvedValue(undefined);
    const view = renderTable(onSave);

    startEdit(NOTE.deckhand);
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'Master' } });
    save();
    expect(await screen.findByText(MASTER_OFFICE_MESSAGE)).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();

    // Captain by rank is the same office.
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'Deckhand' } });
    fireEvent.change(screen.getByLabelText('Rank'), { target: { value: 'captain' } });
    save();
    expect(await screen.findByText(MASTER_OFFICE_MESSAGE)).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    view.unmount();

    h.can.mockImplementation((key) => key === ADMIN_KEY);
    renderTable(onSave);
    startEdit(NOTE.deckhand);
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'Master' } });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][1]).toMatchObject({ position: 'Master', leave_date: null });
    expect(screen.queryByText(MASTER_OFFICE_MESSAGE)).toBeNull();
  });

  it('(g) shows the guard’s sentence for a 42501 refusal, never its code', async () => {
    const onSave = vi
      .fn<OnSave>()
      .mockRejectedValue({ code: '42501', message: 'master_office_change_refused', details: MASTER_OFFICE_MESSAGE });
    renderTable(onSave);

    startEdit(NOTE.deckhand);
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Moved to tender duty' } });
    save();

    expect(await screen.findByText(MASTER_OFFICE_MESSAGE)).toBeVisible();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(document.body.textContent ?? '').not.toContain('master_office_change_refused');
    // The row stays in edit mode so the change is not lost.
    expect(screen.getByLabelText('Notes')).toHaveValue('Moved to tender duty');
  });
});
