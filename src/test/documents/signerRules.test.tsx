/**
 * Choose who can sign (components/SignerRuleDialog.tsx,
 * lib/acknowledgementSchema.ts, hooks/useFleetDocumentAcks.ts
 * setVesselSignerRule, lib/ackAdmin.ts signer rules; gap/02 FD8, W1;
 * X5-05B):
 *
 * - the form (zod): chosen positions need 1-100 names up to 80 characters,
 *   chosen people 1-500; the definer's arguments carry a list only for its
 *   own rule, the default removes the rule (NULL), "every document type" is
 *   a NULL type;
 * - the dialog opens on the vessel's stored rule for every type, switches
 *   to a type's own rule, offers the crew's positions (and a typed one) and
 *   people;
 * - the returned rule is checked (vessel, type, rule, lists) before it says
 *   saved; a removal answers the removed rule or none; refusals are
 *   sentences; who sees the button (the Master, fleet admins) is pinned in
 *   crewTab.test.tsx.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Answer = { data: unknown; error: { code?: string; message: string; details?: string | null } | null };

const state = vi.hoisted(() => ({
  rpcs: {} as Record<string, Answer>,
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  notify: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args });
      return Promise.resolve(state.rpcs[fn] ?? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    },
  },
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/notify')>()),
  notify: state.notify,
}));

import { SignerRuleDialog } from '@/modules/documents/components/SignerRuleDialog';
import {
  ALL_TYPES,
  DEFAULT_RULE,
  PEOPLE_REQUIRED,
  POSITIONS_REQUIRED,
  cleanPositions,
  signerRuleSchema,
  toSignerRuleArgs,
} from '@/modules/documents/lib/acknowledgementSchema';
import { SIGNER_RULES, SIGNER_RULE_LABELS, effectiveSignerRule, signerRuleRefusal, signerRuleSummary } from '@/modules/documents/lib/ackAdmin';
import type { VesselSignerRule } from '@/modules/documents/hooks/useFleetDocumentAcks';

const RULES: VesselSignerRule[] = [
  { id: 'r-all', vessel_id: 'v-dra', type_id: null, rule: 'hod_and_above', positions: [], profile_ids: [], updated_at: '2026-11-01T10:00:00Z' },
  { id: 'r-proc', vessel_id: 'v-dra', type_id: 't-proc', rule: 'positions', positions: ['Master', 'Bosun'], profile_ids: [], updated_at: '2026-11-01T10:00:00Z' },
];
const TYPES = [
  { id: 't-proc', name: 'Procedures' },
  { id: 't-manual', name: 'Manuals' },
];
const PEOPLE = [
  { profileId: 'p-bosun', name: 'Demo Bosun', position: 'Bosun' },
  { profileId: 'p-co', name: 'Demo Chief Officer', position: 'Chief Officer' },
  { profileId: 'p-junior', name: 'Demo Junior Deckhand', position: 'Junior Deckhand' },
];
const POSITIONS = ['Bosun', 'Chief Officer', 'Junior Deckhand', 'Master'];

const stored = (over: Record<string, unknown>) => ({
  id: 'r-new',
  company_id: 'co-1',
  vessel_id: 'v-dra',
  type_id: null,
  rule: 'positions',
  positions: [],
  profile_ids: [],
  created_by: 'u-master',
  updated_by: 'u-master',
  created_at: '2026-11-26T10:00:00Z',
  updated_at: '2026-11-26T10:00:00Z',
  ...over,
});

function renderDialog(rules: VesselSignerRule[] = RULES, onOpenChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SignerRuleDialog
        open
        onOpenChange={onOpenChange}
        companyId="co-1"
        vesselId="v-dra"
        vesselName="DRAAK"
        types={TYPES}
        rules={rules}
        positions={POSITIONS}
        people={PEOPLE}
      />
    </QueryClientProvider>,
  );
  return onOpenChange;
}
const dialog = () => screen.getByRole('dialog', { name: 'Choose who can sign' });
const radio = (name: RegExp) => within(dialog()).getByRole('radio', { name });
const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: /Save/ }));
const calls = () => state.calls.filter((c) => c.fn === 'fleet_document_set_signer_rule');

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
  state.calls = [];
  for (const fn of Object.values(state.notify)) fn.mockReset();
});
afterEach(() => cleanup());

describe('the form and the definer’s arguments (lib/acknowledgementSchema.ts)', () => {
  const values = (over: Record<string, unknown> = {}) => ({ typeId: ALL_TYPES, rule: 'positions', positions: [], profileIds: [], ...over });
  const issues = (v: Record<string, unknown>) => {
    const r = signerRuleSchema.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('chosen positions need 1-100 names of up to 80 characters; chosen people 1-500', () => {
    expect(issues(values())).toEqual([POSITIONS_REQUIRED]);
    expect(issues(values({ positions: ['  ', ''] }))).toEqual([POSITIONS_REQUIRED]);
    expect(issues(values({ positions: ['x'.repeat(81)] }))).toEqual(['Position names can be up to 80 characters']);
    expect(issues(values({ positions: Array.from({ length: 101 }, (_, i) => `P${i}`) }))).toEqual(['Choose up to 100 positions']);
    expect(issues(values({ positions: ['Bosun'] }))).toEqual([]);
    expect(issues(values({ rule: 'named_people' }))).toEqual([PEOPLE_REQUIRED]);
    expect(issues(values({ rule: 'named_people', profileIds: Array.from({ length: 501 }, (_, i) => `p-${i}`) }))).toEqual(['Choose up to 500 people']);
    expect(issues(values({ rule: 'hod_and_above' }))).toEqual([]);
    expect(issues(values({ rule: DEFAULT_RULE }))).toEqual([]);
    expect(issues(values({ rule: 'everyone' }))).toHaveLength(1);
  });

  it('builds the definer’s arguments: lists only for their rule, the default removes it, every type is NULL', () => {
    expect(toSignerRuleArgs(values({ positions: [' Bosun ', 'bosun', 'Master'] }) as never, 'v-dra')).toEqual({
      p_vessel_id: 'v-dra',
      p_type_id: null,
      p_rule: 'positions',
      p_positions: ['Bosun', 'Master'],
      p_profile_ids: null,
    });
    expect(toSignerRuleArgs(values({ rule: 'named_people', typeId: 't-proc', positions: ['Bosun'], profileIds: ['p-1', 'p-1', ' '] }) as never, 'v-dra')).toEqual({
      p_vessel_id: 'v-dra',
      p_type_id: 't-proc',
      p_rule: 'named_people',
      p_positions: null,
      p_profile_ids: ['p-1'],
    });
    expect(toSignerRuleArgs(values({ rule: DEFAULT_RULE, positions: ['Bosun'] }) as never, 'v-dra')).toMatchObject({ p_rule: null, p_positions: null, p_profile_ids: null });
    expect(cleanPositions(['Chief Officer', ' chief officer ', '', 'Master'])).toEqual(['Chief Officer', 'Master']);
  });

  it('the rule that applies and the rule in words', () => {
    expect(SIGNER_RULES).toEqual(['all_crew_with_login', 'hod_and_above', 'positions', 'named_people']);
    expect(effectiveSignerRule(RULES, 't-proc')?.id).toBe('r-proc');
    expect(effectiveSignerRule(RULES, 't-manual')?.id).toBe('r-all');
    expect(effectiveSignerRule([], 't-manual')).toBeNull();
    expect(signerRuleSummary(null)).toBe(`${SIGNER_RULE_LABELS.all_crew_with_login} (default)`);
    expect(signerRuleSummary(RULES[1])).toBe('Chosen positions: Master, Bosun');
    const people = { rule: 'named_people' as const, positions: [], profile_ids: ['p-bosun', 'p-co'] };
    expect(signerRuleSummary(people, (id) => PEOPLE.find((p) => p.profileId === id)?.name ?? null)).toBe('Chosen people: Demo Bosun, Demo Chief Officer');
    expect(signerRuleSummary(people)).toBe('Chosen people: 2 people');
    expect(signerRuleRefusal('not_permitted')).toBe('Only the vessel’s Master or a fleet document admin can change who can sign.');
    expect(signerRuleRefusal('positions_required')).toBe('Choose at least one position.');
    expect(signerRuleRefusal('vessel_archived')).toBe('This vessel is archived.');
    expect(signerRuleRefusal('mystery')).toBeNull();
  });
});

describe('the dialog', () => {
  it('opens on the rule for every document type, with what applies now', () => {
    renderDialog();
    expect(within(dialog()).getByRole('combobox', { name: 'Applies to' })).toHaveTextContent('Every document type');
    expect(radio(/Heads of department and above/)).toBeChecked();
    expect(radio(/Everyone on the crew with an app login \(default\)/)).not.toBeChecked();
    expect(within(dialog()).getByText('Now: Heads of department and above.')).toBeInTheDocument();
    expect(within(dialog()).getByText(/People outside the rule are shown as not on the signer list/)).toBeInTheDocument();
  });

  it('chosen positions: at least one, the crew’s or typed; saves and checks the returned rule', async () => {
    const answer = stored({ positions: ['Bosun', 'Electrician'] });
    state.rpcs.fleet_document_set_signer_rule = { data: answer, error: null };
    const onOpenChange = renderDialog();
    fireEvent.click(radio(/Chosen positions/));
    save();
    expect(await within(dialog()).findByText(POSITIONS_REQUIRED)).toBeInTheDocument();
    expect(calls()).toEqual([]);
    const positions = within(dialog()).getByRole('group', { name: 'Positions that sign' });
    expect(within(positions).getAllByRole('checkbox')).toHaveLength(4);
    fireEvent.click(within(positions).getByRole('checkbox', { name: 'Bosun' }));
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Add a position' }), { target: { value: 'Electrician' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: /^Add$/ }));
    expect(within(positions).getByRole('checkbox', { name: 'Electrician' })).toBeChecked();
    save();
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0].args).toEqual({ p_vessel_id: 'v-dra', p_type_id: null, p_rule: 'positions', p_positions: ['Bosun', 'Electrician'], p_profile_ids: null });
    await waitFor(() => expect(state.notify.success).toHaveBeenCalledWith('Who can sign is saved', { description: 'DRAAK, every document type: Chosen positions: Bosun, Electrician.' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a returned rule that is not the one asked for is not saved', async () => {
    state.rpcs.fleet_document_set_signer_rule = { data: stored({ positions: ['Master'] }), error: null };
    const onOpenChange = renderDialog();
    fireEvent.click(radio(/Chosen positions/));
    fireEvent.click(within(within(dialog()).getByRole('group', { name: 'Positions that sign' })).getByRole('checkbox', { name: 'Bosun' }));
    save();
    expect(await within(dialog()).findByText('Who can sign was not saved. Refresh and try again.')).toBeInTheDocument();
    expect(state.notify.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('chosen people: at least one; sends their profiles', async () => {
    state.rpcs.fleet_document_set_signer_rule = { data: stored({ rule: 'named_people', profile_ids: ['p-co', 'p-bosun'] }), error: null };
    renderDialog();
    fireEvent.click(radio(/Chosen people/));
    save();
    expect(await within(dialog()).findByText(PEOPLE_REQUIRED)).toBeInTheDocument();
    const people = within(dialog()).getByRole('group', { name: /People who sign/ });
    fireEvent.click(within(people).getByRole('checkbox', { name: /Demo Bosun/ }));
    fireEvent.click(within(people).getByRole('checkbox', { name: /Demo Chief Officer/ }));
    expect(people).toHaveAccessibleName('People who sign (2 chosen)');
    save();
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0].args).toMatchObject({ p_rule: 'named_people', p_positions: null, p_profile_ids: ['p-bosun', 'p-co'] });
    await waitFor(() =>
      expect(state.notify.success).toHaveBeenCalledWith('Who can sign is saved', { description: 'DRAAK, every document type: Chosen people: Demo Chief Officer, Demo Bosun.' }),
    );
  });

  it('one document type: opens on its own rule; "the same as every type" removes it', async () => {
    state.rpcs.fleet_document_set_signer_rule = { data: stored({ id: 'r-proc', type_id: 't-proc', positions: ['Master', 'Bosun'] }), error: null };
    renderDialog();
    fireEvent.keyDown(within(dialog()).getByRole('combobox', { name: 'Applies to' }), { key: 'Enter' });
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Every document type', 'Procedures (own rule)', 'Manuals']);
    fireEvent.keyDown(options[1], { key: 'Enter' });
    await waitFor(() => expect(radio(/Chosen positions/)).toBeChecked());
    const positions = within(dialog()).getByRole('group', { name: 'Positions that sign' });
    expect(within(positions).getByRole('checkbox', { name: 'Master' })).toBeChecked();
    expect(within(positions).getByRole('checkbox', { name: 'Bosun' })).toBeChecked();
    expect(within(dialog()).getByText('Heads of department and above', { selector: 'span.type-caption' })).toBeInTheDocument();
    fireEvent.click(radio(/The same as every document type/));
    save();
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0].args).toEqual({ p_vessel_id: 'v-dra', p_type_id: 't-proc', p_rule: null, p_positions: null, p_profile_ids: null });
    await waitFor(() => expect(state.notify.success).toHaveBeenCalledWith('Who can sign is saved', { description: 'DRAAK, Procedures: the same as every document type.' }));
  });

  it('the default for every type removes the rule; an empty answer (nothing to remove) is fine', async () => {
    state.rpcs.fleet_document_set_signer_rule = { data: stored({ id: null, vessel_id: null, rule: null }), error: null };
    renderDialog([]);
    expect(radio(/Everyone on the crew with an app login \(default\)/)).toBeChecked();
    save();
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0].args).toMatchObject({ p_type_id: null, p_rule: null });
    await waitFor(() => expect(state.notify.success).toHaveBeenCalledWith('Who can sign is saved', { description: 'DRAAK: everyone on the crew with an app login signs (the default).' }));
  });

  it('refusals are sentences in the dialog; the RPC missing says nothing was saved', async () => {
    state.rpcs.fleet_document_set_signer_rule = { data: null, error: { code: '42501', message: 'not_permitted' } };
    renderDialog();
    fireEvent.click(radio(/Heads of department and above/));
    save();
    expect(await within(dialog()).findByText('Only the vessel’s Master or a fleet document admin can change who can sign.')).toBeInTheDocument();
    expect(within(dialog()).getByText('Who can sign was not saved')).toBeInTheDocument();
    cleanup();
    state.rpcs = {};
    renderDialog();
    save();
    expect(await within(dialog()).findByText('Acknowledgements are not set up yet, so nothing was saved.')).toBeInTheDocument();
  });
});
