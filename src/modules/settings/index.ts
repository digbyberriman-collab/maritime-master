// Settings module public API

// Pages
export { default as SettingsPage } from './pages/Settings';
export { default as BrandingSettingsPage } from './pages/BrandingSettings';
export { default as RolesPermissionsPage } from './pages/RolesPermissionsPage';

// Common components
export {
  SectionHeader,
  SettingsCard,
  FormField,
  Toggle,
  useSettingsToast,
} from './components/common';

// Section components
export {
  ProfileSection,
  SecuritySection,
  NotificationsSection,
  AppearanceSection,
  DataExportsSection,
  SupportSection,
  PlaceholderSection,
  IntegrationsSection,
  VesselAccessSection,
  PermissionsSection,
  AuditModeSection,
  DataRetentionSection,
  InsuranceAuditModeSection,
  HRAuditAccessSection,
  GDPRRequestsSection,
} from './components/sections';
