// Drill Categories
export const DRILL_CATEGORIES = [
  { value: 'SOLAS_Required', label: 'SOLAS Required' },
  { value: 'Company_Required', label: 'Company Required' },
  { value: 'Voluntary', label: 'Voluntary' },
] as const;

// Drill Statuses
export const DRILL_STATUSES = [
  { value: 'Scheduled', label: 'Scheduled', color: 'bg-blue-100 text-blue-800' },
  { value: 'In_Progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'Completed', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'Cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  { value: 'Postponed', label: 'Postponed', color: 'bg-orange-100 text-orange-800' },
] as const;

// Weather Conditions
export const WEATHER_CONDITIONS = [
  { value: 'Fair', label: 'Fair' },
  { value: 'Moderate_Sea', label: 'Moderate Sea' },
  { value: 'Heavy_Weather', label: 'Heavy Weather' },
  { value: 'At_Port', label: 'At Port' },
  { value: 'At_Anchor', label: 'At Anchor' },
] as const;

// Deficiency Severities
export const DEFICIENCY_SEVERITIES = [
  { value: 'Critical', label: 'Critical', color: 'bg-red-100 text-red-800' },
  { value: 'Serious', label: 'Serious', color: 'bg-orange-100 text-orange-800' },
  { value: 'Minor', label: 'Minor', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'Observation', label: 'Observation', color: 'bg-blue-100 text-blue-800' },
] as const;

// Equipment Statuses
export const EQUIPMENT_STATUSES = [
  { value: 'Satisfactory', label: 'Satisfactory' },
  { value: 'Defective', label: 'Defective' },
  { value: 'Not_Available', label: 'Not Available' },
] as const;

// Emergency Contact Categories
export const CONTACT_CATEGORIES = [
  { value: 'Coast_Guard', label: 'Coast Guard' },
  { value: 'Flag_State', label: 'Flag State' },
  { value: 'Class_Society', label: 'Classification Society' },
  { value: 'P_And_I', label: 'P&I Club' },
  { value: 'Medical', label: 'Medical' },
  { value: 'SAR', label: 'Search & Rescue' },
  { value: 'Port_Authority', label: 'Port Authority' },
  { value: 'Company', label: 'Company' },
  { value: 'Environmental', label: 'Environmental' },
  { value: 'Other', label: 'Other' },
] as const;

// Emergency Types
export const EMERGENCY_TYPES = [
  { value: 'Fire', label: 'Fire' },
  { value: 'Flooding', label: 'Flooding' },
  { value: 'Man_Overboard', label: 'Man Overboard' },
  { value: 'Abandon_Ship', label: 'Abandon Ship' },
  { value: 'Collision', label: 'Collision' },
  { value: 'Grounding', label: 'Grounding' },
  { value: 'Pollution', label: 'Pollution' },
  { value: 'Piracy', label: 'Piracy/Armed Robbery' },
  { value: 'Medical', label: 'Medical Emergency' },
  { value: 'Enclosed_Space', label: 'Enclosed Space Emergency' },
] as const;

// Default objectives by drill type
export const DEFAULT_OBJECTIVES: Record<string, string[]> = {
  'Fire Drill': [
    'All crew muster at assigned stations within 5 minutes',
    'Fire team deploys with correct PPE',
    'Fire boundary established and maintained',
    'Communication maintained throughout drill',
    'Fire equipment operated correctly',
  ],
  'Abandon Ship Drill': [
    'All crew muster at lifeboat stations within required time',
    'Correct donning of lifejackets demonstrated',
    'Lifeboat equipment checked and operational',
    'Launch procedures understood by all crew',
    'Head count completed accurately',
  ],
  'Man Overboard Drill': [
    'MOB alarm raised immediately',
    'Williamson turn or other recovery maneuver executed correctly',
    'MOB marker deployed',
    'Rescue boat prepared for launch',
    'MOB dummy recovered within acceptable time',
  ],
  'Collision Drill': [
    'Watertight doors closed immediately',
    'Damage assessment conducted',
    'Emergency steering tested',
    'Communication with bridge maintained',
    'Collision mat/emergency equipment prepared',
  ],
  'Pollution Response Drill': [
    'SOPEP equipment deployed correctly',
    'Oil spill containment procedures followed',
    'Reporting chain activated',
    'Shore notification simulated',
    'Cleanup equipment used correctly',
  ],
};

// Default equipment by drill type
export const DEFAULT_EQUIPMENT: Record<string, string[]> = {
  'Fire Drill': [
    'Fire extinguishers',
    'SCBA (Self-Contained Breathing Apparatus)',
    'Fire hoses',
    'Fire blankets',
    'Fireman outfit',
    'Emergency fire pump',
  ],
  'Abandon Ship Drill': [
    'Lifeboats',
    'Life rafts',
    'EPIRB',
    'SART',
    'Lifejackets',
    'Immersion suits',
    'Pyrotechnics',
  ],
  'Man Overboard Drill': [
    'Life rings',
    'MOB marker/pole',
    'Rescue boat',
    'Throwing lines',
    'MOB recovery system',
  ],
  'Pollution Response Drill': [
    'Oil booms',
    'Absorbent materials',
    'Portable pumps',
    'PPE for oil response',
    'SOPEP equipment',
  ],
};

// Station assignments by rank for different drill types
export const STATION_ASSIGNMENTS: Record<string, Record<string, string>> = {
  'Fire Drill': {
    master: 'Command - Bridge',
    chief_officer: 'Fire Team Leader',
    chief_engineer: 'Engine Room Fire Response',
    crew: 'Fire Team Member',
  },
  'Abandon Ship Drill': {
    master: 'Command - Overall',
    chief_officer: 'Lifeboat 1 - In Charge',
    chief_engineer: 'Lifeboat 2 - In Charge',
    crew: 'Assigned Lifeboat Station',
  },
  'Man Overboard Drill': {
    master: 'Command - Bridge',
    chief_officer: 'Rescue Boat Team Leader',
    chief_engineer: 'Engine Control',
    crew: 'Lookout / Rescue Team',
  },
};

// Drill type colors for calendar
export const DRILL_TYPE_COLORS: Record<string, string> = {
  'Fire Drill': 'bg-red-500',
  'Abandon Ship Drill': 'bg-orange-500',
  'Man Overboard Drill': 'bg-blue-500',
  'Collision Drill': 'bg-yellow-500',
  'Grounding Drill': 'bg-amber-600',
  'Flooding Drill': 'bg-cyan-500',
  'Pollution Response Drill': 'bg-green-500',
  'Piracy/Armed Robbery Drill': 'bg-purple-500',
  'Medical Emergency Drill': 'bg-pink-500',
  'Enclosed Space Entry Drill': 'bg-gray-500',
  'Search and Rescue Drill': 'bg-indigo-500',
  'Steering Gear Failure Drill': 'bg-teal-500',
};

// Get color for a drill type
export function getDrillTypeColor(drillTypeName: string): string {
  return DRILL_TYPE_COLORS[drillTypeName] || 'bg-gray-500';
}

// Generate drill number
export function generateDrillNumber(existingCount: number): string {
  const year = new Date().getFullYear();
  const sequence = String(existingCount + 1).padStart(3, '0');
  return `DRILL-${year}-${sequence}`;
}

// Calculate compliance status
export function calculateComplianceStatus(
  lastDrillDate: Date | null,
  frequencyDays: number
): { status: 'on_schedule' | 'due_soon' | 'overdue'; daysUntilDue: number; nextDueDate: Date } {
  const today = new Date();
  
  if (!lastDrillDate) {
    return {
      status: 'overdue',
      daysUntilDue: -999,
      nextDueDate: today,
    };
  }

  const nextDueDate = new Date(lastDrillDate);
  nextDueDate.setDate(nextDueDate.getDate() + frequencyDays);
  
  const daysUntilDue = Math.ceil((nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) {
    return { status: 'overdue', daysUntilDue, nextDueDate };
  } else if (daysUntilDue <= 7) {
    return { status: 'due_soon', daysUntilDue, nextDueDate };
  } else {
    return { status: 'on_schedule', daysUntilDue, nextDueDate };
  }
}
