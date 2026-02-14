import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { Lightbulb } from 'lucide-react';

const TripSuggestionsPage: React.FC = () => {
  return (
    <DashboardLayout>
      <PlaceholderPage
        title="Trip Suggestions"
        description="Submit, browse, and vote on future trip destination ideas. Replaces the Location Ideas spreadsheet."
        icon={<Lightbulb className="w-8 h-8 text-primary" />}
        features={[
          'Suggestion submission form with activities and diving level',
          'Sortable/filterable suggestion list',
          'World heat map of suggestion clusters',
          'Upvoting system (one vote per user)',
          '"Plan This" to create a Draft itinerary entry from a suggestion',
          'Status tracking (New → Under Consideration → Planned → Declined)',
        ]}
        expectedRelease="Phase 2"
      />
    </DashboardLayout>
  );
};

export default TripSuggestionsPage;
