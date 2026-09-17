import React from 'react';
import { Banknote } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const SalariesPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={Banknote} title="Salaries & Compensation" />
    <PlaceholderPage title="Salaries & Compensation" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default SalariesPage;
