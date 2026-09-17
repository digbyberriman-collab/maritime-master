import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const RightToWorkPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={ShieldCheck} title="Compliance & Right to Work" />
    <PlaceholderPage title="Compliance & Right to Work" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default RightToWorkPage;
