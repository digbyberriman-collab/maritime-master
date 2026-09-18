import {
  Anchor, BookOpen, Briefcase, FileCheck2, FileSignature, FileText, Folder, HardHat, HelpCircle,
  Lightbulb, Scale, ShieldCheck, Users, Waves, ClipboardList, type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type LegalRequestType =
  | 'nda'
  | 'contract_review'
  | 'contractor_agreement'
  | 'employment'
  | 'regulatory_compliance'
  | 'ip_commercial'
  | 'general_inquiry';

export interface RequestTypeDef {
  value: LegalRequestType;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Show the "other party" field. */
  showsCounterparty: boolean;
  /** Show contract value + currency. */
  showsValue: boolean;
}

export const REQUEST_TYPES: RequestTypeDef[] = [
  { value: 'nda', label: 'NDA', description: 'Non-disclosure or confidentiality agreement with a third party.', icon: FileSignature, showsCounterparty: true, showsValue: false },
  { value: 'contract_review', label: 'Service Agreement', description: 'Review or drafting of a supplier, charter or service contract.', icon: FileText, showsCounterparty: true, showsValue: true },
  { value: 'contractor_agreement', label: 'Contractor Agreement', description: 'Engagement terms for a contractor, yard or specialist.', icon: HardHat, showsCounterparty: true, showsValue: true },
  { value: 'employment', label: 'Employment', description: 'Crew contracts, SEAs, terminations and HR-related questions.', icon: Users, showsCounterparty: false, showsValue: false },
  { value: 'regulatory_compliance', label: 'Regulatory', description: 'Flag state, port state, ISM, ISPS, MLC or customs matters.', icon: Scale, showsCounterparty: false, showsValue: false },
  { value: 'ip_commercial', label: 'IP Review', description: 'Trademarks, media rights, licensing and commercial use.', icon: Lightbulb, showsCounterparty: true, showsValue: false },
  { value: 'general_inquiry', label: 'General Inquiry', description: 'Anything else that needs a legal opinion.', icon: HelpCircle, showsCounterparty: false, showsValue: false },
];

export const requestTypeDef = (value: string | null | undefined): RequestTypeDef | undefined =>
  REQUEST_TYPES.find((t) => t.value === value);

export const requestTypeLabel = (value: string | null | undefined): string => requestTypeDef(value)?.label ?? 'Legal request';

export type LegalPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface PriorityDef {
  value: LegalPriority;
  label: string;
  slaLabel: string;
  description: string;
  businessDays: number | null;
  hours: number | null;
  tone: Tone;
}

export const PRIORITIES: PriorityDef[] = [
  { value: 'low', label: 'Low', slaLabel: '10 business days', description: 'Routine matter with no fixed date.', businessDays: 10, hours: null, tone: 'neutral' },
  { value: 'medium', label: 'Standard', slaLabel: '5 business days', description: 'Normal turnaround for most requests.', businessDays: 5, hours: null, tone: 'info' },
  { value: 'high', label: 'High', slaLabel: '2 business days', description: 'Blocking an operation, charter or signing.', businessDays: 2, hours: null, tone: 'warning' },
  { value: 'urgent', label: 'Urgent', slaLabel: '24 hours', description: 'Live incident, detention or a same-day deadline.', businessDays: null, hours: 24, tone: 'critical' },
];

export const priorityDef = (value: string | null | undefined): PriorityDef =>
  PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[1];

export type LegalStatus = 'submitted' | 'triaged' | 'in_progress' | 'under_review' | 'completed' | 'cancelled';

export interface StatusDef {
  value: LegalStatus;
  label: string;
  description: string;
  tone: Tone;
  /** Chart colour: a `--chart-n` token, validated for colour-vision deficiency in the workflow order. */
  chart: string;
}

/** Ordered workflow, shown as a stepper. `cancelled` sits outside it. */
export const STATUS_WORKFLOW: LegalStatus[] = ['submitted', 'triaged', 'in_progress', 'under_review', 'completed'];

export const STATUSES: StatusDef[] = [
  { value: 'submitted', label: 'Submitted', description: 'Waiting for the legal team to triage.', tone: 'info', chart: 'hsl(var(--chart-1))' },
  { value: 'triaged', label: 'Triaged', description: 'Reviewed, risk assessed and assigned.', tone: 'amber', chart: 'hsl(var(--chart-2))' },
  { value: 'in_progress', label: 'In progress', description: 'Being worked on by the legal team.', tone: 'teal', chart: 'hsl(var(--chart-3))' },
  { value: 'under_review', label: 'Under review', description: 'Draft with the requester or counterparty for review.', tone: 'purple', chart: 'hsl(var(--chart-4))' },
  { value: 'completed', label: 'Completed', description: 'Resolved and closed.', tone: 'success', chart: 'hsl(var(--chart-5))' },
  { value: 'cancelled', label: 'Cancelled', description: 'Withdrawn by the requester or the legal team.', tone: 'neutral', chart: 'hsl(var(--chart-6))' },
];

export const OPEN_STATUSES: LegalStatus[] = ['submitted', 'triaged', 'in_progress', 'under_review'];

export const statusDef = (value: string | null | undefined): StatusDef =>
  STATUSES.find((s) => s.value === value) ?? STATUSES[0];

export type LegalRisk = 'low' | 'medium' | 'high';

export interface RiskDef {
  value: LegalRisk;
  label: string;
  tone: Tone;
}

export const RISK_LEVELS: RiskDef[] = [
  { value: 'low', label: 'Low risk', tone: 'success' },
  { value: 'medium', label: 'Medium risk', tone: 'warning' },
  { value: 'high', label: 'High risk', tone: 'critical' },
];

export const riskDef = (value: string | null | undefined): RiskDef =>
  RISK_LEVELS.find((r) => r.value === value) ?? RISK_LEVELS[1];

export const REQUESTER_DEPARTMENTS = ['Deck', 'Interior', 'Engineering', 'Dive', 'Galley', 'Administration', 'Bridge', 'Medical', 'Other'] as const;

export const JURISDICTIONS = [
  'Cayman Islands',
  'Marshall Islands',
  'United States',
  'United Kingdom',
  'Netherlands',
  'Australia',
  'International / IMO',
  'Other',
] as const;

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'AED', 'CHF'] as const;

export type CommentType = 'comment' | 'status_change' | 'assignment' | 'internal_note';

export const COMMENT_TYPES: { value: CommentType; label: string }[] = [
  { value: 'comment', label: 'Comment' },
  { value: 'internal_note', label: 'Internal note' },
  { value: 'status_change', label: 'Status change' },
  { value: 'assignment', label: 'Assignment' },
];

// ---------------------------------------------------------------------------
// Documents & forms
// ---------------------------------------------------------------------------

export type DocumentCategory = 'padi' | 'waiver' | 'contract' | 'employment' | 'maritime' | 'policy' | 'general';

export interface CategoryDef {
  value: DocumentCategory;
  label: string;
  icon: LucideIcon;
}

export const DOCUMENT_CATEGORIES: CategoryDef[] = [
  { value: 'padi', label: 'PADI', icon: Waves },
  { value: 'waiver', label: 'Waiver', icon: ShieldCheck },
  { value: 'contract', label: 'Contract', icon: FileSignature },
  { value: 'employment', label: 'Employment', icon: Briefcase },
  { value: 'maritime', label: 'Maritime', icon: Anchor },
  { value: 'policy', label: 'Policy', icon: BookOpen },
  { value: 'general', label: 'General', icon: Folder },
];

export const categoryDef = (value: string | null | undefined): CategoryDef =>
  DOCUMENT_CATEGORIES.find((c) => c.value === value) ?? DOCUMENT_CATEGORIES[6];

export type TemplateStatus = 'draft' | 'active' | 'under_review' | 'archived';

export const TEMPLATE_STATUSES: { value: TemplateStatus; label: string; tone: Tone }[] = [
  { value: 'draft', label: 'Draft', tone: 'neutral' },
  { value: 'active', label: 'Active', tone: 'success' },
  { value: 'under_review', label: 'Under review', tone: 'warning' },
  { value: 'archived', label: 'Archived', tone: 'neutral' },
];

export const templateStatusDef = (value: string | null | undefined) =>
  TEMPLATE_STATUSES.find((s) => s.value === value) ?? TEMPLATE_STATUSES[0];

export const TEMPLATE_DEPARTMENTS = ['Legal', 'Dive', 'Fleet', 'HR', 'Medical', 'Administration'] as const;

export type DocumentType = 'template' | 'form';

export const DOCUMENT_TYPES: { value: DocumentType; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'template', label: 'Document template', description: 'Versioned rich text: contracts, policies, letters.', icon: FileCheck2 },
  { value: 'form', label: 'Form', description: 'Schema-driven form crew fill in and submit for review.', icon: ClipboardList },
];

export type VersionStatus = 'draft' | 'approved' | 'superseded';

export const VERSION_STATUSES: { value: VersionStatus; label: string; tone: Tone }[] = [
  { value: 'draft', label: 'Draft', tone: 'neutral' },
  { value: 'approved', label: 'Approved', tone: 'success' },
  { value: 'superseded', label: 'Superseded', tone: 'neutral' },
];

export type SubmissionStatus = 'submitted' | 'approved' | 'rejected';

export const SUBMISSION_STATUSES: { value: SubmissionStatus; label: string; tone: Tone }[] = [
  { value: 'submitted', label: 'Awaiting review', tone: 'info' },
  { value: 'approved', label: 'Approved', tone: 'success' },
  { value: 'rejected', label: 'Rejected', tone: 'critical' },
];

export const submissionStatusDef = (value: string | null | undefined) =>
  SUBMISSION_STATUSES.find((s) => s.value === value) ?? SUBMISSION_STATUSES[0];

// ---------------------------------------------------------------------------
// Tones: semantic design tokens only, never hard-coded colours.
// ---------------------------------------------------------------------------

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'critical' | 'primary' | 'purple' | 'amber' | 'teal';

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-info/30 bg-info/10 text-info',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  critical: 'border-critical/30 bg-critical/10 text-critical',
  primary: 'border-primary/30 bg-primary/10 text-primary',
  purple: 'border-purple/30 bg-purple/10 text-purple',
  amber: 'border-amber/30 bg-amber/10 text-amber',
  teal: 'border-teal/30 bg-teal/10 text-teal',
};

/** Solid dot / bar colour for a tone, from the same tokens. */
export const TONE_DOT_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted-foreground',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical',
  primary: 'bg-primary',
  purple: 'bg-purple',
  amber: 'bg-amber',
  teal: 'bg-teal',
};
