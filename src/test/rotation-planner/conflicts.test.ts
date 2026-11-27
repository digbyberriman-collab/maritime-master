import { describe, expect, it } from 'vitest';
import {
  buildConflictItems,
  buildManningGapItems,
  buildPlannerConflictItems,
  crewKeyOf,
  detectConflicts,
  isManningGapItem,
  type PlannerConflictItem,
} from '@/modules/rotation-planner/lib/conflicts';
import type { ManningDayRow } from '@/modules/rotation-planner/lib/manning';
import type { LeaveOverlayEntry, RotationAssignment } from '@/modules/rotation-planner/types';

const bar = (over: Partial<RotationAssignment> & Pick<RotationAssignment, 'id' | 'start_date' | 'end_date'>): RotationAssignment => ({
  company_id: 'c1',
  vessel_id: 'v1',
  lane_id: null,
  crew_user_id: 'u1',
  crew_name_raw: null,
  label: null,
  rotation_type: 'onboard',
  status: 'confirmed',
  colour: null,
  notes: null,
  linked_leave_entry_id: null,
  linked_travel_movement_id: null,
  linked_payroll_transfer_id: null,
  source_import_id: null,
  version: 1,
  created_by: null,
  updated_by: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  ...over,
});

const leaveDay = (date: string, status_code = 'L', crew_id = 'u1'): LeaveOverlayEntry => ({ id: `${crew_id}:${date}`, crew_id, date, status_code, vessel_id: 'v1' });

const manning = (day: string, over: Partial<ManningDayRow> = {}): ManningDayRow => ({
  day,
  positionId: 'pos-master',
  positionKey: 'master',
  positionName: 'Master',
  departmentKey: 'deck',
  sortOrder: 1,
  aboard: 0,
  qualified: 0,
  min: 1,
  max: 1,
  shortBy: 1,
  band: 'critical',
  ...over,
});

describe('crewKeyOf', () => {
  it('groups by login, else by the imported name (case and spaces folded), else nothing', () => {
    expect(crewKeyOf(bar({ id: 'a', start_date: '2026-11-01', end_date: '2026-11-02' }))).toBe('u1');
    expect(crewKeyOf(bar({ id: 'a', start_date: '2026-11-01', end_date: '2026-11-02', crew_user_id: null, crew_name_raw: '  Deck Hand ' }))).toBe('name:deck hand');
    expect(crewKeyOf(bar({ id: 'a', start_date: '2026-11-01', end_date: '2026-11-02', crew_user_id: null, crew_name_raw: '   ' }))).toBeNull();
  });
});

describe('block conflicts (legacy behaviour kept)', () => {
  const a = bar({ id: 'a', start_date: '2026-11-01', end_date: '2026-11-10', label: 'Trip A' });
  const b = bar({ id: 'b', start_date: '2026-11-08', end_date: '2026-11-20' });

  it('reports a double booking once per pair, the later block first', () => {
    expect(buildConflictItems([b, a], [])).toEqual([
      {
        key: 'overlap:a:b', kind: 'overlap', severity: 'hard', primaryId: 'b', otherId: 'a', crewId: 'u1', crewLabel: null,
        reason: 'Double-booked: two assignments cover the same days', overlapStart: '2026-11-08', overlapEnd: '2026-11-10',
      },
    ]);
    const map = detectConflicts([a, b], []);
    expect(map.get('a')?.[0].reason).toBe('Overlaps assignment b');
    expect(map.get('b')?.[0].reason).toBe('Overlaps assignment Trip A');
  });

  it('ignores leave bars, other crew and touching-free blocks', () => {
    const leaveBar = bar({ id: 'l', start_date: '2026-11-05', end_date: '2026-11-06', rotation_type: 'leave' });
    const other = bar({ id: 'o', start_date: '2026-11-05', end_date: '2026-11-06', crew_user_id: 'u2' });
    const after = bar({ id: 'z', start_date: '2026-11-11', end_date: '2026-11-12' });
    expect(buildConflictItems([a, leaveBar, other, after], [])).toEqual([]);
  });

  it('names an imported crew member by name', () => {
    const x = bar({ id: 'x', start_date: '2026-11-01', end_date: '2026-11-05', crew_user_id: null, crew_name_raw: 'Imported Cook' });
    const y = bar({ id: 'y', start_date: '2026-11-03', end_date: '2026-11-04', crew_user_id: null, crew_name_raw: 'imported cook' });
    const [item] = buildConflictItems([x, y], []);
    expect(item).toMatchObject({ crewId: null, crewLabel: 'imported cook', overlapStart: '2026-11-03', overlapEnd: '2026-11-04' });
  });

  it('flags an on-board block over approved leave days (legacy leave codes only)', () => {
    const items = buildConflictItems([a], [leaveDay('2026-11-04'), leaveDay('2026-11-02', 'M'), leaveDay('2026-11-03', 'F'), leaveDay('2026-11-05', 'L', 'u2')]);
    expect(items).toEqual([
      {
        key: 'leave:a', kind: 'leave', severity: 'hard', primaryId: 'a', otherId: null, crewId: 'u1', crewLabel: null,
        reason: 'Crew is on approved leave for 2 days in this block', overlapStart: '2026-11-02', overlapEnd: '2026-11-04',
      },
    ]);
    expect(buildConflictItems([a], [leaveDay('2026-11-04')])[0].reason).toBe('Crew is on approved leave on 2026-11-04');
    expect(detectConflicts([a], [leaveDay('2026-11-04')]).get('a')?.[0].reason).toBe('Crew on leave 2026-11-04');
  });
});

describe('manning gaps (X1-09)', () => {
  it('one item per critical span of a position, with the gap sentence', () => {
    const rows = [manning('2026-11-27'), manning('2026-11-28'), manning('2026-11-29', { aboard: 1, qualified: 1, shortBy: 0, band: 'at_minimum' })];
    expect(buildManningGapItems(rows)).toEqual([
      {
        key: 'manning:pos-master:2026-11-27', kind: 'manning_gap', severity: 'hard', positionId: 'pos-master', positionName: 'Master',
        departmentKey: 'deck', reason: 'Master needs 1 on board, short by 1', start: '2026-11-27', end: '2026-11-28', days: 2, min: 1, shortBy: 1,
      },
    ]);
  });

  it('keeps only spans touching the window', () => {
    const rows = [manning('2026-11-01'), manning('2026-11-02'), manning('2026-11-10'), manning('2026-11-20')];
    const keys = (from: string, to: string) => buildManningGapItems(rows, { from, to }).map((g) => g.start);
    expect(keys('2026-11-02', '2026-11-10')).toEqual(['2026-11-01', '2026-11-10']);
    expect(keys('2026-11-03', '2026-11-09')).toEqual([]);
    expect(keys('2026-11-20', '2026-11-20')).toEqual(['2026-11-20']);
    expect(buildManningGapItems(rows)).toHaveLength(3);
  });

  it('keys an unmatched-titles span without a position', () => {
    const [g] = buildManningGapItems([manning('2026-11-27', { positionId: null, positionKey: null, positionName: null, sortOrder: null })]);
    expect(g.key).toBe('manning:unmatched:2026-11-27');
    expect(g.reason).toBe('Unmatched titles needs 1 on board, short by 1');
  });

  it('no gaps without critical days', () => {
    expect(buildManningGapItems([manning('2026-11-27', { band: 'normal', shortBy: 0, qualified: 2, min: 1 })])).toEqual([]);
    expect(buildManningGapItems([])).toEqual([]);
  });

  it('lists block conflicts first, then the gaps; the guard tells them apart', () => {
    const a = bar({ id: 'a', start_date: '2026-11-01', end_date: '2026-11-10' });
    const b = bar({ id: 'b', start_date: '2026-11-05', end_date: '2026-11-12' });
    const items: PlannerConflictItem[] = buildPlannerConflictItems([a, b], [], [manning('2026-11-02')], { from: '2026-11-01', to: '2026-11-30' });
    expect(items.map((i) => i.kind)).toEqual(['overlap', 'manning_gap']);
    expect(items.filter(isManningGapItem).map((g) => g.positionName)).toEqual(['Master']);
    expect(items.filter((i) => !isManningGapItem(i))).toHaveLength(1);
  });
});
