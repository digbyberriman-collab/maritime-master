import React from 'react';
import { UserPlus } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const OnboardingPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={UserPlus} title="Onboarding" />
    <PlaceholderPage title="Onboarding" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default OnboardingPage;
