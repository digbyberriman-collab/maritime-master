import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { LayoutGrid } from 'lucide-react';

const FleetPlanningPage: React.FC = () => {
  return (
    <DashboardLayout>
      <PlaceholderPage
        title="Fleet Planning Grid"
        description="Multi-vessel itinerary planning grid — the digital replacement for the Working Plan spreadsheet."
        icon={<LayoutGrid className="w-8 h-8 text-primary" />}
        features={[
          'Vessels as columns, time as rows (Day/Week/Month)',
          'Drag-and-drop trip blocks between vessels and dates',
          'Inline entry creation and editing',
          'Multi-vessel entries with visual linking',
          'Status colour coding (Draft/Tentative/Confirmed)',
          'Crew change date indicators',
          'Postponed entries drawer',
        ]}
        expectedRelease="Phase 2"
      />
    </DashboardLayout>
  );
};

export default FleetPlanningPage;
