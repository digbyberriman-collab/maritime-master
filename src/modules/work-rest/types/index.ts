// Domain types for the Hours of Work and Rest module.
// All times are minutes-from-local-midnight on a given record_date,
// in the [0, 1440] range (1440 = end of day). "Local" is the vessel's
// clock (vessel_work_rest_settings.timezone): the rules run on 1440-minute
// local days, exactly as the entry grid shows them.

export type BlockType = 'work' | 'rest';

export interface WorkRestBlock {
  id?: string;
  record_id?: string;
  crew_id?: string;
  block_type: BlockType;
  category?: string | null;
  start_minute: number;
  end_minute: number;
  notes?: string | null;
}

export interface DailyRecord {
  id?: string;
  submission_id?: string;
  crew_id: string;
  vessel_id: string;
  record_date: string; // YYYY-MM-DD
  blocks: WorkRestBlock[];
  notes?: string | null;
  total_work_minutes?: number;
  total_rest_minutes?: number;
  longest_rest_minutes?: number;
  rest_period_count?: number;
  is_compliant?: boolean | null;
}

export interface RuleSet {
  id?: string;
  name: string;
  min_rest_per_24h: number;        // hours
  min_rest_per_7d: number;         // hours
  max_rest_periods_per_24h: number;
  min_long_rest_block: number;     // hours
  max_interval_between_rest: number; // hours
  /**
   * Near-limit margins and serious thresholds (gap/04 C46, W6), in hours.
   * They come from vessel_work_rest_settings (20261124060700); left out,
   * the engine uses DEFAULT_THRESHOLDS.
   */
  warning_margin_24h?: number;
  warning_margin_7d?: number;
  serious_24h?: number;
  serious_7d?: number;
}

/** The W6 defaults: warning within 1 h (24 h) / 3 h (7 days); serious below 4 h / 50 h. */
export const DEFAULT_THRESHOLDS = {
  warning_margin_24h: 1,
  warning_margin_7d: 3,
  serious_24h: 4,
  serious_7d: 50,
} as const;

export const DEFAULT_RULE_SET: RuleSet = {
  name: 'MLC/STCW Default',
  min_rest_per_24h: 10,
  min_rest_per_7d: 77,
  max_rest_periods_per_24h: 2,
  min_long_rest_block: 6,
  max_interval_between_rest: 14,
  ...DEFAULT_THRESHOLDS,
};

/**
 * Month statuses. The engine (20261124060700, lib/horMonth.ts) writes draft,
 * submitted, hod_signed, approved, locked and reopened; crew_signed,
 * hod_reviewed and captain_reviewed are legacy rows and read as submitted,
 * hod_signed and approved.
 */
export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'crew_signed'
  | 'hod_reviewed'
  | 'hod_signed'
  | 'captain_reviewed'
  | 'approved'
  | 'locked'
  | 'reopened';

/** Whether a head-of-department signature comes before approval (D-X1-11, T-148). */
export type HodStep = 'off' | 'nudge' | 'required';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type NCStatus =
  | 'open'
  | 'reviewed'
  | 'justified'
  | 'corrected'
  | 'accepted_by_captain'
  | 'dismissed';

/** A breach review decision (X1-08's work_rest_review_breach writes it). */
export type NCReviewOutcome = 'accepted' | 'correction_requested' | 'dismissed';

export type RuleCode =
  | 'REST_24H_MIN'
  | 'REST_7D_MIN'
  | 'REST_PERIODS_MAX'
  | 'REST_LONG_BLOCK_MIN'
  | 'REST_INTERVAL_MAX';

export interface NonConformity {
  id?: string;
  crew_id: string;
  submission_id?: string;
  rule_code: RuleCode;
  rule_description: string;
  severity: Severity;
  window_start: string; // ISO timestamp
  window_end: string;
  measured_value: number;
  threshold_value: number;
  suggested_correction?: string;
  status?: NCStatus;
  justification?: string;
  /** The local day the breach belongs to (the day its window ends in). */
  breach_day?: string;
  /** Below the serious threshold (< 4 h in 24 h, < 50 h in 7 days by default). */
  is_serious?: boolean;
  /** Hours short of the threshold (24 h, 7 days, longest rest); null for counts and intervals. */
  deficit_hours?: number | null;
}

export interface ComplianceWindow {
  check_window: 'rolling_24h' | 'rolling_7d' | 'daily';
  window_start: string;
  window_end: string;
  rest_minutes: number;
  work_minutes: number;
  passes: boolean;
  threshold_minutes?: number;
}

export interface DaySummary {
  date: string;
  work_minutes: number;
  rest_minutes: number;
  rest_period_count: number;
  longest_rest_minutes: number;
  /** No breach belongs to the day. */
  is_compliant: boolean;
  /** A non-conformity belongs to the day (its window ends that day). */
  breach: boolean;
  /** No breach, but rest within the warning margin of the 24 h or 7-day threshold. */
  warning: boolean;
  /** Least rest in any fully recorded 24 h window ending that day; null when none is. */
  min_rest_24h_minutes: number | null;
  /** Least rest in any fully recorded 7-day window ending that day; null when none is. */
  min_rest_7d_minutes: number | null;
}

export interface ComplianceResult {
  is_compliant: boolean;
  daily_summary: DaySummary[];
  rolling_24h: ComplianceWindow[];
  rolling_7d: ComplianceWindow[];
  non_conformities: NonConformity[];
  totals: {
    work_minutes: number;
    rest_minutes: number;
  };
}

export interface CrewProfileLite {
  user_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  rank?: string | null;
  department?: string | null;
  hod_user_id?: string | null;
  vessel_id?: string | null;
  employment_status?: string | null;
  watch_pattern?: string | null;
  joining_date?: string | null;
  leaving_date?: string | null;
}
