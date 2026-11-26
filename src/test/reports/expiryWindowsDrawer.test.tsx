/**
 * "Alert windows" (src/modules/reports/components/ExpiryWindowsDrawer.tsx,
 * lib/expiryWindowSchema.ts; gap/02 X2, R3, R4; DECISIONS C5, D-X5-02):
 *
 * - the schema: a whole number of days from 1 to 1095, read from the
 *   input's text; the definer's input for an item type's own window;
 * - admin only: `fleet.operations.fleet_reports.admin`; nothing is read
 *   while the access loads, and a reader without it gets AccessDenied;
 * - one row per item type, the report's own first, with the window in
 *   force (the company's rule, else the default: passports 270, everything
 *   else 90) and the type-specific windows counted;
 * - validation before any request; Save sends `set_expiry_window_rule` and
 *   checks the stored row; "Use the default" sends `clear_expiry_window_rule`;
 *   refusals are mapped to a sentence (toast and under the row), never a
 *   raw code; D-01: while the table is missing the defaults are read-only.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  answers: {} as Record<string, Answer | ((args: Record<string, unknown>) => Answer)>,
  tables: {} as Record<string, Answer>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
  reads: 0,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  state.rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    const answer = state.answers[fn];
    const value = typeof answer === 'function' ? answer(args) : answer;
    return Promise.resolve(value ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } });
  });
  const from = (table: string) => {
    state.reads += 1;
    const result = () => state.tables[table] ?? { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'in']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  return { supabase: { rpc: state.rpc, from } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, error: state.toastError, success: state.toastSuccess } };
});

import { ExpiryWindowsDrawer } from '@/modules/reports/components/ExpiryWindowsDrawer';
import type { ExpiryItemType } from '@/modules/fleet';
import { MAX_WARN_DAYS } from '@/modules/fleet/lib/expiryWindows';
import {
  EXPIRY_WINDOW_MAX_DAYS,
  WARN_DAYS_REQUIRED,
  expiryWindowFormDefaults,
  expiryWindowSchema,
  toSetWindowInput,
  toWarnDays,
} from '@/modules/reports/lib/expiryWindowSchema';

const RULES = [
  { id: 'r-pass', company_id: 'co-1', item_type: 'passport', certificate_type_id: null, warn_days: 300, updated_at: '2026-11-01T00:00:00Z' },
  { id: 'r-course', company_id: 'co-1', item_type: 'crew_qualification', certificate_type_id: 'course-1', warn_days: 45, updated_at: '2026-11-01T00:00:00Z' },
];

function renderDrawer(focusTypes: ExpiryItemType[] = ['passport', 'visa', 'medical']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExpiryWindowsDrawer open onOpenChange={() => undefined} companyId="co-1" focusTypes={focusTypes} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rowForm = (label: string) => screen.getByRole('form', { name: `${label} warning window` });
const rpcCalls = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.answers = {};
  state.tables = {};
  state.reads = 0;
  state.rpc.mockClear();
  state.toastError.mockClear();
  state.toastSuccess.mockClear();
});

describe('alert window schema', () => {
  it('reads a whole number of days from 1 to 1095 from the input text', () => {
    expect(EXPIRY_WINDOW_MAX_DAYS).toBe(MAX_WARN_DAYS);
    expect(toWarnDays({ warnDays: '120' })).toBe(120);
    expect(toWarnDays({ warnDays: ' 1095 ' })).toBe(1095);
    for (const bad of ['', '0', '1096', '1.5', '-3', 'ten', '1e3']) expect(toWarnDays({ warnDays: bad }), bad).toBeNull();
    const blank = expiryWindowSchema.safeParse({ warnDays: '' });
    expect(blank.success).toBe(false);
    if (!blank.success) expect(blank.error.issues[0].message).toBe(WARN_DAYS_REQUIRED);
    expect(expiryWindowFormDefaults(270)).toEqual({ warnDays: '270' });
    expect(toSetWindowInput('visa', 60)).toEqual({ itemType: 'visa', certificateTypeId: null, warnDays: 60 });
  });
});

describe('Alert windows drawer', () => {
  it('is admin only: nothing is read while the access loads, and a reader without it is denied', async () => {
    state.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    state.tables = { expiry_window_rules: { data: RULES, error: null } };
    renderDrawer();
    expect(await screen.findByRole('dialog', { name: 'Alert windows' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /warning window/ })).toBeNull();
    expect(state.reads).toBe(0);
    cleanup();
    state.decide = () => ({ allowed: false, status: 'denied', reason: '' });
    renderDrawer();
    expect(await screen.findByText(/fleet reports admin permission/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /warning window/ })).toBeNull();
    expect(state.reads).toBe(0);
  });

  it('lists every item type, the report’s first, with the window in force and the type-specific ones counted', async () => {
    state.tables = { expiry_window_rules: { data: RULES, error: null } };
    renderDrawer();
    await screen.findByRole('form', { name: 'Passports warning window' });
    const sections = screen.getAllByRole('region');
    expect(within(sections[0]).getByRole('heading', { name: 'In this report' })).toBeInTheDocument();
    expect(within(sections[0]).getAllByRole('form').map((f) => f.getAttribute('aria-label'))).toEqual([
      'Passports warning window',
      'Visas warning window',
      'Medical certificates warning window',
    ]);
    expect(within(sections[1]).getAllByRole('form')).toHaveLength(8);
    expect(within(rowForm('Passports')).getByRole('textbox', { name: 'Passports' })).toHaveValue('300');
    expect(within(rowForm('Passports')).getByText('Set to 300 days for your company')).toBeInTheDocument();
    expect(within(rowForm('Passports')).getByRole('button', { name: 'Use the default (270 days)' })).toBeInTheDocument();
    expect(within(rowForm('Visas')).getByRole('textbox', { name: 'Visas' })).toHaveValue('90');
    expect(within(rowForm('Visas')).getByText('Default: 90 days')).toBeInTheDocument();
    expect(within(rowForm('Visas')).queryByRole('button', { name: /Use the default/ })).toBeNull();
    expect(within(rowForm('Crew qualifications')).getByText(/1 type has a window of its own/)).toBeInTheDocument();
    // Save waits for a change.
    expect(within(rowForm('Visas')).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('checks the days before any request', async () => {
    state.tables = { expiry_window_rules: { data: [], error: null } };
    renderDrawer();
    const form = await screen.findByRole('form', { name: 'Visas warning window' });
    const input = within(form).getByRole('textbox', { name: 'Visas' });
    for (const [value, message] of [
      ['', WARN_DAYS_REQUIRED],
      ['0', 'Must be 1 or more'],
      ['2000', 'Must be 1095 or less'],
      ['1.5', 'Enter a whole number'],
    ] as const) {
      fireEvent.change(input, { target: { value } });
      await act(async () => {
        fireEvent.submit(form);
      });
      expect(await within(form.parentElement as HTMLElement).findByText(message)).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
    }
    expect(rpcCalls('set_expiry_window_rule')).toHaveLength(0);
  });

  it('saves through set_expiry_window_rule, checks the stored row and says so', async () => {
    state.tables = { expiry_window_rules: { data: [], error: null } };
    state.answers = {
      set_expiry_window_rule: (args) => ({
        data: { id: 'r-new', company_id: 'co-1', item_type: args.p_item_type, certificate_type_id: null, warn_days: args.p_warn_days },
        error: null,
      }),
    };
    renderDrawer();
    const form = await screen.findByRole('form', { name: 'Visas warning window' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Visas' }), { target: { value: '120' } });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(rpcCalls('set_expiry_window_rule')).toEqual([{ p_item_type: 'visa', p_certificate_type_id: null, p_warn_days: 120 }]));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith('Visas: warning window set to 120 days'));
    expect(state.toastError).not.toHaveBeenCalled();
  });

  it('a stored row that is not what was asked is not a save', async () => {
    state.tables = { expiry_window_rules: { data: [], error: null } };
    state.answers = {
      set_expiry_window_rule: { data: { id: 'r-new', company_id: 'co-1', item_type: 'visa', certificate_type_id: null, warn_days: 90 }, error: null },
    };
    renderDrawer();
    const form = await screen.findByRole('form', { name: 'Visas warning window' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Visas' }), { target: { value: '120' } });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    });
    const sentence = 'The window was not saved. Refresh to see the current windows, then try again.';
    expect(await screen.findByRole('alert')).toHaveTextContent(sentence);
    expect(state.toastSuccess).not.toHaveBeenCalled();
    expect(state.toastError).toHaveBeenCalled();
  });

  it('maps a refusal to a sentence, as a toast and under the row', async () => {
    state.tables = { expiry_window_rules: { data: [], error: null } };
    state.answers = { set_expiry_window_rule: { data: null, error: { code: '42501', message: 'not_permitted' } } };
    renderDrawer();
    const form = await screen.findByRole('form', { name: 'Medical certificates warning window' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Medical certificates' }), { target: { value: '45' } });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    });
    const sentence = 'You do not have permission to change expiry windows.';
    expect(await screen.findByRole('alert')).toHaveTextContent(sentence);
    expect(screen.queryByText(/not_permitted|42501/)).toBeNull();
    const [error, options] = state.toastError.mock.calls[0];
    expect((error as Error).message).toBe(sentence);
    expect(options).toEqual({ title: 'Could not save the expiry window' });
  });

  it('"Use the default" clears the rule through clear_expiry_window_rule', async () => {
    state.tables = { expiry_window_rules: { data: RULES, error: null } };
    state.answers = { clear_expiry_window_rule: { data: null, error: null } };
    renderDrawer();
    const form = await screen.findByRole('form', { name: 'Passports warning window' });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Use the default (270 days)' }));
    });
    await waitFor(() => expect(rpcCalls('clear_expiry_window_rule')).toEqual([{ p_rule_id: 'r-pass' }]));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith('Warning window reset to the default'));
  });

  it('a rule already gone is mapped too (P0002 rule_not_found)', async () => {
    state.tables = { expiry_window_rules: { data: RULES, error: null } };
    state.answers = { clear_expiry_window_rule: { data: null, error: { code: 'P0002', message: 'rule_not_found' } } };
    renderDrawer();
    const form = await screen.findByRole('form', { name: 'Passports warning window' });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Use the default (270 days)' }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('That window rule no longer exists. Refresh to see the current windows.');
  });

  it('shows the defaults read-only while the table is missing (D-01)', async () => {
    renderDrawer();
    expect(await screen.findByRole('note')).toHaveTextContent('Alert windows can be changed once this part of STORM is set up.');
    const form = rowForm('Passports');
    expect(within(form).getByRole('textbox', { name: 'Passports' })).toHaveValue('270');
    expect(within(form).getByRole('textbox', { name: 'Passports' })).toBeDisabled();
    expect(within(form).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(within(rowForm('Visas')).getByRole('textbox', { name: 'Visas' })).toHaveValue('90');
  });

  it('a read error says so with Retry', async () => {
    state.tables = { expiry_window_rules: { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } };
    renderDrawer();
    expect(await screen.findByText('The alert windows could not load', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});
