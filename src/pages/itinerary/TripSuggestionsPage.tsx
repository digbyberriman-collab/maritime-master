import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Lightbulb, List, Map } from 'lucide-react';
import SubmitSuggestionForm from '@/components/tripsuggestions/SubmitSuggestionForm';

const BrowsePlaceholder = () => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <List className="w-12 h-12 text-muted-foreground mb-4" />
    <h3 className="text-lg font-semibold text-foreground">Browse Suggestions</h3>
    <p className="text-sm text-muted-foreground mt-1 max-w-md">
      The full browsable, filterable, sortable list of all trip suggestions with voting will be built in Phase 2.
    </p>
  </div>
);

const HeatMapPlaceholder = () => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <Map className="w-12 h-12 text-muted-foreground mb-4" />
    <h3 className="text-lg font-semibold text-foreground">Heat Map</h3>
    <p className="text-sm text-muted-foreground mt-1 max-w-md">
      The geographic heat map visualisation of suggestion clusters will be built in Phase 2.
    </p>
  </div>
);

const TripSuggestionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('submit');

  return (
    <DashboardLayout>
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="submit" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              Submit Suggestion
            </TabsTrigger>
            <TabsTrigger value="browse" className="gap-2">
              <List className="w-4 h-4" />
              Browse Suggestions
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="gap-2">
              <Map className="w-4 h-4" />
              Heat Map
            </TabsTrigger>
          </TabsList>

          <TabsContent value="submit">
            <SubmitSuggestionForm />
          </TabsContent>

          <TabsContent value="browse">
            <BrowsePlaceholder />
          </TabsContent>

          <TabsContent value="heatmap">
            <HeatMapPlaceholder />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default TripSuggestionsPage;
