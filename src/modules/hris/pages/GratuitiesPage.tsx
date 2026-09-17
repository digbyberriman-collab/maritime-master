import React from 'react';
import { Coins } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const GratuitiesPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={Coins} title="Gratuities" />
    <PlaceholderPage title="Gratuities" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default GratuitiesPage;
