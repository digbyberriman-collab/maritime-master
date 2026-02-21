import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Lightbulb, List, Map } from 'lucide-react';
import SubmitSuggestionForm from '@/modules/itinerary/components/SubmitSuggestionForm';
import BrowseSuggestionsTab from '@/modules/itinerary/components/BrowseSuggestionsTab';

const HeatMapTab = React.lazy(() => import('@/modules/itinerary/components/HeatMapTab'));

const TripSuggestionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('browse');

  return (
    <DashboardLayout>
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="browse" className="gap-2">
              <List className="w-4 h-4" />
              Browse Suggestions
            </TabsTrigger>
            <TabsTrigger value="submit" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              Submit Suggestion
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="gap-2">
              <Map className="w-4 h-4" />
              Heat Map
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse">
            <BrowseSuggestionsTab />
          </TabsContent>

          <TabsContent value="submit">
            <SubmitSuggestionForm />
          </TabsContent>

          <TabsContent value="heatmap">
            <React.Suspense fallback={
              <div className="flex items-center justify-center h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            }>
              <HeatMapTab />
            </React.Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default TripSuggestionsPage;
