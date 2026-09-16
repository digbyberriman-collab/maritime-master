import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PlannerLane, RotationAssignment, ConflictInfo, ZoomLevel, LeaveOverlayEntry } from '../types';
import { ZOOM_PX_PER_DAY, LANE_HEIGHT, LEFT_COL_WIDTH } from '../constants';
import { addDays, differenceInCalendarDays, fromISO, toISO, dateAtX } from '../lib/dateMath';
import RotationBlock from './RotationBlock';
import { LEAVE_CODE_TO_TYPE, ROTATION_TYPE_COLOURS } from '../constants';

export interface BlockUpdate { id: string; start_date: string; end_date: string }

interface Props {
  lanes: PlannerLane[];
  assignments: RotationAssignment[];
  leave: LeaveOverlayEntry[];
  conflictsById: Map<string, ConflictInfo[]>;
  viewStart: Date;
  viewEnd: Date;
  zoom: ZoomLevel;
  totalWidth: number;
  vesselName: (id: string | null) => string;
  crewName: (id: string | null) => string;
  /** Click on a block. `mode` reflects modifier keys for multi-select. */
  onSelectAssignment: (a: RotationAssignment, mode: 'single' | 'toggle' | 'range') => void;
  /** Marquee (rubber-band) selection result. */
  onMarqueeSelect: (ids: string[], additive: boolean) => void;
  onClearSelection: () => void;
  /** Batch date move/resize, so dragging a multi-selection is one undo step. */
  onMoveBlocks: (updates: BlockUpdate[], label: string) => void;
  onCreateAssignment: (laneId: string, startDate: string, endDate: string) => void;
  /** Reports the lane/date under the cursor — used as the paste target. */
  onHoverTarget?: (target: { laneId: string; date: string } | null) => void;
  selectedIds: Set<string>;
  canEdit?: boolean;
}

const PlannerGrid: React.FC<Props> = ({
  lanes, assignments, leave, conflictsById,
  viewStart, zoom, totalWidth,
  vesselName, crewName,
  onSelectAssignment, onMarqueeSelect, onClearSelection, onMoveBlocks, onCreateAssignment,
  onHoverTarget, selectedIds, canEdit = true,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const px = ZOOM_PX_PER_DAY[zoom];

  const virt = useVirtualizer({
    count: lanes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LANE_HEIGHT,
    overscan: 8,
  });

  const laneIndexById = useMemo(() => {
    const m = new Map<string, number>();
    lanes.forEach((l, i) => m.set(l.id, i));
    return m;
  }, [lanes]);

  /**
   * Group by lane and pack overlapping blocks into sub-rows, so a double
   * booking shows as two stacked bars instead of one hiding the other.
   */
  const assignmentsByLane = useMemo(() => {
    const grouped = new Map<string, RotationAssignment[]>();
    for (const a of assignments) {
      if (!a.lane_id) continue;
      const arr = grouped.get(a.lane_id) ?? [];
      arr.push(a);
      grouped.set(a.lane_id, arr);
    }
    const m = new Map<string, { rows: { a: RotationAssignment; row: number }[]; rowCount: number }>();
    for (const [laneId, list] of grouped) {
      const sorted = [...list].sort((x, y) => x.start_date.localeCompare(y.start_date));
      const rowEnds: string[] = [];
      const rows: { a: RotationAssignment; row: number }[] = [];
      for (const a of sorted) {
        let row = rowEnds.findIndex((end) => end < a.start_date);
        if (row === -1) { row = rowEnds.length; rowEnds.push(a.end_date); }
        else rowEnds[row] = a.end_date;
        rows.push({ a, row });
      }
      m.set(laneId, { rows, rowCount: Math.max(1, rowEnds.length) });
    }
    return m;
  }, [assignments]);

  const byId = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);

  const leaveByCrew = useMemo(() => {
    const m = new Map<string, LeaveOverlayEntry[]>();
    for (const l of leave) {
      const arr = m.get(l.crew_id) ?? [];
      arr.push(l);
      m.set(l.crew_id, arr);
    }
    return m;
  }, [leave]);

  // ---- drag (move / resize) -------------------------------------------------
  const dragRef = useRef<null | {
    type: 'move' | 'resize-left' | 'resize-right';
    assignment: RotationAssignment;
    ids: string[];
    startX: number;
  }>(null);
  const [dragDays, setDragDays] = useState<number | null>(null);
  const [dragKind, setDragKind] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);

  const draggingIds = dragRef.current?.ids ?? [];

  const beginDrag = useCallback((
    e: React.PointerEvent,
    a: RotationAssignment,
    type: 'move' | 'resize-left' | 'resize-right',
  ) => {
    if (!canEdit) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    // Dragging a block inside a multi-selection drags the whole selection.
    const ids = type === 'move' && selectedIds.has(a.id) && selectedIds.size > 1
      ? [...selectedIds].filter((id) => byId.has(id))
      : [a.id];
    dragRef.current = { type, assignment: a, ids, startX: e.clientX };
    setDragKind(type);
    setDragDays(0);
  }, [canEdit, selectedIds, byId]);

  const onPointerDownMove = useCallback((e: React.PointerEvent, a: RotationAssignment) => beginDrag(e, a, 'move'), [beginDrag]);
  const onPointerDownResize = useCallback(
    (e: React.PointerEvent, a: RotationAssignment, side: 'left' | 'right') =>
      beginDrag(e, a, side === 'left' ? 'resize-left' : 'resize-right'),
    [beginDrag]
  );

  // ---- marquee -------------------------------------------------------------
  const marqueeRef = useRef<null | { x0: number; y0: number; additive: boolean; moved: boolean }>(null);
  const [marquee, setMarquee] = useState<null | { x: number; y: number; w: number; h: number }>(null);

  const contentPoint = (e: React.PointerEvent | React.MouseEvent) => {
    const el = parentRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left + el.scrollLeft, y: e.clientY - rect.top + el.scrollTop };
  };

  const onBackgroundPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-block="1"]')) return; // block handles its own drag
    const p = contentPoint(e);
    marqueeRef.current = { x0: p.x, y0: p.y, additive: e.shiftKey || e.metaKey || e.ctrlKey, moved: false };
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
  }, []);

  // ---- shared pointer handlers --------------------------------------------
  const onGridPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) {
      setDragDays(Math.round((e.clientX - d.startX) / px));
      return;
    }
    const m = marqueeRef.current;
    if (m) {
      const p = contentPoint(e);
      const w = Math.abs(p.x - m.x0), h = Math.abs(p.y - m.y0);
      if (w > 3 || h > 3) m.moved = true;
      setMarquee({ x: Math.min(p.x, m.x0), y: Math.min(p.y, m.y0), w, h });
      return;
    }
    // Track hover target for paste
    if (onHoverTarget) {
      const p = contentPoint(e);
      const laneIdx = Math.floor(p.y / LANE_HEIGHT);
      const lane = lanes[laneIdx];
      if (lane) onHoverTarget({ laneId: lane.id, date: toISO(dateAtX(viewStart, p.x, zoom)) });
      else onHoverTarget(null);
    }
  }, [px, onHoverTarget, lanes, viewStart, zoom]);

  const commitDrag = useCallback((days: number) => {
    const d = dragRef.current;
    if (!d || days === 0) return;
    const updates: BlockUpdate[] = [];
    for (const id of d.ids) {
      const a = byId.get(id);
      if (!a) continue;
      const sd = fromISO(a.start_date), ed = fromISO(a.end_date);
      if (d.type === 'move') {
        updates.push({ id, start_date: toISO(addDays(sd, days)), end_date: toISO(addDays(ed, days)) });
      } else if (d.type === 'resize-left') {
        const ns = addDays(sd, days);
        updates.push({ id, start_date: toISO(ns > ed ? ed : ns), end_date: a.end_date });
      } else {
        const ne = addDays(ed, days);
        updates.push({ id, start_date: a.start_date, end_date: toISO(ne < sd ? sd : ne) });
      }
    }
    if (!updates.length) return;
    const verb = d.type === 'move' ? 'Move' : 'Resize';
    onMoveBlocks(updates, `${verb} ${updates.length} block${updates.length > 1 ? 's' : ''}`);
  }, [byId, onMoveBlocks]);

  const onGridPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      const days = Math.round((e.clientX - dragRef.current.startX) / px);
      commitDrag(days);
      dragRef.current = null;
      setDragDays(null);
      setDragKind(null);
      return;
    }
    const m = marqueeRef.current;
    marqueeRef.current = null;
    const box = marquee;
    setMarquee(null);
    if (!m) return;
    if (!m.moved) {
      if (!m.additive) onClearSelection();
      return;
    }
    if (!box) return;
    const x1 = box.x, x2 = box.x + box.w, y1 = box.y, y2 = box.y + box.h;
    const hits: string[] = [];
    for (const a of assignments) {
      if (!a.lane_id) continue;
      const li = laneIndexById.get(a.lane_id);
      if (li === undefined) continue;
      const top = li * LANE_HEIGHT, bottom = top + LANE_HEIGHT;
      if (bottom < y1 || top > y2) continue;
      const left = differenceInCalendarDays(fromISO(a.start_date), viewStart) * px;
      const right = left + (differenceInCalendarDays(fromISO(a.end_date), fromISO(a.start_date)) + 1) * px;
      if (right < x1 || left > x2) continue;
      hits.push(a.id);
    }
    onMarqueeSelect(hits, m.additive);
  }, [px, commitDrag, marquee, assignments, laneIndexById, viewStart, onMarqueeSelect, onClearSelection]);

  const onLaneDoubleClick = useCallback((laneId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    if ((e.target as HTMLElement).closest('[data-block="1"]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const date = dateAtX(viewStart, x, zoom);
    onCreateAssignment(laneId, toISO(date), toISO(addDays(date, 6)));
  }, [viewStart, zoom, onCreateAssignment, canEdit]);

  // Mouse-wheel horizontal scrolling for the timeline.
  const onWheelTimeline = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = parentRef.current;
    if (!el) return;
    if (e.ctrlKey) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    const step = e.shiftKey ? px * 30 : px * 7;
    el.scrollLeft += dir * step;
    e.preventDefault();
  }, [px]);

  // Keep the pinned lane column vertically in sync with the timeline.
  const onTimelineScroll = useCallback(() => {
    if (leftColRef.current && parentRef.current) {
      leftColRef.current.scrollTop = parentRef.current.scrollTop;
    }
  }, []);

  const ghostFor = (a: RotationAssignment) => {
    if (dragDays === null || !dragKind || !draggingIds.includes(a.id)) return null;
    const sd = fromISO(a.start_date), ed = fromISO(a.end_date);
    let ns = sd, ne = ed;
    if (dragKind === 'move') { ns = addDays(sd, dragDays); ne = addDays(ed, dragDays); }
    if (dragKind === 'resize-left') { ns = addDays(sd, dragDays); if (ns > ne) ns = ne; }
    if (dragKind === 'resize-right') { ne = addDays(ed, dragDays); if (ne < ns) ne = ns; }
    const left = differenceInCalendarDays(ns, viewStart) * px;
    const width = Math.max(6, (differenceInCalendarDays(ne, ns) + 1) * px);
    return { left, width };
  };

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left pinned column */}
      <div ref={leftColRef} className="border-r bg-card overflow-hidden" style={{ width: LEFT_COL_WIDTH }}>
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const lane = lanes[vi.index];
            return (
              <div
                key={lane.id}
                className="absolute left-0 right-0 border-b px-2 py-1 text-xs flex flex-col justify-center"
                style={{ top: vi.start, height: vi.size }}
              >
                <div className="font-medium truncate">{lane.lane_label}</div>
                <div className="text-muted-foreground truncate text-[10px]">
                  {[vesselName(lane.vessel_id), lane.department, lane.position_title].filter(Boolean).join(' • ')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right scrolling timeline */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto relative select-none"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onGridPointerMove}
        onPointerUp={onGridPointerUp}
        onPointerLeave={() => onHoverTarget?.(null)}
        onScroll={onTimelineScroll}
        onWheel={onWheelTimeline}
      >
        <div style={{ width: totalWidth, height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const lane = lanes[vi.index];
            const packed = assignmentsByLane.get(lane.id);
            const laneAssignments = packed?.rows ?? [];
            const rowCount = packed?.rowCount ?? 1;
            const rowHeight = (LANE_HEIGHT - 8) / rowCount;
            return (
              <div
                key={lane.id}
                onDoubleClick={(e) => onLaneDoubleClick(lane.id, e)}
                className="absolute left-0 border-b group hover:bg-muted/30"
                style={{ top: vi.start, height: vi.size, width: totalWidth }}
              >
                {/* Leave overlay markers for assigned crew */}
                {laneAssignments[0]?.a.crew_user_id && (leaveByCrew.get(laneAssignments[0].a.crew_user_id!) ?? []).map((l) => {
                  const dDate = fromISO(l.date);
                  const off = differenceInCalendarDays(dDate, viewStart) * px;
                  if (off < -px || off > totalWidth) return null;
                  const mappedType = LEAVE_CODE_TO_TYPE[l.status_code];
                  const c = mappedType ? ROTATION_TYPE_COLOURS[mappedType] : '#94a3b8';
                  return (
                    <div key={l.id} className="absolute opacity-30 pointer-events-none" title={`Leave: ${l.status_code}`}
                      style={{ left: off, top: 2, width: Math.max(2, px), height: LANE_HEIGHT - 4, background: c }} />
                  );
                })}
                {laneAssignments.map(({ a, row }) => {
                  const ghost = ghostFor(a);
                  const top = row * rowHeight;
                  return (
                    <React.Fragment key={a.id}>
                      <RotationBlock
                        assignment={a}
                        viewStart={viewStart}
                        zoom={zoom}
                        top={top}
                        height={rowHeight - 2}
                        conflicts={conflictsById.get(a.id)}
                        selected={selectedIds.has(a.id)}
                        crewName={crewName(a.crew_user_id)}
                        onClick={onSelectAssignment}
                        onPointerDownMove={onPointerDownMove}
                        onPointerDownResize={onPointerDownResize}
                      />
                      {ghost && (
                        <div
                          className="absolute pointer-events-none rounded-md border-2 border-primary/70 bg-primary/10"
                          style={{ left: ghost.left, width: ghost.width, top: top + 4, height: rowHeight - 2 }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })}

          {marquee && (marquee.w > 3 || marquee.h > 3) && (
            <div
              className="absolute pointer-events-none border border-primary bg-primary/10 rounded-sm"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PlannerGrid;
