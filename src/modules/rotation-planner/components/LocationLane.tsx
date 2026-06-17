import React from 'react';
import type { VesselLocation, ZoomLevel } from '../types';
import type { VesselLocation as VL } from '../types';
import { ZOOM_PX_PER_DAY, LOCATION_LANE_HEIGHT } from '../constants';
import { differenceInCalendarDays, fromISO } from '../lib/dateMath';

interface Props {
  viewStart: Date; viewEnd: Date; zoom: ZoomLevel; totalWidth: number;
  locations: VesselLocation[];
  vesselName?: (id: string) => string;
  onClick?: (loc: VesselLocation) => void;
}

const statusColour: Record<string, string> = {
  confirmed: 'bg-sky-600 text-white',
  estimated: 'bg-sky-400 text-white',
  tbc: 'bg-muted text-foreground border border-dashed',
};

const LocationLane: React.FC<Props> = ({ viewStart, zoom, totalWidth, locations, onClick }) => {
  const px = ZOOM_PX_PER_DAY[zoom];
  return (
    <div className="relative border-b bg-background" style={{ width: totalWidth, height: LOCATION_LANE_HEIGHT }}>
      {locations.map((loc) => {
        const start = fromISO(loc.start_date);
        const end = fromISO(loc.end_date);
        const offset = Math.max(0, differenceInCalendarDays(start, viewStart)) * px;
        const width = Math.max(20, (differenceInCalendarDays(end, start) + 1) * px);
        return (
          <button
            key={loc.id}
            type="button"
            onClick={() => onClick?.(loc)}
            title={`${loc.location_name} (${loc.location_status})`}
            className={`absolute top-1 bottom-1 rounded px-2 text-xs truncate ${statusColour[loc.location_status] ?? statusColour.confirmed}`}
            style={{ left: offset, width }}
          >
            {loc.location_name}
          </button>
        );
      })}
    </div>
  );
};

export default React.memo(LocationLane);