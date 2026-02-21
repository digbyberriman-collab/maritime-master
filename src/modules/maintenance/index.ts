// Components
export { default as AddEquipmentModal } from './components/AddEquipmentModal';
export { default as CreateTaskModal } from './components/CreateTaskModal';
export { default as DefectsTab } from './components/DefectsTab';
export { default as EquipmentDetailModal } from './components/EquipmentDetailModal';
export { default as EquipmentRegisterTab } from './components/EquipmentRegisterTab';
export { default as LogDefectModal } from './components/LogDefectModal';
export { default as MaintenanceScheduleTab } from './components/MaintenanceScheduleTab';
export { default as RunningHoursTab } from './components/RunningHoursTab';
export { default as SparePartsTab } from './components/SparePartsTab';
export { default as TaskTemplateModal } from './components/TaskTemplateModal';
export { default as TaskTemplatesTab } from './components/TaskTemplatesTab';

// Hooks
export { useMaintenance } from './hooks/useMaintenance';
export type { Equipment, EquipmentCategory, MaintenanceTask, Defect, SparePart, RunningHoursLog } from './hooks/useMaintenance';

// Pages
export { default as Maintenance } from './pages/Maintenance';
export { default as MaintenanceDefects } from './pages/MaintenanceDefects';
export { default as CriticalEquipment } from './pages/CriticalEquipment';
export { default as SpareParts } from './pages/SpareParts';

// Constants
export * from './constants';
