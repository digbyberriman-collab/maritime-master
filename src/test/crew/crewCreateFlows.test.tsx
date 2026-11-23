/**
 * The crew create flows on the create-crew-member wrapper (finding
 * create-crew-member-unmigrated, client part):
 *
 * - CSV import: no password is generated or sent, no company is sent, and
 *   every row keeps the outcome the function gave (added and invited /
 *   added, invite failed / not added, with the reason); the summary counts
 *   come from those rows, and "complete" is only said when every row is.
 * - Add crew member: no password field, crew roles only, the invitation is
 *   a choice; a refusal stays in the form.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readRepoFile } from '../design/cssTokens';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  existing: [] as Array<{ email: string }>,
  onDrop: null as null | ((files: File[]) => void),
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'in', 'order', 'limit']) chain[op] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: h.existing, error: null }).then(resolve);
  return { supabase: { from: () => chain, functions: { invoke: (...args: unknown[]) => h.invoke(...args) } } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'p-admin', company_id: 'c-1', role: 'dpa' }, user: { id: 'u-admin' } }) }));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({ useVessels: () => ({ vessels: [{ id: 'v-1', name: 'DRAAK', imo_number: '1234567', status: 'Active' }], isLoading: false }) }));
vi.mock('@/shared/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop }: { onDrop: (files: File[]) => void }) => {
    h.onDrop = onDrop;
    return { getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false };
  },
}));
vi.mock('@/lib/csvParser', () => {
  const row = (rowNumber: number, first: string, email: string) => ({
    valid: true,
    errors: [],
    warnings: [],
    rowNumber,
    data: { first_name: first, last_name: 'Crew', email, rank: 'Deckhand', position: 'Deckhand', vessel_assignment: 'DRAAK', join_date: '2026-11-01', status: 'Pending', rowNumber },
  });
  return {
    parseCrewCSV: async () => ({
      results: [row(2, 'Alpha', 'alpha@example.test'), row(3, 'Bravo', 'bravo@example.test'), row(4, 'Charlie', 'charlie@example.test'), row(5, 'Delta', 'delta@example.test')],
      totalRows: 4,
      validRows: 4,
      errorRows: 0,
      warningRows: 0,
    }),
    downloadCSVTemplate: () => undefined,
    exportErrorRowsCSV: () => undefined,
  };
});
// Radix Select needs layout APIs jsdom lacks: a native <select> with the same contract.
vi.mock('@/components/ui/select', () => {
  type Ctx = { value?: string; onValueChange?: (v: string) => void; items: string[]; register: (v: string) => void };
  const SelectCtx = React.createContext<Ctx>({ items: [], register: () => undefined });
  const Select = ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
    const [items, setItems] = React.useState<string[]>([]);
    const register = React.useCallback((v: string) => setItems((xs) => (xs.includes(v) ? xs : [...xs, v])), []);
    return <SelectCtx.Provider value={{ value, onValueChange, items, register }}>{children}</SelectCtx.Provider>;
  };
  const SelectTrigger = () => {
    const c = React.useContext(SelectCtx);
    return (
      <select data-select="" value={c.value ?? ''} onChange={(e) => c.onValueChange?.(e.target.value)}>
        <option value="" />
        {c.items.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  };
  const SelectItem = ({ value }: { value: string }) => {
    const { register } = React.useContext(SelectCtx);
    React.useEffect(() => register(value), [register, value]);
    return null;
  };
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { Select, SelectTrigger, SelectItem, SelectContent: Passthrough, SelectValue: () => null };
});

import ImportCrewCSVModal from '@/modules/crew/components/ImportCrewCSVModal';
import CrewFormModal from '@/modules/crew/components/CrewFormModal';
import { CrewCreateFailedError } from '@/modules/crew/hooks/useCrew';

const ok = (data: unknown) => h.invoke.mockResolvedValueOnce({ data, error: null });
const httpError = (status: number, body: unknown) =>
  h.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) } });

// Radix Checkbox measures its form control.
const g = globalThis as { ResizeObserver?: unknown };
g.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeEach(() => {
  h.invoke.mockReset();
  h.existing = [];
  h.onDrop = null;
});

async function runImport(options: { sendInvites?: boolean } = {}) {
  const onSuccess = vi.fn();
  render(<ImportCrewCSVModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
  await act(async () => h.onDrop?.([new File(['x'], 'crew.csv', { type: 'text/csv' })]));
  fireEvent.click(screen.getByRole('button', { name: /Next/ }));
  const invites = await screen.findByLabelText('Email each new crew member an invitation');
  if (options.sendInvites === false) fireEvent.click(invites);
  fireEvent.click(screen.getByRole('button', { name: /Import 4 Crew Members/ }));
  await screen.findByRole('heading', { name: /Import (complete|finished)/ });
  return { onSuccess };
}

describe('ImportCrewCSVModal', () => {
  it('sends each row without a password or a company, and shows each row’s honest outcome and counts', async () => {
    ok({ ok: true, profileId: 'p-a', invitation: { status: 'sent', invitationId: 'i-a', stored: true } });
    httpError(502, { error: { code: 'partial_failure', message: 'x', details: { profileCreated: true, profileId: 'p-b', invitation: 'send_failed', email_error: 'provider_unavailable' } } });
    httpError(409, { error: { code: 'conflict', message: 'This email address cannot be used for a new crew member. Check the address, or find the person in the crew list.' } });
    ok({});
    const { onSuccess } = await runImport();

    expect(h.invoke).toHaveBeenCalledTimes(4);
    for (const [name, { body }] of h.invoke.mock.calls as Array<[string, { body: Record<string, unknown> }]>) {
      expect(name).toBe('create-crew-member');
      expect(body).not.toHaveProperty('password');
      expect(body).not.toHaveProperty('companyId');
      expect(body).toMatchObject({ role: 'crew', vesselId: 'v-1', sendInvite: true });
    }

    expect(screen.getByRole('heading', { name: 'Import finished with problems' })).toBeInTheDocument();
    expect(screen.queryByText(/Import Complete!|completed successfully/)).toBeNull();
    expect(screen.getByText(/2 of 4 rows were added · 1 invited/)).toBeInTheDocument();

    // The tiles: label → value, from the rows' own results.
    const tiles = Object.fromEntries(
      [...document.querySelectorAll('[data-import-summary] [data-state]')].map((el) => [
        el.querySelector('.type-eyebrow')?.textContent,
        el.querySelector('[data-kpi-value]')?.textContent,
      ]),
    );
    expect(tiles).toEqual({ Added: '2', 'Not invited': '1', 'Not added': '1', Skipped: '0' });

    const list = screen.getByRole('list', { name: 'Rows that need attention' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-import-row'))).toEqual(['invite_failed', 'failed', 'unconfirmed']);
    expect(within(items[0]).getByText('Added, not invited')).toBeInTheDocument();
    expect(within(items[0]).getByText(/did not answer/)).toBeInTheDocument();
    expect(within(items[1]).getByText('Not added')).toBeInTheDocument();
    expect(within(items[1]).getByText(/cannot be used for a new crew member/)).toBeInTheDocument();
    expect(within(items[2]).getByText('Not confirmed')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('every row added and invited: "Import complete"', async () => {
    for (const id of ['a', 'b', 'c', 'd']) ok({ ok: true, profileId: `p-${id}`, invitation: { status: 'sent', invitationId: `i-${id}`, stored: true } });
    await runImport();
    expect(screen.getByRole('heading', { name: 'Import complete' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Rows that need attention' })).toBeNull();
  });

  it('without invitations: sendInvite false, and nothing reads as invited', async () => {
    for (const id of ['a', 'b', 'c', 'd']) ok({ ok: true, profileId: `p-${id}`, invitation: { status: 'not_sent' } });
    await runImport({ sendInvites: false });
    expect((h.invoke.mock.calls as Array<[string, { body: Record<string, unknown> }]>).every(([, { body }]) => body.sendInvite === false)).toBe(true);
    expect(screen.getByText(/4 of 4 rows were added\./)).toBeInTheDocument();
    expect(screen.queryByText(/invited/)).toBeNull();
  });

  it('nothing added: onSuccess is not called', async () => {
    for (let i = 0; i < 4; i++) httpError(403, { error: { code: 'forbidden', message: "You don't have permission to do that." } });
    const { onSuccess } = await runImport();
    expect(screen.getByText(/0 of 4 rows were added/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('CrewFormModal', () => {
  const fill = () => {
    const [first, last] = screen.getAllByRole('textbox');
    fireEvent.change(first, { target: { value: 'Demo' } });
    fireEvent.change(last, { target: { value: 'Deckhand' } });
    fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value: 'deckhand@example.test' } });
  };

  it('has no password field and offers crew roles only', () => {
    render(<CrewFormModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} isLoading={false} />);
    expect(screen.queryByText(/Initial Password/i)).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    const roleOptions = [...document.querySelectorAll('select[data-select]')]
      .map((s) => [...(s as HTMLSelectElement).options].map((o) => o.value).filter(Boolean))
      .find((values) => values.includes('crew'));
    expect(roleOptions?.sort()).toEqual(['chief_engineer', 'chief_officer', 'crew', 'master']);
    expect(screen.getByLabelText('Send an invitation email')).toBeChecked();
  });

  it('submits without a password, with the invitation choice; closes after the person was added', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ kind: 'created', profileId: 'p-1', invited: 'sent', stored: true });
    const onClose = vi.fn();
    render(<CrewFormModal isOpen onClose={onClose} onSubmit={onSubmit} isLoading={false} />);
    fill();
    fireEvent.click(screen.getByLabelText('Send an invitation email'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Crew Member' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const data = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(data).not.toHaveProperty('password');
    expect(data).toMatchObject({ email: 'deckhand@example.test', firstName: 'Demo', lastName: 'Deckhand', role: 'crew', sendInvite: false });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('a refusal (nothing added) stays in the form with the server’s sentence', async () => {
    const failure = { status: 409, code: 'conflict' as const, reason: null, message: 'This email address cannot be used for a new crew member. Check the address, or find the person in the crew list.', retryAfterSeconds: null, details: {} };
    const onSubmit = vi.fn().mockRejectedValue(new CrewCreateFailedError(failure));
    const onClose = vi.fn();
    render(<CrewFormModal isOpen onClose={onClose} onSubmit={onSubmit} isLoading={false} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add Crew Member' }));
    expect(await screen.findByText(failure.message)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('no password is made, kept or sent by the crew flows', () => {
  it.each(['src/modules/crew/components/CrewFormModal.tsx', 'src/modules/crew/components/ImportCrewCSVModal.tsx', 'src/modules/crew/hooks/useCrew.ts'])('%s', (file) => {
    const source = readRepoFile(file);
    expect(source).not.toMatch(/generatePassword|password:/);
    expect(source).not.toMatch(/functions\.invoke\(\s*['"]create-crew-member/);
  });
});
