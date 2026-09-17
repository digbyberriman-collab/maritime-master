import React from 'react';
import { Settings } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const CompensationSettingsPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={Settings} title="Compensation Settings" />
    <PlaceholderPage title="Compensation Settings" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default CompensationSettingsPage;
