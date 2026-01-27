import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getVisibleNavItems, canAccessSection, SETTINGS_NAV_ITEMS } from '@/utils/settingsPermissions';
import { Ship, Lock, Eye, Plug, Mail, FileCheck, CreditCard, ScrollText } from 'lucide-react';
import SettingsHeader from '@/components/settings/SettingsHeader';
import SettingsSidebar from '@/components/settings/SettingsSidebar';
import SettingsMobileNav from '@/components/settings/SettingsMobileNav';
import {
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
} from '@/components/settings/sections';

const Settings: React.FC = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState('profile');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userRole = profile?.role || null;
  const navItems = getVisibleNavItems(userRole);

  // Validate section access when active section changes
  useEffect(() => {
    if (!canAccessSection(userRole, activeSection)) {
      setActiveSection('profile');
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access that section.',
        variant: 'destructive',
      });
    }
  }, [activeSection, userRole, toast]);

  const handleSectionChange = (sectionId: string) => {
    if (canAccessSection(userRole, sectionId)) {
      setActiveSection(sectionId);
    } else {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access this section.',
        variant: 'destructive',
      });
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfileSection />;
      case 'security':
        return <SecuritySection />;
      case 'notifications':
        return <NotificationsSection />;
      case 'appearance':
        return <AppearanceSection />;
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
      case 'integrations':
        return <IntegrationsSection />;
      case 'templates':
        return <EmailTemplatesSection />;
      case 'compliance':
        return <ComplianceSection />;
      case 'billing':
        return (
          <PlaceholderSection 
            title="Billing" 
            description="Manage billing information and subscription"
            icon={CreditCard}
          />
        );
      case 'logs':
        return <SystemLogsSection />;
      default:
        return <ProfileSection />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <SettingsHeader />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <SettingsSidebar 
          navItems={navItems}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
            {renderSection()}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <SettingsMobileNav 
        navItems={navItems}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />
    </div>
  );
};

export default Settings;
