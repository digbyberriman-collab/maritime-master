/**
 * How many vessel tabs fit beside "More ▾" (spec §5.4, ≥ 768 px).
 */
import { describe, expect, it } from 'vitest';
import { fitTabCount } from '@/shared/components/layout/moduleTabFit';

describe('fitTabCount', () => {
  it('shows every tab when they all fit (no More)', () => {
    expect(fitTabCount([100, 100, 100], 304, 80, 2)).toBe(3);
  });

  it('keeps room for More once one tab does not fit', () => {
    // 100 + 2 + 100 = 202; + 2 + 80 (More) = 284 ≤ 300; a third tab would need 386.
    expect(fitTabCount([100, 100, 100, 100], 300, 80, 2)).toBe(2);
  });

  it('a wider More (the active label inside it) can push one more tab out', () => {
    expect(fitTabCount([100, 100, 100, 100], 300, 150, 2)).toBe(1);
  });

  it('always keeps at least one tab, and none for an empty row', () => {
    expect(fitTabCount([400, 100], 120, 80, 2)).toBe(1);
    expect(fitTabCount([], 500, 80, 2)).toBe(0);
  });
});
