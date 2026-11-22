/**
 * One query key, one query shape. useVessels caches the full '*' vessel row
 * under ['vessels', companyId]. The fleet tracker and the itinerary vessel
 * picker select a few columns only, so they must cache under their own keys
 * ('tracker', 'options') below the same 'vessels' prefix. When they shared
 * the useVessels key, the 30 s staleTime let VesselProfileCard reuse the
 * narrow rows: IMO and Flag showed '—', and Edit Profile → Save wrote nulls
 * over the stored particulars.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Row = Record<string, unknown>;
interface QueryChain {
  select: (cols?: string) => QueryChain;
  eq: () => QueryChain;
  neq: () => QueryChain;
  order: () => Promise<{ data: Row[]; error: null }>;
  update: (payload: Row) => QueryChain;
  single: () => Promise<{ data: Row; error: null }>;
}

const state = vi.hoisted(() => ({
  /** Column lists of every read (select() not chained after update()). */
  selects: [] as string[],
  updates: [] as Array<Record<string, unknown>>,
  row: {
    id: 'v1',
    company_id: 'co-1',
    name: 'Alpha',
    imo_number: '1234567',
    flag_state: 'Malta',
    vessel_type: 'Motor Yacht',
    classification_society: 'Class A',
    gross_tonnage: 499,
    build_year: 2010,
    status: 'Active',
    mmsi: '123456789',
    call_sign: 'ABCD',
    home_port: 'Port A',
    length_overall: 50,
    beam: 9,
    draft: 3,
    builder: 'Yard One',
    operational_status: 'In Service',
    created_at: '',
    updated_at: '',
    particulars: null,
  } as Record<string, unknown>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (): QueryChain => {
    let cols = '*';
    let isWrite = false;
    const chain: QueryChain = {
      select: (c?: string) => {
        if (!isWrite) {
          cols = c ?? '*';
          state.selects.push(cols);
        }
        return chain;
      },
      eq: () => chain,
      neq: () => chain,
      // Return only the requested columns, as PostgREST does.
      order: () => {
        const source = state.row;
        if (cols === '*') return Promise.resolve({ data: [{ ...source }], error: null });
        const picked: Row = {};
        for (const key of cols.split(',').map((s) => s.trim())) picked[key] = source[key];
        return Promise.resolve({ data: [picked], error: null });
      },
      update: (payload: Row) => {
        isWrite = true;
        state.updates.push(payload);
        return chain;
      },
      single: () => Promise.resolve({ data: { ...state.row }, error: null }),
    };
    return chain;
  };
  return { supabase: { from } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'co-1' } }) }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({ useVessel: () => ({ refreshVessels: () => {} }) }));

import { useItineraryVessels } from '@/modules/itinerary/hooks/useItinerary';
import VesselProfileCard from '@/modules/vessels/components/VesselProfileCard';

/** App's QueryClient defaults (src/App.tsx). */
const appClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 }, mutations: { retry: 0 } } });

const ItineraryPicker = () => {
  const q = useItineraryVessels();
  return <div>options:{q.data?.length ?? 'loading'}</div>;
};

const fieldValue = (label: string) => screen.getByText(label).parentElement;

beforeEach(() => {
  state.selects.length = 0;
  state.updates.length = 0;
});

describe('vessels query key: one key, one shape', () => {
  it('VesselProfileCard fetches the full row after the itinerary picker cached its narrow rows', async () => {
    const client = appClient();
    const picker = render(
      <QueryClientProvider client={client}>
        <ItineraryPicker />
      </QueryClientProvider>,
    );
    await screen.findByText('options:1');
    picker.unmount();
    expect(state.selects).toEqual(['id, name']);

    render(
      <QueryClientProvider client={client}>
        <VesselProfileCard vesselId="v1" />
      </QueryClientProvider>,
    );
    await screen.findByText('Alpha');

    expect(state.selects).toContain('*');
    await waitFor(() => expect(fieldValue('IMO Number')).toHaveTextContent('1234567'));
    expect(fieldValue('Flag State')).toHaveTextContent('Malta');

    // Edit Profile → Save Changes must send back what the record holds.
    fireEvent.click(screen.getByRole('button', { name: /Edit Profile/ }));
    const save = await screen.findByRole('button', { name: /Save Changes/ });
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0]).toMatchObject({ imo_number: '1234567', flag_state: 'Malta' });

    // The real mutation's ['vessels'] invalidation still reaches the narrow key.
    await waitFor(() => expect(client.getQueryState(['vessels', 'co-1', 'options'])?.isInvalidated).toBe(true));
  });

  it("invalidating ['vessels'] reaches the tracker and options keys", async () => {
    const client = appClient();
    client.setQueryData(['vessels', 'co-1', 'tracker'], [{ id: 'v1', name: 'Alpha', mmsi: null, status: 'Active' }]);
    client.setQueryData(['vessels', 'co-1', 'options'], [{ id: 'v1', name: 'Alpha' }]);
    expect(client.getQueryState(['vessels', 'co-1', 'tracker'])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['vessels', 'co-1', 'options'])?.isInvalidated).toBe(false);

    await client.invalidateQueries({ queryKey: ['vessels'] });

    expect(client.getQueryState(['vessels', 'co-1', 'tracker'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['vessels', 'co-1', 'options'])?.isInvalidated).toBe(true);
  });

  it("only useVessels uses the two-element ['vessels', companyId] key", () => {
    const ROOT = process.cwd();
    const SRC = join(ROOT, 'src');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (full !== join(SRC, 'test')) walk(full, out);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) {
          out.push(full);
        }
      }
      return out;
    };
    const twoElementKey = /queryKey:\s*\[\s*['"]vessels['"]\s*,\s*[^,\]]+\]/;
    const offenders = walk(SRC)
      .filter((file) => twoElementKey.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file).split('\\').join('/'));
    expect(offenders).toEqual(['src/modules/vessels/hooks/useVessels.ts']);

    const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
    expect(read('src/modules/dashboard/pages/FleetMap.tsx')).toMatch(
      /queryKey:\s*\[\s*'vessels'\s*,\s*companyId\s*,\s*'tracker'\s*\]/,
    );
    expect(read('src/modules/itinerary/hooks/useItinerary.ts')).toMatch(
      /queryKey:\s*\[\s*'vessels'\s*,\s*companyId\s*,\s*'options'\s*\]/,
    );
  });
});
