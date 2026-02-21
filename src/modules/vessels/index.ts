// Contexts
export { VesselProvider, useVessel } from './contexts/VesselContext';

// Hooks
export { useVessels, useVesselCount } from './hooks/useVessels';
export type { Vessel, VesselFormData } from './hooks/useVessels';
export { useVesselDashboard, useVesselQuickStats } from './hooks/useVesselDashboard';
export type { VesselDashboardData } from './hooks/useVesselDashboard';
export { useVesselFilter } from './hooks/useVesselFilter';

// Components
export { default as VesselFormModal } from './components/VesselFormModal';
export { default as DeleteVesselDialog } from './components/DeleteVesselDialog';
export { default as VesselSelector } from './components/VesselSelector';
export { default as VesselContextBanner } from './components/VesselContextBanner';

// Pages
export { default as Vessels } from './pages/Vessels';
export { default as VesselDashboard } from './pages/VesselDashboard';
