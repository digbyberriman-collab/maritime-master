import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const ReviewsPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={ClipboardCheck} title="Performance Reviews" />
    <PlaceholderPage title="Performance Reviews" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default ReviewsPage;
