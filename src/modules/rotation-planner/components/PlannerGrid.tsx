import React, { useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PlannerLane, RotationAssignment, ConflictInfo, ZoomLevel, LeaveOverlayEntry } from '../types';
import { ZOOM_PX_PER_DAY, LANE_HEIGHT, LEFT_COL_WIDTH } from '../constants';
import { addDays, differenceInCalendarDays, fromISO, toISO, dateAtX } from '../lib/dateMath';
import RotationBlock from './RotationBlock';
import { LEAVE_CODE_TO_TYPE, ROTATION_TYPE_COLOURS } from '../constants';

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
  onSelectAssignment: (a: RotationAssignment) => void;
  onUpdateAssignment: (a: RotationAssignment, changes: Partial<RotationAssignment>) => void;
  onCreateAssignment: (laneId: string, startDate: string, endDate: string) => void;
  selectedId?: string;
}

const PlannerGrid: React.FC<Props> = ({
  lanes, assignments, leave, conflictsById,
  viewStart, zoom, totalWidth,
  vesselName, crewName,
  onSelectAssignment, onUpdateAssignment, onCreateAssignment, selectedId,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const px = ZOOM_PX_PER_DAY[zoom];

  const virt = useVirtualizer({
    count: lanes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LANE_HEIGHT,
    overscan: 8,
  });

  // Group assignments by lane_id
  const assignmentsByLane = React.useMemo(() => {
    const m = new Map<string, RotationAssignment[]>();
    for (const a of assignments) {
      if (!a.lane_id) continue;
      const arr = m.get(a.lane_id) ?? [];
      arr.push(a);
      m.set(a.lane_id, arr);
    }
    return m;
  }, [assignments]);

  // Group leave by crew_id for quick lookup
  const leaveByCrew = React.useMemo(() => {
    const m = new Map<string, LeaveOverlayEntry[]>();
    for (const l of leave) {
      const arr = m.get(l.crew_id) ?? [];
      arr.push(l);
      m.set(l.crew_id, arr);
    }
    return m;
  }, [leave]);

  // Pointer drag/resize state
  const dragRef = useRef<null | {
    type: 'move' | 'resize-left' | 'resize-right' | 'create';
    assignment?: RotationAssignment;
    startX: number;
    origStart: string;
    origEnd: string;
    laneId?: string;
    previewLeft?: number;
    previewWidth?: number;
  }>(null);
  const [previewBox, setPreviewBox] = useState<{ left: number; top: number; width: number } | null>(null);

  const onPointerDownMove = useCallback((e: React.PointerEvent, a: RotationAssignment) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { type: 'move', assignment: a, startX: e.clientX, origStart: a.start_date, origEnd: a.end_date };
  }, []);

  const onPointerDownResize = useCallback((e: React.PointerEvent, a: RotationAssignment, side: 'left' | 'right') => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { type: side === 'left' ? 'resize-left' : 'resize-right', assignment: a, startX: e.clientX, origStart: a.start_date, origEnd: a.end_date };
  }, []);

  const onGridPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !d.assignment) return;
    const dx = e.clientX - d.startX;
    const days = Math.round(dx / px);
    const a = d.assignment;
    const sd = fromISO(a.start_date);
    const ed = fromISO(a.end_date);
    let newStart = sd, newEnd = ed;
    if (d.type === 'move') { newStart = addDays(sd, days); newEnd = addDays(ed, days); }
    if (d.type === 'resize-left') { newStart = addDays(sd, days); if (newStart > newEnd) newStart = newEnd; }
    if (d.type === 'resize-right') { newEnd = addDays(ed, days); if (newEnd < newStart) newEnd = newStart; }
    const left = differenceInCalendarDays(newStart, viewStart) * px;
    const width = Math.max(8, (differenceInCalendarDays(newEnd, newStart) + 1) * px);
    setPreviewBox({ left, top: 0, width });
  }, [px, viewStart]);

  const onGridPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setPreviewBox(null);
    if (!d || !d.assignment) return;
    const dx = e.clientX - d.startX;
    const days = Math.round(dx / px);
    if (days === 0) return;
    const a = d.assignment;
    const sd = fromISO(a.start_date);
    const ed = fromISO(a.end_date);
    if (d.type === 'move') {
      onUpdateAssignment(a, { start_date: toISO(addDays(sd, days)), end_date: toISO(addDays(ed, days)) });
    } else if (d.type === 'resize-left') {
      const ns = addDays(sd, days);
      onUpdateAssignment(a, { start_date: toISO(ns > ed ? ed : ns) });
    } else if (d.type === 'resize-right') {
      const ne = addDays(ed, days);
      onUpdateAssignment(a, { end_date: toISO(ne < sd ? sd : ne) });
    }
  }, [px, onUpdateAssignment]);

  const onLaneDoubleClick = useCallback((laneId: string, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const date = dateAtX(viewStart, x, zoom);
    onCreateAssignment(laneId, toISO(date), toISO(addDays(date, 6)));
  }, [viewStart, zoom, onCreateAssignment]);

  // Mouse-wheel horizontal scrolling for the timeline.
  // - Plain wheel (deltaY): scroll horizontally by ~1 week per tick.
  // - Shift + wheel: jump by a whole month.
  // - Trackpads that already emit deltaX (or hold ctrl for zoom) are left alone.
  const onWheelTimeline = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = parentRef.current;
    if (!el) return;
    if (e.ctrlKey) return; // let zoom-pinch / browser zoom pass through
    // If the gesture is primarily horizontal already, let native handle it.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    const step = e.shiftKey ? px * 30 : px * 7;
    el.scrollLeft += dir * step;
    e.preventDefault();
  }, [px]);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left pinned column */}
      <div className="border-r bg-card" style={{ width: LEFT_COL_WIDTH }}>
        <div
          ref={null}
          style={{ height: virt.getTotalSize(), position: 'relative' }}
        >
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
        className="flex-1 overflow-auto relative"
        onPointerMove={onGridPointerMove}
        onPointerUp={onGridPointerUp}
        onWheel={onWheelTimeline}
      >
        <div style={{ width: totalWidth, height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const lane = lanes[vi.index];
            const laneAssignments = assignmentsByLane.get(lane.id) ?? [];
            const crewLeave = lane && (lane as any) ? [] as LeaveOverlayEntry[] : [];
            return (
              <div
                key={lane.id}
                onDoubleClick={(e) => onLaneDoubleClick(lane.id, e)}
                className="absolute left-0 border-b group hover:bg-muted/30"
                style={{ top: vi.start, height: vi.size, width: totalWidth }}
              >
                {/* Leave overlay markers for assigned crew */}
                {laneAssignments[0]?.crew_user_id && (leaveByCrew.get(laneAssignments[0].crew_user_id!) ?? []).map((l) => {
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
                {laneAssignments.map((a) => (
                  <RotationBlock
                    key={a.id}
                    assignment={a}
                    viewStart={viewStart}
                    zoom={zoom}
                    top={0}
                    conflicts={conflictsById.get(a.id)}
                    selected={selectedId === a.id}
                    onClick={onSelectAssignment}
                    onPointerDownMove={onPointerDownMove}
                    onPointerDownResize={onPointerDownResize}
                  />
                ))}
              </div>
            );
          })}
          {previewBox && (
            <div
              className="absolute pointer-events-none border-2 border-primary/60 bg-primary/10 rounded-md"
              style={{ left: previewBox.left, top: 4, width: previewBox.width, height: LANE_HEIGHT - 8 }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PlannerGrid;