import React from 'react';
import { Target } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const ObjectivesPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={Target} title="Objectives & PDPs" />
    <PlaceholderPage title="Objectives & PDPs" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default ObjectivesPage;
