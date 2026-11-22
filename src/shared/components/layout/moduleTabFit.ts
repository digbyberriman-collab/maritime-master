/**
 * How many vessel tabs fit beside the "More ▾" button (spec §5.4, ≥ 768 px).
 * Pure, so the overflow rule is tested without a layout engine.
 *
 * All tabs fit: every tab shows and there is no More menu. Otherwise as many
 * tabs as fit, in order, with room left for the More button; always at least
 * one (Home), so the row is never only "More".
 */
export function fitTabCount(widths: readonly number[], available: number, moreWidth: number, gap = 0): number {
  const n = widths.length;
  if (n === 0) return 0;
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (n - 1);
  if (total <= available) return n;
  let used = 0;
  let count = 0;
  for (const width of widths) {
    const next = used + (count > 0 ? gap : 0) + width;
    if (next + gap + moreWidth > available) break;
    used = next;
    count += 1;
  }
  return Math.max(1, count);
}
