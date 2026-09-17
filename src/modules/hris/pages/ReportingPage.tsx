import React from 'react';
import { BarChart3 } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const ReportingPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={BarChart3} title="Reporting & Analytics" />
    <PlaceholderPage title="Reporting & Analytics" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default ReportingPage;
