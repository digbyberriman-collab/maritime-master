// Settings module public API

// Pages
export { default as SettingsPage } from './pages/Settings';
export { default as BrandingSettingsPage } from './pages/BrandingSettings';
export { default as PermissionsPage } from './pages/PermissionsPage';
export { default as RolesPermissionsPage } from './pages/RolesPermissionsPage';

// Components
export { default as SettingsHeader } from './components/SettingsHeader';
export { default as SettingsSidebar } from './components/SettingsSidebar';
export { default as SettingsMobileNav } from './components/SettingsMobileNav';

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
  EmailTemplatesSection,
  ComplianceSection,
  SystemLogsSection,
  VesselAccessSection,
  PermissionsSection,
  AuditModeSection,
  DataRetentionSection,
  InsuranceAuditModeSection,
  HRAuditAccessSection,
  GDPRRequestsSection,
} from './components/sections';
