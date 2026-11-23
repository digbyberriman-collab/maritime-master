/**
 * Reading `vessel_module_settings` through the pending shim (spec §5.1,
 * §5.3; DECISIONS D-01, D-04): a missing table is "every module on", any
 * other failure is an error state (never mock rows), rows map to settings.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', async () => (await import('../shell/fakeSupabase')).fakeSupabaseModule);

import {
  fetchVesselModuleSettings,
  useVesselModuleSettings,
  vesselModuleSettingsKeys,
  vesselModuleSettingsQueryOptions,
} from '@/modules/vessels/hooks/useVesselModuleSettings';
import { resolveModuleSettings } from '@/modules/vessels/lib/moduleSettings';
import { fakeDb, resetFakeDb } from '../shell/fakeSupabase';

beforeEach(() => resetFakeDb());

const wrapper = (client: QueryClient) => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

describe('fetchVesselModuleSettings', () => {
  it('reads the vessel rows with the columns the resolver needs', async () => {
    fakeDb.tables.vessel_module_settings = [
      { vessel_id: 'v-dra', module_key: 'planner', enabled: true, enabled_from: null, label_override: 'Leave' },
      { vessel_id: 'v-dra', module_key: 'technical', enabled: false, enabled_from: null, label_override: null },
      { vessel_id: 'v-hyd', module_key: 'crew', enabled: false, enabled_from: null, label_override: null },
    ];
    const state = await fetchVesselModuleSettings('v-dra');
    expect(state.source).toBe('table');
    expect([...state.settings.keys()].sort()).toEqual(['planner', 'technical']);
    expect(state.settings.get('planner')).toEqual({ moduleKey: 'planner', enabled: true, enabledFrom: null, labelOverride: 'Leave' });
    expect(state.settings.get('technical')?.enabled).toBe(false);
    expect(fakeDb.calls[0]).toMatchObject({ table: 'vessel_module_settings', op: 'select', filters: [['vessel_id', 'eq', 'v-dra']] });
  });

  it('treats a missing table as ready with nothing stored (D-01)', async () => {
    fakeDb.failures.vessel_module_settings = { code: '42P01', message: 'relation "public.vessel_module_settings" does not exist' };
    const state = await fetchVesselModuleSettings('v-dra');
    expect(state).toMatchObject({ status: 'ready', source: 'table-missing' });
    expect(state.settings.size).toBe(0);
  });

  it('treats PGRST205 (table not in the schema cache) as table-missing', async () => {
    fakeDb.failures.vessel_module_settings = { code: 'PGRST205', message: "Could not find the table 'public.vessel_module_settings' in the schema cache" };
    await expect(fetchVesselModuleSettings('v-dra')).resolves.toMatchObject({ status: 'ready', source: 'table-missing' });
  });

  it('treats an uncoded "relation … does not exist" as table-missing', async () => {
    fakeDb.failures.vessel_module_settings = { message: 'relation "public.vessel_module_settings" does not exist' };
    await expect(fetchVesselModuleSettings('v-dra')).resolves.toMatchObject({ status: 'ready', source: 'table-missing' });
  });

  it.each([
    ['42703 missing column', { code: '42703', message: 'column vessel_module_settings.enabled_from does not exist' }],
    ['PGRST204 column not in the schema cache', { code: 'PGRST204', message: "Could not find the 'enabled_from' column of 'vessel_module_settings' in the schema cache" }],
    ['uncoded missing column', { message: 'column vessel_module_settings.enabled_from does not exist' }],
    ['uncoded column of relation', { message: 'column "enabled_from" of relation "vessel_module_settings" does not exist' }],
  ])('a %s is an error, never "every module on" (D-63, D-04)', async (_label, failure) => {
    fakeDb.failures.vessel_module_settings = failure;
    await expect(fetchVesselModuleSettings('v-dra')).rejects.toMatchObject({ message: failure.message });
  });

  it('throws any other error', async () => {
    fakeDb.failures.vessel_module_settings = { code: '57014', message: 'canceling statement due to statement timeout' };
    await expect(fetchVesselModuleSettings('v-dra')).rejects.toMatchObject({ code: '57014' });
  });

  it('shares one cache key per vessel with the switch', () => {
    expect(vesselModuleSettingsQueryOptions('v-dra').queryKey).toEqual(vesselModuleSettingsKeys.vessel('v-dra'));
    expect(vesselModuleSettingsKeys.vessel('v-dra').slice(0, 1)).toEqual([...vesselModuleSettingsKeys.all]);
    expect(vesselModuleSettingsQueryOptions('v-dra')).toMatchObject({ staleTime: 30_000, retry: 1 });
  });
});

describe('useVesselModuleSettings', () => {
  it('is loading without a vessel and asks for nothing', () => {
    const { result } = renderHook(() => useVesselModuleSettings(null), { wrapper: wrapper(client()) });
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(fakeDb.calls).toEqual([]);
  });

  it('goes from loading to ready', async () => {
    fakeDb.tables.vessel_module_settings = [{ vessel_id: 'v-dra', module_key: 'charter', enabled: true, enabled_from: null, label_override: 'Trip' }];
    const { result } = renderHook(() => useVesselModuleSettings('v-dra'), { wrapper: wrapper(client()) });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });

  it('a missing column ends in the error state, where every module is off', async () => {
    fakeDb.failures.vessel_module_settings = { code: '42703', message: 'column vessel_module_settings.enabled_from does not exist' };
    const { result } = renderHook(() => useVesselModuleSettings('v-dra'), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.state.status).toBe('error'), { timeout: 4000 });
    const modules = resolveModuleSettings(result.current.state, '2026-11-22');
    expect(modules.isModuleOn('technical')).toBe(false);
    expect(modules.isModuleOn('crew')).toBe(false);
  });

  it('reports an error with a message and recovers on retry', async () => {
    fakeDb.failures.vessel_module_settings = { code: '57014', message: 'timeout' };
    const { result } = renderHook(() => useVesselModuleSettings('v-dra'), { wrapper: wrapper(client()) });
    // One automatic retry (retry: 1, ~1 s) before the error shows.
    await waitFor(() => expect(result.current.state.status).toBe('error'), { timeout: 4000 });
    const state = result.current.state;
    expect(state.status === 'error' && state.message.length > 0).toBe(true);
    fakeDb.failures.vessel_module_settings = undefined;
    result.current.retry();
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });
});
