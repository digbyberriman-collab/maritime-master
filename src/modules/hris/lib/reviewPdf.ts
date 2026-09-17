import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPDFTemplate, getContentStartY, type PDFBranding } from '@/lib/pdf/pdfTemplate';
import { formatDate, formatDateTime } from '@/modules/hris/lib/format';
import {
  FOLLOW_UP_OWNERS,
  parseFollowUps,
  parseRatings,
  ratingDelta,
  ratingLabel,
  reviewTypeLabel,
  statusLabel,
  type PerformanceReviewRow,
} from '@/modules/hris/lib/reviews';

export interface ReviewPdfPerson {
  name: string;
  rank?: string | null;
  department?: string | null;
}

export interface BuildReviewPdfArgs {
  review: PerformanceReviewRow;
  subject: ReviewPdfPerson;
  reviewer: ReviewPdfPerson | null;
  vesselName?: string | null;
  cycleName?: string | null;
  /** Welfare notes are confidential and never printed unless explicitly requested by an HR editor. */
  includeWelfareNotes?: boolean;
  branding?: PDFBranding | null;
}

type WithAutoTable = jsPDF & { lastAutoTable?: { finalY?: number } };
const tableEnd = (doc: jsPDF, fallback: number): number => (doc as WithAutoTable).lastAutoTable?.finalY ?? fallback;

const margin = 15;

const TABLE_STYLE = {
  theme: 'grid' as const,
  styles: { fontSize: 9, cellPadding: 2, textColor: '#111827', lineColor: '#e5e7eb', lineWidth: 0.2 },
  headStyles: { fillColor: '#f3f4f6', textColor: '#374151', fontStyle: 'bold' as const },
  margin: { left: margin, right: margin },
};

const rating = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : `${value} · ${ratingLabel(value)}`);

const yesNo = (value: boolean | null | undefined): string => (value === null || value === undefined ? '—' : value ? 'Yes' : 'No');

/** Builds the printable review. Caller decides whether to `save` or upload it. */
export const buildReviewPdf = ({ review, subject, reviewer, vesselName, cycleName, includeWelfareNotes, branding }: BuildReviewPdfArgs): jsPDF => {
  const doc = createPDFTemplate({ title: `${reviewTypeLabel(review.review_type)} — ${subject.name}`, branding: branding ?? undefined });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = getContentStartY(Boolean(branding?.clientDisplayName));

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
  };

  const heading = (text: string) => {
    ensureRoom(14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#111827');
    doc.text(text, margin, y);
    y += 6;
  };

  const paragraph = (label: string, value: string | null | undefined) => {
    const body = value?.trim() || '—';
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#374151');
    const lines = doc.splitTextToSize(body, contentWidth) as string[];
    ensureRoom(6 + lines.length * 4.5);
    doc.text(label, margin, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#111827');
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 3;
  };

  // --- Header block -----------------------------------------------------------
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    body: [
      ['Crew member', [subject.name, subject.rank, subject.department].filter(Boolean).join(' · '), 'Status', statusLabel(review.status)],
      ['Reviewer', reviewer ? [reviewer.name, reviewer.rank].filter(Boolean).join(' · ') : '—', 'Vessel', vesselName ?? '—'],
      ['Review period', `${formatDate(review.period_start)} – ${formatDate(review.period_end)}`, 'Due', formatDate(review.due_date)],
      ['Cycle', cycleName ?? '—', 'Overall rating', rating(review.overall_rating)],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 30, fillColor: '#f9fafb' },
      1: { cellWidth: 'auto' },
      2: { fontStyle: 'bold', cellWidth: 30, fillColor: '#f9fafb' },
      3: { cellWidth: 45 },
    },
  });
  y = tableEnd(doc, y) + 8;

  // --- Competencies ------------------------------------------------------------
  const ratings = parseRatings(review.ratings);
  const selfRatings = new Map(parseRatings(review.self_ratings).map((r) => [r.competency_id, r]));
  heading('Competency ratings');
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [['Competency', 'Self', 'Reviewer', 'Δ', 'Reviewer comment']],
    body: ratings.length
      ? ratings.map((r) => {
          const self = selfRatings.get(r.competency_id);
          const delta = ratingDelta(self?.rating, r.rating);
          return [r.name, self?.rating ?? '—', r.rating ?? '—', delta === null ? '—' : delta > 0 ? `+${delta}` : String(delta), r.comment || ''];
        })
      : [['No competencies rated', '', '', '', '']],
    columnStyles: { 0: { cellWidth: 45 }, 1: { halign: 'center', cellWidth: 15 }, 2: { halign: 'center', cellWidth: 20 }, 3: { halign: 'center', cellWidth: 12 }, 4: { cellWidth: 'auto' } },
  });
  y = tableEnd(doc, y) + 8;

  // --- Narrative ---------------------------------------------------------------
  heading('Narrative');
  paragraph('Strengths', review.strengths);
  paragraph('Development areas', review.development_areas);
  paragraph('Training needs', review.training_needs);
  paragraph('Career aspirations', review.career_aspirations);
  paragraph('Summary', review.summary);
  paragraph('Reviewer comments', review.reviewer_comments);
  paragraph('Crew member comments', review.employee_comments);
  if (includeWelfareNotes && review.welfare_notes) paragraph('Welfare notes (confidential)', review.welfare_notes);

  // --- Follow-up ---------------------------------------------------------------
  const actions = parseFollowUps(review.follow_up_actions);
  heading('Follow-up');
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [['Action', 'Owner', 'Due', 'Done']],
    body: actions.length
      ? actions.map((a) => [a.action, FOLLOW_UP_OWNERS.find((o) => o.value === a.owner)?.label ?? a.owner, formatDate(a.due_date), a.done ? 'Yes' : 'No'])
      : [['No follow-up actions', '', '', '']],
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30 }, 2: { cellWidth: 30 }, 3: { cellWidth: 18, halign: 'center' } },
  });
  y = tableEnd(doc, y) + 6;
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    body: [
      ['Next review', formatDate(review.next_review_date), 'Recommend promotion', yesNo(review.recommend_promotion)],
      ['Recommend pay review', yesNo(review.recommend_pay_review), 'Retain', yesNo(review.retain)],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40, fillColor: '#f9fafb' },
      1: { cellWidth: 'auto' },
      2: { fontStyle: 'bold', cellWidth: 45, fillColor: '#f9fafb' },
      3: { cellWidth: 30 },
    },
  });
  y = tableEnd(doc, y) + 8;

  // --- Signatures --------------------------------------------------------------
  heading('Signatures');
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [['Step', 'By', 'When']],
    body: [
      ['Self-assessment submitted', subject.name, formatDateTime(review.self_assessment_submitted_at)],
      ['Reviewer signed', reviewer?.name ?? '—', formatDateTime(review.reviewer_signed_at)],
      ['Crew member acknowledged', subject.name, formatDateTime(review.employee_acknowledged_at)],
      ['Completed', '', formatDateTime(review.completed_at)],
    ],
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 45 } },
  });

  return doc;
};

/** Convert a jsPDF document into a File ready for `uploadCrewDocument`. */
export const pdfToFile = (doc: jsPDF, fileName: string): File => new File([doc.output('blob')], fileName, { type: 'application/pdf' });
