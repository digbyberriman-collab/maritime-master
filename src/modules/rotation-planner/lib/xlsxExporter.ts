import * as XLSX from 'xlsx';
import type { RotationAssignment, VesselLocation } from '../types';
import { ROTATION_TYPE_LABELS } from '../constants';

export function exportPlannerToXLSX(opts: {
  assignments: RotationAssignment[];
  locations: VesselLocation[];
  vesselName: (id: string | null) => string;
  crewName: (id: string | null) => string;
  laneName: (id: string | null) => string;
}) {
  const { assignments, locations, vesselName, crewName, laneName } = opts;
  const wb = XLSX.utils.book_new();

  const aRows = assignments.map((a) => ({
    Vessel: vesselName(a.vessel_id),
    Lane: laneName(a.lane_id),
    Crew: crewName(a.crew_user_id) || a.crew_name_raw || '',
    Start: a.start_date,
    End: a.end_date,
    Type: ROTATION_TYPE_LABELS[a.rotation_type],
    Status: a.status,
    Label: a.label ?? '',
    Notes: a.notes ?? '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aRows), 'Rotations');

  const lRows = locations.map((l) => ({
    Vessel: vesselName(l.vessel_id),
    Location: l.location_name,
    Status: l.location_status,
    Start: l.start_date,
    End: l.end_date,
    Notes: l.notes ?? '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lRows), 'Vessel Locations');

  XLSX.writeFile(wb, `fleet-rotation-planner_${new Date().toISOString().slice(0, 10)}.xlsx`);
}