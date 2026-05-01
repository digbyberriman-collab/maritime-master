// PDF & CSV export helpers for the Hours of Work and Rest module.

import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import { ComplianceResult, DailyRecord, RuleSet } from '../types';
import { createPDFTemplate, getContentStartY, getContentEndY } from '@/lib/pdf';

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
  signatures: Array<{ signer_role: string; signed_at: string; profiles?: any }>;
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
      const name = sig.profiles ? `${sig.profiles.first_name} ${sig.profiles.last_name}` : '—';
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
