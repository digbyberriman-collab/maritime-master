// Alert Engine Rules Configuration
// Based on STORM Platform Alert Specification v3.2

export type AlertSeverity = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'SNOOZED' | 'RESOLVED' | 'ESCALATED' | 'AUTO_DISMISSED';

export interface AlertTrigger {
  type: string;
  condition: string;
}

export interface EscalationConfig {
  if_not_acknowledged_minutes?: number;
  if_not_acknowledged_hours?: number;
  escalate_to: string[];
  notify_method: ('in_app' | 'email' | 'sms')[];
}

export interface SnoozeConfig {
  allowed: boolean;
  max_duration_hours: number;
  max_snoozes: number;
  requires_reason: boolean;
}

export interface AlertRule {
  triggers: AlertTrigger[];
  escalation: EscalationConfig | null;
  snooze: SnoozeConfig;
  auto_dismiss_hours?: number;
}

export const ALERT_RULES: Record<AlertSeverity, AlertRule> = {
  RED: {
    triggers: [
      { type: 'incident', condition: 'severity >= HIGH' },
      { type: 'medical_report', condition: 'any' },
      { type: 'defect', condition: 'ism_critical === true && status === OPEN' },
      { type: 'safe_manning', condition: 'crew_count < minimum_required' },
      { type: 'certificate', condition: 'is_expired && is_mandatory' },
      { type: 'non_compliance', condition: 'type === PRE_DEPARTURE_MISSED' },
      { type: 'hours_of_rest', condition: 'violation_count >= 3 in 7 days' }
    ],
    escalation: {
      if_not_acknowledged_minutes: 30,
      escalate_to: ['DPA', 'CAPTAIN', 'FLEET_MASTER'],
      notify_method: ['in_app', 'email', 'sms']
    },
    snooze: {
      allowed: true,
      max_duration_hours: 4,
      max_snoozes: 2,
      requires_reason: true
    }
  },
  ORANGE: {
    triggers: [
      { type: 'capa', condition: 'status === OPEN && days_overdue > 0' },
      { type: 'corrective_action', condition: 'due_date < today' },
      { type: 'training', condition: 'required && overdue' },
      { type: 'drill_participation', condition: 'crew_missed_required_drill' },
      { type: 'certificate', condition: 'expires_within_days <= 30 && is_mandatory' }
    ],
    escalation: {
      if_not_acknowledged_hours: 24,
      escalate_to: ['DPA'],
      notify_method: ['in_app', 'email']
    },
    snooze: {
      allowed: true,
      max_duration_hours: 48,
      max_snoozes: 3,
      requires_reason: false
    }
  },
  YELLOW: {
    triggers: [
      { type: 'certificate', condition: 'expires_within_days <= 90' },
      { type: 'meeting_minutes', condition: 'status === INCOMPLETE' },
      { type: 'audit', condition: 'scheduled_within_days <= 30' },
      { type: 'survey', condition: 'window_opens_within_days <= 60' },
      { type: 'drill', condition: 'next_due_within_days <= 14' }
    ],
    escalation: null,
    snooze: {
      allowed: true,
      max_duration_hours: 168, // 7 days
      max_snoozes: 5,
      requires_reason: false
    }
  },
  GREEN: {
    triggers: [
      { type: 'submission', condition: 'status === COMPLETED' },
      { type: 'certificate', condition: 'status === APPROVED' },
      { type: 'capa', condition: 'status === CLOSED' },
      { type: 'drill', condition: 'completed_today' },
      { type: 'reminder', condition: 'acknowledged' }
    ],
    escalation: null,
    snooze: {
      allowed: false,
      max_duration_hours: 0,
      max_snoozes: 0,
      requires_reason: false
    },
    auto_dismiss_hours: 72
  }
};

// Alert type labels for UI
export const ALERT_TYPE_LABELS: Record<string, string> = {
  incident: 'Incident',
  medical_report: 'Medical Emergency',
  defect: 'ISM Critical Defect',
  safe_manning: 'Safe Manning Breach',
  certificate: 'Certificate',
  non_compliance: 'Non-Compliance',
  hours_of_rest: 'Hours of Rest Violation',
  capa: 'CAPA Overdue',
  corrective_action: 'Corrective Action Overdue',
  training: 'Training Overdue',
  drill_participation: 'Drill Participation',
  meeting_minutes: 'Meeting Minutes',
  audit: 'Upcoming Audit',
  survey: 'Upcoming Survey',
  drill: 'Drill Due',
  submission: 'Submission Complete',
  reminder: 'Reminder'
};

// Severity color mappings for UI
export const SEVERITY_COLORS: Record<AlertSeverity, { bg: string; text: string; border: string; badge: string }> = {
  RED: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive',
    badge: 'bg-destructive text-destructive-foreground'
  },
  ORANGE: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning',
    badge: 'bg-warning text-warning-foreground'
  },
  YELLOW: {
    bg: 'bg-accent/20',
    text: 'text-accent-foreground',
    border: 'border-accent',
    badge: 'bg-accent text-accent-foreground'
  },
  GREEN: {
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success',
    badge: 'bg-success text-success-foreground'
  }
};

// Status labels for UI
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  SNOOZED: 'Snoozed',
  RESOLVED: 'Resolved',
  ESCALATED: 'Escalated',
  AUTO_DISMISSED: 'Auto-Dismissed'
};
