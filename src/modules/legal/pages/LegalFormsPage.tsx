import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Hammer, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { LegalShell } from '@/modules/legal/components/LegalShell';
import { TemplateStatusBadge } from '@/modules/legal/components/badges';
import { NewDocumentDialog } from '@/modules/legal/components/documents/NewDocumentDialog';
import { SubmissionsTable } from '@/modules/legal/components/forms/SubmissionsTable';
import { SubmissionReviewSheet } from '@/modules/legal/components/forms/SubmissionReviewSheet';
import { useLegalDocuments } from '@/modules/legal/hooks/useLegalDocuments';
import { useFormSubmissions, type LegalSubmissionRow } from '@/modules/legal/hooks/useFormSubmissions';
import { categoryDef, SUBMISSION_STATUSES } from '@/modules/legal/lib/constants';
import { LEGAL_PATHS } from '@/modules/legal/paths';

const LegalFormsPage: React.FC = () => {
  const access = useLegalAccess();
  const { templates, isLoading, createTemplate } = useLegalDocuments();
  const submissions = useFormSubmissions('all');
  const [status, setStatus] = useState('all');
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<LegalSubmissionRow | null>(null);

  const forms = useMemo(() => templates.filter((t) => t.document_type === 'form' && (access.canEdit ? t.status !== 'archived' : t.status === 'active')), [templates, access.canEdit]);
  const nameOf = (id: string) => templates.find((t) => t.id === id)?.name ?? 'Form';
  const rows = useMemo(() => submissions.submissions.filter((s) => status === 'all' || s.status === status), [submissions.submissions, status]);
  const pendingCount = submissions.submissions.filter((s) => s.status === 'submitted').length;

  return (
    <LegalShell
      description={access.canEdit ? 'Published forms crew can fill in, and the review queue for what they submit.' : 'Forms to fill in, and the ones you have already submitted.'}
      actions={
        access.canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> New form
          </Button>
        )
      }
    >
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Forms</h2>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {access.canEdit ? 'No forms yet. Create one and build its fields in the form builder.' : 'No forms have been published yet.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {forms.map((t) => {
              const cat = categoryDef(t.category);
              const Icon = cat.icon;
              return (
                <Card key={t.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md bg-muted p-2 text-muted-foreground" title={cat.label}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <TemplateStatusBadge status={t.status} />
                    </div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <CardDescription>{t.description || `${cat.label} · ${t.department} · v${t.current_version}`}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1" />
                  <CardFooter className="flex flex-wrap gap-2">
                    <Button asChild size="sm" disabled={t.status !== 'active' && !access.canEdit}>
                      <Link to={LEGAL_PATHS.formFill(t.id)}>
                        <ClipboardList className="mr-2 h-4 w-4" /> Fill in
                      </Link>
                    </Button>
                    {access.canEdit && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={LEGAL_PATHS.document(t.id)}>
                          <Hammer className="mr-2 h-4 w-4" /> Build
                        </Link>
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {access.canView ? 'Submissions' : 'My submissions'}
            {access.canView && pendingCount > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{pendingCount} awaiting review</span>}
          </h2>
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
        <SubmissionsTable rows={rows} templateName={nameOf} isLoading={submissions.isLoading} onOpen={setReviewing} emptyText={access.canView ? 'No submissions to review.' : 'You have not submitted any forms yet.'} />
      </section>

      <SubmissionReviewSheet
        submission={reviewing}
        templateName={reviewing ? nameOf(reviewing.template_id) : ''}
        onOpenChange={(o) => !o && setReviewing(null)}
        canReview={access.canEdit}
        onReview={async (args) => {
          await submissions.reviewSubmission.mutateAsync(args);
          setReviewing(null);
        }}
        isReviewing={submissions.reviewSubmission.isPending}
      />

      <NewDocumentDialog open={creating} onOpenChange={setCreating} onCreate={(args) => createTemplate.mutateAsync(args)} isPending={createTemplate.isPending} defaultType="form" />
    </LegalShell>
  );
};

export default LegalFormsPage;
