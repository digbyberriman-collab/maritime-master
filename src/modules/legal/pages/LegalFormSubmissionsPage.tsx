import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { LegalShell } from '@/modules/legal/components/LegalShell';
import { SubmissionsTable } from '@/modules/legal/components/forms/SubmissionsTable';
import { SubmissionReviewSheet } from '@/modules/legal/components/forms/SubmissionReviewSheet';
import { useLegalDocument } from '@/modules/legal/hooks/useLegalDocuments';
import { useFormSubmissions, type LegalSubmissionRow } from '@/modules/legal/hooks/useFormSubmissions';
import { SUBMISSION_STATUSES } from '@/modules/legal/lib/constants';
import { LEGAL_PATHS } from '@/modules/legal/paths';

const LegalFormSubmissionsPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const access = useLegalAccess();
  const template = useLegalDocument(templateId);
  const submissions = useFormSubmissions(templateId);
  const [status, setStatus] = useState('all');
  const [reviewing, setReviewing] = useState<LegalSubmissionRow | null>(null);
  const rows = useMemo(() => submissions.submissions.filter((s) => status === 'all' || s.status === status), [submissions.submissions, status]);
  const name = template.data?.name ?? 'Form';

  return (
    <LegalShell
      title={template.isLoading ? 'Loading…' : `${name}: submissions`}
      description="Open a submission to see it against the version it was filled on, then approve or reject it."
      backTo={{ label: 'Back to forms', path: LEGAL_PATHS.forms }}
      actions={
        access.canEdit &&
        templateId && (
          <Button asChild variant="outline">
            <Link to={LEGAL_PATHS.document(templateId)}>
              <Hammer className="mr-2 h-4 w-4" /> Open builder
            </Link>
          </Button>
        )
      }
    >
      <div className="flex justify-end">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" aria-label="Submission status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {SUBMISSION_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {template.isLoading ? <Skeleton className="h-40 w-full" /> : <SubmissionsTable rows={rows} templateName={() => name} isLoading={submissions.isLoading} onOpen={setReviewing} />}
      <SubmissionReviewSheet
        submission={reviewing}
        templateName={name}
        onOpenChange={(o) => !o && setReviewing(null)}
        canReview={access.canEdit}
        onReview={async (args) => {
          await submissions.reviewSubmission.mutateAsync(args);
          setReviewing(null);
        }}
        isReviewing={submissions.reviewSubmission.isPending}
      />
    </LegalShell>
  );
};

export default LegalFormSubmissionsPage;
