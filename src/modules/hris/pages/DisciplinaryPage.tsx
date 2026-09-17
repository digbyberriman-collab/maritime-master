import React from 'react';
import { Gavel } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const DisciplinaryPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={Gavel} title="Disciplinary Matters" />
    <PlaceholderPage title="Disciplinary Matters" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default DisciplinaryPage;
