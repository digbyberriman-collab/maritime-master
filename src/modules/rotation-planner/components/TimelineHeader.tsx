import React from 'react';
import { format, eachDayOfInterval, getISOWeek } from 'date-fns';
import type { ZoomLevel } from '../types';
import { ZOOM_PX_PER_DAY, HEADER_HEIGHT } from '../constants';
import { buildMonthSegments, differenceInCalendarDays } from '../lib/dateMath';

interface Props { viewStart: Date; viewEnd: Date; zoom: ZoomLevel; totalWidth: number }

const TimelineHeader: React.FC<Props> = ({ viewStart, viewEnd, zoom, totalWidth }) => {
  const px = ZOOM_PX_PER_DAY[zoom];
  const months = buildMonthSegments(viewStart, viewEnd);
  const showDays = zoom === 'day' || zoom === 'week';
  const showWeeks = zoom === 'week' || zoom === 'fortnight' || zoom === 'month';

  return (
    <div style={{ width: totalWidth, height: HEADER_HEIGHT }} className="relative border-b bg-card">
      {/* Month row */}
      <div className="flex border-b h-7 text-xs font-semibold">
        {months.map((m) => {
          const offset = differenceInCalendarDays(m.start, viewStart) * px;
          const width = (differenceInCalendarDays(m.end, m.start) + 1) * px;
          return (
            <div
              key={m.label}
              className="absolute top-0 h-7 px-2 flex items-center border-r bg-muted/50 text-foreground/80"
              style={{ left: offset, width }}
              title={m.label}
            >
              {width > 60 ? m.label : format(m.date, 'MMM')}
            </div>
          );
        })}
      </div>
      {/* Day/week sub-row */}
      <div className="relative h-9">
        {showDays && eachDayOfInterval({ start: viewStart, end: viewEnd }).map((d, i) => (
          <div
            key={i}
            className="absolute top-0 h-9 border-r text-[10px] text-center"
            style={{ left: i * px, width: px }}
          >
            <div className="text-muted-foreground">{format(d, 'EEEEE')}</div>
            <div className="font-medium">{format(d, 'd')}</div>
          </div>
        ))}
        {!showDays && showWeeks && eachDayOfInterval({ start: viewStart, end: viewEnd })
          .filter((d) => d.getDay() === 1)
          .map((d) => {
            const offset = differenceInCalendarDays(d, viewStart) * px;
            return (
              <div
                key={d.toISOString()}
                className="absolute top-0 h-9 border-r text-[10px] text-center"
                style={{ left: offset, width: 7 * px }}
              >
                <div className="text-muted-foreground">W{getISOWeek(d)}</div>
                <div className="font-medium">{format(d, 'd MMM')}</div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default React.memo(TimelineHeader);