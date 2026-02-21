// Risk Assessment Status
export const RA_STATUS = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  UNDER_REVIEW: 'Under_Review',
  EXPIRED: 'Expired',
} as const;

export const RA_STATUS_OPTIONS = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Under_Review', label: 'Under Review' },
  { value: 'Expired', label: 'Expired' },
];

// Work Permit Status
export const PERMIT_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
} as const;

export const PERMIT_STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Active', label: 'Active' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Cancelled', label: 'Cancelled' },
];

// Work Permit Types
export const PERMIT_TYPES = {
  HOT_WORK: 'Hot_Work',
  ENCLOSED_SPACE: 'Enclosed_Space',
  WORKING_ALOFT: 'Working_Aloft',
  WORKING_OVERBOARD: 'Working_Overboard',
  ELECTRICAL: 'Electrical',
  OTHER: 'Other',
} as const;

export const PERMIT_TYPE_OPTIONS = [
  { value: 'Hot_Work', label: 'Hot Work' },
  { value: 'Enclosed_Space', label: 'Enclosed Space Entry' },
  { value: 'Working_Aloft', label: 'Working Aloft' },
  { value: 'Working_Overboard', label: 'Working Overboard' },
  { value: 'Electrical', label: 'Electrical Work' },
  { value: 'Other', label: 'Other' },
];

// Task Categories
export const TASK_CATEGORIES = [
  'Deck Operations',
  'Engine Room Work',
  'Hot Work',
  'Enclosed Space Entry',
  'Working Aloft',
  'Working Overboard',
  'Electrical Work',
  'Lifting Operations',
  'Tender Operations',
  'Diving Operations',
  'Cargo Operations',
  'Mooring Operations',
  'Navigation',
  'Other',
];

// Likelihood Levels (1-5)
export const LIKELIHOOD_LEVELS = [
  { value: 1, label: 'Rare', description: 'May occur only in exceptional circumstances' },
  { value: 2, label: 'Unlikely', description: 'Could occur at some time' },
  { value: 3, label: 'Possible', description: 'Might occur at some time' },
  { value: 4, label: 'Likely', description: 'Will probably occur in most circumstances' },
  { value: 5, label: 'Almost Certain', description: 'Expected to occur in most circumstances' },
];

// Severity Levels (1-5)
export const SEVERITY_LEVELS = [
  { value: 1, label: 'Insignificant', description: 'Minor injury, no damage' },
  { value: 2, label: 'Minor', description: 'First aid injury, minor damage' },
  { value: 3, label: 'Moderate', description: 'Medical treatment, moderate damage' },
  { value: 4, label: 'Major', description: 'Lost time injury, significant damage' },
  { value: 5, label: 'Catastrophic', description: 'Fatality, total loss, major pollution' },
];

// Risk Level Classification
export const getRiskLevel = (score: number): { level: string; color: string; bgColor: string } => {
  if (score <= 6) {
    return { level: 'Low', color: 'text-green-700', bgColor: 'bg-green-100' };
  } else if (score <= 12) {
    return { level: 'Medium', color: 'text-yellow-700', bgColor: 'bg-yellow-100' };
  } else {
    return { level: 'High', color: 'text-red-700', bgColor: 'bg-red-100' };
  }
};

// Risk Matrix Cell Colors
export const getRiskMatrixColor = (likelihood: number, severity: number): string => {
  const score = likelihood * severity;
  if (score <= 6) return 'bg-green-500';
  if (score <= 12) return 'bg-yellow-500';
  return 'bg-red-500';
};

// Responsible Roles
export const RESPONSIBLE_ROLES = [
  'Master',
  'Chief Officer',
  'Second Officer',
  'Third Officer',
  'Chief Engineer',
  'Second Engineer',
  'Third Engineer',
  'Fourth Engineer',
  'Bosun',
  'Able Seaman',
  'Ordinary Seaman',
  'Motorman',
  'Cook',
  'Steward',
  'All Crew',
];

// Common Hazards by Category
export const COMMON_HAZARDS: Record<string, Array<{ description: string; consequences: string; suggestedControls: string[] }>> = {
  'Hot Work': [
    {
      description: 'Fire/explosion from sparks or heat',
      consequences: 'Fire, explosion, burns, property damage',
      suggestedControls: ['Remove flammables from area', 'Post fire watch', 'Have fire extinguisher ready', 'Obtain hot work permit'],
    },
    {
      description: 'Fumes and toxic gases',
      consequences: 'Respiratory issues, poisoning, asphyxiation',
      suggestedControls: ['Ensure adequate ventilation', 'Use respiratory protection', 'Monitor atmosphere'],
    },
    {
      description: 'Burns from hot surfaces/materials',
      consequences: 'Burn injuries, tissue damage',
      suggestedControls: ['Use appropriate PPE', 'Allow cooling time', 'Barricade hot areas'],
    },
  ],
  'Enclosed Space Entry': [
    {
      description: 'Oxygen deficiency/enrichment',
      consequences: 'Asphyxiation, fire risk, death',
      suggestedControls: ['Test atmosphere before entry', 'Continuous monitoring', 'Ventilate space', 'Use breathing apparatus if needed'],
    },
    {
      description: 'Toxic gases (H2S, CO, etc.)',
      consequences: 'Poisoning, incapacitation, death',
      suggestedControls: ['Gas testing', 'Forced ventilation', 'Rescue team on standby', 'Entry permit system'],
    },
    {
      description: 'Engulfment/entrapment',
      consequences: 'Suffocation, crushing injuries, death',
      suggestedControls: ['Lock out/tag out', 'Trained rescue team', 'Communication system', 'Attendant at entry'],
    },
  ],
  'Working Aloft': [
    {
      description: 'Falls from height',
      consequences: 'Serious injury, fatality',
      suggestedControls: ['Use safety harness', 'Check equipment before use', 'Two-person team', 'Secure tools'],
    },
    {
      description: 'Falling objects',
      consequences: 'Head injuries, equipment damage',
      suggestedControls: ['Barricade work area below', 'Use tool lanyards', 'Hard hats for ground crew'],
    },
    {
      description: 'Weather conditions (wind, rain)',
      consequences: 'Slips, loss of grip, equipment failure',
      suggestedControls: ['Check weather forecast', 'Postpone if adverse', 'Use appropriate footwear'],
    },
  ],
  'Working Overboard': [
    {
      description: 'Man overboard',
      consequences: 'Drowning, hypothermia, death',
      suggestedControls: ['Life jacket/harness', 'Rescue boat ready', 'Watchman on deck', 'Communication with bridge'],
    },
    {
      description: 'Propeller strike',
      consequences: 'Severe injury, death',
      suggestedControls: ['Lock out propulsion', 'Display warning signals', 'Brief all personnel'],
    },
    {
      description: 'Crushing between hull and quay',
      consequences: 'Crushing injuries, fatality',
      suggestedControls: ['Fender protection', 'Monitor vessel movement', 'Weather awareness'],
    },
  ],
  'Electrical Work': [
    {
      description: 'Electric shock/electrocution',
      consequences: 'Burns, cardiac arrest, death',
      suggestedControls: ['Isolate power', 'Lock out/tag out', 'Test before touching', 'Insulated tools'],
    },
    {
      description: 'Arc flash',
      consequences: 'Severe burns, blindness, hearing damage',
      suggestedControls: ['Arc flash PPE', 'Maintain clearances', 'Use appropriate voltage equipment'],
    },
    {
      description: 'Fire from electrical fault',
      consequences: 'Fire, equipment damage, injury',
      suggestedControls: ['Fire extinguisher ready', 'Proper fusing', 'Regular inspection'],
    },
  ],
  'Lifting Operations': [
    {
      description: 'Load drop/swing',
      consequences: 'Crushing injuries, equipment damage, fatality',
      suggestedControls: ['Check SWL', 'Use tag lines', 'Clear lift zone', 'Qualified operator'],
    },
    {
      description: 'Crane/equipment failure',
      consequences: 'Load drop, structural damage, injury',
      suggestedControls: ['Regular inspection', 'Load test certificates', 'Pre-use checks'],
    },
    {
      description: 'Pinch points/crushing',
      consequences: 'Finger/hand injuries, crushing',
      suggestedControls: ['Keep clear of pinch points', 'Use proper rigging', 'Hand signals'],
    },
  ],
  'Deck Operations': [
    {
      description: 'Slips, trips, and falls',
      consequences: 'Sprains, fractures, head injuries',
      suggestedControls: ['Good housekeeping', 'Non-slip footwear', 'Clean up spills immediately'],
    },
    {
      description: 'Moving equipment/machinery',
      consequences: 'Crushing, entanglement, amputation',
      suggestedControls: ['Guards in place', 'Safe distance', 'Training on equipment'],
    },
    {
      description: 'Mooring line snap-back',
      consequences: 'Severe injury, fatality',
      suggestedControls: ['Stand clear of snap-back zones', 'Check line condition', 'Proper tension monitoring'],
    },
  ],
  'Engine Room Work': [
    {
      description: 'High temperature surfaces',
      consequences: 'Burns, heat exhaustion',
      suggestedControls: ['Lagging on hot surfaces', 'Warning signs', 'PPE (gloves, long sleeves)'],
    },
    {
      description: 'Rotating machinery',
      consequences: 'Entanglement, amputation, death',
      suggestedControls: ['Guards in place', 'Lock out/tag out', 'No loose clothing'],
    },
    {
      description: 'Noise exposure',
      consequences: 'Hearing damage, communication issues',
      suggestedControls: ['Hearing protection', 'Limit exposure time', 'Sound-powered phones'],
    },
  ],
};

// Safety Precautions for Work Permits
export const SAFETY_PRECAUTIONS: Record<string, string[]> = {
  'Hot_Work': [
    'Fire extinguisher positioned nearby',
    'Fire watch posted',
    'Area cleared of flammables',
    'Welding screens in place',
    'Ventilation adequate',
    'Gas-free certificate obtained',
    'Adjacent spaces checked',
  ],
  'Enclosed_Space': [
    'Atmosphere tested and safe',
    'Continuous ventilation',
    'Rescue equipment ready',
    'Attendant posted at entry',
    'Communication system established',
    'Breathing apparatus available',
    'Emergency procedures briefed',
  ],
  'Working_Aloft': [
    'Safety harness worn and checked',
    'Tools secured with lanyards',
    'Area below barricaded',
    'Weather conditions checked',
    'Second person in attendance',
    'Radio communication established',
  ],
  'Working_Overboard': [
    'Life jacket worn',
    'Safety line attached',
    'Rescue boat ready',
    'Watchman posted',
    'Bridge informed',
    'Propulsion secured',
    'Emergency equipment ready',
  ],
  'Electrical': [
    'Power isolated and locked out',
    'Warning tags in place',
    'Voltage tested zero',
    'Insulated tools used',
    'Protective equipment worn',
    'Fire extinguisher nearby',
  ],
  'Other': [
    'Risk assessment completed',
    'Work area barricaded',
    'Personnel briefed',
    'Emergency equipment ready',
    'Communication established',
  ],
};

// Emergency Equipment by Permit Type
export const EMERGENCY_EQUIPMENT: Record<string, string[]> = {
  'Hot_Work': ['Fire extinguisher (CO2)', 'Fire extinguisher (Foam)', 'Fire blanket', 'First aid kit'],
  'Enclosed_Space': ['Self-contained breathing apparatus', 'Rescue harness', 'Tripod and winch', 'Gas detector', 'First aid kit', 'Stretcher'],
  'Working_Aloft': ['First aid kit', 'Rescue line', 'Stretcher'],
  'Working_Overboard': ['Life ring with line', 'Rescue boat', 'First aid kit', 'Stretcher'],
  'Electrical': ['Fire extinguisher (CO2)', 'First aid kit', 'Rescue hook'],
  'Other': ['First aid kit', 'Fire extinguisher'],
};
