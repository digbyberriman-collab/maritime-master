import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useSidebarOrder,
  applySidebarOrder,
  SIDEBAR_ROOT,
} from '@/shared/hooks/useSidebarOrder';

type Item = { id: string };
const items = (ids: string[]): Item[] => ids.map((id) => ({ id }));

// Simulate a drag-and-drop drop: move `movedId` to occupy `targetId`'s slot.
const drop = (base: string[], movedId: string, targetId: string): string[] | null => {
  const from = base.indexOf(movedId);
  const to = base.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return null;
  const next = [...base];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};

describe('useSidebarOrder — deep drag-and-drop reordering', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists root-level drag order independently from child groups', () => {
    const { result } = renderHook(() => useSidebarOrder());
    const rootIds = ['vessels', 'crew', 'compliance', 'settings'];
    const crewChildren = ['roster', 'leave', 'training'];

    // Reorder root: drag 'settings' to 'vessels' position.
    act(() => {
      result.current.reorderGroup(SIDEBAR_ROOT, rootIds, (base) =>
        drop(base, 'settings', 'vessels')
      );
    });
    // Reorder a nested group: drag 'training' to 'roster' position.
    act(() => {
      result.current.reorderGroup('crew', crewChildren, (base) =>
        drop(base, 'training', 'roster')
      );
    });

    expect(result.current.getGroupOrder(SIDEBAR_ROOT)).toEqual([
      'settings',
      'vessels',
      'crew',
      'compliance',
    ]);
    expect(result.current.getGroupOrder('crew')).toEqual(['training', 'roster', 'leave']);
    // applySidebarOrder reflects both independently.
    expect(applySidebarOrder(items(rootIds), result.current.getGroupOrder(SIDEBAR_ROOT)).map((i) => i.id)).toEqual([
      'settings',
      'vessels',
      'crew',
      'compliance',
    ]);
    expect(applySidebarOrder(items(crewChildren), result.current.getGroupOrder('crew')).map((i) => i.id)).toEqual([
      'training',
      'roster',
      'leave',
    ]);
  });

  it('persists order independently at every depth (root → child → grandchild)', () => {
    const { result } = renderHook(() => useSidebarOrder());
    const rootIds = ['compliance', 'crew'];
    const complianceChildren = ['ism', 'isps', 'mlc'];
    const ismChildren = ['policy', 'objectives', 'review'];

    act(() => {
      result.current.reorderGroup(SIDEBAR_ROOT, rootIds, (base) => drop(base, 'crew', 'compliance'));
      result.current.reorderGroup('compliance', complianceChildren, (base) => drop(base, 'mlc', 'ism'));
      result.current.reorderGroup('ism', ismChildren, (base) => drop(base, 'review', 'policy'));
    });

    expect(result.current.getGroupOrder(SIDEBAR_ROOT)).toEqual(['crew', 'compliance']);
    expect(result.current.getGroupOrder('compliance')).toEqual(['mlc', 'ism', 'isps']);
    expect(result.current.getGroupOrder('ism')).toEqual(['review', 'policy', 'objectives']);

    // Each group is stored under its own key — they do not overwrite each other.
    const all = result.current.map;
    expect(Object.keys(all).sort()).toEqual([SIDEBAR_ROOT, 'compliance', 'ism'].sort());
  });

  it('rapid successive drops in the same group operate on fresh state, not stale data', () => {
    const { result } = renderHook(() => useSidebarOrder());
    const ids = ['a', 'b', 'c', 'd'];

    act(() => {
      // Three drops queued back-to-back. The reducer form of reorderGroup must
      // always read the latest saved order so the chain composes correctly.
      result.current.reorderGroup('grp', ids, (base) => drop(base, 'd', 'a')); // d,a,b,c
      result.current.reorderGroup('grp', ids, (base) => drop(base, 'b', 'd')); // b,d,a,c
      result.current.reorderGroup('grp', ids, (base) => drop(base, 'c', 'b')); // c,b,d,a
    });

    expect(result.current.getGroupOrder('grp')).toEqual(['c', 'b', 'd', 'a']);
  });

  it('appends newly-visible ids at the end so they remain reorderable', () => {
    const { result } = renderHook(() => useSidebarOrder());

    act(() => {
      result.current.setGroupOrder('grp', ['a', 'b']);
    });

    // Permissions change — a new child 'c' becomes visible.
    act(() => {
      result.current.reorderGroup('grp', ['a', 'b', 'c'], (base) => drop(base, 'c', 'a'));
    });

    expect(result.current.getGroupOrder('grp')).toEqual(['c', 'a', 'b']);
  });

  it('writes each group to localStorage under a single shared key (no cross-group clobbering)', () => {
    const { result } = renderHook(() => useSidebarOrder());

    act(() => {
      result.current.reorderGroup(SIDEBAR_ROOT, ['x', 'y'], (base) => drop(base, 'y', 'x'));
      result.current.reorderGroup('child-1', ['p', 'q'], (base) => drop(base, 'q', 'p'));
      result.current.reorderGroup('child-2', ['m', 'n'], (base) => drop(base, 'n', 'm'));
    });

    const raw = localStorage.getItem('storm:sidebar-order:v2');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed[SIDEBAR_ROOT]).toEqual(['y', 'x']);
    expect(parsed['child-1']).toEqual(['q', 'p']);
    expect(parsed['child-2']).toEqual(['n', 'm']);
  });

  it('drop onto self or unknown ids is a no-op', () => {
    const { result } = renderHook(() => useSidebarOrder());
    const ids = ['a', 'b', 'c'];

    act(() => {
      result.current.reorderGroup('grp', ids, (base) => drop(base, 'a', 'a'));
      result.current.reorderGroup('grp', ids, (base) => drop(base, 'zzz', 'a'));
    });

    // No persistence happened because the updater returned null both times.
    expect(result.current.getGroupOrder('grp')).toEqual([]);
  });

  it('moveInGroup swaps neighbours without touching sibling groups', () => {
    const { result } = renderHook(() => useSidebarOrder());

    act(() => {
      result.current.setGroupOrder('a', ['1', '2', '3']);
      result.current.setGroupOrder('b', ['x', 'y', 'z']);
    });

    act(() => {
      result.current.moveInGroup('a', '3', 'up', ['1', '2', '3']);
    });

    expect(result.current.getGroupOrder('a')).toEqual(['1', '3', '2']);
    expect(result.current.getGroupOrder('b')).toEqual(['x', 'y', 'z']);
  });

  it('reset clears every nested group at once', () => {
    const { result } = renderHook(() => useSidebarOrder());

    act(() => {
      result.current.setGroupOrder(SIDEBAR_ROOT, ['b', 'a']);
      result.current.setGroupOrder('a', ['2', '1']);
      result.current.setGroupOrder('a.child', ['z', 'y']);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.map).toEqual({});
    expect(localStorage.getItem('storm:sidebar-order:v2')).toBeNull();
  });
});
