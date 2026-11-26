/**
 * Fleet › Training › Settings (X5-07B; gap/02 TR10; D-01, D-X5-06,
 * D-X5-19):
 *
 * - the form starts from the company's row and policy columns;
 * - Save sends only what changed through development_settings_save, with
 *   the row's updated_at; nothing changed sends nothing; a stale refusal is
 *   a sentence; an answer for another company is never "saved";
 * - exchange-rate overrides are added as rows and sent as a code → rate
 *   object;
 * - while the 040600 policy columns are missing, their fields read "Not set
 *   up yet", the live limits still show and Save is disabled;
 * - someone who is not a training admin reads the settings only.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COMPANY, freshTrainingState, vesselsReady, type TrainingDbState } from './fakeTrainingDb';

const h = vi.hoisted(() => ({
  state: null as unknown as TrainingDbState,
  caps: {} as Record<string, boolean>,
  vessels: null as unknown,
}));

vi.mock('@/integrations/supabase/client', async () => {
  const { createTrainingDb: create } = await import('./fakeTrainingDb');
  return {
    supabase: {
      from: (t: string) => create(h.state).from(t),
      rpc: (fn: string, args: Record<string, unknown>) => create(h.state).rpc(fn, args),
    },
  };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' }, profile: { company_id: 'co-1' } }) }));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => ({ status: 'allowed', allowed: true }),
  useCan: (key: string) => Boolean(h.caps[key]),
}));
vi.mock('@/modules/fleet', () => ({ useFleetVesselsShown: () => h.vessels }));
vi.mock('@/modules/development/components/ApplicationDetailModal', () => ({ default: () => null }));

import FleetTrainingPage from '@/modules/development/pages/FleetTrainingPage';

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const UPDATED = '2026-11-01T08:00:00.000Z';

const ROW = {
  id: 'ps-1',
  company_id: COMPANY,
  accommodation_cap_per_night_usd: 250,
  food_per_diem_usd: 50,
  professional_split_threshold_usd: 4000,
  clawback_months: 12,
  eligibility_service_days: 90,
  probation_default_days: 180,
  online_neutral_threshold_hours: 24,
  anniversary_window_days: 30,
  business_class_flights_allowed: true,
  updated_at: UPDATED,
  final_approval_mode: 'both',
  mileage_rate_per_mile: 0.67,
  mileage_rate_per_km: null,
  fx_overrides: { EUR: 1.08 },
  category_labels: { fleet_organised: 'Company required' },
};

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/fleet/training/settings']}>
        <Routes>
          <Route path="/fleet/training/:tab" element={<FleetTrainingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const form = () => screen.findByRole('form', { name: 'Programme settings' });
const saved = () => ({ data: { ...ROW, updated_at: '2026-11-26T09:00:00.000Z' }, error: null });

beforeEach(() => {
  h.state = freshTrainingState();
  h.state.rows.program_settings = [{ ...ROW }];
  h.caps = { 'fleet.operations.fleet_training.view': true, 'fleet.operations.fleet_training.admin': true };
  h.vessels = vesselsReady();
});

describe('a training admin', () => {
  it('starts from the company’s settings', async () => {
    renderSettings();
    const f = await form();
    expect(within(f).getByLabelText('Clawback window')).toHaveValue('12');
    expect(within(f).getByLabelText('Mileage per mile (USD)')).toHaveValue('0.67');
    expect(within(f).getByLabelText('Captain and Purser both approve')).toBeChecked();
    expect(within(f).getByLabelText('Currency code')).toHaveValue('EUR');
    expect(within(f).getByLabelText('Name for company-required courses')).toHaveValue('Company required');
  });

  it('saves only what changed, with the updated_at it loaded', async () => {
    h.state.rpc.development_settings_save = saved();
    renderSettings();
    const f = await form();
    fireEvent.change(within(f).getByLabelText('Clawback window'), { target: { value: '6' } });
    fireEvent.click(within(f).getByLabelText('Either the Captain or the Purser approves'));
    fireEvent.click(within(f).getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(h.state.rpcCalls).toHaveLength(1));
    expect(h.state.rpcCalls[0]).toEqual({
      fn: 'development_settings_save',
      args: { p_settings: { clawback_months: 6, final_approval_mode: 'either', expected_updated_at: UPDATED } },
    });
    expect(h.state.writes).toEqual([]);
  });

  it('sends nothing when nothing changed', async () => {
    renderSettings();
    const f = await form();
    fireEvent.click(within(f).getByRole('button', { name: 'Save settings' }));
    expect(await within(f).findByText('Nothing has changed.')).toBeInTheDocument();
    expect(h.state.rpcCalls).toEqual([]);
  });

  it('adds an exchange-rate override and sends the code → rate object', async () => {
    h.state.rpc.development_settings_save = saved();
    renderSettings();
    const f = await form();
    fireEvent.click(within(f).getByRole('button', { name: 'Add a currency' }));
    const codes = within(f).getAllByLabelText('Currency code');
    const rates = within(f).getAllByLabelText('Rate to USD');
    fireEvent.change(codes[1], { target: { value: 'gbp' } });
    fireEvent.change(rates[1], { target: { value: '1.27' } });
    fireEvent.click(within(f).getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(h.state.rpcCalls).toHaveLength(1));
    expect(h.state.rpcCalls[0].args.p_settings).toEqual({ fx_overrides: { EUR: 1.08, GBP: 1.27 }, expected_updated_at: UPDATED });
  });

  it('refuses a currency listed twice before sending', async () => {
    renderSettings();
    const f = await form();
    fireEvent.click(within(f).getByRole('button', { name: 'Add a currency' }));
    fireEvent.change(within(f).getAllByLabelText('Currency code')[1], { target: { value: 'EUR' } });
    fireEvent.click(within(f).getByRole('button', { name: 'Save settings' }));
    expect(await within(f).findByText('This currency is already listed')).toBeInTheDocument();
    expect(h.state.rpcCalls).toEqual([]);
  });

  it('says why a stale save was refused', async () => {
    h.state.rpc.development_settings_save = { data: null, error: { code: '22023', message: 'stale_settings' } };
    renderSettings();
    const f = await form();
    fireEvent.change(within(f).getByLabelText('Food per diem'), { target: { value: '60' } });
    fireEvent.click(within(f).getByRole('button', { name: 'Save settings' }));
    expect(await within(f).findByRole('alert')).toHaveTextContent('Someone changed these settings since you opened them.');
  });

  it('never says saved when the answer is another company’s row', async () => {
    h.state.rpc.development_settings_save = { data: { ...ROW, company_id: 'other' }, error: null };
    renderSettings();
    const f = await form();
    fireEvent.change(within(f).getByLabelText('Food per diem'), { target: { value: '60' } });
    fireEvent.click(within(f).getByRole('button', { name: 'Save settings' }));
    expect(await within(f).findByRole('alert')).toHaveTextContent('did not confirm the change');
  });
});

describe('before the policy columns are set up (D-01)', () => {
  it('shows the live limits, marks the new fields not set up and disables Save', async () => {
    h.state.missingColumns.add('program_settings.final_approval_mode');
    renderSettings();
    const f = await form();
    expect(screen.getByTestId('settings-not-set-up')).toBeInTheDocument();
    expect(within(f).getByLabelText('Clawback window')).toHaveValue('12');
    expect(within(f).getAllByText('Not set up yet').length).toBeGreaterThan(0);
    expect(within(f).queryByLabelText('Captain and Purser both approve')).toBeNull();
    expect(within(f).getByRole('button', { name: /Save settings/ })).toBeDisabled();
  });
});

describe('someone who is not a training admin', () => {
  it('reads the settings only', async () => {
    h.caps = { 'fleet.operations.fleet_training.view': true };
    renderSettings();
    const f = await form();
    expect(screen.getByTestId('settings-read-only')).toHaveTextContent('Only training admins change these settings.');
    expect(within(f).getByLabelText('Clawback window')).toBeDisabled();
    expect(within(f).queryByRole('button', { name: /Save settings/ })).toBeNull();
  });
});
