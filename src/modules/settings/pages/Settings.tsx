/**
 * One settings section, at its own URL inside the personal area (spec §8;
 * gap/01 "Personal area": the state-driven sections each get a URL). The
 * personal scope draws the shell around it: the breadcrumb, the personal
 * sidebar (which lists the sections) and the page title. This page renders
 * only the section body, in a reading-width column.
 *
 * The section comes from the route (`section` prop, else the `:section`
 * param). An unknown section opens the profile. Company settings sections
 * are gated by the user's role (`canAccessSection`): the role is read from
 * the profile, so while auth is loading, or the profile has not arrived yet
 * (within PROFILE_GRACE_MS, D-54), the page shows a loading state and only
 * then decides. A deep link to `/me/permissions` for an admin whose profile
 * loads late lands on Permissions; anyone else is told and sent to their
 * profile (fail closed, never a false denial).
 */
import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { CreditCard, FileCheck, Mail, ScrollText } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { canAccessSection, isAdminSection, isSettingsSection } from '@/shared/utils/settingsPermissions';
import { useRolePending } from '@/shared/hooks/useRolePending';
import { PERSONAL_HOME } from '@/config/personalNav';
import { PageLoading } from '@/shared/components/states';
import { notify } from '@/shared/lib/notify';
import { useCurrentPageNavigation } from '@/shared/components/layout/useActiveNavModule';
import {
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
  ShortcutsSection,
  SidebarLayoutSection,
} from '@/modules/settings/components/sections';

export interface SettingsProps {
  /** The section to show (`profile`, `security`, `permissions`, …). Defaults to the `:section` route param. */
  section?: string;
}

const DENIED_TOAST_ID = 'settings-section-denied';

/** The section's body. */
function renderSection(section: string): React.ReactNode {
  switch (section) {
    case 'profile':
      return <ProfileSection />;
    case 'security':
      return <SecuritySection />;
    case 'notifications':
      return <NotificationsSection />;
    case 'appearance':
      return <AppearanceSection />;
    case 'shortcuts':
      return <ShortcutsSection />;
    case 'sidebar-layout':
      return <SidebarLayoutSection />;
    case 'data-exports':
      return <DataExportsSection />;
    case 'support':
      return <SupportSection />;
    case 'vessel-access':
      return <VesselAccessSection />;
    case 'permissions':
      return <PermissionsSection />;
    case 'audit-mode':
      return <AuditModeSection />;
    case 'data-retention':
      return <DataRetentionSection />;
    case 'gdpr-requests':
      return <GDPRRequestsSection />;
    case 'insurance-audit':
      return <InsuranceAuditModeSection />;
    case 'hr-audit-access':
      return <HRAuditAccessSection />;
    case 'integrations':
      return <IntegrationsSection />;
    // Not built yet: the personal scope routes these to Coming Soon; shown
    // honestly here if a section prop names one.
    case 'templates':
      return <PlaceholderSection title="Email Templates" description="Editable notification templates are not built yet" icon={Mail} />;
    case 'compliance':
      return <PlaceholderSection title="Compliance Settings" description="Company-wide compliance settings are not built yet" icon={FileCheck} />;
    case 'billing':
      return <PlaceholderSection title="Billing" description="Billing and subscription settings are not built yet" icon={CreditCard} />;
    case 'logs':
      return <PlaceholderSection title="System Logs" description="A log viewer over audit_logs is not built yet" icon={ScrollText} />;
    default:
      return null;
  }
}

/** Says why, then opens the profile. */
const DeniedRedirect: React.FC = () => {
  React.useEffect(() => {
    notify.warning('You do not have access to that settings section', {
      id: DENIED_TOAST_ID,
      description: 'Ask your account admin if you need it.',
    });
  }, []);
  return <Navigate to={PERSONAL_HOME} replace />;
};

const Settings: React.FC<SettingsProps> = ({ section: sectionProp }) => {
  const params = useParams<{ section?: string }>();
  const section = sectionProp ?? params.section ?? 'profile';
  const { profile } = useAuth();
  const rolePending = useRolePending();
  const { title } = useCurrentPageNavigation();

  if (!isSettingsSection(section)) return <Navigate to={PERSONAL_HOME} replace />;
  if (isAdminSection(section)) {
    if (rolePending) return <PageLoading variant="detail" label="Checking your access…" />;
    if (!canAccessSection(profile?.role ?? null, section)) return <DeniedRedirect />;
  }

  return (
    <div className="w-full max-w-4xl" data-settings-section={section}>
      {/* The page's h1 (heading contract): the nav title, as the breadcrumb
          ends; the section's own header below carries the visible title. */}
      <h1 className="sr-only">{title}</h1>
      {renderSection(section)}
    </div>
  );
};

export default Settings;
