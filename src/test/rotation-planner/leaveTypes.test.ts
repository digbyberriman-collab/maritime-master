import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFF_LEAVE_TYPE,
  LEAVE_BALANCE_EFFECTS,
  LEAVE_DAY_CODES,
  LEAVE_POLICY_FLAGS,
  LEAVE_TONE_CLASSES,
  LEAVE_TONE_KEYS,
  LEAVE_TYPE_COLUMNS,
  LEAVE_TYPE_KEYS,
  LEAVE_TYPES,
  LeaveTypeShapeError,
  isLeaveDayCode,
  isLeaveTypeKey,
  leaveTypeByKey,
  leaveTypeForDayCode,
  leaveTypeKeyForRotation,
  leaveTypeLegend,
  offLeaveTypes,
  parseLeaveTypeRows,
  requestableLeaveTypes,
  resolveBalanceEffect,
  rotationTypeForLeaveType,
  type LeaveType,
} from '@/modules/rotation-planner/lib/leaveTypes';
import type { FrpRotationType } from '@/modules/rotation-planner/types';

const ROTATION_TYPES: FrpRotationType[] = ['onboard', 'leave', 'travel', 'standby', 'yard', 'wfh', 'temp_cover', 'training', 'no_crew', 'tbc'];

/** A leave_types row (snake case) from a LeaveType. */
const rowOf = (t: LeaveType) => ({
  key: t.key,
  label: t.label,
  day_code: t.dayCode,
  tone_key: t.toneKey,
  balance_effect: t.balanceEffect,
  policy_flag: t.policyFlag,
  counts_on_board: t.countsOnBoard,
  is_leave: t.isLeave,
  needs_approval: t.needsApproval,
  is_system: t.isSystem,
  is_active: t.isActive,
  sort_order: t.sortOrder,
});

describe('LEAVE_TYPES (the W7 table, the leave_types seed)', () => {
  it('holds the 14 system types in legend order, one per key', () => {
    expect(LEAVE_TYPES.map((t) => t.key)).toEqual([...LEAVE_TYPE_KEYS]);
    expect(new Set(LEAVE_TYPES.map((t) => t.key)).size).toBe(14);
    const orders = LEAVE_TYPES.map((t) => t.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(14);
  });

  it('pins each type exactly', () => {
    const pin = Object.fromEntries(
      LEAVE_TYPES.map((t) => [t.key, [t.label, t.dayCode, t.toneKey, t.balanceEffect, t.policyFlag, t.countsOnBoard, t.isLeave, t.needsApproval]]),
    );
    expect(pin).toEqual({
      on_board: ['On board', 'F', 'success', 'accrues', null, true, false, false],
      sick_on_board: ['Sick on board', 'F', 'pink', 'accrues', null, true, false, false],
      rotation: ['Rotation leave', 'R', 'teal', 'neutral', null, false, true, false],
      holiday: ['Holiday (annual leave)', 'L', 'info', 'deducts', null, false, true, true],
      medical: ['Medical / sick leave', 'M', 'critical', 'policy', 'sick_affects_balance', false, true, true],
      emergency: ['Emergency leave', 'E', 'orange', 'neutral', null, false, true, true],
      crew_development: ['Crew development / training', 'CD', 'cyan', 'policy', 'training_affects_balance', false, true, true],
      paid_parental: ['Paid parental leave', 'PPL', 'purple', 'neutral', null, false, true, true],
      compassionate: ['Compassionate leave', 'CL', 'indigo', 'neutral', null, false, true, true],
      unpaid: ['Unpaid leave', 'U', 'warning', 'policy', 'unpaid_affects_balance', false, true, true],
      travel: ['Travel', 'T', 'amber', 'neutral', null, false, false, false],
      neutral: ['Neutral leave', 'N', 'muted', 'neutral', null, false, true, false],
      pbq: ['Pre-boarding quarantine (PBQ)', 'Q', 'muted', 'accrues', null, false, false, false],
      other: ['Other', 'O', 'muted', 'neutral', null, false, true, true],
    });
  });

  it('keeps the seed CHECKs: a policy type names its flag and only then; aboard is never leave; approval only for leave', () => {
    for (const t of LEAVE_TYPES) {
      expect(t.balanceEffect === 'policy').toBe(t.policyFlag !== null);
      expect(t.countsOnBoard && t.isLeave).toBe(false);
      if (t.needsApproval) expect(t.isLeave).toBe(true);
      expect(LEAVE_DAY_CODES).toContain(t.dayCode);
      expect(LEAVE_TONE_KEYS).toContain(t.toneKey);
      expect(LEAVE_BALANCE_EFFECTS).toContain(t.balanceEffect);
      if (t.policyFlag !== null) expect(LEAVE_POLICY_FLAGS).toContain(t.policyFlag);
      expect(t.isSystem && t.isActive).toBe(true);
    }
  });

  it('uses every day code but the sick-on-board duplicate, and the 13 codes of crew_leave_entries', () => {
    expect(LEAVE_DAY_CODES).toEqual(['F', 'Q', 'L', 'T', 'CD', 'M', 'PPL', 'CL', 'N', 'U', 'R', 'E', 'O']);
    expect(new Set(LEAVE_TYPES.map((t) => t.dayCode))).toEqual(new Set(LEAVE_DAY_CODES));
  });

  it('is frozen', () => {
    expect(Object.isFrozen(LEAVE_TYPES)).toBe(true);
    expect(Object.isFrozen(LEAVE_TONE_CLASSES)).toBe(true);
  });

  it('defaults the Off toggle to rotation leave', () => {
    expect(DEFAULT_OFF_LEAVE_TYPE).toBe('rotation');
    expect(leaveTypeByKey(DEFAULT_OFF_LEAVE_TYPE)?.countsOnBoard).toBe(false);
  });
});

describe('guards', () => {
  it.each(LEAVE_DAY_CODES.map((c) => [c]))('isLeaveDayCode(%s)', (c) => expect(isLeaveDayCode(c)).toBe(true));
  it.each([['f'], ['X'], [''], [null], [undefined], [1], ['FF']])('isLeaveDayCode rejects %s', (v) => expect(isLeaveDayCode(v)).toBe(false));
  it.each(LEAVE_TYPE_KEYS.map((k) => [k]))('isLeaveTypeKey(%s)', (k) => expect(isLeaveTypeKey(k)).toBe(true));
  it.each([['On_board'], ['annual'], [''], [null], [7]])('isLeaveTypeKey rejects %s', (v) => expect(isLeaveTypeKey(v)).toBe(false));
});

describe('lists the dialog and the legend read', () => {
  it('leaveTypeLegend: active only, sort order then key, never mutating its input', () => {
    const extra: LeaveType = { ...LEAVE_TYPES[2], key: 'aaa_company', sortOrder: 30, isSystem: false };
    const inactive: LeaveType = { ...LEAVE_TYPES[3], key: 'retired', isActive: false };
    const input = [inactive, LEAVE_TYPES[2], extra, LEAVE_TYPES[0]];
    const before = [...input];
    expect(leaveTypeLegend(input).map((t) => t.key)).toEqual(['on_board', 'aaa_company', 'rotation']);
    expect(input).toEqual(before);
    expect(leaveTypeLegend().map((t) => t.key)).toEqual([...LEAVE_TYPE_KEYS]);
  });

  it('leaveTypeByKey: by key, null for none', () => {
    expect(leaveTypeByKey('holiday')?.label).toBe('Holiday (annual leave)');
    expect(leaveTypeByKey('nope')).toBeNull();
    expect(leaveTypeByKey(null)).toBeNull();
    expect(leaveTypeByKey(undefined)).toBeNull();
    expect(leaveTypeByKey('')).toBeNull();
  });

  it('leaveTypeForDayCode: the first active type of the code (F reads On board), any case, null otherwise', () => {
    const expected: Record<string, string> = {
      F: 'on_board', Q: 'pbq', L: 'holiday', T: 'travel', CD: 'crew_development', M: 'medical', PPL: 'paid_parental',
      CL: 'compassionate', N: 'neutral', U: 'unpaid', R: 'rotation', E: 'emergency', O: 'other',
    };
    for (const code of LEAVE_DAY_CODES) expect(leaveTypeForDayCode(code)?.key).toBe(expected[code]);
    expect(leaveTypeForDayCode(' cd ')?.key).toBe('crew_development');
    expect(leaveTypeForDayCode('Z')).toBeNull();
    expect(leaveTypeForDayCode(null)).toBeNull();
    expect(leaveTypeForDayCode('')).toBeNull();
    const withoutOnBoard = LEAVE_TYPES.map((t) => (t.key === 'on_board' ? { ...t, isActive: false } : t));
    expect(leaveTypeForDayCode('F', withoutOnBoard)?.key).toBe('sick_on_board');
  });

  it('requestableLeaveTypes: time off only', () => {
    expect(requestableLeaveTypes().map((t) => t.key)).toEqual([
      'rotation', 'holiday', 'medical', 'emergency', 'crew_development', 'paid_parental', 'compassionate', 'unpaid', 'neutral', 'other',
    ]);
  });

  it('offLeaveTypes: everything that does not put the person aboard', () => {
    expect(offLeaveTypes().map((t) => t.key)).toEqual([
      'rotation', 'holiday', 'medical', 'emergency', 'crew_development', 'paid_parental', 'compassionate', 'unpaid', 'travel', 'neutral', 'pbq', 'other',
    ]);
  });
});

describe('legacy mappings (mirrors of planner_leave_type_for_rotation / planner_rotation_type_for_leave)', () => {
  it('maps every rotation type', () => {
    expect(Object.fromEntries(ROTATION_TYPES.map((r) => [r, leaveTypeKeyForRotation(r)]))).toEqual({
      onboard: 'on_board',
      leave: 'rotation',
      travel: 'travel',
      standby: 'rotation',
      yard: 'on_board',
      wfh: 'neutral',
      temp_cover: 'on_board',
      training: 'crew_development',
      no_crew: 'neutral',
      tbc: null,
    });
    expect(leaveTypeKeyForRotation(null)).toBeNull();
    expect(leaveTypeKeyForRotation(undefined)).toBeNull();
    expect(leaveTypeKeyForRotation('nonsense')).toBeNull();
  });

  it('maps every leave type back', () => {
    expect(Object.fromEntries(LEAVE_TYPE_KEYS.map((k) => [k, rotationTypeForLeaveType(k)]))).toEqual({
      on_board: 'onboard',
      sick_on_board: 'onboard',
      rotation: 'leave',
      holiday: 'leave',
      medical: 'leave',
      emergency: 'leave',
      crew_development: 'training',
      paid_parental: 'leave',
      compassionate: 'leave',
      unpaid: 'no_crew',
      travel: 'travel',
      neutral: 'no_crew',
      pbq: 'onboard',
      other: 'leave',
    });
    expect(rotationTypeForLeaveType(null)).toBe('leave');
    expect(rotationTypeForLeaveType('company_custom')).toBe('leave');
  });

  it('round-trips the aboard flag: a leave type that counts aboard maps to onboard', () => {
    for (const t of LEAVE_TYPES) if (t.countsOnBoard) expect(rotationTypeForLeaveType(t.key)).toBe('onboard');
  });

  it('a rotation type maps to a leave type whose back mapping keeps its aboard / away sense', () => {
    for (const r of ROTATION_TYPES) {
      const key = leaveTypeKeyForRotation(r);
      if (key === null) continue;
      const back = rotationTypeForLeaveType(key);
      const aboard = (x: string) => x === 'onboard' || x === 'yard' || x === 'temp_cover';
      expect(aboard(back)).toBe(aboard(r));
    }
  });
});

describe('resolveBalanceEffect', () => {
  const flags = [false, true];
  it('follows the policy flag for every combination, and the fixed effect otherwise', () => {
    for (const sick of flags) {
      for (const training of flags) {
        for (const unpaid of flags) {
          const policy = { sickAffectsBalance: sick, trainingAffectsBalance: training, unpaidAffectsBalance: unpaid };
          for (const t of LEAVE_TYPES) {
            const got = resolveBalanceEffect(t, policy);
            if (t.balanceEffect !== 'policy') {
              expect(got).toBe(t.balanceEffect);
              continue;
            }
            const on = t.policyFlag === 'sick_affects_balance' ? sick : t.policyFlag === 'training_affects_balance' ? training : unpaid;
            expect(got).toBe(on ? 'deducts' : 'neutral');
          }
        }
      }
    }
  });

  it('reads a policy type without a known flag as neutral', () => {
    expect(resolveBalanceEffect({ balanceEffect: 'policy', policyFlag: null }, { sickAffectsBalance: true, trainingAffectsBalance: true, unpaidAffectsBalance: true })).toBe('neutral');
  });

  it('agrees with the leave calculator on the codes it reads today (holiday deducts, on board accrues, rotation and emergency neutral)', () => {
    const none = { sickAffectsBalance: false, trainingAffectsBalance: false, unpaidAffectsBalance: false };
    expect(resolveBalanceEffect(leaveTypeByKey('holiday') as LeaveType, none)).toBe('deducts');
    expect(resolveBalanceEffect(leaveTypeByKey('on_board') as LeaveType, none)).toBe('accrues');
    expect(resolveBalanceEffect(leaveTypeByKey('rotation') as LeaveType, none)).toBe('neutral');
    expect(resolveBalanceEffect(leaveTypeByKey('emergency') as LeaveType, none)).toBe('neutral');
    expect(resolveBalanceEffect(leaveTypeByKey('other') as LeaveType, none)).toBe('neutral');
  });
});

describe('LEAVE_TONE_CLASSES', () => {
  it('has classes for every tone, built from design tokens only', () => {
    expect(Object.keys(LEAVE_TONE_CLASSES).sort()).toEqual([...LEAVE_TONE_KEYS].sort());
    for (const [tone, c] of Object.entries(LEAVE_TONE_CLASSES)) {
      for (const cls of [c.swatch, c.bar, c.text].join(' ').split(' ')) {
        expect(cls).not.toMatch(/-(50|100|200|300|400|500|600|700|800|900|950)$/);
        expect(cls).not.toMatch(/#|dark:|\[/);
      }
      if (tone !== 'muted') {
        expect(c.swatch).toBe(`bg-${tone}`);
        expect(c.text).toBe(`text-${tone}`);
        expect(c.bar).toContain(`bg-${tone}-muted`);
      }
    }
  });
});

describe('parseLeaveTypeRows', () => {
  it('reads the seed back exactly', () => {
    expect(parseLeaveTypeRows(LEAVE_TYPES.map(rowOf))).toEqual(LEAVE_TYPES);
  });

  it('reads an empty list', () => {
    expect(parseLeaveTypeRows([])).toEqual([]);
  });

  it('treats a missing policy flag as none', () => {
    const { policy_flag: _drop, ...row } = rowOf(LEAVE_TYPES[0]);
    expect(parseLeaveTypeRows([row])[0].policyFlag).toBeNull();
  });

  const base = rowOf(leaveTypeByKey('medical') as LeaveType);
  it.each([
    ['not an array', { rows: 'x' }],
    ['a row that is not an object', { rows: [null] }],
    ['no key', { rows: [{ ...base, key: '' }] }],
    ['no label', { rows: [{ ...base, label: '  ' }] }],
    ['an unknown day code', { rows: [{ ...base, day_code: 'X' }] }],
    ['an unknown tone', { rows: [{ ...base, tone_key: 'red' }] }],
    ['an unknown balance effect', { rows: [{ ...base, balance_effect: 'grows' }] }],
    ['an unknown policy flag', { rows: [{ ...base, policy_flag: 'whatever' }] }],
    ['a policy type without its flag', { rows: [{ ...base, policy_flag: null }] }],
    ['a flag on a non-policy type', { rows: [{ ...base, balance_effect: 'neutral' }] }],
    ['no sort order', { rows: [{ ...base, sort_order: '5' }] }],
    ['a sort order that is not finite', { rows: [{ ...base, sort_order: Number.NaN }] }],
    ['a flag that is not a boolean', { rows: [{ ...base, counts_on_board: 'yes' }] }],
    ['a missing is_active', { rows: [{ ...base, is_active: undefined }] }],
  ])('refuses %s', (_what, { rows }) => {
    expect(() => parseLeaveTypeRows(rows)).toThrow(LeaveTypeShapeError);
  });

  it('lists the selected columns explicitly', () => {
    expect(LEAVE_TYPE_COLUMNS.split(',').map((s) => s.trim())).toEqual(Object.keys(rowOf(LEAVE_TYPES[0])));
  });
});
