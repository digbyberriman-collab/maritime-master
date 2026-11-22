/**
 * Data-driven nav sections (gap/10 IA24; spec §2.1): a provider's `ready`
 * children replace the static ones, `loading` keeps the node with a
 * skeleton and no stale children, `error` keeps the static children; an
 * empty registry leaves today's tree as it is.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { Circle } from 'lucide-react';
import { buildVesselNav } from '@/config/sitemap';
import {
  NAV_CHILDREN_PROVIDERS,
  applyNavProviders,
  useNavProviderResults,
  type NavChildrenProvider,
  type NavProviderResult,
} from '@/app/nav/navProviders';
import { buildVesselTabs } from '@/app/nav/vesselNavModel';
import { navNodeDecision } from '@/app/nav/visibility';
import type { NavChild } from '@/config/navigation-types';

const DOCS = 'vessel-safety-vessel-documents';
const provided: NavChild[] = [
  { id: 'doc-sec-muster', label: 'Muster & Stations', path: '/v/dra/safety/vessel-documents/muster', icon: Circle, kind: 'leaf', status: 'live' },
];
const decide = (n: NavChild) => navNodeDecision(n, { showPlanned: false, can: () => true, fleetReach: true, vesselReach: true });
const resolver = { labelFor: () => null };

const safetyOf = (results: ReadonlyMap<string, NavProviderResult>) => applyNavProviders(buildVesselNav('DRA'), results).find((m) => m.id === 'safety');
const docsNode = (results: ReadonlyMap<string, NavProviderResult>) => safetyOf(results)?.children.find((n) => n.id === DOCS);

describe('applyNavProviders', () => {
  it('an empty registry is today’s tree', () => {
    expect(NAV_CHILDREN_PROVIDERS).toEqual([]);
    const statics = buildVesselNav('DRA');
    expect(applyNavProviders(statics, new Map())).toEqual(statics);
  });

  it('ready children replace the static seed', () => {
    const node = docsNode(new Map([[DOCS, { status: 'ready', children: provided }]]));
    expect(node?.children?.map((c) => c.label)).toEqual(['Muster & Stations']);
    expect(node?.childrenPending).toBeUndefined();
  });

  it('loading keeps the node with no children and a pending marker (never the stale seed)', () => {
    const node = docsNode(new Map([[DOCS, { status: 'loading', children: [] }]]));
    expect(node?.children).toEqual([]);
    expect(node?.childrenPending).toBe(true);
  });

  it('error keeps the static children', () => {
    const statics = buildVesselNav('DRA').find((m) => m.id === 'safety')?.children.find((n) => n.id === DOCS);
    const node = docsNode(new Map([[DOCS, { status: 'error', children: [] }]]));
    expect(node?.children).toEqual(statics?.children);
  });

  it('a provider on a tab id fills the whole tab', () => {
    const logbooks = applyNavProviders(buildVesselNav('DRA'), new Map([['logbooks', { status: 'loading', children: [] }]])).find((m) => m.id === 'logbooks');
    expect(logbooks).toMatchObject({ childrenPending: true, children: [] });
  });

  it('provided leaves go through the same visibility rule and the tab keeps a pending sidebar', () => {
    const tabs = buildVesselTabs({ code: 'DRA', resolver, decide, providerResults: new Map([['logbooks', { status: 'loading', children: [] }]]) });
    expect(tabs.find((t) => t.id === 'logbooks')).toMatchObject({ childrenPending: true, children: [] });
    const planned: NavChild[] = [{ ...provided[0], id: 'p', status: 'planned' }];
    const withPlanned = buildVesselTabs({ code: 'DRA', resolver, decide, providerResults: new Map([['logbooks', { status: 'ready', children: planned }]]) });
    // Only a planned provided leaf: nothing to open, so the tab is hidden like any empty tab.
    expect(withPlanned.find((t) => t.id === 'logbooks')).toBeUndefined();
  });
});

describe('useNavProviderResults', () => {
  it('runs each provider for the vessel and keys the results by node id, keeping one map while nothing changes', () => {
    const children: NavChild[] = provided;
    const seen: unknown[] = [];
    const provider: NavChildrenProvider = {
      id: 'vessel-documents',
      nodeId: DOCS,
      useChildren: (vessel) => {
        seen.push(vessel?.code);
        return { status: 'ready', children };
      },
    };
    const providers = [provider];
    const vessel = { id: 'v-dra', code: 'DRA', name: 'DRAAK' };
    const { result, rerender } = renderHook(() => useNavProviderResults(vessel, providers));
    const first = result.current;
    expect(first.get(DOCS)).toEqual({ status: 'ready', children });
    rerender();
    expect(result.current).toBe(first);
    expect(seen).toEqual(['DRA', 'DRA']);
  });

  it('returns an empty map with no providers', () => {
    const { result } = renderHook(() => useNavProviderResults(null));
    expect(result.current.size).toBe(0);
  });
});
