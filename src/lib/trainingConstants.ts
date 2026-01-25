// Training Course Categories
export const COURSE_CATEGORIES = [
  { value: 'STCW', label: 'STCW Required' },
  { value: 'Flag_Required', label: 'Flag State Required' },
  { value: 'Company_Required', label: 'Company Required' },
  { value: 'Manufacturer', label: 'Manufacturer Training' },
  { value: 'Other', label: 'Other' },
] as const;

// Training Record Statuses
export const TRAINING_STATUSES = [
  { value: 'Valid', label: 'Valid', color: 'bg-success-muted text-success' },
  { value: 'Expiring_Soon', label: 'Expiring Soon', color: 'bg-warning-muted text-warning' },
  { value: 'Expired', label: 'Expired', color: 'bg-critical-muted text-critical' },
  { value: 'Suspended', label: 'Suspended', color: 'bg-muted text-muted-foreground' },
] as const;

// Familiarization Statuses
export const FAMILIARIZATION_STATUSES = [
  { value: 'Not_Started', label: 'Not Started', color: 'bg-muted text-muted-foreground' },
  { value: 'In_Progress', label: 'In Progress', color: 'bg-info-muted text-info' },
  { value: 'Completed', label: 'Completed', color: 'bg-success-muted text-success' },
  { value: 'Overdue', label: 'Overdue', color: 'bg-critical-muted text-critical' },
] as const;

// Grade/Result Options
export const GRADE_OPTIONS = [
  { value: 'Pass', label: 'Pass' },
  { value: 'Distinction', label: 'Distinction' },
  { value: 'Merit', label: 'Merit' },
  { value: 'Competent', label: 'Competent' },
  { value: 'Not_Competent', label: 'Not Competent' },
] as const;

// Default Familiarization Sections
export const DEFAULT_FAMILIARIZATION_SECTIONS = [
  {
    section_name: 'Safety & Emergency',
    required_days: 3,
    checklist_items: [
      'Safety equipment locations tour',
      'Muster station assignment',
      'Emergency alarm familiarization',
      'Fire-fighting equipment demonstration',
      'Life-saving appliances location',
      'Emergency procedures review',
      'Safety video watched',
    ],
  },
  {
    section_name: 'Vessel Layout',
    required_days: 5,
    checklist_items: [
      'General arrangement drawings review',
      'Engine room tour',
      'Bridge equipment familiarization',
      'Accommodation areas tour',
      'Deck equipment walkthrough',
    ],
  },
  {
    section_name: 'Operational Procedures',
    required_days: 7,
    checklist_items: [
      'Watch-keeping procedures',
      'Log book procedures',
      'Communication protocols',
      'Navigation equipment operation',
      'Cargo/tender operations',
    ],
  },
  {
    section_name: 'ISM/ISPS',
    required_days: 3,
    checklist_items: [
      'ISM Code overview',
      'SMS Manual review',
      'ISPS security duties',
      'Document control procedures',
      'Non-conformity reporting',
    ],
  },
];

// Get status color class
export function getTrainingStatusColor(status: string): string {
  const statusConfig = TRAINING_STATUSES.find(s => s.value === status);
  return statusConfig?.color || 'bg-gray-100 text-gray-800';
}

export function getFamiliarizationStatusColor(status: string): string {
  const statusConfig = FAMILIARIZATION_STATUSES.find(s => s.value === status);
  return statusConfig?.color || 'bg-gray-100 text-gray-800';
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    STCW: 'bg-info-muted text-info',
    Flag_Required: 'bg-purple-muted text-purple',
    Company_Required: 'bg-orange-muted text-orange',
    Manufacturer: 'bg-cyan-muted text-cyan',
    Other: 'bg-muted text-muted-foreground',
  };
  return colors[category] || 'bg-muted text-muted-foreground';
}

// Calculate training status based on expiry
export function calculateTrainingStatus(expiryDate: Date | null): string {
  if (!expiryDate) return 'Valid';
  
  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiry < 0) return 'Expired';
  if (daysUntilExpiry <= 90) return 'Expiring_Soon';
  return 'Valid';
}

// Calculate days until expiry
export function daysUntilExpiry(expiryDate: Date | null): number | null {
  if (!expiryDate) return null;
  const today = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
