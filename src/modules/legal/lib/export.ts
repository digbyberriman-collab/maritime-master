import { priorityDef, requestTypeLabel, riskDef, statusDef } from './constants';
import { slaState } from './sla';
import type { LegalRequestRow } from './requests';

export const csvEscape = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (headers: string[], rows: (string | number | null | undefined)[][]): string =>
  [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');

export interface RequestCsvLookups {
  nameFor: (userId: string | null | undefined) => string;
  vesselName: (vesselId: string | null | undefined) => string;
}

export const REQUEST_CSV_HEADERS = [
  'Reference',
  'Title',
  'Type',
  'Status',
  'Priority',
  'Risk',
  'Requester',
  'Department',
  'Assigned to',
  'Vessel',
  'Counterparty',
  'Contract value',
  'Currency',
  'Jurisdiction',
  'Requested deadline',
  'SLA deadline',
  'SLA',
  'Created',
  'Resolved',
  'Tags',
];

export function requestsToCsv(rows: LegalRequestRow[], lookups: RequestCsvLookups, now: Date = new Date()): string {
  return toCsv(
    REQUEST_CSV_HEADERS,
    rows.map((r) => [
      r.reference_number,
      r.title,
      requestTypeLabel(r.request_type),
      statusDef(r.status).label,
      priorityDef(r.priority).label,
      r.risk_level ? riskDef(r.risk_level).label : '',
      lookups.nameFor(r.submitted_by),
      r.requester_department,
      lookups.nameFor(r.assigned_to),
      lookups.vesselName(r.vessel_id),
      r.counterparty,
      r.contract_value,
      r.contract_value === null ? '' : r.currency,
      r.jurisdiction,
      r.requested_deadline,
      r.sla_deadline,
      slaState(r, now).label,
      r.created_at,
      r.resolved_at,
      (r.tags ?? []).join('; '),
    ]),
  );
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const exportFilename = (base: string, ext: string, now: Date = new Date()): string =>
  `${base}-${now.toISOString().slice(0, 10)}.${ext}`;
