import React from 'react';
import { cn } from '@/lib/utils';
import { STORM_MARK_ARMS, STORM_MARK_EYE, STORM_MARK_GRID, STORM_MARK_STROKE } from './stormMark';

interface StormMarkProps {
  className?: string;
  /** Accessible name. Without one the mark is decorative (aria-hidden). */
  title?: string;
}

/** The STORM cyclone glyph in `currentColor` (see stormMark.ts). */
export function StormMark({ className, title }: StormMarkProps) {
  return (
    <svg
      viewBox={`0 0 ${STORM_MARK_GRID} ${STORM_MARK_GRID}`}
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth={STORM_MARK_STROKE} strokeLinecap="round">
        {STORM_MARK_ARMS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <circle cx={STORM_MARK_EYE.cx} cy={STORM_MARK_EYE.cy} r={STORM_MARK_EYE.r} fill="currentColor" />
    </svg>
  );
}

export default StormMark;
