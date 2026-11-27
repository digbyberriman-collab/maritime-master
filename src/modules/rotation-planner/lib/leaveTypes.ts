/**
 * The planner's leave types (gap/04 C51, W7; X1-09): one STORM list for the
 * Add leave dialog, the legend, the manning grid and the day codes the
 * period store writes. The dialog and the legend read the same list, so
 * they always agree (the reference product's two lists did not).
 *
 * `LEAVE_TYPES` is the exact mirror of the `leave_types` seed of
 * 20261124060900_crew_planner_periods.sql; the SQL test loads this file
 * (scripts/db/lib/load-ts.mjs) and compares it with the seeded rows, and the
 * two legacy mappings below with their SQL twins, case by case. While the
 * table is not applied (D-01) the planner uses this list as is: it is
 * STORM's reference data, never sample rows.
 *
 * Pure: no imports but types, so the SQL test can load it.
 */
import type { FrpRotationType } from '../types';

/** The day codes of crew_leave_entries (E and O are new with X1-09). */
export const LEAVE_DAY_CODES = ['F', 'Q', 'L', 'T', 'CD', 'M', 'PPL', 'CL', 'N', 'U', 'R', 'E', 'O'] as const;
export type LeaveDayCode = (typeof LEAVE_DAY_CODES)[number];

/** Design token families a leave type is drawn with (never a colour value). */
export const LEAVE_TONE_KEYS = [
  'success',
  'info',
  'warning',
  'critical',
  'orange',
  'purple',
  'cyan',
  'amber',
  'pink',
  'indigo',
  'teal',
  'muted',
] as const;
export type LeaveToneKey = (typeof LEAVE_TONE_KEYS)[number];

/** What a day of the type does to the leave balance; `policy` follows the vessel's leave policy flag. */
export const LEAVE_BALANCE_EFFECTS = ['accrues', 'deducts', 'neutral', 'policy'] as const;
export type LeaveBalanceEffect = (typeof LEAVE_BALANCE_EFFECTS)[number];

/** The crew_leave_policies flags a `policy` type reads. */
export const LEAVE_POLICY_FLAGS = ['sick_affects_balance', 'training_affects_balance', 'unpaid_affects_balance'] as const;
export type LeavePolicyFlag = (typeof LEAVE_POLICY_FLAGS)[number];

/** The system leave type keys, in legend order. */
export const LEAVE_TYPE_KEYS = [
  'on_board',
  'sick_on_board',
  'rotation',
  'holiday',
  'medical',
  'emergency',
  'crew_development',
  'paid_parental',
  'compassionate',
  'unpaid',
  'travel',
  'neutral',
  'pbq',
  'other',
] as const;
export type LeaveTypeKey = (typeof LEAVE_TYPE_KEYS)[number];

export interface LeaveType {
  /** leave_types.key; the system keys are LeaveTypeKey, a later company type may add others. */
  key: string;
  label: string;
  dayCode: LeaveDayCode;
  toneKey: LeaveToneKey;
  balanceEffect: LeaveBalanceEffect;
  policyFlag: LeavePolicyFlag | null;
  /** Puts the person aboard (On board, Sick on board): the manning count reads it. */
  countsOnBoard: boolean;
  /** Time off: a crew member may request it. */
  isLeave: boolean;
  /** Personal leave: a planner writes it directly only with leave approval (D-X1-10). */
  needsApproval: boolean;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
}

const sys = (
  key: LeaveTypeKey,
  label: string,
  dayCode: LeaveDayCode,
  toneKey: LeaveToneKey,
  balanceEffect: LeaveBalanceEffect,
  policyFlag: LeavePolicyFlag | null,
  countsOnBoard: boolean,
  isLeave: boolean,
  needsApproval: boolean,
  sortOrder: number,
): LeaveType => ({
  key,
  label,
  dayCode,
  toneKey,
  balanceEffect,
  policyFlag,
  countsOnBoard,
  isLeave,
  needsApproval,
  isSystem: true,
  isActive: true,
  sortOrder,
});

/** STORM's 14 leave types (the leave_types seed; the W7 table). */
export const LEAVE_TYPES: readonly LeaveType[] = Object.freeze([
  sys('on_board', 'On board', 'F', 'success', 'accrues', null, true, false, false, 10),
  sys('sick_on_board', 'Sick on board', 'F', 'pink', 'accrues', null, true, false, false, 20),
  sys('rotation', 'Rotation leave', 'R', 'teal', 'neutral', null, false, true, false, 30),
  sys('holiday', 'Holiday (annual leave)', 'L', 'info', 'deducts', null, false, true, true, 40),
  sys('medical', 'Medical / sick leave', 'M', 'critical', 'policy', 'sick_affects_balance', false, true, true, 50),
  sys('emergency', 'Emergency leave', 'E', 'orange', 'neutral', null, false, true, true, 60),
  sys('crew_development', 'Crew development / training', 'CD', 'cyan', 'policy', 'training_affects_balance', false, true, true, 70),
  sys('paid_parental', 'Paid parental leave', 'PPL', 'purple', 'neutral', null, false, true, true, 80),
  sys('compassionate', 'Compassionate leave', 'CL', 'indigo', 'neutral', null, false, true, true, 90),
  sys('unpaid', 'Unpaid leave', 'U', 'warning', 'policy', 'unpaid_affects_balance', false, true, true, 100),
  sys('travel', 'Travel', 'T', 'amber', 'neutral', null, false, false, false, 110),
  sys('neutral', 'Neutral leave', 'N', 'muted', 'neutral', null, false, true, false, 120),
  sys('pbq', 'Pre-boarding quarantine (PBQ)', 'Q', 'muted', 'accrues', null, false, false, false, 130),
  sys('other', 'Other', 'O', 'muted', 'neutral', null, false, true, true, 140),
]);

/** The type that a new Off toggle and a rotation stint default to. */
export const DEFAULT_OFF_LEAVE_TYPE: LeaveTypeKey = 'rotation';

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

export const isLeaveDayCode = (value: unknown): value is LeaveDayCode => isOneOf(LEAVE_DAY_CODES, value);
export const isLeaveTypeKey = (value: unknown): value is LeaveTypeKey => isOneOf(LEAVE_TYPE_KEYS, value);

/** Active types, legend order (sort order, then key). The dialog and the legend both read this. */
export function leaveTypeLegend(types: readonly LeaveType[] = LEAVE_TYPES): LeaveType[] {
  return types
    .filter((t) => t.isActive)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function leaveTypeByKey(key: string | null | undefined, types: readonly LeaveType[] = LEAVE_TYPES): LeaveType | null {
  if (!key) return null;
  return types.find((t) => t.key === key) ?? null;
}

/**
 * The type a bare day code stands for (a legacy request row, the legacy
 * day-code grid): the first active type with that code in legend order, so
 * F reads On board, never Sick on board. Null for an unknown code.
 */
export function leaveTypeForDayCode(code: string | null | undefined, types: readonly LeaveType[] = LEAVE_TYPES): LeaveType | null {
  const c = (code ?? '').trim().toUpperCase();
  if (!c) return null;
  return leaveTypeLegend(types).find((t) => t.dayCode === c) ?? null;
}

/** The types a crew member may request (time off), legend order. */
export function requestableLeaveTypes(types: readonly LeaveType[] = LEAVE_TYPES): LeaveType[] {
  return leaveTypeLegend(types).filter((t) => t.isLeave);
}

/** The types of time off the Off toggle offers (everything that does not put the person aboard). */
export function offLeaveTypes(types: readonly LeaveType[] = LEAVE_TYPES): LeaveType[] {
  return leaveTypeLegend(types).filter((t) => !t.countsOnBoard);
}

/**
 * The leave type of a legacy rotation type (bars written before X1-09):
 * the mirror of planner_leave_type_for_rotation(). Null for "to be
 * confirmed" and anything unknown (such a bar writes no day codes).
 */
export function leaveTypeKeyForRotation(rotationType: string | null | undefined): LeaveTypeKey | null {
  switch (rotationType) {
    case 'onboard':
    case 'yard':
    case 'temp_cover':
      return 'on_board';
    case 'training':
      return 'crew_development';
    case 'leave':
    case 'standby':
      return 'rotation';
    case 'travel':
      return 'travel';
    case 'wfh':
    case 'no_crew':
      return 'neutral';
    default:
      return null;
  }
}

/**
 * The legacy rotation type an engine period shows to the legacy planner
 * and to hr_days_onboard's bar fallback: the mirror of
 * planner_rotation_type_for_leave().
 */
export function rotationTypeForLeaveType(key: string | null | undefined): FrpRotationType {
  switch (key) {
    case 'on_board':
    case 'sick_on_board':
    case 'pbq':
      return 'onboard';
    case 'travel':
      return 'travel';
    case 'crew_development':
      return 'training';
    case 'neutral':
    case 'unpaid':
      return 'no_crew';
    default:
      return 'leave';
  }
}

/** The vessel's leave policy flags (crew_leave_policies) a `policy` type reads. */
export interface LeaveBalancePolicy {
  sickAffectsBalance: boolean;
  trainingAffectsBalance: boolean;
  unpaidAffectsBalance: boolean;
}

/**
 * What a day of the type does to the balance under a policy: accrues,
 * deducts or neutral. A `policy` type deducts when its flag is on, as the
 * leave calculator reads a day code today (M with sick_affects_balance, CD
 * with training_affects_balance, U with unpaid_affects_balance).
 */
export function resolveBalanceEffect(type: Pick<LeaveType, 'balanceEffect' | 'policyFlag'>, policy: LeaveBalancePolicy): 'accrues' | 'deducts' | 'neutral' {
  if (type.balanceEffect !== 'policy') return type.balanceEffect;
  switch (type.policyFlag) {
    case 'sick_affects_balance':
      return policy.sickAffectsBalance ? 'deducts' : 'neutral';
    case 'training_affects_balance':
      return policy.trainingAffectsBalance ? 'deducts' : 'neutral';
    case 'unpaid_affects_balance':
      return policy.unpaidAffectsBalance ? 'deducts' : 'neutral';
    default:
      return 'neutral';
  }
}

/** Token classes for a leave type's tone: a swatch, a bar (soft fill + readable text) and a text colour. */
export interface LeaveToneClasses {
  swatch: string;
  bar: string;
  text: string;
}

export const LEAVE_TONE_CLASSES: Readonly<Record<LeaveToneKey, LeaveToneClasses>> = Object.freeze({
  success: { swatch: 'bg-success', bar: 'bg-success-muted text-foreground border-success', text: 'text-success' },
  info: { swatch: 'bg-info', bar: 'bg-info-muted text-foreground border-info', text: 'text-info' },
  warning: { swatch: 'bg-warning', bar: 'bg-warning-muted text-foreground border-warning', text: 'text-warning' },
  critical: { swatch: 'bg-critical', bar: 'bg-critical-muted text-foreground border-critical', text: 'text-critical' },
  orange: { swatch: 'bg-orange', bar: 'bg-orange-muted text-foreground border-orange', text: 'text-orange' },
  purple: { swatch: 'bg-purple', bar: 'bg-purple-muted text-foreground border-purple', text: 'text-purple' },
  cyan: { swatch: 'bg-cyan', bar: 'bg-cyan-muted text-foreground border-cyan', text: 'text-cyan' },
  amber: { swatch: 'bg-amber', bar: 'bg-amber-muted text-foreground border-amber', text: 'text-amber' },
  pink: { swatch: 'bg-pink', bar: 'bg-pink-muted text-foreground border-pink', text: 'text-pink' },
  indigo: { swatch: 'bg-indigo', bar: 'bg-indigo-muted text-foreground border-indigo', text: 'text-indigo' },
  teal: { swatch: 'bg-teal', bar: 'bg-teal-muted text-foreground border-teal', text: 'text-teal' },
  muted: { swatch: 'bg-muted-foreground', bar: 'bg-muted text-foreground border-border', text: 'text-muted-foreground' },
});

/** A leave_types row that does not have the shape the planner needs. */
export class LeaveTypeShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeaveTypeShapeError';
  }
}

const bool = (v: unknown, field: string, i: number): boolean => {
  if (typeof v !== 'boolean') throw new LeaveTypeShapeError(`Leave type ${i + 1}: ${field} is not a boolean.`);
  return v;
};

/**
 * Reads leave_types rows (snake case, as selected) strictly: an unknown
 * day code, tone, balance effect or policy flag, a policy type without its
 * flag or a missing field is an error, never a guess.
 */
export function parseLeaveTypeRows(rows: unknown): LeaveType[] {
  if (!Array.isArray(rows)) throw new LeaveTypeShapeError('Leave types came back in an unexpected shape.');
  return rows.map((row: unknown, i) => {
    if (!row || typeof row !== 'object') throw new LeaveTypeShapeError(`Leave type ${i + 1} is not an object.`);
    const r = row as Record<string, unknown>;
    if (typeof r.key !== 'string' || !r.key) throw new LeaveTypeShapeError(`Leave type ${i + 1} has no key.`);
    if (typeof r.label !== 'string' || !r.label.trim()) throw new LeaveTypeShapeError(`Leave type ${r.key} has no label.`);
    if (!isLeaveDayCode(r.day_code)) throw new LeaveTypeShapeError(`Leave type ${r.key} has an unknown day code.`);
    if (!isOneOf(LEAVE_TONE_KEYS, r.tone_key)) throw new LeaveTypeShapeError(`Leave type ${r.key} has an unknown tone.`);
    if (!isOneOf(LEAVE_BALANCE_EFFECTS, r.balance_effect)) throw new LeaveTypeShapeError(`Leave type ${r.key} has an unknown balance effect.`);
    const rawFlag: unknown = r.policy_flag ?? null;
    let flag: LeavePolicyFlag | null = null;
    if (rawFlag !== null) {
      if (!isOneOf(LEAVE_POLICY_FLAGS, rawFlag)) throw new LeaveTypeShapeError(`Leave type ${r.key} has an unknown policy flag.`);
      flag = rawFlag;
    }
    if ((r.balance_effect === 'policy') !== (flag !== null)) {
      throw new LeaveTypeShapeError(`Leave type ${r.key}: a policy type names its policy flag, and only a policy type does.`);
    }
    if (typeof r.sort_order !== 'number' || !Number.isFinite(r.sort_order)) throw new LeaveTypeShapeError(`Leave type ${r.key} has no sort order.`);
    return {
      key: r.key,
      label: r.label,
      dayCode: r.day_code,
      toneKey: r.tone_key,
      balanceEffect: r.balance_effect,
      policyFlag: flag,
      countsOnBoard: bool(r.counts_on_board, 'counts_on_board', i),
      isLeave: bool(r.is_leave, 'is_leave', i),
      needsApproval: bool(r.needs_approval, 'needs_approval', i),
      isSystem: bool(r.is_system, 'is_system', i),
      isActive: bool(r.is_active, 'is_active', i),
      sortOrder: r.sort_order,
    };
  });
}

/** The leave_types columns the planner selects (explicit list, D-01 readers). */
export const LEAVE_TYPE_COLUMNS =
  'key, label, day_code, tone_key, balance_effect, policy_flag, counts_on_board, is_leave, needs_approval, is_system, is_active, sort_order';
