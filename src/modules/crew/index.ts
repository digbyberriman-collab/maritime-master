// Crew Module - Public API

// Hooks
export { useCrew, useCrewCount, useRecentCrewChanges, useCrewMember } from './hooks/useCrew';
export type { CrewMember, CrewAssignment, AddCrewMemberData, UpdateCrewMemberData, TransferCrewData } from './hooks/useCrew';

export { useCrewAttachments, formatFileSize, ATTACHMENT_TYPES } from './hooks/useCrewAttachments';
export type { CrewAttachment, AttachmentFormData } from './hooks/useCrewAttachments';

export { useCrewLeave } from './hooks/useCrewLeave';

export { useCrewTasks } from './hooks/useCrewTasks';
export type { CrewTask, CreateTaskInput, TaskType, TaskPriority, TaskStatus } from './hooks/useCrewTasks';

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

// Components
export { default as AdminPinModal } from './components/AdminPinModal';
export { AssignTaskModal } from './components/AssignTaskModal';
export { CrewAttachments } from './components/CrewAttachments';
export { CrewAuditLog } from './components/CrewAuditLog';
export { default as CrewCertificates } from './components/CrewCertificates';
export { default as CrewFormModal } from './components/CrewFormModal';
export { default as CrewProfileModal } from './components/CrewProfileModal';
export { default as EditCrewModal } from './components/EditCrewModal';
export { default as FullCrewEditModal } from './components/FullCrewEditModal';
export { default as ImportCrewCSVModal } from './components/ImportCrewCSVModal';
export { default as ReallocateVesselModal } from './components/ReallocateVesselModal';
export { default as ResetAccountModal } from './components/ResetAccountModal';
export { default as SignOffDialog } from './components/SignOffDialog';
export { default as ToggleAccessModal } from './components/ToggleAccessModal';
export { default as TransferCrewModal } from './components/TransferCrewModal';
