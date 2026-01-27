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
        return (
          <PlaceholderSection 
            title="Vessel Access" 
            description="Manage vessel access permissions and configurations"
            icon={Ship}
          />
        );
      case 'permissions':
        return (
          <PlaceholderSection 
            title="Permissions" 
            description="Configure role-based access control settings"
            icon={Lock}
          />
        );
      case 'audit-mode':
        return (
          <PlaceholderSection 
            title="Audit Visibility" 
            description="Configure audit mode visibility rules"
            icon={Eye}
          />
        );
      case 'integrations':
        return (
          <PlaceholderSection 
            title="Integrations" 
            description="Manage third-party integrations and API connections"
            icon={Plug}
          />
        );
      case 'templates':
        return (
          <PlaceholderSection 
            title="Email Templates" 
            description="Customize email templates for notifications"
            icon={Mail}
          />
        );
      case 'compliance':
        return (
          <PlaceholderSection 
            title="Compliance" 
            description="Manage compliance settings and regulatory requirements"
            icon={FileCheck}
          />
        );
      case 'billing':
        return (
          <PlaceholderSection 
            title="Billing" 
            description="Manage billing information and subscription"
            icon={CreditCard}
          />
        );
      case 'logs':
        return (
          <PlaceholderSection 
            title="System Logs" 
            description="View system activity and audit logs"
            icon={ScrollText}
          />
        );
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
