/**
 * PDF builder for table exports (gap/08 EX1, PDF1), loaded on demand:
 * `runExport` imports this module dynamically and this module imports
 * jspdf, jspdf-autotable and the STORM page template
 * (`src/lib/pdf/pdfTemplate.ts`) dynamically, so none of them is in the
 * entry chunk.
 *
 * Layout: the template's header (STORM, the title) and footer, a line with
 * the scope, when the file was made and the row count, the personal-data
 * notice when the export holds personal data (gap/08 EX4, GD4), then the
 * table. Landscape above six columns. Pages after the first repeat the
 * header row and carry the same footer text as the template's first page.
 * Paper uses the light palette (allow-listed generator).
 */
import type { ExportTable } from './table';
import { cellText } from './table';

export const PDF_MIME = 'application/pdf';

export interface PdfMeta {
  title: string;
  scope: string;
  generatedAt: string;
  notice: string | null;
}

const INK = '#111827';
const MUTED = '#6b7280';
const FAINT = '#9ca3af';
const RULE = '#e5e7eb';
const HEAD_FILL = '#f3f4f6';
const MARGIN = 15;

export async function buildPdf(table: ExportTable, meta: PdfMeta): Promise<Blob> {
  const [{ createPDFTemplate, getContentStartY }, { default: autoTable }] = await Promise.all([
    import('@/lib/pdf/pdfTemplate'),
    import('jspdf-autotable'),
  ]);
  const doc = createPDFTemplate({ title: meta.title, orientation: table.headers.length > 6 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let y = getContentStartY(false) - 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  const rows = `${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'}`;
  doc.text(`${meta.scope} · Made ${meta.generatedAt} · ${rows}`, MARGIN, y);
  if (meta.notice) {
    y += 5;
    doc.setTextColor(INK);
    const lines = doc.splitTextToSize(meta.notice, pageWidth - 2 * MARGIN) as string[];
    doc.text(lines, MARGIN, y);
    y += (lines.length - 1) * 4;
  }

  autoTable(doc, {
    startY: y + 5,
    head: [table.headers],
    body: table.rows.map((row) => row.map(cellText)),
    margin: { left: MARGIN, right: MARGIN, top: 20, bottom: 18 },
    styles: { fontSize: 8, cellPadding: 1.8, textColor: INK, lineColor: RULE, lineWidth: 0.1, overflow: 'linebreak' },
    headStyles: { fillColor: HEAD_FILL, textColor: INK, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(table.kinds.map((kind, i) => [i, kind === 'number' ? { halign: 'right' as const } : {}])),
    didDrawPage: (data) => {
      if (data.pageNumber === 1) return;
      const footerY = pageHeight - 10;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(FAINT);
      doc.text('Powered by Inkfish', pageWidth - MARGIN, footerY, { align: 'right' });
      doc.text(`Page ${data.pageNumber}`, pageWidth / 2, footerY, { align: 'center' });
      doc.text(meta.title, MARGIN, footerY);
    },
  });

  return doc.output('blob');
}
