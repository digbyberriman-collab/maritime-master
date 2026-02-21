// Equipment Criticality Levels
export const EQUIPMENT_CRITICALITY = [
  { value: 'Critical', label: 'Critical', color: 'bg-critical-muted text-critical', description: 'Failure stops operations' },
  { value: 'Important', label: 'Important', color: 'bg-warning-muted text-warning', description: 'Significant impact on operations' },
  { value: 'Non_Critical', label: 'Non-Critical', color: 'bg-muted text-muted-foreground', description: 'Minor impact' },
] as const;

// Equipment Status
export const EQUIPMENT_STATUS = [
  { value: 'Operational', label: 'Operational', color: 'bg-success-muted text-success' },
  { value: 'Defective', label: 'Defective', color: 'bg-critical-muted text-critical' },
  { value: 'Under_Repair', label: 'Under Repair', color: 'bg-warning-muted text-warning' },
  { value: 'Decommissioned', label: 'Decommissioned', color: 'bg-muted text-muted-foreground' },
] as const;

// Maintenance Task Types
export const TASK_TYPES = [
  { value: 'Inspection', label: 'Inspection', color: 'bg-info-muted text-info' },
  { value: 'Service', label: 'Service', color: 'bg-success-muted text-success' },
  { value: 'Overhaul', label: 'Overhaul', color: 'bg-purple-muted text-purple' },
  { value: 'Calibration', label: 'Calibration', color: 'bg-teal-muted text-teal' },
  { value: 'Replacement', label: 'Replacement', color: 'bg-warning-muted text-warning' },
  { value: 'Repair', label: 'Repair', color: 'bg-orange-muted text-orange' },
] as const;

// Maintenance Task Status
export const TASK_STATUS = [
  { value: 'Pending', label: 'Pending', color: 'bg-muted text-muted-foreground' },
  { value: 'Scheduled', label: 'Scheduled', color: 'bg-info-muted text-info' },
  { value: 'In_Progress', label: 'In Progress', color: 'bg-warning-muted text-warning' },
  { value: 'Completed', label: 'Completed', color: 'bg-success-muted text-success' },
  { value: 'Overdue', label: 'Overdue', color: 'bg-critical-muted text-critical' },
  { value: 'Cancelled', label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
] as const;

// Task Priority
export const TASK_PRIORITY = [
  { value: 'Low', label: 'Low', color: 'bg-muted text-muted-foreground' },
  { value: 'Normal', label: 'Normal', color: 'bg-info-muted text-info' },
  { value: 'High', label: 'High', color: 'bg-warning-muted text-warning' },
  { value: 'Urgent', label: 'Urgent', color: 'bg-critical-muted text-critical' },
] as const;

// Interval Types
export const INTERVAL_TYPES = [
  { value: 'Hours', label: 'Running Hours' },
  { value: 'Days', label: 'Days' },
  { value: 'Months', label: 'Months' },
  { value: 'Annual', label: 'Annual' },
  { value: 'Condition_Based', label: 'Condition Based' },
] as const;

// Defect Priority
export const DEFECT_PRIORITY = [
  { value: 'P1_Critical', label: 'P1 - Critical', color: 'bg-critical-muted text-critical', description: 'Immediate action required' },
  { value: 'P2_Serious', label: 'P2 - Serious', color: 'bg-orange-muted text-orange', description: 'Urgent attention needed' },
  { value: 'P3_Normal', label: 'P3 - Normal', color: 'bg-warning-muted text-warning', description: 'Standard priority' },
  { value: 'P4_Minor', label: 'P4 - Minor', color: 'bg-muted text-muted-foreground', description: 'Low priority' },
] as const;

// Operational Impact
export const OPERATIONAL_IMPACT = [
  { value: 'No_Impact', label: 'No Impact', color: 'bg-success-muted text-success' },
  { value: 'Reduced_Capability', label: 'Reduced Capability', color: 'bg-warning-muted text-warning' },
  { value: 'Not_Operational', label: 'Not Operational', color: 'bg-critical-muted text-critical' },
] as const;

// Defect Status
export const DEFECT_STATUS = [
  { value: 'Open', label: 'Open', color: 'bg-critical-muted text-critical' },
  { value: 'In_Progress', label: 'In Progress', color: 'bg-warning-muted text-warning' },
  { value: 'Awaiting_Parts', label: 'Awaiting Parts', color: 'bg-info-muted text-info' },
  { value: 'Closed', label: 'Closed', color: 'bg-success-muted text-success' },
] as const;

// Responsible Roles
export const RESPONSIBLE_ROLES = [
  { value: 'Chief_Engineer', label: 'Chief Engineer' },
  { value: 'Second_Engineer', label: 'Second Engineer' },
  { value: 'Third_Engineer', label: 'Third Engineer' },
  { value: 'Electrical_Officer', label: 'Electrical Officer' },
  { value: 'Deck_Officer', label: 'Deck Officer' },
  { value: 'Bosun', label: 'Bosun' },
  { value: 'Master', label: 'Master' },
] as const;

// Helper functions
export const getCriticalityConfig = (criticality: string) => 
  EQUIPMENT_CRITICALITY.find(c => c.value === criticality);

export const getEquipmentStatusConfig = (status: string) => 
  EQUIPMENT_STATUS.find(s => s.value === status);

export const getTaskTypeConfig = (type: string) => 
  TASK_TYPES.find(t => t.value === type);

export const getTaskStatusConfig = (status: string) => 
  TASK_STATUS.find(s => s.value === status);

export const getPriorityConfig = (priority: string) => 
  TASK_PRIORITY.find(p => p.value === priority);

export const getDefectPriorityConfig = (priority: string) => 
  DEFECT_PRIORITY.find(p => p.value === priority);

export const getDefectStatusConfig = (status: string) => 
  DEFECT_STATUS.find(s => s.value === status);

export const getOperationalImpactConfig = (impact: string) => 
  OPERATIONAL_IMPACT.find(i => i.value === impact);

// Generate task number
export const generateTaskNumber = (year: number, sequence: number): string => {
  return `MAINT-${year}-${String(sequence).padStart(3, '0')}`;
};

// Generate defect number
export const generateDefectNumber = (year: number, sequence: number): string => {
  return `DEF-${year}-${String(sequence).padStart(3, '0')}`;
};

// Calculate next due date based on interval
export const calculateNextDueDate = (
  completionDate: Date,
  intervalType: string,
  intervalValue: number
): Date => {
  const nextDate = new Date(completionDate);
  
  switch (intervalType) {
    case 'Days':
      nextDate.setDate(nextDate.getDate() + intervalValue);
      break;
    case 'Months':
      nextDate.setMonth(nextDate.getMonth() + intervalValue);
      break;
    case 'Annual':
      nextDate.setFullYear(nextDate.getFullYear() + intervalValue);
      break;
    default:
      // For Hours and Condition_Based, don't calculate date
      break;
  }
  
  return nextDate;
};
