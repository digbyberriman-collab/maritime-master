/**
 * CSV sections and the printable PDF summary for HR Reporting & Analytics.
 * The section builder is pure; the PDF builder only touches jsPDF.
 */
import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addPageWithFooter, createPDFTemplate, getContentEndY, getContentStartY, type PDFBranding } from '@/lib/pdf/pdfTemplate';
import { humanise } from '@/modules/hris/lib/format';
import {
  forecastTypes,
  type CsvSection,
  type ForecastPoint,
  type HeadcountPoint,
  type LeavePoint,
  type MixPoint,
  type MovementPoint,
  type ReviewCompletionPoint,
  type TenurePoint,
  type TurnoverPoint,
} from '@/modules/hris/lib/reports';

export interface ReportSeries {
  headcount: HeadcountPoint[];
  movement: MovementPoint[];
  turnover: TurnoverPoint[];
  tenure: TenurePoint[];
  contractForecast: ForecastPoint[];
  documentForecast: ForecastPoint[];
  nationality: MixPoint[];
  departments: MixPoint[];
  reviews: ReviewCompletionPoint[];
  leave: LeavePoint[];
  onboarding: MixPoint[];
}

export const forecastSection = (title: string, points: ForecastPoint[]): CsvSection => {
  const types = forecastTypes(points);
  return {
    title,
    headers: ['Month', ...types.map(humanise), 'Total'],
    rows: points.map((p) => [p.label, ...types.map((t) => p.counts[t] ?? 0), p.total]),
  };
};

const mixSection = (title: string, header: string, points: MixPoint[]): CsvSection => ({
  title,
  headers: [header, 'Crew'],
  rows: points.map((p) => [p.name, p.count]),
});

/** Every report as a titled table, in page order. */
export const buildReportSections = (s: ReportSeries): CsvSection[] => [
  { title: 'Headcount trend', headers: ['Month', 'Onboard on 1st'], rows: s.headcount.map((p) => [p.label, p.headcount]) },
  { title: 'Joiners vs leavers', headers: ['Month', 'Joiners', 'Leavers', 'Net'], rows: s.movement.map((p) => [p.label, p.joiners, p.leavers, p.joiners - p.leavers]) },
  {
    title: 'Turnover rate (rolling 12 months)',
    headers: ['Month', 'Leavers (12m)', 'Average headcount', 'Turnover %'],
    rows: s.turnover.map((p) => [p.label, p.leavers12m, p.avgHeadcount, p.ratePct]),
  },
  { title: 'Tenure distribution', headers: ['Tenure', 'Crew onboard'], rows: s.tenure.map((p) => [p.bucket, p.count]) },
  forecastSection('Contract expiry forecast', s.contractForecast),
  forecastSection('Document & certificate expiry forecast', s.documentForecast),
  mixSection('Nationality mix', 'Nationality', s.nationality),
  mixSection('Department mix', 'Department', s.departments),
  {
    title: 'Review completion (this year)',
    headers: ['Review type', 'Completed', 'Outstanding', 'Overdue'],
    rows: s.reviews.map((p) => [humanise(p.type), p.completed, p.outstanding, p.overdue]),
  },
  { title: 'Leave requests by month', headers: ['Month', 'Pending', 'Approved', 'Declined'], rows: s.leave.map((p) => [p.label, p.pending, p.approved, p.declined]) },
  { title: 'Onboarding (familiarisation) status', headers: ['Status', 'Records'], rows: s.onboarding.map((p) => [humanise(p.name), p.count]) },
];

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

type WithAutoTable = jsPDF & { lastAutoTable?: { finalY?: number } };
const tableEnd = (doc: jsPDF, fallback: number): number => (doc as WithAutoTable).lastAutoTable?.finalY ?? fallback;

const TABLE_STYLE = {
  theme: 'grid' as const,
  styles: { fontSize: 8.5, cellPadding: 1.8, textColor: '#111827', lineColor: '#e5e7eb', lineWidth: 0.2 },
  headStyles: { fillColor: '#f3f4f6', textColor: '#374151', fontStyle: 'bold' as const },
  margin: { left: 15, right: 15, bottom: 20 },
};

export interface HrSummaryPdfInput {
  branding?: PDFBranding;
  /** e.g. "All vessels · Deck · Oct 25 – Sep 26" */
  scopeLabel: string;
  kpis: { label: string; value: string }[];
  sections: CsvSection[];
  generatedAt?: Date;
}

/** Branded A4 summary: scope line, KPI table, then one table per report. */
export const buildHrSummaryPdf = (input: HrSummaryPdfInput): jsPDF => {
  const doc = createPDFTemplate({ title: 'HR Summary — Reporting & Analytics', branding: input.branding, orientation: 'portrait' });
  const margin = 15;
  let y = getContentStartY(Boolean(input.branding?.clientDisplayName));

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#6b7280');
  doc.text(`Scope: ${input.scopeLabel}`, margin, y);
  doc.text(`Generated: ${(input.generatedAt ?? new Date()).toLocaleString('en-GB')}`, margin, y + 5);
  y += 11;

  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [['Key figures', 'Value']],
    body: input.kpis.map((k) => [k.label, k.value]),
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' } },
  });
  y = tableEnd(doc, y) + 8;

  for (const section of input.sections) {
    const needed = 12 + Math.min(section.rows.length + 1, 8) * 6;
    if (y + needed > getContentEndY(doc)) {
      addPageWithFooter(doc);
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#111827');
    doc.text(section.title, margin, y);
    y += 4;
    autoTable(doc, {
      ...TABLE_STYLE,
      startY: y,
      head: [section.headers],
      body: section.rows.length ? section.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c)))) : [['No data']],
      columnStyles: Object.fromEntries(section.headers.slice(1).map((_, i) => [i + 1, { halign: 'right' as const }])),
    });
    y = tableEnd(doc, y) + 8;
  }

  return doc;
};
