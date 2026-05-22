import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import TimelineView from '@/modules/itinerary/components/TimelineView';
import GridToolbar from '@/modules/itinerary/components/GridToolbar';
import CreateEntryModal from '@/modules/itinerary/components/CreateEntryModal';
import EntryDetailPanel from '@/modules/itinerary/components/EntryDetailPanel';
import { useItineraryEntries, useTripTypes, useItineraryVessels } from '@/modules/itinerary/hooks/useItinerary';
import { Loader2 } from 'lucide-react';
import type { ItineraryEntry, ViewMode, ItineraryStatus } from '@/modules/itinerary/types';
import { PageHeader } from '@/shared/components/common/PageHeader';

const ALL_STATUSES: ItineraryStatus[] = ['draft', 'tentative', 'confirmed', 'postponed', 'cancelled', 'completed'];

const FleetTimelinePage: React.FC = () => {
  const { data: entries = [], isLoading: entriesLoading } = useItineraryEntries();
  const { data: tripTypes = [] } = useTripTypes();
  const { data: vessels = [], isLoading: vesselsLoading } = useItineraryVessels();

  const [viewMode, setViewMode] = useState<ViewMode>('year');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<ItineraryStatus[]>(ALL_STATUSES);
  const [tripTypeFilter, setTripTypeFilter] = useState<string[]>([]);
  const [vesselFilter, setVesselFilter] = useState<string[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const selectedEntry = useMemo(
    () => (selectedEntryId ? entries.find(e => e.id === selectedEntryId) ?? null : null),
    [selectedEntryId, entries]
  );

  const handleSelectEntry = (entry: ItineraryEntry) => setSelectedEntryId(entry.id);

  React.useEffect(() => {
    if (vessels.length > 0 && vesselFilter.length === 0) {
      setVesselFilter(vessels.map(v => v.id));
    }
  }, [vessels]);

  const isLoading = entriesLoading || vesselsLoading;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <PageHeader
            title="Fleet Timeline"
            description={`Gantt-style view — ${entries.length} entries across ${vessels.length} vessels`}
          />
        </div>

        {/* Toolbar (reused, view mode toggle hidden since this is always timeline) */}
        <GridToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          onCreateEntry={() => setCreateModalOpen(true)}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          tripTypes={tripTypes}
          tripTypeFilter={tripTypeFilter}
          onTripTypeFilterChange={setTripTypeFilter}
          vesselIds={vesselFilter}
          vessels={vessels}
          onVesselFilterChange={setVesselFilter}
        />

        {/* Timeline + Detail panel */}
        <div className="flex flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <TimelineView
              entries={entries}
              vessels={vessels}
              currentDate={currentDate}
              viewMode={viewMode}
              statusFilter={statusFilter}
              vesselFilter={vesselFilter}
              onSelectEntry={handleSelectEntry}
            />
          )}

          {selectedEntry && (
            <EntryDetailPanel
              entry={selectedEntry}
              onClose={() => setSelectedEntryId(null)}
            />
          )}
        </div>
      </div>

      <CreateEntryModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />
    </DashboardLayout>
  );
};

export default FleetTimelinePage;
