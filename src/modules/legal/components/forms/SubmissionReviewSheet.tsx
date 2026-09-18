import React, { useEffect, useMemo, useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { PersonChip } from '@/modules/legal/components/PersonChip';
import { SubmissionStatusBadge } from '@/modules/legal/components/badges';
import { FormRenderer } from '@/modules/legal/components/forms/FormRenderer';
import { useDocumentVersion } from '@/modules/legal/hooks/useDocumentVersions';
import { useLegalPeople } from '@/modules/legal/hooks/useLegalLookups';
import type { LegalSubmissionRow, ReviewSubmissionArgs } from '@/modules/legal/hooks/useFormSubmissions';
import { emptySchema, parseFormSchema, type FormData } from '@/modules/legal/lib/forms';
import { exportSubmissionPdf } from '@/modules/legal/lib/pdf';
import { submissionReference } from '@/modules/legal/lib/forms';

interface SubmissionReviewSheetProps {
  submission: LegalSubmissionRow | null;
  templateName: string;
  onOpenChange: (open: boolean) => void;
  canReview: boolean;
  onReview?: (args: ReviewSubmissionArgs) => Promise<unknown>;
  isReviewing?: boolean;
}

/** Read-only view of a submission against the version it was filled on, with approve / reject. */
export const SubmissionReviewSheet: React.FC<SubmissionReviewSheetProps> = ({ submission, templateName, onOpenChange, canReview, onReview, isReviewing }) => {
  const version = useDocumentVersion(submission?.version_id);
  const { nameFor } = useLegalPeople();
  const { clientDisplayName, clientLogoUrl } = useBrandingContext();
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(submission?.review_notes ?? ''), [submission?.id, submission?.review_notes]);

  const schema = useMemo(() => parseFormSchema(version.data?.form_schema) ?? emptySchema(templateName), [version.data?.form_schema, templateName]);
  const data = useMemo(() => (submission?.form_data && typeof submission.form_data === 'object' ? (submission.form_data as FormData) : {}), [submission?.form_data]);
  const pending = submission?.status === 'submitted';

  const download = () => {
    if (!submission) return;
    exportSubmissionPdf({
      templateName,
      versionNumber: version.data?.version_number ?? 0,
      schema,
      data,
      submittedBy: nameFor(submission.submitted_by) || 'Unknown',
      submittedFor: submission.submitted_for_name,
      submittedAt: submission.created_at,
      status: submission.status,
      reviewedBy: submission.reviewed_by ? nameFor(submission.reviewed_by) : null,
      reviewedAt: submission.reviewed_at,
      reviewNotes: submission.review_notes,
      reference: submissionReference(submission.id),
      branding: { clientDisplayName, clientLogoUrl },
    });
  };

  return (
    <Sheet open={Boolean(submission)} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
        {submission && (
          <>
            <SheetHeader className="space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SubmissionStatusBadge status={submission.status} />
                <span className="font-mono text-xs text-muted-foreground">{submissionReference(submission.id)}</span>
                {version.data && <span className="text-xs text-muted-foreground">· form v{version.data.version_number}</span>}
              </div>
              <SheetTitle>{templateName}</SheetTitle>
              <SheetDescription asChild>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p className="flex flex-wrap items-center gap-1">
                    Submitted by <PersonChip userId={submission.submitted_by} /> on {format(new Date(submission.created_at), 'd MMM yyyy, HH:mm')}
                  </p>
                  {submission.submitted_for_name && <p>Filed for {submission.submitted_for_name}</p>}
                  {submission.reviewed_by && (
                    <p className="flex flex-wrap items-center gap-1">
                      Reviewed by <PersonChip userId={submission.reviewed_by} /> {submission.reviewed_at ? `on ${format(new Date(submission.reviewed_at), 'd MMM yyyy, HH:mm')}` : ''}
                    </p>
                  )}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="my-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={download} disabled={version.isLoading}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              {version.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <>
                  {schema.description && <p className="mb-4 text-sm text-muted-foreground">{schema.description}</p>}
                  <FormRenderer schema={schema} data={data} readOnly />
                </>
              )}
            </div>

            {(canReview || submission.review_notes) && (
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                <Label htmlFor="review-notes">Review notes</Label>
                {canReview && pending ? (
                  <Textarea id="review-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Reason for rejection, or conditions of approval." disabled={isReviewing} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-foreground">{submission.review_notes || '—'}</p>
                )}
                {canReview && pending && onReview && (
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={() => onReview({ id: submission.id, status: 'rejected', review_notes: notes })} disabled={isReviewing}>
                      <X className="mr-2 h-4 w-4" /> Reject
                    </Button>
                    <Button onClick={() => onReview({ id: submission.id, status: 'approved', review_notes: notes })} disabled={isReviewing}>
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default SubmissionReviewSheet;
