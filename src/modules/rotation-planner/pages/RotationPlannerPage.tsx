import React, { useMemo, useState, useCallback, useEffect } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { addDays, startOfMonth, endOfMonth } from 'date-fns';
import Toolbar from '../components/Toolbar';
import TimelineHeader from '../components/TimelineHeader';
import LocationLane from '../components/LocationLane';
import PlannerGrid from '../components/PlannerGrid';
import BlockDetailDrawer from '../components/BlockDetailDrawer';
import ImportDialog from '../components/ImportDialog';
import { usePlannerData } from '../hooks/usePlannerData';
import { useVesselsLite, useCrewLite } from '../hooks/useVesselsAndCrew';
import { ZOOM_PX_PER_DAY, HEADER_HEIGHT, LOCATION_LANE_HEIGHT, LEFT_COL_WIDTH } from '../constants';
import { detectConflicts } from '../lib/conflicts';
import { exportPlannerToXLSX } from '../lib/xlsxExporter';
import type { PlannerFilters, RotationAssignment, ZoomLevel } from '../types';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from '@/shared/hooks/use-toast';

const defaultFilters: PlannerFilters = {
  vesselIds: [], departments: [], rotationTypes: [], statuses: [],
  search: '', conflictsOnly: false,
};

const RotationPlannerPage: React.FC = () => {
  const { user } = useAuth();
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [filters, setFilters] = useState<PlannerFilters>(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('company_id').eq('user_id', user.id).single()
      .then(({ data }) => setCompanyId((data as any)?.company_id ?? null));
  }, [user]);

  const { viewStart, viewEnd } = useMemo(() => {
    // Show ~6 months around anchor
    const span = zoom === 'day' ? 30 : zoom === 'week' ? 120 : zoom === 'fortnight' ? 240 : zoom === 'month' ? 365 : zoom === 'quarter' ? 730 : 1825;
    const half = Math.floor(span / 2);
    return { viewStart: startOfMonth(addDays(anchor, -half)), viewEnd: endOfMonth(addDays(anchor, half)) };
  }, [anchor, zoom]);

  const vesselsQ = useVesselsLite();
  const crewQ = useCrewLite();
  const planner = usePlannerData({ start: viewStart, end: viewEnd, vesselIds: filters.vesselIds.length ? filters.vesselIds : null });

  const vesselName = useCallback((id: string | null) => id ? (vesselsQ.data?.find((v) => v.id === id)?.name ?? '—') : '—', [vesselsQ.data]);
  const crewName = useCallback((id: string | null) => {
    if (!id) return '';
    const c = crewQ.data?.find((x) => x.user_id === id);
    return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : '';
  }, [crewQ.data]);
  const laneName = useCallback((id: string | null) => id ? (planner.lanes.find((l) => l.id === id)?.lane_label ?? '—') : '—', [planner.lanes]);

  const totalWidth = useMemo(() => {
    const days = Math.max(1, Math.floor((viewEnd.getTime() - viewStart.getTime()) / 86_400_000) + 1);
    return days * ZOOM_PX_PER_DAY[zoom];
  }, [viewStart, viewEnd, zoom]);

  const conflictsById = useMemo(
    () => detectConflicts(planner.assignments, planner.leave),
    [planner.assignments, planner.leave]
  );

  // Apply filters
  const visibleAssignments = useMemo(() => {
    let xs = planner.assignments;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      xs = xs.filter((a) =>
        (a.label ?? '').toLowerCase().includes(s)
        || (a.notes ?? '').toLowerCase().includes(s)
        || crewName(a.crew_user_id).toLowerCase().includes(s)
      );
    }
    if (filters.conflictsOnly) xs = xs.filter((a) => conflictsById.has(a.id));
    return xs;
  }, [planner.assignments, filters, conflictsById, crewName]);

  const selected = useMemo(() => planner.assignments.find((a) => a.id === selectedId) ?? null, [planner.assignments, selectedId]);

  const onUpdate = useCallback((a: RotationAssignment, changes: Partial<RotationAssignment>) => {
    planner.upsertAssignment.mutate({ id: a.id, ...changes }, {
      onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
    });
  }, [planner]);

  const onCreate = useCallback((laneId: string, start_date: string, end_date: string) => {
    if (!companyId) { toast({ title: 'No company context yet', variant: 'destructive' }); return; }
    const lane = planner.lanes.find((l) => l.id === laneId);
    planner.upsertAssignment.mutate({
      company_id: companyId, lane_id: laneId, vessel_id: lane?.vessel_id ?? null,
      start_date, end_date, rotation_type: 'onboard', status: 'draft',
      label: 'New rotation',
    } as any);
  }, [companyId, planner]);

  const onCreateBlank = useCallback(() => {
    if (planner.lanes.length === 0) return;
    const first = planner.lanes[0];
    onCreate(first.id, addDays(new Date(), 1).toISOString().slice(0, 10), addDays(new Date(), 8).toISOString().slice(0, 10));
  }, [planner.lanes, onCreate]);

  const onExport = useCallback(() => {
    exportPlannerToXLSX({
      assignments: visibleAssignments, locations: planner.locations,
      vesselName, crewName, laneName,
    });
  }, [visibleAssignments, planner.locations, vesselName, crewName, laneName]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <Toolbar
          zoom={zoom} setZoom={setZoom}
          viewStart={viewStart} viewEnd={viewEnd}
          onToday={() => setAnchor(new Date())}
          onShift={(d) => setAnchor((a) => addDays(a, d))}
          filters={filters} setFilters={setFilters}
          vessels={vesselsQ.data ?? []}
          conflictCount={conflictsById.size}
          onImport={() => setImportOpen(true)}
          onExport={onExport}
          onCreate={onCreateBlank}
        />

        {/* Sticky top: timeline header + location lane */}
        <div className="flex border-b">
          <div style={{ width: LEFT_COL_WIDTH }} className="border-r bg-card p-2 text-xs font-medium" >
            <div>Vessel / Department / Role</div>
            <div className="text-muted-foreground mt-1">Itinerary →</div>
          </div>
          <div className="flex-1 overflow-hidden">
            <div style={{ width: totalWidth }}>
              <TimelineHeader viewStart={viewStart} viewEnd={viewEnd} zoom={zoom} totalWidth={totalWidth} />
              <LocationLane
                viewStart={viewStart} viewEnd={viewEnd} zoom={zoom} totalWidth={totalWidth}
                locations={planner.locations}
              />
            </div>
          </div>
        </div>

        {planner.loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading planner…
          </div>
        ) : planner.lanes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
            <div>No lanes configured yet.</div>
            <div>Import the existing spreadsheet, or create lanes per vessel/department/role.</div>
            <button className="text-primary underline" onClick={() => setImportOpen(true)}>Import XLSX</button>
          </div>
        ) : (
          <PlannerGrid
            lanes={planner.lanes}
            assignments={visibleAssignments}
            leave={planner.leave}
            conflictsById={conflictsById}
            viewStart={viewStart} viewEnd={viewEnd} zoom={zoom} totalWidth={totalWidth}
            vesselName={vesselName} crewName={crewName}
            onSelectAssignment={(a) => setSelectedId(a.id)}
            onUpdateAssignment={onUpdate}
            onCreateAssignment={onCreate}
            selectedId={selectedId}
          />
        )}

        <BlockDetailDrawer
          assignment={selected}
          open={!!selected}
          onClose={() => setSelectedId(undefined)}
          onSave={(a) => planner.upsertAssignment.mutate(a as any)}
          onDelete={(id) => planner.deleteAssignment.mutate(id)}
          lanes={planner.lanes}
          vessels={vesselsQ.data ?? []}
          crew={crewQ.data ?? []}
          conflicts={selected ? conflictsById.get(selected.id) : undefined}
        />

        <ImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          vessels={vesselsQ.data ?? []}
          crew={crewQ.data ?? []}
          lanes={planner.lanes}
          onComplete={() => { /* queries auto-invalidate via realtime */ }}
        />
      </div>
    </DashboardLayout>
  );
};

export default RotationPlannerPage;