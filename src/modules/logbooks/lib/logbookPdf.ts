import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { createPDFTemplate, getContentStartY, type PDFBranding } from '@/lib/pdf/pdfTemplate';
import type { LogbookDefinition } from '@/modules/logbooks/lib/logbookDefinitions';
import type { LogbookEntry } from '@/modules/logbooks/hooks/useLogbook';
import {
  BALANCE_COLUMNS, computeDifference, computePresentRob, sheetKey,
  type SheetTemplate,
} from '@/modules/logbooks/lib/dagonEngineLog';

export interface BuildLogbookPdfArgs {
  definition: LogbookDefinition;
  vesselName?: string | null;
  from: Date;
  to: Date;
  entries: LogbookEntry[];
  /** Print the flexible per-type detail fields and full remarks under each entry. */
  includeDetails?: boolean;
  /** Vessel-specific daily sheet; each entry is printed as its own readings sheet. */
  sheet?: SheetTemplate;
  branding?: PDFBranding | null;
}

type WithAutoTable = jsPDF & { lastAutoTable?: { finalY?: number } };
const tableEnd = (doc: jsPDF, fallback: number): number =>
  (doc as WithAutoTable).lastAutoTable?.finalY ?? fallback;

const margin = 15;

const TABLE_STYLE = {
  theme: 'grid' as const,
  styles: {
    fontSize: 8,
    cellPadding: 2,
    textColor: '#111827',
    lineColor: '#e5e7eb',
    lineWidth: 0.2,
    overflow: 'linebreak' as const,
    valign: 'top' as const,
  },
  headStyles: { fillColor: '#f3f4f6', textColor: '#374151', fontStyle: 'bold' as const },
  margin: { left: margin, right: margin },
};

const dt = (value: string) => format(new Date(value), 'dd MMM yyyy HH:mm');

const statusLabel = (entry: LogbookEntry): string => {
  if (entry.status === 'signed') {
    return entry.signed_by_name ? `Signed — ${entry.signed_by_name}` : 'Signed';
  }
  return entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
};

const positionOf = (entry: LogbookEntry): string => {
  if (entry.position_text) return entry.position_text;
  if (entry.latitude !== null && entry.longitude !== null) {
    return `${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)}`;
  }
  return '—';
};

/** Formats the flexible detail fields for one entry, using the logbook's own field labels. */
const detailLines = (definition: LogbookDefinition, entry: LogbookEntry): string[] => {
  const data = entry.data ?? {};
  return definition.fields
    .map((field) => {
      const raw = data[field.key];
      if (raw === null || raw === undefined || raw === '') return null;
      const unit = field.unit ? ` ${field.unit}` : '';
      return `${field.label}: ${String(raw)}${unit}`;
    })
    .filter((line): line is string => line !== null);
};

/**
 * Builds the printable logbook report for a date range.
 * The caller decides whether to save, print or upload the document.
 */
export const buildLogbookPdf = ({
  definition, vesselName, from, to, entries, includeDetails = true, branding,
}: BuildLogbookPdfArgs): jsPDF => {
  const title = `${definition.label} — ${format(from, 'dd MMM yyyy')} to ${format(to, 'dd MMM yyyy')}`;
  const doc = createPDFTemplate({ title, branding: branding ?? undefined, orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = getContentStartY(Boolean(branding?.clientDisplayName));

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#374151');
  const meta = [
    `Vessel: ${vesselName ?? '—'}`,
    definition.statutory ? 'Statutory record' : 'Operational record',
    `Entries: ${entries.length}`,
    `Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
  ].join('    |    ');
  doc.text(meta, margin, y);
  y += 6;

  if (entries.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor('#6b7280');
    doc.text('No entries were recorded in this period.', margin, y + 4);
    return doc;
  }

  const rows = entries.map((entry) => {
    const remarks: string[] = [];
    if (entry.remarks) remarks.push(entry.remarks);
    if (includeDetails) remarks.push(...detailLines(definition, entry));
    return [
      dt(entry.entry_at),
      entry.watch_period ?? '—',
      positionOf(entry),
      entry.summary ?? '—',
      remarks.join('\n') || '—',
      entry.recorded_by_name ?? '—',
      statusLabel(entry),
    ];
  });

  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [['Date & time', 'Watch', 'Position', 'Summary', 'Remarks & details', 'Recorded by', 'Status']],
    body: rows,
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 20 },
      2: { cellWidth: 30 },
      3: { cellWidth: 58 },
      4: { cellWidth: 'auto' },
      5: { cellWidth: 34 },
      6: { cellWidth: 32 },
    },
  });

  let signY = tableEnd(doc, y) + 12;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (signY > pageHeight - 30) {
    doc.addPage();
    signY = getContentStartY(false);
  }

  doc.setDrawColor('#9ca3af');
  doc.setLineWidth(0.3);
  doc.line(margin, signY, margin + 70, signY);
  doc.line(pageWidth - margin - 70, signY, pageWidth - margin, signY);
  doc.setFontSize(8);
  doc.setTextColor('#6b7280');
  doc.text('Master / Officer in charge', margin, signY + 4);
  doc.text('Date', pageWidth - margin - 70, signY + 4);

  // Re-stamp page numbers so multi-page tables are numbered correctly.
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor('#9ca3af');
    doc.text(`Page ${page} of ${total}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  return doc;
};

export const logbookPdfFileName = (
  definition: LogbookDefinition, vesselName: string | null | undefined, from: Date, to: Date,
): string => {
  const vessel = (vesselName ?? 'vessel').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${vessel}-${definition.slug}-${format(from, 'yyyyMMdd')}-${format(to, 'yyyyMMdd')}.pdf`;
};
