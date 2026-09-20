/**
 * Branded PDF report for a volume section over a date range (jsPDF + autoTable).
 * Ported from the original module's export and adapted to volumes, section
 * schemas and the signature ledger.
 */
import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPDFTemplate, getContentStartY, type PDFBranding } from '@/lib/pdf/pdfTemplate';
import type { LogbookBook } from './catalog';
import type { EntryView, VolumeRow } from './types';
import type { TemplateSection } from './templates';
import { itemCode } from './lineLayouts';
import { BALANCE_COLUMNS, computeDifference, computePresentRob, sheetKey, type SheetTemplate } from './dagonEngineLog';
import { sheetForSection } from './vesselSheets';
import { stamp } from './format';

export interface BuildLogbookPdfArgs {
  book: LogbookBook;
  volume: VolumeRow;
  section: TemplateSection;
  vesselName?: string | null;
  from: Date;
  to: Date;
  entries: EntryView[];
  /** Print every schema field and full remarks under each line. */
  includeDetails?: boolean;
  branding?: PDFBranding | null;
}

type WithAutoTable = jsPDF & { lastAutoTable?: { finalY?: number } };
const tableEnd = (doc: jsPDF, fallback: number): number => (doc as WithAutoTable).lastAutoTable?.finalY ?? fallback;
const margin = 15;

const TABLE_STYLE = {
  theme: 'grid' as const,
  styles: { fontSize: 8, cellPadding: 2, textColor: '#111827', lineColor: '#e5e7eb', lineWidth: 0.2, overflow: 'linebreak' as const, valign: 'top' as const },
  headStyles: { fillColor: '#f3f4f6', textColor: '#374151', fontStyle: 'bold' as const },
  margin: { left: margin, right: margin },
};

const statusLabel = (entry: EntryView): string => {
  if (entry.superseded_by_id) return 'Superseded';
  if (entry.page_id) return `Signed page ${entry.page_number ?? ''}`.trim();
  if (entry.status === 'verified') return 'Master reviewed';
  if (entry.status === 'signed') return 'Signed';
  if (entry.status === 'finalized') return 'Finalised';
  return 'Draft';
};

const signatureLines = (entry: EntryView): string =>
  entry.signatures.filter((s) => s.kind !== 'acknowledge').map((s) => `${s.kind}: ${s.kind === 'attested' ? `${s.witness_name} (${s.witness_capacity}) attested by ${s.actor_name}` : s.actor_name} · ${stamp(s.signed_at)}`).join('\n') || 'Unsigned';

const detailLines = (entry: EntryView): string[] =>
  (entry.schema_snapshot?.fields ?? [])
    .map((field) => {
      const raw = entry.data[field.key];
      if (raw === null || raw === undefined || raw === '') return null;
      return `${field.item ? `${itemCode(field.item)} ` : ''}${field.label}: ${String(raw)}`;
    })
    .filter((line): line is string => line !== null);

const summaryOf = (entry: EntryView): string => {
  const fields = entry.schema_snapshot?.fields ?? [];
  const first = fields.slice(0, 2).map((f) => entry.data[f.key]).filter((v) => v !== undefined && v !== '' && v !== null);
  return first.length ? first.map(String).join(' · ') : entry.summary ?? '—';
};

/** Prints one vessel-specific readings sheet per entry, matching the paper layout. */
const buildSheetPdf = ({ book, volume, section, vesselName, from, to, entries, branding }: BuildLogbookPdfArgs, sheet: SheetTemplate): jsPDF => {
  const title = `${sheet.title} — ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`;
  const doc = createPDFTemplate({ title, branding: branding ?? undefined, orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const startY = getContentStartY(Boolean(branding?.clientDisplayName));
  if (entries.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor('#6b7280');
    doc.text('No sheets were recorded in this period.', margin, startY + 4);
    return doc;
  }
  entries.forEach((entry, index) => {
    if (index > 0) doc.addPage();
    const data = entry.data as Record<string, unknown>;
    let y = startY;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#374151');
    doc.text([`Vessel: ${(volume.particulars.shipName as string | undefined) || vesselName || '—'}`, `Sheet ${entry.line_number ?? '—'} · ${stamp(entry.entry_at)}`, `Status: ${statusLabel(entry)}`].join('    |    '), margin, y);
    y += 5;
    doc.text(sheet.headerFields.map((f) => `${f.label}: ${String(data[`header.${f.key}`] ?? '—')}`).join('    |    '), margin, y);
    y += 4;
    doc.setFontSize(7);
    doc.setTextColor('#6b7280');
    doc.text(sheet.units, margin, y);
    y += 4;
    sheet.sections.forEach((part) => {
      const columns = part.kind === 'balance' ? BALANCE_COLUMNS : part.columns;
      const extraLabel = part.kind === 'computed' ? part.resultLabel : part.kind === 'balance' ? 'Present ROB' : null;
      const body = part.rows.map((row) => {
        const cells = columns.map((column) => { const v = data[sheetKey(part.id, row.key, column.key)]; return v === null || v === undefined || v === '' ? '' : String(v); });
        if (part.kind === 'computed') cells.push(computeDifference(data, part.id, row.key));
        if (part.kind === 'balance') cells.push(computePresentRob(data, part.id, row.key));
        return [row.label, ...cells];
      });
      autoTable(doc, {
        ...TABLE_STYLE, startY: y,
        styles: { ...TABLE_STYLE.styles, fontSize: 7, cellPadding: 1.2, halign: 'center' },
        columnStyles: { 0: { cellWidth: 52, halign: 'left' } },
        head: [[part.title, ...columns.map((c) => c.label), ...(extraLabel ? [extraLabel] : [])]],
        body,
      });
      y = tableEnd(doc, y) + 3;
      if (y > pageHeight - 40) { doc.addPage(); y = startY; }
    });
    if (entry.remarks) {
      autoTable(doc, { ...TABLE_STYLE, startY: y, styles: { ...TABLE_STYLE.styles, fontSize: 7 }, head: [['Comments / Remarks']], body: [[entry.remarks]] });
      y = tableEnd(doc, y) + 6;
    }
    if (y > pageHeight - 34) { doc.addPage(); y = startY; }
    doc.setDrawColor('#9ca3af');
    doc.setLineWidth(0.3);
    doc.line(margin, y + 8, margin + 70, y + 8);
    doc.line(pageWidth - margin - 70, y + 8, pageWidth - margin, y + 8);
    doc.setFontSize(7);
    doc.setTextColor('#6b7280');
    doc.text(`${sheet.signatureFields[0]?.label ?? 'Engineer'}: ${String(data[`signature.${sheet.signatureFields[0]?.key}`] ?? '')}`, margin, y + 12);
    doc.text(`${sheet.signatureFields[1]?.label ?? 'Chief Engineer'}: ${String(data[`signature.${sheet.signatureFields[1]?.key}`] ?? '')}`, pageWidth - margin - 70, y + 12);
    doc.text(signatureLines(entry).split('\n')[0] ?? '', margin, y + 17);
    doc.text(`${book.title} · ${volume.label} · ${section.title}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  });
  return doc;
};

export const buildLogbookPdf = (args: BuildLogbookPdfArgs): jsPDF => {
  const sheet = sheetForSection(args.section);
  if (sheet) return buildSheetPdf(args, sheet);
  const { book, volume, section, vesselName, from, to, entries, includeDetails = true, branding } = args;
  const title = `${book.title} · ${section.title} — ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`;
  const doc = createPDFTemplate({ title, branding: branding ?? undefined, orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = getContentStartY(Boolean(branding?.clientDisplayName));

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#374151');
  doc.text([
    `Vessel: ${(volume.particulars.shipName as string | undefined) || vesselName || '—'}`,
    `Volume: ${volume.label} (${volume.flag_profile} · ${volume.template_revision} · ${volume.status})`,
    book.statutory ? 'Statutory record' : 'Operational record',
    `Lines: ${entries.length}`,
    `Generated: ${stamp(new Date().toISOString())}`,
  ].join('    |    '), margin, y);
  y += 5;
  doc.setFontSize(7.5);
  doc.setTextColor('#6b7280');
  doc.text('Mapped electronic design, not an approved facsimile. Attestations are reviewed electronic statements, not advanced electronic signatures. No flag, MCA or class approval is held.', margin, y);
  y += 6;

  if (entries.length === 0) {
    doc.setFontSize(10);
    doc.text('No lines were recorded in this period.', margin, y + 4);
    return doc;
  }

  const rows = entries.map((entry) => {
    const detail: string[] = [];
    if (includeDetails) detail.push(...detailLines(entry));
    if (entry.remarks) detail.push(`Remarks: ${entry.remarks}`);
    if (entry.amended_from_id) detail.push(`Correction of ${entry.amended_from_id}: ${entry.amendment_reason ?? ''}`);
    if (entry.source_snapshot) detail.push(`Captured ${entry.source_snapshot.source} · ${stamp(entry.source_snapshot.observed_at, true)}${entry.override_reason ? ` · changed: ${entry.override_reason}` : ''}`);
    return [
      String(entry.line_number ?? '—'),
      stamp(entry.entry_at),
      section.operationCode ?? section.title,
      summaryOf(entry),
      detail.join('\n') || '—',
      entry.recorded_by_name ?? '—',
      `${statusLabel(entry)}\n${signatureLines(entry)}`,
    ];
  });

  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [['Line', 'Date & time UTC', 'Section / code', 'Record', 'Particulars, remarks & evidence', 'Author', 'Status & signatures']],
    body: rows,
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 30 }, 2: { cellWidth: 26 }, 3: { cellWidth: 46 }, 4: { cellWidth: 'auto' }, 5: { cellWidth: 30 }, 6: { cellWidth: 52 } },
  });

  let signY = tableEnd(doc, y) + 12;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (signY > pageHeight - 30) { doc.addPage(); signY = getContentStartY(false); }
  doc.setDrawColor('#9ca3af');
  doc.setLineWidth(0.3);
  doc.line(margin, signY, margin + 70, signY);
  doc.line(pageWidth - margin - 70, signY, pageWidth - margin, signY);
  doc.setFontSize(8);
  doc.setTextColor('#6b7280');
  doc.text('Master', margin, signY + 4);
  doc.text('Date', pageWidth - margin - 70, signY + 4);

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor('#9ca3af');
    doc.text(`Page ${page} of ${total}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }
  return doc;
};

export const logbookPdfFileName = (book: LogbookBook, section: TemplateSection, vesselName: string | null | undefined, from: Date, to: Date): string => {
  const vessel = (vesselName ?? 'vessel').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  return `${vessel}-${book.slug}-${section.id}-${day(from)}-${day(to)}.pdf`;
};
