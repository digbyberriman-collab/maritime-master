import React from 'react';
import { UserRound } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const PersonalDetailsPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={UserRound} title="Personal Details" />
    <PlaceholderPage title="Personal Details" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default PersonalDetailsPage;
