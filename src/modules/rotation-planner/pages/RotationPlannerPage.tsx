import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { addDays as addDaysFns, startOfMonth, endOfMonth } from 'date-fns';
import Toolbar from '../components/Toolbar';
import TimelineHeader from '../components/TimelineHeader';
import LocationLane from '../components/LocationLane';
import PlannerGrid, { type BlockUpdate } from '../components/PlannerGrid';
import BlockDetailDrawer from '../components/BlockDetailDrawer';
import ImportDialog from '../components/ImportDialog';
import ConflictPanel, { type ConflictResolution } from '../components/ConflictPanel';
import { usePlannerData } from '../hooks/usePlannerData';
import { usePlannerPermissions } from '../hooks/usePlannerPermissions';
import { usePlannerHistory } from '../hooks/usePlannerHistory';
import { useVesselsLite, useCrewLite } from '../hooks/useVesselsAndCrew';
import { ZOOM_PX_PER_DAY, LOCATION_LANE_HEIGHT, LEFT_COL_WIDTH } from '../constants';
import { detectConflicts, buildConflictItems } from '../lib/conflicts';
import { exportPlannerToXLSX } from '../lib/xlsxExporter';
import { exportPlannerToPDF } from '../lib/pdfExporter';
import { addDays, differenceInCalendarDays, fromISO, toISO } from '../lib/dateMath';
import type { PlannerFilters, RotationAssignment, ZoomLevel } from '../types';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from '@/shared/hooks/use-toast';

const defaultFilters: PlannerFilters = {
  vesselIds: [], departments: [], rotationTypes: [], statuses: [],
  search: '', conflictsOnly: false,
};

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

const RotationPlannerPage: React.FC = () => {
  const { user } = useAuth();
  const { canEdit } = usePlannerPermissions();
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [filters, setFilters] = useState<PlannerFilters>(defaultFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const [conflictPanelOpen, setConflictPanelOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<RotationAssignment[]>([]);
  const lastClickedRef = useRef<string | null>(null);
  const hoverRef = useRef<{ laneId: string; date: string } | null>(null);

  const history = usePlannerHistory();

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('company_id').eq('user_id', user.id).single()
      .then(({ data }) => setCompanyId((data as any)?.company_id ?? null));
  }, [user]);

  const { viewStart, viewEnd } = useMemo(() => {
    const span = zoom === 'day' ? 30 : zoom === 'week' ? 120 : zoom === 'fortnight' ? 240 : zoom === 'month' ? 365 : zoom === 'quarter' ? 730 : 1825;
    const half = Math.floor(span / 2);
    return { viewStart: startOfMonth(addDaysFns(anchor, -half)), viewEnd: endOfMonth(addDaysFns(anchor, half)) };
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

  const assignmentsById = useMemo(
    () => new Map(planner.assignments.map((a) => [a.id, a])),
    [planner.assignments]
  );

  const conflictItems = useMemo(
    () => buildConflictItems(planner.assignments, planner.leave),
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

  /** Visible blocks in display order — used for shift-click range selection. */
  const orderedVisible = useMemo(() => {
    const laneIdx = new Map(planner.lanes.map((l, i) => [l.id, i]));
    return [...visibleAssignments].sort((a, b) => {
      const la = laneIdx.get(a.lane_id ?? '') ?? 9e9;
      const lb = laneIdx.get(b.lane_id ?? '') ?? 9e9;
      return la !== lb ? la - lb : a.start_date.localeCompare(b.start_date);
    });
  }, [visibleAssignments, planner.lanes]);

  const detail = useMemo(() => planner.assignments.find((a) => a.id === detailId) ?? null, [planner.assignments, detailId]);

  const requireEdit = useCallback(() => {
    if (canEdit) return true;
    toast({ title: 'View-only access', description: 'You cannot change rotations.', variant: 'destructive' });
    return false;
  }, [canEdit]);

  // ---- history-backed operations -------------------------------------------
  const applyUpdates = useCallback(async (
    updates: (Partial<RotationAssignment> & { id: string })[],
    label: string,
  ) => {
    if (!requireEdit() || !updates.length) return;
    const before = updates.map((u) => {
      const cur = assignmentsById.get(u.id);
      const prev: any = { id: u.id };
      for (const k of Object.keys(u)) {
        if (k === 'id') continue;
        prev[k] = (cur as any)?.[k] ?? null;
      }
      return prev as Partial<RotationAssignment> & { id: string };
    });
    try {
      await history.run({
        label,
        apply: async () => { await planner.updateManyAssignments.mutateAsync(updates); },
        revert: async () => { await planner.updateManyAssignments.mutateAsync(before); },
      });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    }
  }, [requireEdit, assignmentsById, history, planner]);

  const applyInserts = useCallback(async (rows: Partial<RotationAssignment>[], label: string) => {
    if (!requireEdit() || !rows.length) return;
    const withIds = rows.map((r) => ({ ...r, id: r.id ?? newId() }));
    const ids = withIds.map((r) => r.id as string);
    try {
      await history.run({
        label,
        apply: async () => { await planner.insertManyAssignments.mutateAsync(withIds); },
        revert: async () => { await planner.deleteManyAssignments.mutateAsync(ids); },
      });
      setSelectedIds(new Set(ids));
    } catch (e: any) {
      toast({ title: 'Could not add blocks', description: e?.message, variant: 'destructive' });
    }
  }, [requireEdit, history, planner]);

  const applyDeletes = useCallback(async (ids: string[], label: string) => {
    if (!requireEdit() || !ids.length) return;
    const snapshots = ids.map((id) => assignmentsById.get(id)).filter(Boolean) as RotationAssignment[];
    try {
      await history.run({
        label,
        apply: async () => { await planner.deleteManyAssignments.mutateAsync(ids); },
        revert: async () => { await planner.insertManyAssignments.mutateAsync(snapshots); },
      });
      setSelectedIds(new Set());
      setDetailId(undefined);
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' });
    }
  }, [requireEdit, assignmentsById, history, planner]);

  const onUndo = useCallback(async () => {
    try {
      const label = await history.undo();
      if (label) toast({ title: 'Undone', description: label });
    } catch (e: any) {
      toast({ title: 'Undo failed', description: e?.message, variant: 'destructive' });
    }
  }, [history]);

  const onRedo = useCallback(async () => {
    try {
      const label = await history.redo();
      if (label) toast({ title: 'Redone', description: label });
    } catch (e: any) {
      toast({ title: 'Redo failed', description: e?.message, variant: 'destructive' });
    }
  }, [history]);

  // ---- selection -----------------------------------------------------------
  const onSelectAssignment = useCallback((a: RotationAssignment, mode: 'single' | 'toggle' | 'range') => {
    setSelectedIds((prev) => {
      if (mode === 'toggle') {
        const next = new Set(prev);
        next.has(a.id) ? next.delete(a.id) : next.add(a.id);
        return next;
      }
      if (mode === 'range' && lastClickedRef.current) {
        const ids = orderedVisible.map((x) => x.id);
        const i = ids.indexOf(lastClickedRef.current);
        const j = ids.indexOf(a.id);
        if (i >= 0 && j >= 0) {
          const [lo, hi] = i <= j ? [i, j] : [j, i];
          return new Set([...prev, ...ids.slice(lo, hi + 1)]);
        }
      }
      return new Set([a.id]);
    });
    if (mode === 'single') setDetailId(a.id);
    lastClickedRef.current = a.id;
  }, [orderedVisible]);

  const onMarqueeSelect = useCallback((ids: string[], additive: boolean) => {
    setSelectedIds((prev) => additive ? new Set([...prev, ...ids]) : new Set(ids));
    if (ids.length) lastClickedRef.current = ids[ids.length - 1];
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ---- copy / paste --------------------------------------------------------
  const onCopy = useCallback(() => {
    const rows = [...selectedIds].map((id) => assignmentsById.get(id)).filter(Boolean) as RotationAssignment[];
    if (!rows.length) return;
    setClipboard(rows);
    toast({ title: 'Copied', description: `${rows.length} block${rows.length > 1 ? 's' : ''} on the clipboard.` });
  }, [selectedIds, assignmentsById]);

  const onPaste = useCallback(() => {
    if (!requireEdit() || !clipboard.length) return;
    if (!companyId) { toast({ title: 'No company context yet', variant: 'destructive' }); return; }
    const lanes = planner.lanes;
    const laneIdx = new Map(lanes.map((l, i) => [l.id, i]));
    const sorted = [...clipboard].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const anchorBlock = sorted[0];
    const target = hoverRef.current ?? {
      laneId: anchorBlock.lane_id ?? lanes[0]?.id ?? '',
      date: toISO(addDays(fromISO(sorted[sorted.length - 1].end_date), 1)),
    };
    if (!target.laneId) { toast({ title: 'No lane to paste into', variant: 'destructive' }); return; }
    const dayShift = differenceInCalendarDays(fromISO(target.date), fromISO(anchorBlock.start_date));
    const baseLaneIdx = laneIdx.get(anchorBlock.lane_id ?? '') ?? 0;
    const targetLaneIdx = laneIdx.get(target.laneId) ?? baseLaneIdx;
    const laneShift = targetLaneIdx - baseLaneIdx;

    const rows = clipboard.map((c) => {
      const srcIdx = laneIdx.get(c.lane_id ?? '') ?? baseLaneIdx;
      const destLane = lanes[Math.min(lanes.length - 1, Math.max(0, srcIdx + laneShift))];
      return {
        company_id: companyId,
        lane_id: destLane?.id ?? null,
        vessel_id: destLane?.vessel_id ?? c.vessel_id ?? null,
        crew_user_id: c.crew_user_id,
        crew_name_raw: c.crew_name_raw,
        start_date: toISO(addDays(fromISO(c.start_date), dayShift)),
        end_date: toISO(addDays(fromISO(c.end_date), dayShift)),
        label: c.label,
        rotation_type: c.rotation_type,
        status: 'draft' as const,
        colour: c.colour,
        notes: c.notes,
      } as Partial<RotationAssignment>;
    });
    void applyUpdatesFreeNoop();
    void applyInserts(rows, `Paste ${rows.length} block${rows.length > 1 ? 's' : ''}`);
  }, [requireEdit, clipboard, companyId, planner.lanes, applyInserts]);

  // no-op kept out of the way so paste stays a single history entry
  const applyUpdatesFreeNoop = async () => {};

  const onDeleteSelection = useCallback(() => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    void applyDeletes(ids, `Delete ${ids.length} block${ids.length > 1 ? 's' : ''}`);
  }, [selectedIds, applyDeletes]);

  const onMoveBlocks = useCallback((updates: BlockUpdate[], label: string) => {
    void applyUpdates(updates, label);
  }, [applyUpdates]);

  const onCreate = useCallback((laneId: string, start_date: string, end_date: string) => {
    if (!requireEdit()) return;
    if (!companyId) { toast({ title: 'No company context yet', variant: 'destructive' }); return; }
    const lane = planner.lanes.find((l) => l.id === laneId);
    void applyInserts([{
      company_id: companyId, lane_id: laneId, vessel_id: lane?.vessel_id ?? null,
      start_date, end_date, rotation_type: 'onboard', status: 'draft', label: 'New rotation',
    } as Partial<RotationAssignment>], 'Create rotation');
  }, [companyId, planner.lanes, requireEdit, applyInserts]);

  const onCreateBlank = useCallback(() => {
    if (planner.lanes.length === 0) return;
    const first = planner.lanes[0];
    onCreate(first.id, toISO(addDays(new Date(), 1)), toISO(addDays(new Date(), 8)));
  }, [planner.lanes, onCreate]);

  const onDuplicate = useCallback((a: RotationAssignment) => {
    setClipboard([a]);
    const days = differenceInCalendarDays(fromISO(a.end_date), fromISO(a.start_date)) + 1;
    void applyInserts([{
      company_id: a.company_id, lane_id: a.lane_id, vessel_id: a.vessel_id,
      crew_user_id: a.crew_user_id, crew_name_raw: a.crew_name_raw,
      start_date: toISO(addDays(fromISO(a.start_date), days)),
      end_date: toISO(addDays(fromISO(a.end_date), days)),
      label: a.label, rotation_type: a.rotation_type, status: 'draft',
      colour: a.colour, notes: a.notes,
    }], 'Duplicate block');
  }, [applyInserts]);

  const onSplit = useCallback((a: RotationAssignment) => {
    const total = differenceInCalendarDays(fromISO(a.end_date), fromISO(a.start_date));
    if (total < 1) { toast({ title: 'Too short to split' }); return; }
    const mid = addDays(fromISO(a.start_date), Math.floor(total / 2));
    void applyUpdates([{ id: a.id, end_date: toISO(mid) }], 'Split block');
    void applyInserts([{
      company_id: a.company_id, lane_id: a.lane_id, vessel_id: a.vessel_id,
      crew_user_id: a.crew_user_id, crew_name_raw: a.crew_name_raw,
      start_date: toISO(addDays(mid, 1)), end_date: a.end_date,
      label: a.label, rotation_type: a.rotation_type, status: 'draft',
      colour: a.colour, notes: a.notes,
    }], 'Split block (second half)');
  }, [applyUpdates, applyInserts]);

  const onApplyResolution = useCallback((res: ConflictResolution) => {
    if (res.deletes?.length) void applyDeletes(res.deletes, res.label);
    if (res.updates.length) void applyUpdates(res.updates, res.label);
  }, [applyDeletes, applyUpdates]);

  // ---- keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? void onRedo() : void onUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); void onRedo(); return; }
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); onCopy(); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); onPaste(); return; }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(orderedVisible.map((a) => a.id)));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedIds.size) return;
        e.preventDefault();
        onDeleteSelection();
        return;
      }
      if (e.key === 'Escape') { clearSelection(); setDetailId(undefined); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUndo, onRedo, onCopy, onPaste, onDeleteSelection, clearSelection, orderedVisible, selectedIds]);

  const onExport = useCallback(() => {
    exportPlannerToXLSX({
      assignments: visibleAssignments, locations: planner.locations,
      vesselName, crewName, laneName,
    });
  }, [visibleAssignments, planner.locations, vesselName, crewName, laneName]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(filters.vesselIds.length ? filters.vesselIds.map(vesselName).join(', ') : 'All vessels');
    if (filters.search) parts.push(`search “${filters.search}”`);
    if (filters.conflictsOnly) parts.push('conflicts only');
    if (filters.departments.length) parts.push(`departments: ${filters.departments.join(', ')}`);
    if (filters.rotationTypes.length) parts.push(`types: ${filters.rotationTypes.join(', ')}`);
    if (filters.statuses.length) parts.push(`status: ${filters.statuses.join(', ')}`);
    return parts.join(' · ');
  }, [filters, vesselName]);

  const onExportPdf = useCallback(() => {
    if (!visibleAssignments.length && !planner.locations.length) {
      toast({ title: 'Nothing to export', description: 'No rotations match the current view.' });
      return;
    }
    try {
      exportPlannerToPDF({
        assignments: visibleAssignments,
        locations: planner.locations,
        lanes: planner.lanes,
        viewStart, viewEnd, zoom,
        vesselName, crewName,
        filterSummary,
      });
      toast({ title: 'PDF exported', description: 'The timeline view was saved to your downloads.' });
    } catch (e: any) {
      toast({ title: 'PDF export failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    }
  }, [visibleAssignments, planner.locations, planner.lanes, viewStart, viewEnd, zoom, vesselName, crewName, filterSummary]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <Toolbar
          zoom={zoom} setZoom={setZoom}
          viewStart={viewStart} viewEnd={viewEnd}
          onToday={() => setAnchor(new Date())}
          onShift={(d) => setAnchor((a) => addDaysFns(a, d))}
          filters={filters} setFilters={setFilters}
          vessels={vesselsQ.data ?? []}
          conflictCount={conflictItems.length}
          conflictPanelOpen={conflictPanelOpen}
          onToggleConflictPanel={() => setConflictPanelOpen((o) => !o)}
          onImport={() => setImportOpen(true)}
          onExport={onExport}
          onExportPdf={onExportPdf}
          onCreate={onCreateBlank}
          canEdit={canEdit}
          selectionCount={selectedIds.size}
          clipboardCount={clipboard.length}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          undoLabel={history.undoLabel}
          redoLabel={history.redoLabel}
          onUndo={onUndo}
          onRedo={onRedo}
          onCopy={onCopy}
          onPaste={onPaste}
          onDeleteSelection={onDeleteSelection}
          onClearSelection={clearSelection}
        />

        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col flex-1 min-w-0">
            {/* Sticky top: timeline header + location lane */}
            <div className="flex border-b">
              <div style={{ width: LEFT_COL_WIDTH }} className="border-r bg-card p-2 text-xs font-medium">
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
                {canEdit && <button className="text-primary underline" onClick={() => setImportOpen(true)}>Import XLSX</button>}
              </div>
            ) : (
              <PlannerGrid
                lanes={planner.lanes}
                assignments={visibleAssignments}
                leave={planner.leave}
                conflictsById={conflictsById}
                viewStart={viewStart} viewEnd={viewEnd} zoom={zoom} totalWidth={totalWidth}
                vesselName={vesselName} crewName={crewName}
                onSelectAssignment={onSelectAssignment}
                onMarqueeSelect={onMarqueeSelect}
                onClearSelection={clearSelection}
                onMoveBlocks={onMoveBlocks}
                onCreateAssignment={onCreate}
                onHoverTarget={(t) => { hoverRef.current = t; }}
                selectedIds={selectedIds}
                canEdit={canEdit}
              />
            )}
          </div>

          {conflictPanelOpen && (
            <ConflictPanel
              items={conflictItems}
              assignmentsById={assignmentsById}
              crewName={crewName}
              laneName={laneName}
              canEdit={canEdit}
              onApply={onApplyResolution}
              onOpenBlock={(id) => { setDetailId(id); setSelectedIds(new Set([id])); }}
              onClose={() => setConflictPanelOpen(false)}
            />
          )}
        </div>

        <BlockDetailDrawer
          assignment={detail}
          open={!!detail}
          onClose={() => setDetailId(undefined)}
          onSave={(a) => { const { id, ...rest } = a as any; if (id) void applyUpdates([{ id, ...rest }], 'Edit block'); }}
          onDelete={(id) => void applyDeletes([id], 'Delete block')}
          onDuplicate={onDuplicate}
          onSplit={onSplit}
          lanes={planner.lanes}
          vessels={vesselsQ.data ?? []}
          crew={crewQ.data ?? []}
          conflicts={detail ? conflictsById.get(detail.id) : undefined}
          canEdit={canEdit}
        />

        <ImportDialog
          open={importOpen && canEdit}
          onClose={() => setImportOpen(false)}
          vessels={vesselsQ.data ?? []}
          crew={crewQ.data ?? []}
          lanes={planner.lanes}
          onComplete={() => { history.clear(); }}
        />
      </div>
    </DashboardLayout>
  );
};

export default RotationPlannerPage;
