// IDEA Integration Types (Read-Only)

export interface IdeaDefect {
  id: string;
  equipmentId: string;
  equipmentName: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  status: 'open' | 'in_progress' | 'pending_parts' | 'closed';
  reportedDate: Date;
  dueDate?: Date;
  assignedTo?: string;
  category?: string;
}

export interface IdeaEquipment {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber?: string;
  ismCritical: boolean;
  lastServiceDate?: Date;
  nextServiceDue?: Date;
  runningHours?: number;
  location?: string;
}

export interface IdeaMaintenanceTask {
  id: string;
  equipmentId: string;
  taskName: string;
  taskType: 'scheduled' | 'breakdown' | 'condition_based';
  intervalHours?: number;
  intervalDays?: number;
  lastCompleted?: Date;
  nextDue?: Date;
  status: 'pending' | 'overdue' | 'completed';
}

export interface IdeaSyncConfig {
  baseUrl: string;
  apiKey: string;
  vesselId: string;
  pollIntervalMinutes?: number;
}

export interface IdeaSyncResult {
  success: boolean;
  defectsSynced: number;
  equipmentSynced: number;
  tasksSynced: number;
  lastSyncAt: Date;
  errors?: string[];
}

// Mapping functions for IDEA API responses
export function mapIdeaSeverity(priority: string | number): IdeaDefect['severity'] {
  const priorityStr = String(priority).toLowerCase();
  if (priorityStr === '1' || priorityStr === 'critical' || priorityStr === 'high') {
    return 'critical';
  }
  if (priorityStr === '2' || priorityStr === 'major' || priorityStr === 'medium') {
    return 'major';
  }
  return 'minor';
}

export function mapIdeaStatus(status: string): IdeaDefect['status'] {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('closed') || statusLower.includes('complete')) {
    return 'closed';
  }
  if (statusLower.includes('progress') || statusLower.includes('work')) {
    return 'in_progress';
  }
  if (statusLower.includes('parts') || statusLower.includes('pending')) {
    return 'pending_parts';
  }
  return 'open';
}
