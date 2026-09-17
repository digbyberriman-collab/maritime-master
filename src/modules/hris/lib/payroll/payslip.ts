/**
 * Branded payslip PDF (STORM header + client branding + Inkfish footer via
 * createPDFTemplate) with jspdf-autotable line-item tables.
 *
 * Pure with respect to the app: everything it needs is passed in, so it can
 * be unit-tested and reused for "generate all payslips".
 */
import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPDFTemplate, getContentStartY, type PDFBranding } from '@/lib/pdf/pdfTemplate';
import { formatDate, formatMinor, humanise } from '@/modules/hris/lib/format';
import { parseBreakdown, type PayPeriodRow, type PayrollLineRow, type PayrollRunRow } from './runHelpers';

export interface PayslipCrew {
  fullName: string;
  rank?: string | null;
  department?: string | null;
  vesselName?: string | null;
  email?: string | null;
}

export interface PayslipCompany extends PDFBranding {
  name?: string | null;
}

export interface PayslipSettings {
  payslip_footer?: string | null;
  rounding_minor?: number;
  travel_days_paid?: boolean;
}

export interface BuildPayslipArgs {
  line: PayrollLineRow;
  run: Pick<PayrollRunRow, 'run_number' | 'currency' | 'status' | 'paid_at' | 'approved_at'>;
  period: Pick<PayPeriodRow, 'label' | 'start_date' | 'end_date'>;
  crew: PayslipCrew;
  company?: PayslipCompany | null;
  settings?: PayslipSettings | null;
}

/** Safe, stable file name: payslip-<run>-<crew>.pdf */
export const payslipFileName = (runNumber: string, crewName: string): string => {
  const slug = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  return `payslip-${slug(runNumber) || 'run'}-${slug(crewName) || 'crew'}.pdf`;
};

const margin = 15;
const money = (minor: number | null | undefined, ccy: string) => formatMinor(minor, ccy);

type WithAutoTable = jsPDF & { lastAutoTable?: { finalY?: number } };
const tableEnd = (doc: jsPDF, fallback: number): number => (doc as WithAutoTable).lastAutoTable?.finalY ?? fallback;

const TABLE_STYLE = {
  theme: 'grid' as const,
  styles: { fontSize: 9, cellPadding: 2, textColor: '#111827', lineColor: '#e5e7eb', lineWidth: 0.2 },
  headStyles: { fillColor: '#f3f4f6', textColor: '#374151', fontStyle: 'bold' as const },
  margin: { left: margin, right: margin },
};

export const buildPayslipPdf = ({ line, run, period, crew, company, settings }: BuildPayslipArgs): jsPDF => {
  const doc = createPDFTemplate({
    title: `Payslip ${run.run_number}`,
    branding: company ?? undefined,
    orientation: 'portrait',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const breakdown = parseBreakdown(line.breakdown);
  const ccy = line.currency;
  let y = getContentStartY(Boolean(company?.clientDisplayName)) + 2;

  // --- Identity block -------------------------------------------------------
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#111827');
  doc.text(crew.fullName, margin, y);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#4b5563');
  const subtitle = [crew.rank, crew.department, crew.vesselName].filter(Boolean).join(' · ');
  if (subtitle) doc.text(subtitle, margin, y + 5);

  const right = (label: string, value: string, offset: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#6b7280');
    doc.text(label, pageWidth - margin - 60, y + offset);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#111827');
    doc.text(value, pageWidth - margin, y + offset, { align: 'right' });
  };
  right('Pay period', period.label, 0);
  right('Dates', `${formatDate(period.start_date)} – ${formatDate(period.end_date)}`, 5);
  right('Run', run.run_number, 10);
  right('Status', humanise(line.status === 'paid' ? 'paid' : run.status), 15);
  if (run.paid_at) right('Paid on', formatDate(run.paid_at), 20);
  y += run.paid_at ? 27 : 22;
  if (company?.name) {
    doc.setTextColor('#6b7280');
    doc.text(`Employer: ${company.name}`, margin, y - 12);
  }

  // --- Earnings --------------------------------------------------------------
  const earnings: (string | number)[][] = [
    [`Base salary (${humanise(line.pay_frequency)})`, money(line.base_period_minor, ccy)],
    [
      `Prorated base — ${line.days_paid}/${line.days_in_period} days paid (${(Number(line.proration_ratio) * 100).toFixed(1)}%)`,
      money(line.prorated_base_minor, ccy),
    ],
    ...breakdown.allowances.map((a) => [`Allowance — ${a.name}`, money(a.amount_minor, ccy)]),
  ];
  if (line.gratuity_minor) earnings.push(['Gratuity', money(line.gratuity_minor, ccy)]);
  if (line.other_earnings_minor) earnings.push(['Other earnings', money(line.other_earnings_minor, ccy)]);

  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [['Earnings', `Amount (${ccy})`]],
    body: earnings,
    foot: [['Gross pay', money(line.gross_minor, ccy)]],
    footStyles: { fillColor: '#eef2ff', textColor: '#111827', fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 45 } },
  });
  y = tableEnd(doc, y) + 6;

  // --- Deductions ------------------------------------------------------------
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [['Deductions', `Amount (${ccy})`]],
    body: line.deductions_minor ? [['Deductions', money(line.deductions_minor, ccy)]] : [['No deductions', money(0, ccy)]],
    foot: [['Total deductions', money(line.deductions_minor, ccy)]],
    footStyles: { fillColor: '#fef2f2', textColor: '#111827', fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 45 } },
  });
  y = tableEnd(doc, y) + 6;

  // --- Net ------------------------------------------------------------------
  const netRows: (string | number)[][] = [[`Net pay (${ccy})`, money(line.net_minor, ccy)]];
  if (run.currency !== ccy && line.net_run_currency_minor !== null) {
    netRows.push([
      `Net pay in run currency (${run.currency}) @ ${Number(line.fx_rate_to_run ?? 0).toFixed(4)}`,
      money(line.net_run_currency_minor, run.currency),
    ]);
  }
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    body: netRows,
    bodyStyles: { fontStyle: 'bold', fillColor: '#ecfdf5', fontSize: 10 },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 45 } },
  });
  y = tableEnd(doc, y) + 6;

  // --- Day summary -----------------------------------------------------------
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [['Days in period', 'Onboard', 'Paid leave', 'Travel', 'Unpaid', 'Paid days']],
    body: [[
      line.days_in_period,
      line.days_onboard,
      line.days_leave_paid,
      `${line.days_travel}${breakdown.travel_days_paid ? '' : ' (unpaid)'}`,
      line.days_unpaid,
      line.days_paid,
    ]],
    styles: { ...TABLE_STYLE.styles, halign: 'center' },
  });
  y = tableEnd(doc, y) + 6;

  if (line.notes) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor('#4b5563');
    const lines = doc.splitTextToSize(`Notes: ${line.notes}`, pageWidth - margin * 2) as string[];
    doc.text(lines, margin, y);
    y += lines.length * 4 + 4;
  }

  // --- Footer text from company settings --------------------------------------
  const footer = settings?.payslip_footer?.trim();
  if (footer) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#6b7280');
    const lines = doc.splitTextToSize(footer, pageWidth - margin * 2) as string[];
    const pageHeight = doc.internal.pageSize.getHeight();
    const footerY = Math.max(y + 4, pageHeight - 20 - lines.length * 3.5);
    doc.text(lines, margin, footerY);
  }

  return doc;
};

/** Wraps a jsPDF document in a File so it can go through uploadCrewDocument. */
export const pdfToFile = (doc: jsPDF, fileName: string): File => {
  const blob = doc.output('blob');
  return new File([blob], fileName, { type: 'application/pdf' });
};
