// Domain types for the Hours of Work and Rest module.
// All times are minutes-from-local-midnight on a given record_date,
// in the [0, 1440] range (1440 = end of day).

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
}

export const DEFAULT_RULE_SET: RuleSet = {
  name: 'MLC/STCW Default',
  min_rest_per_24h: 10,
  min_rest_per_7d: 77,
  max_rest_periods_per_24h: 2,
  min_long_rest_block: 6,
  max_interval_between_rest: 14,
};

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'crew_signed'
  | 'hod_reviewed'
  | 'hod_signed'
  | 'captain_reviewed'
  | 'locked'
  | 'reopened';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type NCStatus =
  | 'open'
  | 'reviewed'
  | 'justified'
  | 'corrected'
  | 'accepted_by_captain'
  | 'dismissed';

export interface NonConformity {
  id?: string;
  crew_id: string;
  submission_id?: string;
  rule_code:
    | 'REST_24H_MIN'
    | 'REST_7D_MIN'
    | 'REST_PERIODS_MAX'
    | 'REST_LONG_BLOCK_MIN'
    | 'REST_INTERVAL_MAX';
  rule_description: string;
  severity: Severity;
  window_start: string; // ISO timestamp
  window_end: string;
  measured_value: number;
  threshold_value: number;
  suggested_correction?: string;
  status?: NCStatus;
  justification?: string;
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

export interface ComplianceResult {
  is_compliant: boolean;
  daily_summary: Array<{
    date: string;
    work_minutes: number;
    rest_minutes: number;
    rest_period_count: number;
    longest_rest_minutes: number;
    is_compliant: boolean;
  }>;
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
