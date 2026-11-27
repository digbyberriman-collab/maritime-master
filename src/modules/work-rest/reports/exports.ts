// Export builders of the Hours of Work and Rest module.
//
// - One crew member's month (PDF and CSV; MyWorkRestMonth logs the export
//   first, source key work_rest.hor_month) and the department summary CSV.
// - The vessel's hours of rest report (X1-08B; gap/04 C44): every month of a
//   year as Excel through the export engine (@/lib/export runExport, source
//   key work_rest.hor_report).
// - A breach report's PDF (X1-08B; gap/04 C42, D-X1-23): no file is stored
//   in wave 1, so the PDF is rebuilt on demand from the breaches the report
//   stored, through the export engine (source key work_rest.hor_breach_report).
//
// Both engine exports hold personal data (EX4): runExport logs them with
// log_client_export before anything is built, refuses them while the log
// is missing (they carry no legacyUnlogged flag) and names the file per EX1
// (`DRA_HoursOfRestReport_2026-01-01-to-2026-11-30_2026-11-26.xlsx`).
// This module is imported on demand (the report page and MyWorkRestMonth
// load it when the user exports), so jspdf stays out of the page chunks.

import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import { ComplianceResult, DailyRecord, RuleSet } from '../types';
import { createPDFTemplate, getContentStartY, getContentEndY } from '@/lib/pdf';
import { runExport, type ExportColumn, type ExportResult } from '@/lib/export';
import { breachFigures, ruleLabel } from '../lib/horBoard';
import { lastDayOf, personName, type MonthRow, type SentReport } from '../lib/horReport';
import type { WorkRestVesselBreachRow } from '../types/db.pending';

interface CrewInfo {
  first_name: string;
  last_name: string;
  rank?: string | null;
  department?: string | null;
}

interface VesselInfo {
  name: string;
  imo_number?: string | null;
  flag?: string | null;
}

export interface MonthlyReportData {
  crew: CrewInfo;
  vessel: VesselInfo;
  year: number;
  month: number;
  records: DailyRecord[];
  compliance: ComplianceResult;
  ruleSet: RuleSet;
  signatures: Array<{ signer_role: string; signed_at: string; profiles?: { first_name: string | null; last_name: string | null } | null }>;
  notes?: string;
}

const monthName = (m: number) =>
  ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1];

export function exportMonthlyPDF(data: MonthlyReportData): jsPDF {
  const doc = createPDFTemplate({
    title: `Hours of Work & Rest — ${monthName(data.month)} ${data.year}`,
    orientation: 'portrait',
  });

  let y = getContentStartY(false);
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 14;
  const right = pageWidth - 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(
    `${data.crew.first_name} ${data.crew.last_name} · ${data.crew.rank ?? ''}`,
    left,
    y
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y += 5;
  doc.text(
    `Vessel: ${data.vessel.name}${data.vessel.imo_number ? ' · IMO ' + data.vessel.imo_number : ''}${data.vessel.flag ? ' · Flag ' + data.vessel.flag : ''}`,
    left,
    y
  );
  y += 4;
  doc.text(
    `Department: ${data.crew.department ?? '—'} · Period: ${monthName(data.month)} ${data.year}`,
    left,
    y
  );
  y += 8;

  // Totals
  const tw = (data.compliance.totals.work_minutes / 60).toFixed(1);
  const tr = (data.compliance.totals.rest_minutes / 60).toFixed(1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Total work: ${tw}h    Total rest: ${tr}h    Status: ${data.compliance.is_compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`,
    left, y);
  y += 7;

  // Daily breakdown table
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Date', left, y);
  doc.text('Work (h)', left + 35, y);
  doc.text('Rest (h)', left + 60, y);
  doc.text('Periods', left + 85, y);
  doc.text('Longest rest (h)', left + 110, y);
  doc.text('Compliant', left + 155, y);
  y += 4;
  doc.line(left, y, right, y);
  y += 3;

  doc.setFont('helvetica', 'normal');
  for (const d of data.compliance.daily_summary) {
    if (y > getContentEndY(doc) - 20) {
      doc.addPage();
      y = getContentStartY(false);
    }
    doc.text(d.date, left, y);
    doc.text((d.work_minutes / 60).toFixed(1), left + 35, y);
    doc.text((d.rest_minutes / 60).toFixed(1), left + 60, y);
    doc.text(String(d.rest_period_count), left + 85, y);
    doc.text((d.longest_rest_minutes / 60).toFixed(1), left + 110, y);
    doc.text(d.is_compliant ? 'Yes' : 'No', left + 155, y);
    y += 5;
  }

  // Non-conformities
  if (data.compliance.non_conformities.length) {
    if (y > getContentEndY(doc) - 30) { doc.addPage(); y = getContentStartY(false); }
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Non-conformities', left, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const n of data.compliance.non_conformities) {
      if (y > getContentEndY(doc) - 15) { doc.addPage(); y = getContentStartY(false); }
      const line =
        `[${n.severity.toUpperCase()}] ${format(parseISO(n.window_start), 'd MMM HH:mm')} → ${format(
          parseISO(n.window_end),
          'd MMM HH:mm'
        )} · ${n.rule_description} (measured ${n.measured_value}, threshold ${n.threshold_value})`;
      const split = doc.splitTextToSize(line, right - left);
      doc.text(split, left, y);
      y += split.length * 4;
    }
  }

  // Rules in force
  if (y > getContentEndY(doc) - 25) { doc.addPage(); y = getContentStartY(false); }
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Rules in force (' + data.ruleSet.name + ')', left, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `Min rest /24h: ${data.ruleSet.min_rest_per_24h}h · Min rest /7d: ${data.ruleSet.min_rest_per_7d}h · Max rest periods/24h: ${data.ruleSet.max_rest_periods_per_24h} · Min long rest block: ${data.ruleSet.min_long_rest_block}h · Max interval between rest: ${data.ruleSet.max_interval_between_rest}h`,
    left,
    y,
    { maxWidth: right - left }
  );

  // Signatures
  y += 12;
  if (y > getContentEndY(doc) - 30) { doc.addPage(); y = getContentStartY(false); }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Sign-off', left, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const role of ['crew', 'hod', 'captain'] as const) {
    const sig = data.signatures.find((s) => s.signer_role === role);
    const label = role === 'hod' ? 'Head of Department' : role.charAt(0).toUpperCase() + role.slice(1);
    if (sig) {
      const name = sig.profiles ? [sig.profiles.first_name, sig.profiles.last_name].filter(Boolean).join(' ') || '—' : '—';
      doc.text(
        `${label}: ${name} · ${format(parseISO(sig.signed_at), 'd MMM yyyy HH:mm')}`,
        left,
        y
      );
    } else {
      doc.text(`${label}: not signed`, left, y);
    }
    y += 5;
  }

  return doc;
}

export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(filename);
}

/**
 * CSV (one row per day) for payroll/audit purposes.
 */
export function exportMonthlyCSV(data: MonthlyReportData): string {
  const rows: string[][] = [
    [
      'Vessel',
      'Crew Name',
      'Rank',
      'Department',
      'Date',
      'Work hours',
      'Rest hours',
      'Rest periods',
      'Longest rest',
      'Compliant',
    ],
  ];
  const fullName = `${data.crew.first_name} ${data.crew.last_name}`;
  for (const d of data.compliance.daily_summary) {
    rows.push([
      data.vessel.name,
      fullName,
      data.crew.rank ?? '',
      data.crew.department ?? '',
      d.date,
      (d.work_minutes / 60).toFixed(2),
      (d.rest_minutes / 60).toFixed(2),
      String(d.rest_period_count),
      (d.longest_rest_minutes / 60).toFixed(2),
      d.is_compliant ? 'yes' : 'no',
    ]);
  }
  return rows
    .map((r) => r.map((c) => (/[,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Department / vessel-wide compliance summary CSV (one row per crew).
 */
export function exportDepartmentCSV(rows: Array<{
  crew_name: string;
  rank: string;
  department: string;
  total_work: number;
  total_rest: number;
  open_ncs: number;
  status: string;
  is_compliant: boolean;
}>): string {
  const out: string[][] = [
    ['Crew name', 'Rank', 'Department', 'Total work (h)', 'Total rest (h)', 'Open NCs', 'Status', 'Compliant'],
    ...rows.map((r) => [
      r.crew_name,
      r.rank,
      r.department,
      r.total_work.toFixed(2),
      r.total_rest.toFixed(2),
      String(r.open_ncs),
      r.status,
      r.is_compliant ? 'yes' : 'no',
    ]),
  ];
  return out
    .map((r) => r.map((c) => (/[,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
}

// ---------------------------------------------------------------- the vessel's report (X1-08B; gap/04 C44)

/** The export log's source keys of the report page's exports. */
export const HOR_REPORT_SOURCE_KEY = 'work_rest.hor_report';
export const HOR_BREACH_REPORT_SOURCE_KEY = 'work_rest.hor_breach_report';

/** One row per month of the year (Export all months). */
export const MONTH_EXPORT_COLUMNS: readonly ExportColumn<MonthRow & { year: number }>[] = [
  { key: 'month', header: 'Month', value: (r) => `${r.label} ${r.year}`, width: 16 },
  { key: 'crew', header: 'Crew', kind: 'number', value: (r) => r.crew },
  { key: 'days_logged', header: 'Days logged', kind: 'number', value: (r) => r.daysLogged },
  { key: 'breach_days', header: 'Breach days', kind: 'number', value: (r) => r.breachDays },
  { key: 'unreviewed', header: 'Unreviewed breaches', kind: 'number', value: (r) => r.unreviewed },
  { key: 'awaiting_correction', header: 'Waiting on a correction', kind: 'number', value: (r) => r.awaitingCorrection },
  { key: 'serious_open', header: 'Serious open', kind: 'number', value: (r) => r.seriousOpen },
  { key: 'not_submitted', header: 'Not submitted', kind: 'number', value: (r) => (r.phase === 'before_start' ? null : r.notSubmitted) },
  { key: 'awaiting_approval', header: 'Awaiting approval', kind: 'number', value: (r) => r.awaitingApproval },
  { key: 'approved', header: 'Approved', kind: 'number', value: (r) => r.approved },
  { key: 'locked', header: 'Locked', kind: 'number', value: (r) => r.locked },
  { key: 'submission', header: 'Submission', value: (r) => r.submission.label, width: 30 },
];

export interface ExportOptions {
  vesselId: string;
  vesselCode: string | null;
  vesselName: string;
  /** The clock and the download step (tests). */
  now?: Date;
  download?: (blob: Blob, fileName: string) => void;
}

/**
 * Export all months (C44): the year's months as Excel, oldest first, logged
 * first (personal data). The file covers 1 January to the last month listed.
 */
export function exportAllMonths(opts: ExportOptions & { year: number; rows: readonly MonthRow[] }): Promise<ExportResult> {
  const rows = [...opts.rows].sort((a, b) => a.month - b.month).map((r) => ({ ...r, year: opts.year }));
  const lastMonth = rows.length ? rows[rows.length - 1].month : 12;
  return runExport({
    format: 'xlsx',
    kind: 'Hours of rest report',
    title: `Hours of rest report ${opts.year}, ${opts.vesselName}`,
    sourceKey: HOR_REPORT_SOURCE_KEY,
    personalData: true,
    vesselId: opts.vesselId,
    vesselCode: opts.vesselCode,
    columns: MONTH_EXPORT_COLUMNS,
    rows,
    range: { from: `${opts.year}-01-01`, to: lastDayOf(opts.year, lastMonth) },
    params: { year: opts.year },
    now: opts.now,
    download: opts.download,
  });
}

/** A reviewed breach's outcome in the PDF (the engine's outcomes and the legacy reviewed states). */
const REVIEW_WORD: Readonly<Record<string, string>> = {
  accepted: 'Accepted',
  dismissed: 'Dismissed',
  justified: 'Justified',
  accepted_by_captain: 'Accepted by Master',
  corrected: 'Corrected',
};

/** The breaches of one breach report (its PDF). */
export const BREACH_REPORT_COLUMNS: readonly ExportColumn<WorkRestVesselBreachRow>[] = [
  { key: 'crew', header: 'Crew member', value: (r) => personName(r), width: 22 },
  { key: 'position', header: 'Position', value: (r) => r.position_name ?? r.department_label ?? null, width: 18 },
  { key: 'day', header: 'Day', kind: 'date', value: (r) => r.breach_day },
  { key: 'rule', header: 'Rule', value: (r) => ruleLabel(r.rule_code), width: 18 },
  { key: 'measured', header: 'Measured', value: (r) => breachFigures(r.rule_code, r.measured_value, r.threshold_value) ?? r.rule_description ?? null, width: 26 },
  { key: 'deficit', header: 'Hours short', kind: 'number', value: (r) => r.deficit_hours },
  { key: 'serious', header: 'Serious', kind: 'boolean', value: (r) => r.is_serious },
  { key: 'outcome', header: 'Review', value: (r) => REVIEW_WORD[r.review_outcome ?? r.status ?? ''] ?? null, width: 14 },
  { key: 'note', header: 'Justification or note', value: (r) => r.review_note, width: 32 },
  { key: 'reviewed_by', header: 'Reviewed by', value: (r) => r.reviewer_name, width: 18 },
  { key: 'reviewed_on', header: 'Reviewed on', kind: 'date', value: (r) => r.reviewed_at },
];

/**
 * A breach report's PDF (D-X1-23): rebuilt from the breaches it stored,
 * logged first (personal data), named after the report's reference
 * (`DRA_HoRBreachReport_HORBR-DRA-2026-001_2026-11-26.pdf`).
 */
export function exportBreachReportPdf(opts: ExportOptions & { report: SentReport; rows: readonly WorkRestVesselBreachRow[] }): Promise<ExportResult> {
  const { report } = opts;
  return runExport({
    format: 'pdf',
    kind: 'HoR breach report',
    title: `Hours of rest breach report ${report.reference}, ${opts.vesselName}`,
    sourceKey: HOR_BREACH_REPORT_SOURCE_KEY,
    personalData: true,
    vesselId: opts.vesselId,
    vesselCode: opts.vesselCode,
    columns: BREACH_REPORT_COLUMNS,
    rows: opts.rows,
    range: { ref: report.reference },
    params: { report_id: report.id },
    now: opts.now,
    download: opts.download,
  });
}
