import React from 'react';
import { History } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const EmploymentHistoryPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={History} title="Employment History" />
    <PlaceholderPage title="Employment History" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default EmploymentHistoryPage;
