import { z } from 'zod';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import {
  OPEN_STATUSES,
  PRIORITIES,
  REQUEST_TYPES,
  STATUS_WORKFLOW,
  type LegalPriority,
  type LegalRequestType,
  type LegalRisk,
  type LegalStatus,
} from './constants';

export type LegalRequestRow = Tables<'legal_requests'>;
export type LegalCommentRow = Tables<'legal_request_comments'>;
export type LegalEventRow = Tables<'legal_request_events'>;

// ---------------------------------------------------------------------------
// Attachments (jsonb array on legal_requests)
// ---------------------------------------------------------------------------

export interface LegalAttachment {
  /** Object path in the `legal-attachments` bucket. */
  path: string;
  name: string;
  size: number;
  mime_type: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export function parseAttachments(json: unknown): LegalAttachment[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
    .filter((a) => typeof a.path === 'string' && typeof a.name === 'string')
    .map((a) => ({
      path: a.path as string,
      name: a.name as string,
      size: typeof a.size === 'number' ? a.size : 0,
      mime_type: typeof a.mime_type === 'string' ? a.mime_type : 'application/octet-stream',
      uploaded_by: typeof a.uploaded_by === 'string' ? a.uploaded_by : null,
      uploaded_at: typeof a.uploaded_at === 'string' ? a.uploaded_at : '',
    }));
}

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export const isOpen = (status: string | null | undefined): boolean =>
  OPEN_STATUSES.includes(status as LegalStatus);

export const isUrgentRequest = (r: Pick<LegalRequestRow, 'status' | 'priority' | 'risk_level'>): boolean =>
  isOpen(r.status) && (r.priority === 'high' || r.priority === 'urgent' || r.risk_level === 'high');

/** Position in the stepper; -1 for cancelled. */
export const statusIndex = (status: string | null | undefined): number =>
  STATUS_WORKFLOW.indexOf(status as LegalStatus);

export const nextStatus = (status: string | null | undefined): LegalStatus | null => {
  const i = statusIndex(status);
  if (i < 0 || i >= STATUS_WORKFLOW.length - 1) return null;
  return STATUS_WORKFLOW[i + 1];
};

export const requestAgeDays = (createdAt: string, now: Date = new Date()): number => {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now.getTime() - created) / (24 * 3600 * 1000)));
};

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

export interface RequestFilters {
  search: string;
  status: LegalStatus | 'all' | 'open';
  priority: LegalPriority | 'all';
  risk: LegalRisk | 'all';
  /** 'all' | 'unassigned' | 'me' | <user id> */
  assignee: string;
  /** Only requests the current user submitted. */
  mine: boolean;
}

export const DEFAULT_REQUEST_FILTERS: RequestFilters = {
  search: '',
  status: 'open',
  priority: 'all',
  risk: 'all',
  assignee: 'all',
  mine: false,
};

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

export function filterRequests(rows: LegalRequestRow[], filters: RequestFilters, currentUserId?: string | null): LegalRequestRow[] {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.mine && r.submitted_by !== currentUserId) return false;
    if (filters.status === 'open' ? !isOpen(r.status) : filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.priority !== 'all' && r.priority !== filters.priority) return false;
    if (filters.risk !== 'all' && r.risk_level !== filters.risk) return false;
    if (filters.assignee === 'unassigned' && r.assigned_to) return false;
    if (filters.assignee === 'me' && r.assigned_to !== currentUserId) return false;
    if (filters.assignee !== 'all' && filters.assignee !== 'unassigned' && filters.assignee !== 'me' && r.assigned_to !== filters.assignee) return false;
    if (q) {
      const hay = `${norm(r.title)} ${norm(r.reference_number)} ${norm(r.counterparty)}`;
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Open requests by SLA (most pressing first), then closed by most recently resolved. */
export function sortRequests(rows: LegalRequestRow[]): LegalRequestRow[] {
  const time = (s: string | null) => (s ? new Date(s).getTime() : Number.POSITIVE_INFINITY);
  return [...rows].sort((a, b) => {
    const ao = isOpen(a.status);
    const bo = isOpen(b.status);
    if (ao !== bo) return ao ? -1 : 1;
    if (ao) return time(a.sla_deadline) - time(b.sla_deadline) || b.created_at.localeCompare(a.created_at);
    return (b.resolved_at ?? b.updated_at).localeCompare(a.resolved_at ?? a.updated_at);
  });
}

// ---------------------------------------------------------------------------
// Intake form
// ---------------------------------------------------------------------------

export const INTAKE_STEPS = ['type', 'details', 'priority'] as const;
export type IntakeStep = (typeof INTAKE_STEPS)[number];

export interface IntakeValues {
  request_type: LegalRequestType | '';
  title: string;
  description: string;
  counterparty: string;
  contract_value: string;
  currency: string;
  jurisdiction: string;
  requester_department: string;
  vessel_id: string;
  incident_id: string;
  profile_id: string;
  requested_deadline: string;
  tags: string[];
  priority: LegalPriority;
}

export const emptyIntakeValues = (overrides: Partial<IntakeValues> = {}): IntakeValues => ({
  request_type: '',
  title: '',
  description: '',
  counterparty: '',
  contract_value: '',
  currency: 'USD',
  jurisdiction: '',
  requester_department: '',
  vessel_id: '',
  incident_id: '',
  profile_id: '',
  requested_deadline: '',
  tags: [],
  priority: 'medium',
  ...overrides,
});

const requestTypeValues = REQUEST_TYPES.map((t) => t.value) as [LegalRequestType, ...LegalRequestType[]];
const priorityValues = PRIORITIES.map((p) => p.value) as [LegalPriority, ...LegalPriority[]];

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const intakeSchema = z.object({
  request_type: z.enum(requestTypeValues, { errorMap: () => ({ message: 'Choose a request type' }) }),
  title: z.string().trim().min(3, 'Give the request a short title').max(200, 'Keep the title under 200 characters'),
  description: z.string().trim().max(10_000, 'Keep the description under 10,000 characters'),
  counterparty: z.string().trim().max(200),
  contract_value: z
    .string()
    .trim()
    .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Enter the value as a number'),
  currency: z.string().trim().length(3, 'Use a 3-letter currency code'),
  jurisdiction: z.string().trim().max(120),
  requester_department: z.string().trim().max(80),
  vessel_id: z.string(),
  incident_id: z.string(),
  profile_id: z.string(),
  requested_deadline: z.string().refine((v) => v === '' || (isoDate.test(v) && !Number.isNaN(new Date(v).getTime())), 'Enter a valid date'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  priority: z.enum(priorityValues),
});

export type IntakeErrors = Partial<Record<keyof IntakeValues, string>>;

export function validateIntake(values: IntakeValues): { ok: boolean; errors: IntakeErrors } {
  const result = intakeSchema.safeParse(values);
  if (result.success) return { ok: true, errors: {} };
  const errors: IntakeErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof IntakeValues | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** Fields each step owns, so a step can be validated on its own. */
export const INTAKE_STEP_FIELDS: Record<IntakeStep, (keyof IntakeValues)[]> = {
  type: ['request_type'],
  details: ['title', 'description', 'counterparty', 'contract_value', 'currency', 'jurisdiction', 'requester_department', 'vessel_id', 'incident_id', 'profile_id', 'requested_deadline', 'tags'],
  priority: ['priority'],
};

export function validateIntakeStep(values: IntakeValues, step: IntakeStep): IntakeErrors {
  const { errors } = validateIntake(values);
  const own = new Set(INTAKE_STEP_FIELDS[step]);
  return Object.fromEntries(Object.entries(errors).filter(([k]) => own.has(k as keyof IntakeValues))) as IntakeErrors;
}

const nullable = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function intakeToInsert(values: IntakeValues, userId: string, companyId: string): TablesInsert<'legal_requests'> {
  const type = REQUEST_TYPES.find((t) => t.value === values.request_type);
  const showsCounterparty = type?.showsCounterparty ?? false;
  const showsValue = type?.showsValue ?? false;
  const value = values.contract_value.trim() === '' ? null : Number(values.contract_value);
  return {
    submitted_by: userId,
    company_id: companyId,
    request_type: values.request_type as LegalRequestType,
    title: values.title.trim(),
    description: nullable(values.description),
    counterparty: showsCounterparty ? nullable(values.counterparty) : null,
    contract_value: showsValue ? value : null,
    currency: showsValue ? values.currency.trim().toUpperCase() : 'USD',
    jurisdiction: nullable(values.jurisdiction),
    requester_department: nullable(values.requester_department),
    vessel_id: nullable(values.vessel_id),
    incident_id: nullable(values.incident_id),
    profile_id: nullable(values.profile_id),
    requested_deadline: nullable(values.requested_deadline),
    tags: values.tags.map((t) => t.trim()).filter(Boolean),
    priority: values.priority,
    status: 'submitted',
    risk_level: 'medium',
  };
}

/** Comma / enter separated tag entry → clean unique list. */
export function parseTags(input: string, existing: string[] = []): string[] {
  const out = [...existing];
  for (const raw of input.split(/[,\n]/)) {
    const t = raw.trim().slice(0, 40);
    if (t && !out.some((e) => e.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 20);
}
