import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { GanttChart } from 'lucide-react';

const FleetTimelinePage: React.FC = () => {
  return (
    <DashboardLayout>
      <PlaceholderPage
        title="Fleet Timeline"
        description="Horizontal Gantt-style timeline view of the fleet itinerary — vessels as rows, time as the horizontal axis."
        icon={<GanttChart className="w-8 h-8 text-primary" />}
        features={[
          'Vessels as rows with horizontal trip bars',
          'Drag bars to move dates, resize to extend/shorten',
          'Drag between vessel rows to reassign',
          'Zoom from day-level to year-level',
          'Same filtering as the Grid view',
          'Today line indicator',
        ]}
        expectedRelease="Phase 2"
      />
    </DashboardLayout>
  );
};

export default FleetTimelinePage;
