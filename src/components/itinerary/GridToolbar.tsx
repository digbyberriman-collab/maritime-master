import React, { useState } from 'react';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Filter, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import type { ViewMode, ItineraryStatus, TripType } from '@/types/itinerary';

interface GridToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onCreateEntry: () => void;
  onImportCSV?: () => void;
  statusFilter: ItineraryStatus[];
  onStatusFilterChange: (statuses: ItineraryStatus[]) => void;
  tripTypes: TripType[];
  tripTypeFilter: string[];
  onTripTypeFilterChange: (ids: string[]) => void;
  vesselIds: string[];
  vessels: { id: string; name: string }[];
  onVesselFilterChange: (ids: string[]) => void;
}

const ALL_STATUSES: ItineraryStatus[] = ['draft', 'tentative', 'confirmed', 'postponed', 'cancelled', 'completed'];

const GridToolbar: React.FC<GridToolbarProps> = ({
  viewMode,
  onViewModeChange,
  currentDate,
  onDateChange,
  onCreateEntry,
  onImportCSV,
  statusFilter,
  onStatusFilterChange,
  tripTypes,
  tripTypeFilter,
  onTripTypeFilterChange,
  vesselIds,
  vessels,
  onVesselFilterChange,
}) => {
  const navigate = (direction: 'prev' | 'next') => {
    const d = direction === 'prev' ? -1 : 1;
    switch (viewMode) {
      case 'year':
        onDateChange(d === -1 ? subMonths(currentDate, 12) : addMonths(currentDate, 12));
        break;
      case 'quarter':
        onDateChange(d === -1 ? subMonths(currentDate, 3) : addMonths(currentDate, 3));
        break;
      case 'month':
        onDateChange(d === -1 ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
        break;
      case 'week':
        // Navigate by 4 weeks at a time for the 52-week view
        onDateChange(d === -1 ? subMonths(currentDate, 12) : addMonths(currentDate, 12));
        break;
      case 'day':
        onDateChange(d === -1 ? subDays(currentDate, 7) : addDays(currentDate, 7));
        break;
    }
  };

  const jumpToToday = () => onDateChange(new Date());

  const toggleStatus = (status: ItineraryStatus) => {
    if (statusFilter.includes(status)) {
      onStatusFilterChange(statusFilter.filter(s => s !== status));
    } else {
      onStatusFilterChange([...statusFilter, status]);
    }
  };

  const toggleVessel = (id: string) => {
    if (vesselIds.includes(id)) {
      onVesselFilterChange(vesselIds.filter(v => v !== id));
    } else {
      onVesselFilterChange([...vesselIds, id]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-card">
      {/* Navigation */}
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate('prev')}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={jumpToToday}>
          Today
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate('next')}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Date label */}
      <span className="text-sm font-semibold text-foreground min-w-[140px]">
        {viewMode === 'year' && format(currentDate, 'yyyy')}
        {viewMode === 'month' && format(currentDate, 'MMMM yyyy')}
        {viewMode === 'quarter' && `Q${Math.ceil((currentDate.getMonth() + 1) / 3)} ${format(currentDate, 'yyyy')}: ${format(startOfMonth(currentDate), 'MMM')} – ${format(addMonths(startOfMonth(currentDate), 2), 'MMM')}`}
        {viewMode === 'week' && `${format(currentDate, 'yyyy')} — 52 Weeks`}
        {viewMode === 'day' && format(currentDate, 'MMM d, yyyy')}
      </span>

      {/* View mode toggle */}
      <div className="flex items-center bg-muted rounded-md p-0.5">
        {(['year', 'quarter', 'month', 'week', 'day'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === mode
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Filters */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
            <Filter className="w-3 h-3" />
            Filters
            {(statusFilter.length < ALL_STATUSES.length || tripTypeFilter.length > 0 || vesselIds.length < vessels.length) && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">!</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="end">
          <div className="space-y-4">
            {/* Status filter */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Status</h4>
              <div className="space-y-1">
                {ALL_STATUSES.map(s => (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={statusFilter.includes(s)}
                      onCheckedChange={() => toggleStatus(s)}
                    />
                    <span className="capitalize">{s}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Vessel filter */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Vessels</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {vessels.map(v => (
                  <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={vesselIds.includes(v.id)}
                      onCheckedChange={() => toggleVessel(v.id)}
                    />
                    <span>{v.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Import CSV */}
      {onImportCSV && (
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={onImportCSV}>
          <Upload className="w-3 h-3" />
          Import
        </Button>
      )}

      {/* Create entry */}
      <Button size="sm" className="h-8 text-xs gap-1" onClick={onCreateEntry}>
        <Plus className="w-3 h-3" />
        New Entry
      </Button>
    </div>
  );
};

export default GridToolbar;
