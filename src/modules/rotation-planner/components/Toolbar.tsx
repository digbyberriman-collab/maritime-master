import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, CalendarDays, Upload, Download, AlertTriangle, Plus } from 'lucide-react';
import { format } from 'date-fns';
import type { ZoomLevel, PlannerFilters } from '../types';
import { ZOOM_ORDER } from '../constants';
import type { VesselLite } from '../hooks/useVesselsAndCrew';

interface Props {
  zoom: ZoomLevel;
  setZoom: (z: ZoomLevel) => void;
  viewStart: Date;
  viewEnd: Date;
  onToday: () => void;
  onShift: (days: number) => void;
  filters: PlannerFilters;
  setFilters: (f: PlannerFilters) => void;
  vessels: VesselLite[];
  conflictCount: number;
  onImport: () => void;
  onExport: () => void;
  onCreate: () => void;
}

const Toolbar: React.FC<Props> = ({
  zoom, setZoom, viewStart, viewEnd, onToday, onShift,
  filters, setFilters, vessels, conflictCount, onImport, onExport, onCreate,
}) => {
  const zoomIdx = ZOOM_ORDER.indexOf(zoom);
  const zoomIn = () => zoomIdx > 0 && setZoom(ZOOM_ORDER[zoomIdx - 1]);
  const zoomOut = () => zoomIdx < ZOOM_ORDER.length - 1 && setZoom(ZOOM_ORDER[zoomIdx + 1]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-card sticky top-0 z-30">
      <Button size="sm" variant="outline" onClick={() => onShift(-30)} title="Back"><ChevronLeft className="h-4 w-4" /></Button>
      <Button size="sm" variant="outline" onClick={onToday}><CalendarDays className="h-4 w-4 mr-1" />Today</Button>
      <Button size="sm" variant="outline" onClick={() => onShift(30)} title="Forward"><ChevronRight className="h-4 w-4" /></Button>

      <div className="text-xs text-muted-foreground px-2 hidden md:block">
        {format(viewStart, 'd MMM yyyy')} – {format(viewEnd, 'd MMM yyyy')}
      </div>

      <div className="flex items-center gap-1 ml-2">
        <Button size="icon" variant="outline" onClick={zoomIn} disabled={zoomIdx === 0} title="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
        <Select value={zoom} onValueChange={(v) => setZoom(v as ZoomLevel)}>
          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="fortnight">Fortnight</SelectItem>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="quarter">Quarter</SelectItem>
            <SelectItem value="year">Year</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" variant="outline" onClick={zoomOut} disabled={zoomIdx === ZOOM_ORDER.length - 1} title="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
      </div>

      <Select
        value={filters.vesselIds.length === 1 ? filters.vesselIds[0] : '__all__'}
        onValueChange={(v) => setFilters({ ...filters, vesselIds: v === '__all__' ? [] : [v] })}
      >
        <SelectTrigger className="h-8 w-44"><SelectValue placeholder="All vessels" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All vessels</SelectItem>
          {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Input
        className="h-8 w-56"
        placeholder="Search crew, lane or notes…"
        value={filters.search}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
      />

      <Button
        size="sm"
        variant={filters.conflictsOnly ? 'destructive' : 'outline'}
        onClick={() => setFilters({ ...filters, conflictsOnly: !filters.conflictsOnly })}
      >
        <AlertTriangle className="h-4 w-4 mr-1" />
        Conflicts {conflictCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground text-xs">{conflictCount}</span>}
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={onImport}><Upload className="h-4 w-4 mr-1" />Import</Button>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="h-4 w-4 mr-1" />Export</Button>
        <Button size="sm" onClick={onCreate}><Plus className="h-4 w-4 mr-1" />New</Button>
      </div>
    </div>
  );
};

export default Toolbar;