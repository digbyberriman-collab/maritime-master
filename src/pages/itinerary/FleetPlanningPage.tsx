import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PlanningGrid from '@/components/itinerary/PlanningGrid';
import GridToolbar from '@/components/itinerary/GridToolbar';
import CreateEntryModal from '@/components/itinerary/CreateEntryModal';
import EntryDetailPanel from '@/components/itinerary/EntryDetailPanel';
import { useItineraryEntries, useTripTypes, useItineraryVessels } from '@/hooks/useItinerary';
import { Loader2 } from 'lucide-react';
import type { ItineraryEntry, ViewMode, ItineraryStatus } from '@/types/itinerary';

const ALL_STATUSES: ItineraryStatus[] = ['draft', 'tentative', 'confirmed', 'postponed', 'cancelled', 'completed'];

const FleetPlanningPage: React.FC = () => {
  const { data: entries = [], isLoading: entriesLoading } = useItineraryEntries();
  const { data: tripTypes = [] } = useTripTypes();
  const { data: vessels = [], isLoading: vesselsLoading } = useItineraryVessels();

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<ItineraryStatus[]>(ALL_STATUSES);
  const [tripTypeFilter, setTripTypeFilter] = useState<string[]>([]);
  const [vesselFilter, setVesselFilter] = useState<string[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{ vesselId?: string; date?: string }>({});

  // Derive selectedEntry from fresh query data
  const selectedEntry = useMemo(
    () => (selectedEntryId ? entries.find(e => e.id === selectedEntryId) ?? null : null),
    [selectedEntryId, entries]
  );

  const handleSelectEntry = (entry: ItineraryEntry) => setSelectedEntryId(entry.id);

  // Initialize vessel filter with all vessels once loaded
  React.useEffect(() => {
    if (vessels.length > 0 && vesselFilter.length === 0) {
      setVesselFilter(vessels.map(v => v.id));
    }
  }, [vessels]);

  const handleCreateFromCell = (vesselId: string, date: string) => {
    setCreateDefaults({ vesselId, date });
    setCreateModalOpen(true);
  };

  const handleCreateNew = () => {
    setCreateDefaults({});
    setCreateModalOpen(true);
  };

  const isLoading = entriesLoading || vesselsLoading;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-lg font-bold text-foreground">Fleet Planning</h1>
          <p className="text-xs text-muted-foreground">
            {entries.length} entries across {vessels.length} vessels
          </p>
        </div>

        {/* Toolbar */}
        <GridToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          onCreateEntry={handleCreateNew}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          tripTypes={tripTypes}
          tripTypeFilter={tripTypeFilter}
          onTripTypeFilterChange={setTripTypeFilter}
          vesselIds={vesselFilter}
          vessels={vessels}
          onVesselFilterChange={setVesselFilter}
        />

        {/* Grid + Detail panel */}
        <div className="flex flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <PlanningGrid
              entries={entries}
              vessels={vessels}
              viewMode={viewMode}
              currentDate={currentDate}
              statusFilter={statusFilter}
              vesselFilter={vesselFilter}
              onSelectEntry={handleSelectEntry}
              onCreateEntry={handleCreateFromCell}
            />
          )}

          {/* Detail panel */}
          {selectedEntry && (
            <EntryDetailPanel
              entry={selectedEntry}
              onClose={() => setSelectedEntryId(null)}
            />
          )}
        </div>
      </div>

      {/* Create modal */}
      <CreateEntryModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={createDefaults.date}
        defaultVesselId={createDefaults.vesselId}
      />
    </DashboardLayout>
  );
};

export default FleetPlanningPage;
