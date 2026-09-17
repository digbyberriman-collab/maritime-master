import React from 'react';
import { HeartHandshake } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const NextOfKinPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={HeartHandshake} title="Next of Kin / Emergency" />
    <PlaceholderPage title="Next of Kin / Emergency" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default NextOfKinPage;
