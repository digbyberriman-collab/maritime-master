/**
 * The training applications register's column order (x5-training-apps-number-clipped):
 * the reference comes straight after the crew member, so at narrow desktop
 * widths the lower-priority columns (Vessel, Estimated cost) are the ones
 * that scroll out of view, never the number. The export keeps its own order.
 */
import { describe, expect, it } from 'vitest';
import { registerColumns, registerExportColumns, type RegisterContext } from '@/modules/development/components/training/registerColumns';
import { DEFAULT_CATEGORY_LABELS } from '@/modules/development/lib/settingsSchema';

const ctx = (showVessel: boolean): RegisterContext => ({
  showVessel,
  vesselName: () => 'DRAAK',
  categoryLabels: DEFAULT_CATEGORY_LABELS,
  mode: 'both',
  today: '2026-11-27',
});

describe('registerColumns', () => {
  it('puts Number straight after Crew member (fleet page, with the vessel column)', () => {
    expect(registerColumns(ctx(true)).map((c) => c.id)).toEqual(['crew', 'number', 'vessel', 'course', 'dates', 'cost', 'status']);
  });

  it('and on the vessel page, without it', () => {
    expect(registerColumns(ctx(false)).map((c) => c.id)).toEqual(['crew', 'number', 'course', 'dates', 'cost', 'status']);
  });

  it('keeps the reference on one line, as a reference', () => {
    const number = registerColumns(ctx(true)).find((c) => c.id === 'number');
    expect(number?.kind).toBe('reference');
    expect(number?.className).toContain('whitespace-nowrap');
  });

  it('leaves the export columns as they were', () => {
    expect(registerExportColumns(ctx(true)).map((c) => c.key)).toEqual([
      'application_number',
      'crew_member',
      'department',
      'vessel',
      'course',
      'provider',
      'category',
      'start',
      'end',
      'status',
      'waiting_for',
      'estimated_cost',
      'clawback_until',
    ]);
  });
});
