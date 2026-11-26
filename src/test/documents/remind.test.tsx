/**
 * Manual reminders of a fleet document (components/RemindDialog.tsx,
 * hooks/useFleetDocumentAcks.ts remindFleetDocument, lib/ackAdmin.ts; gap/02
 * FD7 manual reminders, W1 "Remind"; D-128, D-249; X5-05B):
 *
 * - the 24-hour rule is shown before anything is sent, with where a
 *   reminder arrives (in-app), and who a reminder cannot reach;
 * - who it reaches: the people still to acknowledge with a login, never the
 *   caller; the recently reminded (from the log the caller can read) are
 *   "at least" skipped; nobody to remind disables the button;
 * - the answer `{ reminder_id, sent, skipped, failed, vessels }` is checked;
 *   the toast reports the reminded, the skipped (24-hour rule) and the
 *   unreachable; an answer of another shape is not a success;
 * - refusals are sentences in the dialog (not permitted, vessel required);
 *   the RPC missing is "not set up yet";
 * - nothing anywhere says an email was sent (D-249).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Answer = { data: unknown; error: { code?: string; message: string; details?: string | null } | null };

const state = vi.hoisted(() => ({
  rpcs: {} as Record<string, Answer>,
  tables: {} as Record<string, Answer>,
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  filters: [] as Array<[string, string, unknown]>,
  notify: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const result = () => state.tables[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit']) chain[m] = () => chain;
    for (const m of ['eq', 'gte']) {
      chain[m] = (column: string, value: unknown) => {
        state.filters.push([m, column, value]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => {
    state.calls.push({ fn, args });
    return Promise.resolve(state.rpcs[fn] ?? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
  };
  return { supabase: { from, rpc } };
});
vi.mock('@/shared/lib/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/notify')>()),
  notify: state.notify,
}));

import { RemindDialog, type RemindRequest } from '@/modules/documents/components/RemindDialog';
import {
  REMIND_CHANNEL,
  REMIND_RULE,
  parseRemindOutcome,
  remindCandidates,
  remindOutcomeMessage,
  remindRefusal,
} from '@/modules/documents/lib/ackAdmin';
import { remindFleetDocument } from '@/modules/documents/hooks/useFleetDocumentAcks';
import type { FleetDocumentAckStatusRow } from '@/modules/documents/types/db.pending';

const row = (profileId: string, vesselId: string, s: FleetDocumentAckStatusRow['state'], extra: Partial<FleetDocumentAckStatusRow> = {}): FleetDocumentAckStatusRow => ({
  document_id: 'd-fire',
  version_id: 'ver-fire',
  vessel_id: vesselId,
  profile_id: profileId,
  person_name: `Demo ${profileId}`,
  position: 'Deckhand',
  department: 'Deck',
  has_login: true,
  on_crew: true,
  is_planned: false,
  join_date: '2026-01-01',
  state: s,
  due_at: '2026-11-19T10:00:00Z',
  blocked_reason: null,
  acknowledged_at: null,
  method: null,
  ...extra,
});
const ROWS = [
  row('p-bosun', 'v-dra', 'overdue'),
  row('p-deck', 'v-dra', 'pending'),
  row('p-master', 'v-dra', 'pending'),
  row('p-junior', 'v-dra', 'blocked', { has_login: false, blocked_reason: 'no_login' }),
  row('p-co', 'v-dra', 'acknowledged'),
  row('p-gam', 'v-gam', 'overdue'),
  row('p-left', 'v-dra', 'pending', { on_crew: false }),
  row('p-other-doc', 'v-dra', 'pending', { document_id: 'd-sms' }),
];
const REQUEST: RemindRequest = {
  documentId: 'd-fire',
  title: 'Fire response',
  versionLabel: 'v3',
  scopes: ['person', 'vessel', 'all'],
  vesselId: 'v-dra',
  vesselName: 'DRAAK',
  profileId: 'p-bosun',
  personName: 'Demo Bosun',
};

function renderDialog(request: RemindRequest = REQUEST, rows: FleetDocumentAckStatusRow[] | null = ROWS, onOpenChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RemindDialog open onOpenChange={onOpenChange} companyId="co-1" request={request} rows={rows} callerProfileId="p-master" />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

const dialog = () => screen.getByRole('dialog', { name: 'Remind about Fire response' });
const EMAIL = /e-?mail/i;

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});
beforeEach(() => {
  state.rpcs = {};
  state.tables = {};
  state.calls = [];
  state.filters = [];
  for (const fn of Object.values(state.notify)) fn.mockReset();
});
afterEach(() => cleanup());

describe('the reminder answer and its words (lib/ackAdmin.ts)', () => {
  it('reads only the definer’s shape: whole counts, an id exactly when someone was sent or skipped', () => {
    expect(parseRemindOutcome({ reminder_id: 'r-1', sent: 2, skipped: 1, failed: 0, vessels: 1 })).toEqual({ reminderId: 'r-1', sent: 2, skipped: 1, failed: 0, vessels: 1 });
    expect(parseRemindOutcome({ reminder_id: null, sent: 0, skipped: 0, failed: 0, vessels: 0 })).toEqual({ reminderId: null, sent: 0, skipped: 0, failed: 0, vessels: 0 });
    expect(parseRemindOutcome({ reminder_id: null, sent: 0, skipped: 0, failed: 2, vessels: 0 })?.failed).toBe(2);
    for (const bad of [
      null,
      [],
      'sent',
      { reminder_id: null, sent: 2, skipped: 0, failed: 0, vessels: 1 },
      { reminder_id: 'r-1', sent: 0, skipped: 0, failed: 0, vessels: 0 },
      { reminder_id: 'r-1', sent: -1, skipped: 2, failed: 0, vessels: 1 },
      { reminder_id: 'r-1', sent: 1.5, skipped: 0, failed: 0, vessels: 1 },
      { reminder_id: 'r-1', sent: 1, skipped: 0, vessels: 1 },
      { reminder_id: 7, sent: 1, skipped: 0, failed: 0, vessels: 1 },
    ]) {
      expect(parseRemindOutcome(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('says who was reminded, who was skipped by the 24-hour rule and who could not be reached; never an email', () => {
    const cases = [
      [{ reminderId: 'r', sent: 3, skipped: 2, failed: 0, vessels: 2 }, 'success', '3 people reminded', 'It is in their STORM notifications. 2 people skipped: reminded in the last 24 hours.'],
      [{ reminderId: 'r', sent: 1, skipped: 0, failed: 1, vessels: 1 }, 'warning', '1 person reminded', 'It is in their STORM notifications. The reminder could not reach 1 person; try again later.'],
      [{ reminderId: 'r', sent: 0, skipped: 4, failed: 0, vessels: 0 }, 'info', 'Nobody was reminded', 'All 4 people still to acknowledge were reminded in the last 24 hours.'],
      [{ reminderId: 'r', sent: 0, skipped: 1, failed: 0, vessels: 0 }, 'info', 'Nobody was reminded', 'The one person still to acknowledge was reminded in the last 24 hours.'],
      [{ reminderId: null, sent: 0, skipped: 0, failed: 2, vessels: 0 }, 'warning', 'Nobody was reminded', 'The reminder could not reach 2 people; try again later.'],
      [{ reminderId: null, sent: 0, skipped: 0, failed: 0, vessels: 0 }, 'info', 'Nobody to remind', expect.stringMatching(/^Everyone has acknowledged/)],
    ] as const;
    for (const [outcome, tone, title, description] of cases) {
      const message = remindOutcomeMessage(outcome);
      expect(message).toEqual({ tone, title, description });
      expect(`${message.title} ${message.description}`).not.toMatch(EMAIL);
    }
    expect(`${REMIND_RULE} ${REMIND_CHANNEL}`).toMatch(/24 hours/);
    expect(`${REMIND_RULE} ${REMIND_CHANNEL}`).not.toMatch(EMAIL);
  });

  it('reaches the crew still to acknowledge with a login, of this document and target, never the caller', () => {
    const ids = (scope: RemindRequest['scopes'][number], vesselId: string | null, profileId: string | null) =>
      remindCandidates(ROWS, { scope, documentId: 'd-fire', vesselId, profileId }, 'p-master').map((r) => r.profile_id);
    expect(ids('all', null, null)).toEqual(['p-bosun', 'p-deck', 'p-gam']);
    expect(ids('vessel', 'v-dra', null)).toEqual(['p-bosun', 'p-deck']);
    expect(ids('person', 'v-dra', 'p-bosun')).toEqual(['p-bosun']);
    expect(ids('person', 'v-dra', 'p-junior')).toEqual([]);
    expect(ids('person', 'v-dra', 'p-master')).toEqual([]);
  });

  it('words the refusals', () => {
    expect(remindRefusal('not_permitted')).toMatch(/^You cannot send reminders for this vessel/);
    expect(remindRefusal('vessel_required')).toMatch(/^Choose the vessel/);
    expect(remindRefusal('not_published')).toBe('Only a published document can be acknowledged or reminded about.');
    expect(remindRefusal('ack_not_required')).toBe('This document does not need an acknowledgement.');
    expect(remindRefusal('mystery')).toBeNull();
  });

  it('checks the target before any request', async () => {
    await expect(remindFleetDocument({ scope: 'vessel', documentId: 'd-fire', vesselId: null, profileId: null })).rejects.toThrow('Choose who to remind.');
    await expect(remindFleetDocument({ scope: 'person', documentId: 'd-fire', vesselId: 'v-dra', profileId: null })).rejects.toThrow('Choose who to remind.');
    expect(state.calls).toEqual([]);
  });
});

describe('the Remind dialog', () => {
  it('shows the 24-hour rule and the in-app channel before anything is sent', async () => {
    renderDialog();
    const rule = within(dialog()).getByTestId('remind-rule');
    expect(rule).toHaveTextContent('The 24-hour rule');
    expect(rule).toHaveTextContent(REMIND_RULE);
    expect(rule).toHaveTextContent('Reminders appear in the person’s STORM notifications.');
    expect(within(dialog()).getByText(/People without an app login, or not on the signer list, are not reminded/)).toBeInTheDocument();
    expect(dialog().textContent).not.toMatch(EMAIL);
    expect(state.calls).toEqual([]);
    // The log read is for this document, over the last 24 hours.
    await waitFor(() => expect(state.filters.map(([m, c]) => `${m}:${c}`)).toEqual(['eq:document_id', 'gte:sent_at']));
    const since = Date.parse(state.filters[1][2] as string);
    expect(Date.now() - since).toBeGreaterThanOrEqual(24 * 3600 * 1000 - 5000);
    expect(Date.now() - since).toBeLessThan(24 * 3600 * 1000 + 5000);
  });

  it('offers the scopes with how many each reaches, and sends the chosen one', async () => {
    state.rpcs.fleet_document_remind = { data: { reminder_id: 'r-1', sent: 2, skipped: 0, failed: 0, vessels: 1 }, error: null };
    const onOpenChange = renderDialog();
    const options = within(dialog()).getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(within(dialog()).getByText('Only Demo Bosun').closest('label')).toHaveTextContent('1 person');
    expect(within(dialog()).getByText('Everyone still to acknowledge on DRAAK').closest('label')).toHaveTextContent('2 people');
    expect(within(dialog()).getByText('Everyone still to acknowledge, on every vessel it reaches').closest('label')).toHaveTextContent('3 people');
    expect(within(dialog()).getByRole('button', { name: /Remind 1 person/ })).toBeInTheDocument();
    fireEvent.click(options[1]);
    expect(within(dialog()).getByTestId('remind-reach')).toHaveTextContent('2 people still to acknowledge with an app login.');
    fireEvent.click(within(dialog()).getByRole('button', { name: /Remind 2 people/ }));
    await waitFor(() => expect(state.calls.filter((c) => c.fn === 'fleet_document_remind')).toHaveLength(1));
    expect(state.calls.find((c) => c.fn === 'fleet_document_remind')?.args).toEqual({ p_document_id: 'd-fire', p_vessel_id: 'v-dra', p_profile_id: null });
    await waitFor(() => expect(state.notify.success).toHaveBeenCalledWith('2 people reminded', { description: 'It is in their STORM notifications.' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says how many were reminded in the last 24 hours (at least, from the log the caller can read) and reports the skipped count', async () => {
    state.tables.fleet_document_reminders = {
      data: [{ id: 'r-0', document_id: 'd-fire', vessel_id: 'v-dra', kind: 'manual', sent_at: new Date(Date.now() - 3600_000).toISOString(), recipient_profile_ids: ['p-deck'] }],
      error: null,
    };
    state.rpcs.fleet_document_remind = { data: { reminder_id: 'r-2', sent: 1, skipped: 1, failed: 0, vessels: 1 }, error: null };
    renderDialog({ ...REQUEST, scopes: ['vessel'] });
    const reach = within(dialog()).getByTestId('remind-reach');
    await waitFor(() => expect(reach).toHaveTextContent('2 people still to acknowledge with an app login. At least 1 person of them was reminded in the last 24 hours and will be skipped.'));
    expect(within(dialog()).queryAllByRole('radio')).toHaveLength(0);
    fireEvent.click(within(dialog()).getByRole('button', { name: /Remind 1 person/ }));
    await waitFor(() =>
      expect(state.notify.success).toHaveBeenCalledWith('1 person reminded', { description: 'It is in their STORM notifications. 1 person skipped: reminded in the last 24 hours.' }),
    );
    const [title, options] = state.notify.success.mock.calls[0] as [string, { description: string }];
    expect(`${title} ${options.description}`).not.toMatch(EMAIL);
  });

  it('nobody reached: the button is off, with the reason', () => {
    renderDialog({ ...REQUEST, scopes: ['person'], profileId: 'p-junior', personName: 'Demo Junior' });
    expect(within(dialog()).getByTestId('remind-reach')).toHaveTextContent('Nobody here can be reminded');
    expect(within(dialog()).getByRole('button', { name: /Send reminder/ })).toBeDisabled();
  });

  it('without the person rows it says who, without a number', () => {
    renderDialog({ ...REQUEST, scopes: ['all'] }, null);
    expect(within(dialog()).getByTestId('remind-reach')).toHaveTextContent('Everyone still to acknowledge with an app login is reminded.');
    expect(within(dialog()).getByRole('button', { name: /Send reminder/ })).toBeEnabled();
  });

  it('a refusal stays in the dialog as a sentence; no success toast', async () => {
    state.rpcs.fleet_document_remind = { data: null, error: { code: '42501', message: 'not_permitted' } };
    const onOpenChange = renderDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: /Remind 1 person/ }));
    expect(await within(dialog()).findByText('Nobody was reminded')).toBeInTheDocument();
    expect(within(dialog()).getByText(/^You cannot send reminders for this vessel/)).toBeInTheDocument();
    expect(state.notify.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('an answer of another shape is not a success', async () => {
    state.rpcs.fleet_document_remind = { data: { ok: true }, error: null };
    renderDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: /Remind 1 person/ }));
    expect(await within(dialog()).findByText('STORM could not confirm the reminder. Check the list before sending it again.')).toBeInTheDocument();
    expect(state.notify.success).not.toHaveBeenCalled();
  });

  it('the RPC missing says nobody was reminded (D-01)', async () => {
    renderDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: /Remind 1 person/ }));
    expect(await within(dialog()).findByText('Acknowledgements are not set up yet, so nobody was reminded.')).toBeInTheDocument();
  });

  it('the reminder log failing still lets the reminder go, and says so', async () => {
    state.tables.fleet_document_reminders = { data: null, error: { code: '42501', message: 'permission denied' } };
    renderDialog();
    expect(await within(dialog()).findByText('Recent reminders could not be checked; the 24-hour rule still applies.')).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: /Remind 1 person/ })).toBeEnabled();
  });
});
