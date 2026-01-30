// Red Room Types for Urgent Actions Panel

export type AlertSeverity = 'red' | 'orange' | 'yellow' | 'green';
export type AlertStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
export type AssignmentPriority = 'normal' | 'high' | 'urgent';
export type SourceType = 'urgent' | 'assigned';

export interface RedRoomItem {
  id: string;
  title: string;
  description?: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source_module: string | null;
  due_at?: string;
  vessel_id: string;
  vessel_name: string;
  
  // Related record navigation
  incident_id?: string;
  related_entity_type?: string;  // 'incident', 'form', 'certificate', 'maintenance', etc.
  related_entity_id?: string;
  
  // Assignment info
  is_direct_assignment: boolean;
  assigned_by_name?: string;
  assigned_at?: string;
  assignment_notes?: string;
  assignment_priority?: AssignmentPriority;
  
  // Snooze info
  snooze_count: number;
  snoozed_until?: string;
  
  // Timestamps
  created_at: string;
  
  // Computed
  is_overdue: boolean;
  is_snoozed: boolean;
  source_type: SourceType;
}

export interface SnoozeOption {
  hours: number;
  label: string;
}

export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { hours: 1, label: '1 hour' },
  { hours: 4, label: '4 hours' },
  { hours: 8, label: '8 hours' },
  { hours: 24, label: '24 hours' },
];

export const PRIORITY_OPTIONS: { value: AssignmentPriority; label: string; description: string }[] = [
  { value: 'urgent', label: 'Urgent', description: 'Appears in Red Room immediately' },
  { value: 'high', label: 'High', description: 'Highlighted in task list' },
  { value: 'normal', label: 'Normal', description: 'Standard priority' },
];

export interface AssignTaskPayload {
  alertId: string;
  assignToUserId?: string;
  assignToRole?: string;
  notes?: string;
  priority: AssignmentPriority;
}

// Available roles for assignment
export const ASSIGNABLE_ROLES = [
  'Captain',
  'Chief Officer',
  'Chief Engineer',
  'Chief Stewardess',
  'Bosun',
  'Engineer',
  'Deckhand',
  'Stewardess',
  'Purser',
];
