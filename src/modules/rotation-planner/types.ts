export type FrpRotationType =
  | 'onboard' | 'leave' | 'travel' | 'standby' | 'yard'
  | 'wfh' | 'temp_cover' | 'training' | 'no_crew' | 'tbc';

export type FrpAssignmentStatus =
  | 'draft' | 'confirmed' | 'pending_approval' | 'conflict' | 'complete';

export type FrpLocationStatus = 'confirmed' | 'estimated' | 'tbc';
export type FrpTravelDirection = 'arrival' | 'departure';

export interface PlannerLane {
  id: string;
  company_id: string;
  vessel_id: string | null;
  department: string | null;
  position_title: string | null;
  lane_label: string;
  lane_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RotationAssignment {
  id: string;
  company_id: string;
  vessel_id: string | null;
  lane_id: string | null;
  crew_user_id: string | null;
  crew_name_raw: string | null;
  start_date: string;
  end_date: string;
  label: string | null;
  rotation_type: FrpRotationType;
  status: FrpAssignmentStatus;
  colour: string | null;
  notes: string | null;
  linked_leave_entry_id: string | null;
  linked_travel_movement_id: string | null;
  linked_payroll_transfer_id: string | null;
  source_import_id: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VesselLocation {
  id: string;
  company_id: string;
  vessel_id: string;
  start_date: string;
  end_date: string;
  location_name: string;
  location_status: FrpLocationStatus;
  notes: string | null;
  colour: string | null;
}

export interface TravelMovement {
  id: string;
  company_id: string;
  crew_user_id: string | null;
  crew_name_raw: string | null;
  vessel_id: string | null;
  direction: FrpTravelDirection;
  flight_datetime: string | null;
  flight_number: string | null;
  changeover_date: string | null;
  accommodation: string | null;
  route: string | null;
  flight_supplier: string | null;
  transfer_details: string | null;
  travel_letter_status: string | null;
  process_complete: boolean;
  pdf_link: string | null;
  notes: string | null;
}

export interface PayrollTransfer {
  id: string;
  company_id: string;
  crew_user_id: string | null;
  position_title: string | null;
  from_vessel_id: string | null;
  to_vessel_id: string | null;
  onboarding_transfer_date: string | null;
  payroll_transfer_date: string | null;
  travel_date: string | null;
  status: string | null;
  notes: string | null;
}

export type ZoomLevel = 'day' | 'week' | 'fortnight' | 'month' | 'quarter' | 'year';

export interface PlannerFilters {
  vesselIds: string[];
  departments: string[];
  rotationTypes: FrpRotationType[];
  statuses: FrpAssignmentStatus[];
  search: string;
  conflictsOnly: boolean;
}

export interface ConflictInfo {
  assignmentId: string;
  severity: 'hard' | 'soft';
  reason: string;
}

export interface LeaveOverlayEntry {
  id: string;
  crew_id: string;
  date: string;
  status_code: string;
  vessel_id: string | null;
}