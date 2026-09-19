import { createPDFTemplate, getContentStartY, getContentEndY, addPageWithFooter, type PDFBranding } from '@/lib/pdf';
import { answerFields, isSignatureValue, summariseValue, type FormData, type FormSchema } from './forms';
import { markdownToPlainText } from './markdown';

const MARGIN = 15;
const LINE = 5;

interface PdfCursor {
  y: number;
}

const ensureRoom = (doc: ReturnType<typeof createPDFTemplate>, cursor: PdfCursor, needed: number) => {
  if (cursor.y + needed > getContentEndY(doc)) {
    addPageWithFooter(doc);
    cursor.y = 20;
  }
};

const writeParagraph = (doc: ReturnType<typeof createPDFTemplate>, cursor: PdfCursor, text: string, size = 10, bold = false) => {
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2;
  doc.setFontSize(size);
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  const lines: string[] = doc.splitTextToSize(text || '—', width);
  for (const line of lines) {
    ensureRoom(doc, cursor, LINE);
    doc.text(line, MARGIN, cursor.y);
    cursor.y += LINE;
  }
};

export interface SubmissionPdfArgs {
  templateName: string;
  versionNumber: number;
  schema: FormSchema;
  data: FormData;
  submittedBy: string;
  submittedFor: string | null;
  submittedAt: string;
  status: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  reference: string;
  branding?: PDFBranding;
}

const fmt = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Renders a completed form (with signatures) to a PDF and triggers a download. */
export function exportSubmissionPdf(args: SubmissionPdfArgs): void {
  const doc = createPDFTemplate({ title: args.templateName, branding: args.branding });
  const cursor: PdfCursor = { y: getContentStartY(Boolean(args.branding?.clientDisplayName)) };

  doc.setTextColor('#111827');
  writeParagraph(doc, cursor, `Form version ${args.versionNumber}  ·  Submission ${args.reference}`, 9);
  writeParagraph(doc, cursor, `Submitted by ${args.submittedBy} on ${fmt(args.submittedAt)}${args.submittedFor ? `  ·  On behalf of ${args.submittedFor}` : ''}`, 9);
  writeParagraph(doc, cursor, `Status: ${args.status}${args.reviewedBy ? `  ·  Reviewed by ${args.reviewedBy} on ${fmt(args.reviewedAt)}` : ''}`, 9);
  cursor.y += 3;

  if (args.schema.description) {
    writeParagraph(doc, cursor, markdownToPlainText(args.schema.description), 9);
    cursor.y += 2;
  }

  for (const field of args.schema.fields) {
    if (field.type === 'heading') {
      cursor.y += 2;
      writeParagraph(doc, cursor, field.label, 12, true);
      continue;
    }
    if (field.type === 'paragraph') {
      writeParagraph(doc, cursor, field.label, 9);
      cursor.y += 1;
      continue;
    }
    const value = args.data[field.id];
    writeParagraph(doc, cursor, field.label, 9, true);
    if (field.type === 'signature' && isSignatureValue(value) && value.image) {
      ensureRoom(doc, cursor, 28);
      try {
        doc.addImage(value.image, 'PNG', MARGIN, cursor.y, 60, 22);
        cursor.y += 24;
      } catch {
        // Ignore image failures; the typed name below still records the signature.
      }
      writeParagraph(doc, cursor, `${value.name}  ·  signed ${fmt(value.signedAt)}`, 10);
    } else {
      writeParagraph(doc, cursor, summariseValue(field, value), 10);
    }
    cursor.y += 2;
  }

  if (args.reviewNotes) {
    cursor.y += 3;
    writeParagraph(doc, cursor, 'Review notes', 11, true);
    writeParagraph(doc, cursor, args.reviewNotes, 10);
  }

  const answered = answerFields(args.schema).length;
  cursor.y += 4;
  writeParagraph(doc, cursor, `${answered} field${answered === 1 ? '' : 's'} recorded. Generated ${fmt(new Date().toISOString())}.`, 8);

  doc.save(`${args.reference}.pdf`);
}
