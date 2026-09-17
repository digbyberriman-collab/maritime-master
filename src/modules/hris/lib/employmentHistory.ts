import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';

/**
 * Pure helpers for the Employment History page: merging assignments,
 * contracts and rank changes into one timeline, and sea-service maths.
 * No React, no Supabase – so it can be unit tested.
 */

export type EmploymentEventType =
  | 'joined_vessel'
  | 'left_vessel'
  | 'transferred'
  | 'contract_started'
  | 'contract_ended'
  | 'terminated'
  | 'promoted'
  | 'rank_changed'
  | 'probation_ended'
  | 'account_deactivated';

export interface AssignmentRecord {
  id: string;
  vessel_id: string;
  vessel_name: string | null;
  position: string;
  rank: string | null;
  department: string | null;
  join_date: string;
  leave_date: string | null;
  is_current: boolean | null;
  end_reason: string | null;
  notes: string | null;
  created_at?: string | null;
}

export interface ContractRecord {
  id: string;
  contract_type: string;
  contract_number: string | null;
  position: string | null;
  rank: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  start_date: string;
  end_date: string | null;
  probation_end_date: string | null;
  status: string;
  terminated_at: string | null;
  termination_reason: string | null;
}

export interface RankChangeRecord {
  id: string;
  /** ISO timestamp or date. */
  date: string;
  fromRank: string | null;
  toRank: string | null;
  fromPosition: string | null;
  toPosition: string | null;
  actorEmail: string | null;
}

export interface EmploymentEvent {
  id: string;
  type: EmploymentEventType;
  /** yyyy-MM-dd */
  date: string;
  title: string;
  vesselId: string | null;
  vesselName: string | null;
  /** For transfers: destination vessel. */
  toVesselName?: string | null;
  position: string | null;
  rank: string | null;
  fromRank?: string | null;
  toRank?: string | null;
  reason: string | null;
  notes: string | null;
  source: 'assignment' | 'contract' | 'audit' | 'profile';
  sourceId: string;
}

export interface ServiceSummary {
  /** Union of all assignment periods, in days (sign-on and sign-off days inclusive). */
  totalSeaDays: number;
  /** Distinct vessels with at least one assignment. */
  vesselsServed: number;
  /** Days on the current assignment, or null when not on board. */
  currentVesselDays: number | null;
  currentVesselName: string | null;
  firstJoinDate: string | null;
  currentContract: {
    id: string;
    contractType: string;
    startDate: string;
    endDate: string | null;
    /** Total planned contract length in days, or null for open-ended. */
    lengthDays: number | null;
    daysRemaining: number | null;
    daysServed: number;
  } | null;
}

export interface MovementRow {
  id: string;
  kind: 'join' | 'leave' | 'transfer';
  date: string;
  crewName: string;
  profileId: string | null;
  vesselName: string | null;
  position: string | null;
  rank: string | null;
  reason: string | null;
}

/** Only the assignment fields that the inline editor may change. */
export interface AssignmentPatch {
  join_date?: string;
  leave_date?: string | null;
  position?: string;
  rank?: string | null;
  end_reason?: string | null;
  notes?: string | null;
}

export const END_REASONS = [
  { value: 'contract_end', label: 'Contract end' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'resignation', label: 'Resignation' },
  { value: 'termination', label: 'Termination' },
  { value: 'leave', label: 'Leave of absence' },
  { value: 'deactivated', label: 'Account deactivated' },
  { value: 'other', label: 'Other' },
] as const;

/** Rough seniority ladder used to tell a promotion from a sideways change. */
const RANK_ORDER: string[] = [
  'deckhand',
  'junior deckhand',
  'stewardess',
  'steward',
  'junior stew',
  'cook',
  'sous chef',
  'wiper',
  'oiler',
  'motorman',
  'lead deckhand',
  'chief stewardess',
  'chief steward',
  'chief stew',
  'bosun',
  'boatswain',
  'head chef',
  'chef',
  'third engineer',
  '3rd engineer',
  'third officer',
  '3rd officer',
  'second engineer',
  '2nd engineer',
  'second officer',
  '2nd officer',
  'purser',
  'first officer',
  '1st officer',
  'chief officer',
  'chief mate',
  'chief engineer',
  'staff captain',
  'relief captain',
  'master',
  'captain',
];

const normaliseRank = (r: string | null | undefined): string => (r ?? '').trim().toLowerCase();

export const rankIndex = (rank: string | null | undefined): number => RANK_ORDER.indexOf(normaliseRank(rank));

/** True when the seniority ladder knows both ranks and the new one is higher. */
export const isPromotion = (fromRank: string | null | undefined, toRank: string | null | undefined): boolean => {
  const from = rankIndex(fromRank);
  const to = rankIndex(toRank);
  return from >= 0 && to >= 0 && to > from;
};

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
};

/** yyyy-MM-dd for a Date, using local calendar fields. */
export const isoDay = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dayOf = (value: string): string => value.slice(0, 10);

/**
 * Days served on one assignment: sign-on day to sign-off day inclusive, or
 * to `today` while still on board. Never negative; 0 for future joins.
 */
export const assignmentDays = (a: Pick<AssignmentRecord, 'join_date' | 'leave_date'>, today: Date): number => {
  const start = toDate(a.join_date);
  if (!start) return 0;
  const rawEnd = toDate(a.leave_date);
  const end = rawEnd && rawEnd <= today ? rawEnd : today;
  if (start > end) return 0;
  return differenceInCalendarDays(end, start) + 1;
};

/** Days covered by the union of assignment periods (overlaps counted once). */
export const totalSeaDays = (assignments: Pick<AssignmentRecord, 'join_date' | 'leave_date'>[], today: Date): number => {
  const intervals = assignments
    .map((a) => {
      const start = toDate(a.join_date);
      if (!start) return null;
      const rawEnd = toDate(a.leave_date);
      const end = rawEnd && rawEnd <= today ? rawEnd : today;
      if (start > end) return null;
      return { start: differenceInCalendarDays(start, new Date(2000, 0, 1)), end: differenceInCalendarDays(end, new Date(2000, 0, 1)) };
    })
    .filter((x): x is { start: number; end: number } => x !== null)
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let cur: { start: number; end: number } | null = null;
  for (const iv of intervals) {
    if (!cur) {
      cur = { ...iv };
      continue;
    }
    if (iv.start <= cur.end + 1) {
      cur.end = Math.max(cur.end, iv.end);
    } else {
      total += cur.end - cur.start + 1;
      cur = { ...iv };
    }
  }
  if (cur) total += cur.end - cur.start + 1;
  return total;
};

const isOnBoard = (a: AssignmentRecord, today: Date): boolean => {
  const leave = toDate(a.leave_date);
  return Boolean(a.is_current) || !leave || leave > today;
};

export const computeServiceSummary = (
  assignments: AssignmentRecord[],
  contracts: ContractRecord[],
  today: Date,
): ServiceSummary => {
  const started = assignments.filter((a) => {
    const d = toDate(a.join_date);
    return d && d <= today;
  });
  const current = [...assignments]
    .filter((a) => isOnBoard(a, today))
    .sort((a, b) => b.join_date.localeCompare(a.join_date))[0] ?? null;
  const firstJoin = [...assignments].map((a) => dayOf(a.join_date)).sort()[0] ?? null;

  const active = [...contracts]
    .filter((c) => c.status === 'active')
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null;

  let currentContract: ServiceSummary['currentContract'] = null;
  if (active) {
    const start = toDate(active.start_date);
    const end = toDate(active.end_date);
    const lengthDays = start && end ? differenceInCalendarDays(end, start) + 1 : null;
    const daysRemaining = end ? differenceInCalendarDays(end, today) : null;
    const daysServed = start && start <= today ? differenceInCalendarDays(today, start) + 1 : 0;
    currentContract = {
      id: active.id,
      contractType: active.contract_type,
      startDate: dayOf(active.start_date),
      endDate: active.end_date ? dayOf(active.end_date) : null,
      lengthDays,
      daysRemaining,
      daysServed,
    };
  }

  return {
    totalSeaDays: totalSeaDays(started, today),
    vesselsServed: new Set(assignments.map((a) => a.vessel_id)).size,
    currentVesselDays: current ? assignmentDays(current, today) : null,
    currentVesselName: current?.vessel_name ?? null,
    firstJoinDate: firstJoin,
    currentContract,
  };
};

const humanReason = (r: string | null | undefined): string | null => {
  if (!r) return null;
  const found = END_REASONS.find((x) => x.value === r);
  return found ? found.label : r.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Finds the assignment that immediately follows `a` on a different vessel
 * (joined on the same day as, or the day after, `a` ended).
 */
const findSuccessor = (a: AssignmentRecord, all: AssignmentRecord[]): AssignmentRecord | null => {
  const leave = toDate(a.leave_date);
  if (!leave) return null;
  return (
    all.find((b) => {
      if (b.id === a.id || b.vessel_id === a.vessel_id) return false;
      const join = toDate(b.join_date);
      if (!join) return false;
      const gap = differenceInCalendarDays(join, leave);
      return gap >= 0 && gap <= 1;
    }) ?? null
  );
};

/** Sort newest first; on the same day, "ending" events come after "starting" ones. */
const TYPE_ORDER: Record<EmploymentEventType, number> = {
  contract_started: 1,
  joined_vessel: 2,
  promoted: 3,
  rank_changed: 3,
  probation_ended: 4,
  transferred: 5,
  left_vessel: 6,
  contract_ended: 7,
  terminated: 8,
  account_deactivated: 9,
};

export const sortEvents = (events: EmploymentEvent[]): EmploymentEvent[] =>
  [...events].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return TYPE_ORDER[b.type] - TYPE_ORDER[a.type];
  });

export interface BuildTimelineInput {
  assignments: AssignmentRecord[];
  contracts: ContractRecord[];
  rankChanges: RankChangeRecord[];
  /** ISO timestamp/date the account was deactivated, when known from the profile. */
  deactivatedAt?: string | null;
}

export const buildTimeline = ({ assignments, contracts, rankChanges, deactivatedAt }: BuildTimelineInput): EmploymentEvent[] => {
  const events: EmploymentEvent[] = [];
  const suppressedJoins = new Set<string>();

  for (const a of assignments) {
    const vessel = a.vessel_name ?? 'Unknown vessel';
    const isTransfer = a.end_reason === 'transfer';
    const successor = a.leave_date ? findSuccessor(a, assignments) : null;

    if (a.leave_date && (isTransfer || (!a.end_reason && successor))) {
      if (successor) suppressedJoins.add(successor.id);
      events.push({
        id: `transfer:${a.id}`,
        type: 'transferred',
        date: dayOf(a.leave_date),
        title: successor ? `Transferred from ${vessel} to ${successor.vessel_name ?? 'another vessel'}` : `Transferred from ${vessel}`,
        vesselId: a.vessel_id,
        vesselName: a.vessel_name,
        toVesselName: successor?.vessel_name ?? null,
        position: successor?.position ?? a.position,
        rank: successor?.rank ?? a.rank,
        reason: humanReason('transfer'),
        notes: a.notes,
        source: 'assignment',
        sourceId: a.id,
      });
    } else if (a.leave_date && a.end_reason === 'deactivated') {
      events.push({
        id: `deactivated:${a.id}`,
        type: 'account_deactivated',
        date: dayOf(a.leave_date),
        title: `Account deactivated – signed off ${vessel}`,
        vesselId: a.vessel_id,
        vesselName: a.vessel_name,
        position: a.position,
        rank: a.rank,
        reason: humanReason(a.end_reason),
        notes: a.notes,
        source: 'assignment',
        sourceId: a.id,
      });
    } else if (a.leave_date) {
      events.push({
        id: `left:${a.id}`,
        type: 'left_vessel',
        date: dayOf(a.leave_date),
        title: `Signed off ${vessel}`,
        vesselId: a.vessel_id,
        vesselName: a.vessel_name,
        position: a.position,
        rank: a.rank,
        reason: humanReason(a.end_reason),
        notes: a.notes,
        source: 'assignment',
        sourceId: a.id,
      });
    }
  }

  for (const a of assignments) {
    if (suppressedJoins.has(a.id)) continue;
    events.push({
      id: `joined:${a.id}`,
      type: 'joined_vessel',
      date: dayOf(a.join_date),
      title: `Joined ${a.vessel_name ?? 'Unknown vessel'}`,
      vesselId: a.vessel_id,
      vesselName: a.vessel_name,
      position: a.position,
      rank: a.rank,
      reason: null,
      notes: a.leave_date ? null : a.notes,
      source: 'assignment',
      sourceId: a.id,
    });
  }

  for (const c of contracts) {
    const label = c.contract_number ? `contract ${c.contract_number}` : `${c.contract_type.replace(/_/g, ' ')} contract`;
    events.push({
      id: `contract-start:${c.id}`,
      type: 'contract_started',
      date: dayOf(c.start_date),
      title: `Started ${label}`,
      vesselId: c.vessel_id,
      vesselName: c.vessel_name,
      position: c.position,
      rank: c.rank,
      reason: null,
      notes: null,
      source: 'contract',
      sourceId: c.id,
    });
    if (c.status === 'terminated' && (c.terminated_at || c.end_date)) {
      events.push({
        id: `contract-terminated:${c.id}`,
        type: 'terminated',
        date: dayOf(c.terminated_at ?? c.end_date ?? c.start_date),
        title: `Terminated ${label}`,
        vesselId: c.vessel_id,
        vesselName: c.vessel_name,
        position: c.position,
        rank: c.rank,
        reason: c.termination_reason,
        notes: null,
        source: 'contract',
        sourceId: c.id,
      });
    } else if (c.end_date && (c.status === 'expired' || c.status === 'superseded' || c.status === 'active')) {
      events.push({
        id: `contract-end:${c.id}`,
        type: 'contract_ended',
        date: dayOf(c.end_date),
        title: c.status === 'superseded' ? `Superseded ${label}` : `${label.charAt(0).toUpperCase()}${label.slice(1)} ends`,
        vesselId: c.vessel_id,
        vesselName: c.vessel_name,
        position: c.position,
        rank: c.rank,
        reason: c.status === 'superseded' ? 'Superseded' : null,
        notes: null,
        source: 'contract',
        sourceId: c.id,
      });
    }
    if (c.probation_end_date) {
      events.push({
        id: `probation:${c.id}`,
        type: 'probation_ended',
        date: dayOf(c.probation_end_date),
        title: 'Probation period ends',
        vesselId: c.vessel_id,
        vesselName: c.vessel_name,
        position: c.position,
        rank: c.rank,
        reason: null,
        notes: null,
        source: 'contract',
        sourceId: c.id,
      });
    }
  }

  for (const r of rankChanges) {
    const rankMoved = normaliseRank(r.fromRank) !== normaliseRank(r.toRank);
    const positionMoved = (r.fromPosition ?? '') !== (r.toPosition ?? '');
    if (!rankMoved && !positionMoved) continue;
    const promoted = rankMoved && isPromotion(r.fromRank, r.toRank);
    const fromLabel = r.fromRank ?? r.fromPosition ?? '—';
    const toLabel = r.toRank ?? r.toPosition ?? '—';
    events.push({
      id: `rank:${r.id}`,
      type: promoted ? 'promoted' : 'rank_changed',
      date: dayOf(r.date),
      title: promoted ? `Promoted to ${toLabel}` : `${rankMoved ? 'Rank' : 'Position'} changed: ${fromLabel} → ${toLabel}`,
      vesselId: null,
      vesselName: null,
      position: r.toPosition,
      rank: r.toRank,
      fromRank: r.fromRank ?? r.fromPosition,
      toRank: r.toRank ?? r.toPosition,
      reason: null,
      notes: r.actorEmail ? `Changed by ${r.actorEmail}` : null,
      source: 'audit',
      sourceId: r.id,
    });
  }

  if (deactivatedAt && !events.some((e) => e.type === 'account_deactivated')) {
    events.push({
      id: 'deactivated:profile',
      type: 'account_deactivated',
      date: dayOf(deactivatedAt),
      title: 'Account deactivated',
      vesselId: null,
      vesselName: null,
      position: null,
      rank: null,
      reason: null,
      notes: null,
      source: 'profile',
      sourceId: 'profile',
    });
  }

  return sortEvents(events);
};

/**
 * Derives rank/position changes from audit_logs rows written for a profile.
 * Rows without a rank or position difference are ignored.
 */
export interface AuditRowLike {
  id: string;
  timestamp: string | null;
  actor_email: string | null;
  old_values: unknown;
  new_values: unknown;
}

const pick = (obj: unknown, key: string): string | null => {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v : null;
};

export const rankChangesFromAudit = (rows: AuditRowLike[]): RankChangeRecord[] =>
  rows
    .map((row) => ({
      id: row.id,
      date: row.timestamp ?? '',
      fromRank: pick(row.old_values, 'rank'),
      toRank: pick(row.new_values, 'rank'),
      fromPosition: pick(row.old_values, 'position'),
      toPosition: pick(row.new_values, 'position'),
      actorEmail: row.actor_email,
    }))
    .filter((r) => r.date && (normaliseRank(r.fromRank) !== normaliseRank(r.toRank) || (r.fromPosition ?? '') !== (r.toPosition ?? '')));

/** Company-wide joins / leaves / transfers inside the window, newest first. */
export const buildRecentMovements = (
  rows: (AssignmentRecord & { crewName: string; profileId: string | null })[],
  today: Date,
  windowDays = 30,
): MovementRow[] => {
  const since = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - windowDays));
  const out: MovementRow[] = [];
  for (const a of rows) {
    const join = dayOf(a.join_date);
    if (join >= since && join <= isoDay(today)) {
      const successorOf = rows.find(
        (b) =>
          b.id !== a.id &&
          b.profileId === a.profileId &&
          b.vessel_id !== a.vessel_id &&
          b.leave_date &&
          (b.end_reason === 'transfer' || Math.abs(differenceInCalendarDays(parseISO(join), parseISO(dayOf(b.leave_date)))) <= 1),
      );
      if (!successorOf) {
        out.push({ id: `join:${a.id}`, kind: 'join', date: join, crewName: a.crewName, profileId: a.profileId, vesselName: a.vessel_name, position: a.position, rank: a.rank, reason: null });
      }
    }
    if (a.leave_date) {
      const leave = dayOf(a.leave_date);
      if (leave >= since && leave <= isoDay(today)) {
        const successor = rows.find((b) => b.id !== a.id && b.profileId === a.profileId && b.vessel_id !== a.vessel_id && Math.abs(differenceInCalendarDays(parseISO(dayOf(b.join_date)), parseISO(leave))) <= 1);
        const isTransfer = a.end_reason === 'transfer' || (!a.end_reason && Boolean(successor));
        out.push({
          id: `${isTransfer ? 'transfer' : 'leave'}:${a.id}`,
          kind: isTransfer ? 'transfer' : 'leave',
          date: leave,
          crewName: a.crewName,
          profileId: a.profileId,
          vesselName: isTransfer && successor ? `${a.vessel_name ?? '—'} → ${successor.vessel_name ?? '—'}` : a.vessel_name,
          position: isTransfer && successor ? successor.position : a.position,
          rank: a.rank,
          reason: humanReason(a.end_reason),
        });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
};

const csvCell = (value: string | number | null | undefined): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Sea-service record: one row per assignment. */
export const assignmentsToCsv = (assignments: AssignmentRecord[], today: Date): string => {
  const header = ['Vessel', 'Position', 'Rank', 'From', 'To', 'Days', 'Reason', 'Notes'];
  const rows = [...assignments]
    .sort((a, b) => a.join_date.localeCompare(b.join_date))
    .map((a) => [
      a.vessel_name ?? '',
      a.position,
      a.rank ?? '',
      dayOf(a.join_date),
      a.leave_date ? dayOf(a.leave_date) : '',
      assignmentDays(a, today),
      humanReason(a.end_reason) ?? '',
      a.notes ?? '',
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
};

/** Fields that actually changed between an assignment and a patch. */
export const diffAssignment = (
  current: AssignmentRecord,
  patch: AssignmentPatch,
): { changed: AssignmentPatch; oldValues: Record<string, unknown>; newValues: Record<string, unknown> } => {
  const changed: AssignmentPatch = {};
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  const keys = Object.keys(patch) as (keyof AssignmentPatch)[];
  for (const key of keys) {
    const next = patch[key];
    if (next === undefined) continue;
    const prevRaw = current[key];
    const prev = key === 'join_date' || key === 'leave_date' ? (prevRaw ? dayOf(String(prevRaw)) : null) : prevRaw ?? null;
    const nextNorm = next === '' ? null : next;
    if (prev === nextNorm) continue;
    (changed as Record<string, unknown>)[key] = nextNorm;
    oldValues[key] = prev;
    newValues[key] = nextNorm;
  }
  return { changed, oldValues, newValues };
};
