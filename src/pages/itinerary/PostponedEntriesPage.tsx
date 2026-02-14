import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { PauseCircle } from 'lucide-react';

const PostponedEntriesPage: React.FC = () => {
  return (
    <DashboardLayout>
      <PlaceholderPage
        title="Postponed Entries"
        description="All postponed itinerary entries collected in one place. Drag back onto the planning grid to reinstate."
        icon={<PauseCircle className="w-8 h-8 text-primary" />}
        features={[
          'Compact list of postponed entries',
          'Retain all data for reinstatement',
          'Change status back to Draft/Tentative',
          'Drag back onto the Fleet Planning Grid',
        ]}
        expectedRelease="Phase 2"
      />
    </DashboardLayout>
  );
};

export default PostponedEntriesPage;
