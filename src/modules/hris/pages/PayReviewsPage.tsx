import React from 'react';
import { TrendingUp } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const PayReviewsPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={TrendingUp} title="Pay Reviews" />
    <PlaceholderPage title="Pay Reviews" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default PayReviewsPage;
