import React from 'react';
import { Receipt } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const PayrollPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={Receipt} title="Payroll" />
    <PlaceholderPage title="Payroll" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default PayrollPage;
