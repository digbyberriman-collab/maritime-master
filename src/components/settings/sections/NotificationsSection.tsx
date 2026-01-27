import React from 'react';
import { Bell, Mail, Smartphone, AlertCircle, Calendar, FileText, Anchor } from 'lucide-react';
import { SectionHeader, SettingsCard, Toggle } from '@/components/settings/common';
import { Separator } from '@/components/ui/separator';

const NotificationsSection: React.FC = () => {
  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Notifications"
        description="Configure how you receive notifications"
        icon={Bell}
      />

      {/* Notification Channels */}
      <SettingsCard
        title="Notification Channels"
        description="Choose how you want to receive notifications"
      >
        <div className="space-y-1">
          <Toggle
            id="email-notifications"
            label="Email Notifications"
            description="Receive updates via email"
            icon={Mail}
            defaultChecked
          />
          <Separator />
          <Toggle
            id="push-notifications"
            label="Push Notifications"
            description="Browser and mobile notifications"
            icon={Bell}
            defaultChecked
          />
          <Separator />
          <Toggle
            id="sms-notifications"
            label="SMS Notifications"
            description="Critical alerts via SMS"
            icon={Smartphone}
          />
        </div>
      </SettingsCard>

      {/* Notification Types */}
      <SettingsCard
        title="Notification Types"
        description="Select which notifications you want to receive"
      >
        <div className="space-y-1">
          <Toggle
            id="critical-alerts"
            label="Critical Alerts"
            description="Safety and compliance critical alerts"
            icon={AlertCircle}
            defaultChecked
            disabled
          />
          <Separator />
          <Toggle
            id="upcoming-deadlines"
            label="Upcoming Deadlines"
            description="Certificate and task due date reminders"
            icon={Calendar}
            defaultChecked
          />
          <Separator />
          <Toggle
            id="document-updates"
            label="Document Updates"
            description="New documents requiring acknowledgment"
            icon={FileText}
            defaultChecked
          />
          <Separator />
          <Toggle
            id="vessel-updates"
            label="Vessel Updates"
            description="Status changes and crew updates"
            icon={Anchor}
            defaultChecked
          />
        </div>
      </SettingsCard>
    </div>
  );
};

export default NotificationsSection;
