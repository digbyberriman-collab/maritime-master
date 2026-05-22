// Crew Module - Public API

// Hooks
export { useCrew, useCrewCount, useRecentCrewChanges, useCrewMember } from './hooks/useCrew';
export type { CrewMember, CrewAssignment, AddCrewMemberData, UpdateCrewMemberData, TransferCrewData } from './hooks/useCrew';

export { useCrewAttachments, formatFileSize, ATTACHMENT_TYPES } from './hooks/useCrewAttachments';
export type { CrewAttachment, AttachmentFormData } from './hooks/useCrewAttachments';

export { useCrewLeave } from './hooks/useCrewLeave';
export { useLeavePolicy } from './hooks/useLeavePolicy';

export {
  calculateLeaveBreakdown,
  calculateAccruedDays,
  resolveAccrualAnchor,
  findNextLeaveBlock,
  overlapsAny,
  DEFAULT_LEAVE_POLICY,
} from './services/leaveCalculator';
export type {
  LeavePolicy,
  AccrualMethod,
  RoundingMethod,
  AccrualBreakdown,
  CrewProfileLite,
  LeaveEntryLite,
  LeaveRequestLite,
} from './services/leaveCalculator';

export { logLeaveAudit } from './services/leaveAudit';
export type { LeaveAuditEntry, LeaveAction, LeaveEntityType } from './services/leaveAudit';

export { useCrewTasks } from './hooks/useCrewTasks';
export type { CrewTask, CreateTaskInput, TaskType, TaskPriority, TaskStatus } from './hooks/useCrewTasks';

export { useCrewImportLookups } from './hooks/useCrewImportLookups';

// Constants
export { RANKS, NATIONALITIES, CREW_ROLES } from './constants';
export type { Rank, Nationality } from './constants';

export {
  LEAVE_STATUS_CODES,
  STATUS_CODE_MAP,
  LEAVE_DEPARTMENTS,
  CREW_SEED_DATA,
} from './leaveConstants';
export type {
  LeaveStatusCode,
  LeaveDepartment,
  CrewLeaveEntry,
  CrewLeaveCarryover,
  CrewLeaveLockedMonth,
  CrewLeaveRequest,
  CrewMemberLeave,
} from './leaveConstants';

// Components — kept for cross-module reuse
export { default as AdminPinModal } from './components/AdminPinModal';
export { AssignTaskModal } from './components/AssignTaskModal';
export { CrewAttachments } from './components/CrewAttachments';
export { CrewAuditLog } from './components/CrewAuditLog';
export { default as CrewCertificates } from './components/CrewCertificates';
export { default as CrewFormModal } from './components/CrewFormModal';
export { default as ImportCrewCSVModal } from './components/ImportCrewCSVModal';

// New Crew List module (replaces the legacy CrewRoster modal stack)
export { useCrewWithComputedStatus, computeCrewStatus } from './hooks/useCrewWithComputedStatus';
export type { CrewMemberWithStatus, CrewStatusFlags, CertStatus, MedicalStatus } from './hooks/useCrewWithComputedStatus';
