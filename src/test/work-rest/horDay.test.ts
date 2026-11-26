/**
 * The hours-of-rest day state (lib/horDay.ts; gap/04 C38, C45, W6): not
 * expected (Hours of Rest off, before its start date, outside the
 * assignment, still to come), leave, not entered, entered, submitted,
 * approved, and the breach and warning overlays.
 */
import { describe, expect, it } from 'vitest';
import {
  assignmentCovers,
  horDayState,
  horStartFrom,
  isLeaveCode,
  missingDays,
  monthDays,
  notExpectedReason,
  type HorDayInput,
} from '@/modules/work-rest/lib/horDay';
import type { ModuleSettingsState, VesselModuleSetting } from '@/modules/vessels/lib/moduleSettings';
import { statusLabel, statusTone } from '@/shared/components/status/statusTone';

const ON = { off: false as const, from: null };
const BASE: HorDayInput = {
  date: '2026-11-10',
  today: '2026-11-20',
  start: ON,
  assignments: [{ from: '2026-10-01', to: null }],
  leaveCode: null,
  hasRecord: false,
  monthStatus: 'draft',
};
const ready = (rows: Array<Partial<VesselModuleSetting> & { moduleKey: string }>): ModuleSettingsState => ({
  status: 'ready',
  source: 'table',
  settings: new Map(rows.map((r) => [r.moduleKey, { enabled: true, enabledFrom: null, labelOverride: null, ...r }])),
});

describe('when Hours of Rest runs (C45)', () => {
  it('fails closed while the settings load or failed', () => {
    expect(horStartFrom({ status: 'loading' })).toEqual({ off: true, from: null });
    expect(horStartFrom({ status: 'error', message: 'x' })).toEqual({ off: true, from: null });
  });

  it('is on with no start when nothing is stored, or the table is missing', () => {
    expect(horStartFrom(ready([]))).toEqual({ off: false, from: null });
    expect(horStartFrom({ status: 'ready', source: 'table-missing', settings: new Map() })).toEqual({ off: false, from: null });
  });

  it('is off when crew or crew_hor is switched off', () => {
    expect(horStartFrom(ready([{ moduleKey: 'crew_hor', enabled: false }]))).toEqual({ off: true, from: null });
    expect(horStartFrom(ready([{ moduleKey: 'crew', enabled: false }]))).toEqual({ off: true, from: null });
  });

  it('starts at the later of the two start dates; a malformed date is ignored', () => {
    expect(horStartFrom(ready([{ moduleKey: 'crew_hor', enabledFrom: '2026-11-05' }]))).toEqual({ off: false, from: '2026-11-05' });
    expect(
      horStartFrom(ready([{ moduleKey: 'crew', enabledFrom: '2026-12-01' }, { moduleKey: 'crew_hor', enabledFrom: '2026-11-05' }])),
    ).toEqual({ off: false, from: '2026-12-01' });
    expect(horStartFrom(ready([{ moduleKey: 'crew_hor', enabledFrom: 'soon' }]))).toEqual({ off: false, from: null });
  });
});

describe('not expected', () => {
  it('off, before the start, still to come, outside every assignment', () => {
    expect(notExpectedReason({ ...BASE, start: { off: true, from: null } })).toBe('hor_off');
    expect(notExpectedReason({ ...BASE, start: { off: false, from: '2026-11-11' } })).toBe('before_start');
    expect(notExpectedReason({ ...BASE, start: { off: false, from: '2026-11-10' } })).toBeNull();
    expect(notExpectedReason({ ...BASE, date: '2026-11-21' })).toBe('future');
    expect(notExpectedReason({ ...BASE, date: '2026-11-20' })).toBeNull();
    expect(notExpectedReason({ ...BASE, assignments: [{ from: '2026-11-11', to: null }] })).toBe('not_assigned');
    expect(notExpectedReason({ ...BASE, assignments: [] })).toBe('not_assigned');
  });

  it('wins over a record (greyed, as W6 says)', () => {
    expect(horDayState({ ...BASE, hasRecord: true, start: { off: false, from: '2026-11-15' }, breach: true })).toEqual({
      state: 'not_expected',
      reason: 'before_start',
      breach: false,
      warning: false,
    });
  });

  it('assignment ends are inclusive; an open end runs on', () => {
    expect(assignmentCovers({ from: '2026-11-01', to: '2026-11-10' }, '2026-11-10')).toBe(true);
    expect(assignmentCovers({ from: '2026-11-01', to: '2026-11-10' }, '2026-11-11')).toBe(false);
    expect(assignmentCovers({ from: '2026-11-01', to: '2026-11-10' }, '2026-10-31')).toBe(false);
    expect(assignmentCovers({ from: '2026-11-01', to: null }, '2027-03-01')).toBe(true);
    expect(assignmentCovers({ from: null, to: null }, '2026-11-01')).toBe(false);
    expect(assignmentCovers({ from: '2026-11-01T00:00:00Z', to: null }, '2026-11-01')).toBe(true);
  });

  it('two assignments: a day between them is not expected', () => {
    const assignments = [{ from: '2026-10-01', to: '2026-11-05' }, { from: '2026-11-15', to: null }];
    expect(horDayState({ ...BASE, assignments }).state).toBe('not_expected');
    expect(horDayState({ ...BASE, assignments, date: '2026-11-15' }).state).toBe('not_entered');
  });
});

describe('expected days', () => {
  it('not entered, leave, entered, submitted, approved', () => {
    expect(horDayState(BASE).state).toBe('not_entered');
    expect(horDayState({ ...BASE, leaveCode: 'L' }).state).toBe('leave');
    expect(horDayState({ ...BASE, hasRecord: true }).state).toBe('entered');
    expect(horDayState({ ...BASE, hasRecord: true, monthStatus: 'reopened' }).state).toBe('entered');
    expect(horDayState({ ...BASE, hasRecord: true, monthStatus: null }).state).toBe('entered');
    for (const s of ['submitted', 'crew_signed', 'hod_signed', 'hod_reviewed']) {
      expect(horDayState({ ...BASE, hasRecord: true, monthStatus: s }).state).toBe('submitted');
    }
    for (const s of ['approved', 'captain_reviewed', 'locked']) {
      expect(horDayState({ ...BASE, hasRecord: true, monthStatus: s }).state).toBe('approved');
    }
  });

  it('an entry on a leave day shows the entry (entry is optional on leave)', () => {
    expect(horDayState({ ...BASE, leaveCode: 'L', hasRecord: true }).state).toBe('entered');
  });

  it('F (on board) and T (travel) are not leave; codes are trimmed and case-blind', () => {
    expect(isLeaveCode('F')).toBe(false);
    expect(isLeaveCode(' t ')).toBe(false);
    expect(isLeaveCode('')).toBe(false);
    expect(isLeaveCode(null)).toBe(false);
    expect(isLeaveCode(' l')).toBe(true);
    expect(isLeaveCode('SL')).toBe(true);
    expect(horDayState({ ...BASE, leaveCode: 'F' }).state).toBe('not_entered');
  });

  it('a day not entered in a submitted month stays not entered', () => {
    expect(horDayState({ ...BASE, monthStatus: 'approved' }).state).toBe('not_entered');
  });
});

describe('overlays', () => {
  it('breach and warning ride on entered days; breach wins over warning', () => {
    expect(horDayState({ ...BASE, hasRecord: true, breach: true, warning: true })).toMatchObject({ state: 'entered', breach: true, warning: false });
    expect(horDayState({ ...BASE, hasRecord: true, warning: true })).toMatchObject({ breach: false, warning: true });
    expect(horDayState({ ...BASE, hasRecord: true, monthStatus: 'approved', breach: true })).toMatchObject({ state: 'approved', breach: true });
  });

  it('days without an entry carry no overlay', () => {
    expect(horDayState({ ...BASE, breach: true, warning: true })).toMatchObject({ state: 'not_entered', breach: false, warning: false });
    expect(horDayState({ ...BASE, leaveCode: 'L', breach: true })).toMatchObject({ state: 'leave', breach: false });
  });

  it('every state and overlay has a hor_day label and tone', () => {
    for (const s of ['not_expected', 'not_entered', 'entered', 'submitted', 'approved', 'leave', 'breach', 'warning']) {
      expect(statusLabel('hor_day', s)).not.toBe(s);
    }
    expect(statusTone('hor_day', 'breach')).toBe('danger');
  });
});

describe('month helpers', () => {
  it('lists the days of a month, February in a leap year included', () => {
    expect(monthDays(2026, 11)).toHaveLength(30);
    expect(monthDays(2028, 2).at(-1)).toBe('2028-02-29');
    expect(monthDays(2026, 2).at(-1)).toBe('2026-02-28');
    expect(monthDays(2026, 1)[0]).toBe('2026-01-01');
  });

  it('counts expected days without an entry', () => {
    const days = monthDays(2026, 11).map((date) =>
      horDayState({ ...BASE, date, today: '2026-11-05', hasRecord: date === '2026-11-02', leaveCode: date === '2026-11-03' ? 'L' : null }),
    );
    // 1st, 4th and 5th are expected and empty; the 2nd is entered, the 3rd leave, the rest still to come.
    expect(missingDays(days)).toBe(3);
  });
});
