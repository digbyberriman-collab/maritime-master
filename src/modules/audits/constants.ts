// Audit Types
export const AUDIT_TYPES = [
  { value: 'Internal', label: 'Internal Audit' },
  { value: 'External_Initial', label: 'External - Initial' },
  { value: 'External_Annual', label: 'External - Annual' },
  { value: 'External_Intermediate', label: 'External - Intermediate' },
  { value: 'External_Renewal', label: 'External - Renewal' },
] as const;

export const AUDIT_SCOPES = [
  { value: 'Full SMS', label: 'Full SMS (All 13 Sections)' },
  { value: 'Specific sections', label: 'Specific ISM Sections' },
  { value: 'Department-specific', label: 'Department-specific' },
] as const;

export const DEPARTMENTS = [
  { value: 'Deck', label: 'Deck Department' },
  { value: 'Engine', label: 'Engine Department' },
  { value: 'Hotel', label: 'Hotel Department' },
  { value: 'Navigation', label: 'Navigation' },
  { value: 'Safety', label: 'Safety' },
] as const;

export const ISM_SECTIONS = [
  { value: 1, label: '1. General', description: 'General requirements' },
  { value: 2, label: '2. Safety & Environmental Protection Policy', description: 'Company policy' },
  { value: 3, label: '3. Company Responsibilities & Authority', description: 'Organizational responsibilities' },
  { value: 4, label: '4. Designated Person(s)', description: 'DPA responsibilities' },
  { value: 5, label: '5. Master\'s Responsibility & Authority', description: 'Master\'s role' },
  { value: 6, label: '6. Resources & Personnel', description: 'Manning and training' },
  { value: 7, label: '7. Shipboard Operations', description: 'Key shipboard operations' },
  { value: 8, label: '8. Emergency Preparedness', description: 'Emergency response' },
  { value: 9, label: '9. Non-Conformities, Accidents & Hazardous Occurrences', description: 'Incident reporting' },
  { value: 10, label: '10. Maintenance of Ship & Equipment', description: 'PMS requirements' },
  { value: 11, label: '11. Documentation', description: 'Document control' },
  { value: 12, label: '12. Company Verification, Review & Evaluation', description: 'Internal audits' },
  { value: 13, label: '13. Certification & Verification', description: 'Certification requirements' },
] as const;

export const AUDIT_STATUSES = [
  { value: 'Planned', label: 'Planned', color: 'bg-info-muted text-info' },
  { value: 'In_Progress', label: 'In Progress', color: 'bg-warning-muted text-warning' },
  { value: 'Completed', label: 'Completed', color: 'bg-success-muted text-success' },
  { value: 'Closed', label: 'Closed', color: 'bg-muted text-muted-foreground' },
] as const;

export const AUDIT_RESULTS = [
  { value: 'Satisfactory', label: 'Satisfactory' },
  { value: 'Satisfactory_with_Observations', label: 'Satisfactory with Observations' },
  { value: 'Major_NC', label: 'Major Non-Conformity' },
  { value: 'Certificate_Withdrawn', label: 'Certificate Withdrawn' },
] as const;

export const FINDING_TYPES = [
  { value: 'Major_NC', label: 'Major Non-Conformity', color: 'bg-critical-muted text-critical' },
  { value: 'Minor_NC', label: 'Minor Non-Conformity', color: 'bg-orange-muted text-orange' },
  { value: 'Observation', label: 'Observation', color: 'bg-info-muted text-info' },
] as const;

export const FINDING_STATUSES = [
  { value: 'Open', label: 'Open', color: 'bg-critical-muted text-critical' },
  { value: 'CAPA_Assigned', label: 'CAPA Assigned', color: 'bg-warning-muted text-warning' },
  { value: 'Under_Review', label: 'Under Review', color: 'bg-info-muted text-info' },
  { value: 'Closed', label: 'Closed', color: 'bg-success-muted text-success' },
] as const;

export const REVIEW_PERIODS = [
  { value: 'Q1 2025', label: 'Q1 2025' },
  { value: 'Q2 2025', label: 'Q2 2025' },
  { value: 'Q3 2025', label: 'Q3 2025' },
  { value: 'Q4 2025', label: 'Q4 2025' },
  { value: 'H1 2025', label: 'H1 2025' },
  { value: 'H2 2025', label: 'H2 2025' },
  { value: 'Annual 2024', label: 'Annual 2024' },
  { value: 'Annual 2025', label: 'Annual 2025' },
] as const;

export const DEFAULT_AGENDA_ITEMS = [
  'Review of incidents and CAPAs',
  'Audit findings review',
  'Certificate status review',
  'SMS effectiveness assessment',
  'Resource allocation review',
  'Improvement opportunities',
  'Crew feedback and surveys',
  'Regulatory updates',
];

export const EXTERNAL_AUDITOR_ORGS = [
  'Lloyd\'s Register',
  'DNV',
  'ABS (American Bureau of Shipping)',
  'Bureau Veritas',
  'ClassNK',
  'RINA',
  'Korean Register',
  'Indian Register of Shipping',
  'Cayman Islands Shipping Registry',
  'Marshall Islands Maritime Administrator',
  'Malta Transport Authority',
  'Liberia Maritime Authority',
  'Panama Maritime Authority',
  'Bahamas Maritime Authority',
] as const;

// Helper functions
export function getAuditStatusBadgeClass(status: string): string {
  const statusConfig = AUDIT_STATUSES.find(s => s.value === status);
  return statusConfig?.color || 'bg-gray-100 text-gray-800';
}

export function getFindingTypeBadgeClass(type: string): string {
  const typeConfig = FINDING_TYPES.find(t => t.value === type);
  return typeConfig?.color || 'bg-gray-100 text-gray-800';
}

export function getFindingStatusBadgeClass(status: string): string {
  const statusConfig = FINDING_STATUSES.find(s => s.value === status);
  return statusConfig?.color || 'bg-gray-100 text-gray-800';
}

export function generateAuditNumber(existingCount: number): string {
  const year = new Date().getFullYear();
  const paddedNumber = String(existingCount + 1).padStart(3, '0');
  return `AUD-${year}-${paddedNumber}`;
}

export function generateFindingNumber(auditNumber: string, findingCount: number): string {
  const paddedNumber = String(findingCount + 1).padStart(2, '0');
  return `${auditNumber}-F${paddedNumber}`;
}
