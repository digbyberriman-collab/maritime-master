import React from 'react';
import type { RotationAssignment, ConflictInfo, ZoomLevel } from '../types';
import { ROTATION_TYPE_COLOURS, ROTATION_TYPE_LABELS, ZOOM_PX_PER_DAY, LANE_HEIGHT } from '../constants';
import { differenceInCalendarDays, fromISO } from '../lib/dateMath';
import { cn } from '@/lib/utils';

interface Props {
  assignment: RotationAssignment;
  viewStart: Date;
  zoom: ZoomLevel;
  top: number;
  conflicts?: ConflictInfo[];
  selected?: boolean;
  onPointerDownMove: (e: React.PointerEvent, a: RotationAssignment) => void;
  onPointerDownResize: (e: React.PointerEvent, a: RotationAssignment, side: 'left' | 'right') => void;
  onClick: (a: RotationAssignment, e: React.MouseEvent) => void;
}

const RotationBlock: React.FC<Props> = ({
  assignment, viewStart, zoom, top, conflicts, selected,
  onPointerDownMove, onPointerDownResize, onClick,
}) => {
  const px = ZOOM_PX_PER_DAY[zoom];
  const start = fromISO(assignment.start_date);
  const end = fromISO(assignment.end_date);
  const left = differenceInCalendarDays(start, viewStart) * px;
  const width = Math.max(8, (differenceInCalendarDays(end, start) + 1) * px);
  const baseColour = assignment.colour || ROTATION_TYPE_COLOURS[assignment.rotation_type];
  const hasHard = conflicts?.some((c) => c.severity === 'hard');
  const hasSoft = conflicts?.some((c) => c.severity === 'soft');
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onClick(assignment, e)}
      onPointerDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.resize) return;
        onPointerDownMove(e, assignment);
      }}
      title={`${ROTATION_TYPE_LABELS[assignment.rotation_type]} • ${assignment.label ?? ''}\n${assignment.start_date} → ${assignment.end_date}${conflicts?.length ? '\n⚠ ' + conflicts.map(c => c.reason).join('; ') : ''}`}
      className={cn(
        'absolute rounded-md text-[11px] text-white truncate cursor-grab active:cursor-grabbing select-none shadow-sm flex items-center px-1.5',
        selected && 'ring-2 ring-primary ring-offset-1',
        hasHard && 'outline outline-2 outline-destructive',
        !hasHard && hasSoft && 'outline outline-2 outline-amber-500',
      )}
      style={{
        left, width, top: top + 4, height: LANE_HEIGHT - 8,
        background: baseColour,
        opacity: assignment.status === 'draft' ? 0.7 : 1,
      }}
    >
      {/* Left resize handle */}
      <div
        data-resize="left"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDownResize(e, assignment, 'left'); }}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize"
      />
      <span className="truncate">{assignment.label || ROTATION_TYPE_LABELS[assignment.rotation_type]}</span>
      {/* Right resize handle */}
      <div
        data-resize="right"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDownResize(e, assignment, 'right'); }}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize"
      />
    </div>
  );
};

export default React.memo(RotationBlock);