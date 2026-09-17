import React from 'react';
import { FileSignature } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const ContractsPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={FileSignature} title="Contracts & Employment" />
    <PlaceholderPage title="Contracts & Employment" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default ContractsPage;
