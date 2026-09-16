import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, CalendarDays, Upload, Download, AlertTriangle,
  Plus, Eye, FileText, FileSpreadsheet, Undo2, Redo2, Copy, ClipboardPaste, Trash2, XCircle,
} from 'lucide-react';
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
  conflictPanelOpen: boolean;
  onToggleConflictPanel: () => void;
  onImport: () => void;
  onExport: () => void;
  onExportPdf: () => void;
  onCreate: () => void;
  canEdit?: boolean;
  // editing state
  selectionCount: number;
  clipboardCount: number;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDeleteSelection: () => void;
  onClearSelection: () => void;
}

const Toolbar: React.FC<Props> = ({
  zoom, setZoom, viewStart, viewEnd, onToday, onShift,
  filters, setFilters, vessels, conflictCount, conflictPanelOpen, onToggleConflictPanel,
  onImport, onExport, onExportPdf, onCreate, canEdit = true,
  selectionCount, clipboardCount, canUndo, canRedo, undoLabel, redoLabel,
  onUndo, onRedo, onCopy, onPaste, onDeleteSelection, onClearSelection,
}) => {
  const zoomIdx = ZOOM_ORDER.indexOf(zoom);
  const zoomIn = () => zoomIdx > 0 && setZoom(ZOOM_ORDER[zoomIdx - 1]);
  const zoomOut = () => zoomIdx < ZOOM_ORDER.length - 1 && setZoom(ZOOM_ORDER[zoomIdx + 1]);

  return (
    <div className="border-b bg-card sticky top-0 z-30">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
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
          title="Show only blocks with clashes"
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          Only clashes
        </Button>

        <Button
          size="sm"
          variant={conflictPanelOpen ? 'default' : 'outline'}
          onClick={onToggleConflictPanel}
          title="Open the conflict resolution panel"
        >
          Conflicts
          {conflictCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground text-xs">{conflictCount}</span>
          )}
        </Button>

        <div className="ml-auto flex items-center gap-1">
          {!canEdit && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground px-2" title="You have view-only access to rotations, leave and travel">
              <Eye className="h-3.5 w-3.5" /> View only
            </span>
          )}
          {canEdit && <Button size="sm" variant="outline" onClick={onImport}><Upload className="h-4 w-4 mr-1" />Import</Button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportPdf}>
                <FileText className="h-4 w-4 mr-2" />PDF (timeline view)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExport}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />Excel (data)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canEdit && <Button size="sm" onClick={onCreate}><Plus className="h-4 w-4 mr-1" />New</Button>}
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2 text-xs">
          <Button size="sm" variant="outline" className="h-7" onClick={onUndo} disabled={!canUndo}
            title={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}>
            <Undo2 className="h-3.5 w-3.5 mr-1" />Undo
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={onRedo} disabled={!canRedo}
            title={redoLabel ? `Redo: ${redoLabel}` : 'Nothing to redo'}>
            <Redo2 className="h-3.5 w-3.5 mr-1" />Redo
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <Button size="sm" variant="outline" className="h-7" onClick={onCopy} disabled={selectionCount === 0} title="Copy selection (Ctrl/Cmd+C)">
            <Copy className="h-3.5 w-3.5 mr-1" />Copy{selectionCount > 0 ? ` (${selectionCount})` : ''}
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={onPaste} disabled={clipboardCount === 0} title="Paste at the cursor position (Ctrl/Cmd+V)">
            <ClipboardPaste className="h-3.5 w-3.5 mr-1" />Paste{clipboardCount > 0 ? ` (${clipboardCount})` : ''}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-destructive" onClick={onDeleteSelection} disabled={selectionCount === 0} title="Delete selection (Delete)">
            <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
          </Button>
          {selectionCount > 0 && (
            <Button size="sm" variant="ghost" className="h-7" onClick={onClearSelection} title="Clear selection (Esc)">
              <XCircle className="h-3.5 w-3.5 mr-1" />Clear
            </Button>
          )}

          <span className="ml-2 text-muted-foreground hidden lg:inline">
            {selectionCount > 0 ? `${selectionCount} block${selectionCount > 1 ? 's' : ''} selected · ` : ''}
            Drag on empty space to lasso · Shift or Ctrl click to add · double-click a row to create
          </span>
        </div>
      )}
    </div>
  );
};

export default Toolbar;
