import type { FrpRotationType, FrpAssignmentStatus, ZoomLevel } from './types';

export const ROTATION_TYPE_COLOURS: Record<FrpRotationType, string> = {
  onboard: '#16a34a',
  leave: '#3b82f6',
  travel: '#f59e0b',
  standby: '#8b5cf6',
  yard: '#0ea5e9',
  wfh: '#14b8a6',
  temp_cover: '#ec4899',
  training: '#84cc16',
  no_crew: '#9ca3af',
  tbc: '#d1d5db',
};

export const ROTATION_TYPE_LABELS: Record<FrpRotationType, string> = {
  onboard: 'Onboard',
  leave: 'Leave',
  travel: 'Travel',
  standby: 'Standby',
  yard: 'Yard',
  wfh: 'WFH',
  temp_cover: 'Temp Cover',
  training: 'Training',
  no_crew: 'No Crew',
  tbc: 'TBC',
};

export const STATUS_LABELS: Record<FrpAssignmentStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  pending_approval: 'Pending',
  conflict: 'Conflict',
  complete: 'Complete',
};

// Pixels per day for each zoom level
export const ZOOM_PX_PER_DAY: Record<ZoomLevel, number> = {
  day: 48,
  week: 22,
  fortnight: 14,
  month: 8,
  quarter: 3.5,
  year: 1.5,
};

export const ZOOM_ORDER: ZoomLevel[] = ['day', 'week', 'fortnight', 'month', 'quarter', 'year'];

export const LANE_HEIGHT = 36;
export const HEADER_HEIGHT = 64;
export const LOCATION_LANE_HEIGHT = 32;
export const LEFT_COL_WIDTH = 320;

// Maps existing leave status codes from crew_leave_entries to rotation types
export const LEAVE_CODE_TO_TYPE: Record<string, FrpRotationType> = {
  F: 'onboard',  // Free / on board
  Q: 'onboard',
  L: 'leave',
  T: 'travel',
  CD: 'travel',
  M: 'leave',    // Medical
  PPL: 'leave',
  CL: 'leave',
  N: 'no_crew',
  U: 'leave',
  R: 'standby',
};