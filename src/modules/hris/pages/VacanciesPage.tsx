import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import {
  useApplicationMutations,
  useCandidateMutations,
  useMyInterviews,
  usePayGradeOptions,
  useVacancies,
  useVacancyMutations,
} from '@/modules/hris/hooks/useRecruitment';
import { formatDateTime } from '@/modules/hris/lib/format';
import {
  DEFAULT_VACANCY_FILTERS,
  candidateFormToPayload,
  vacancyFormToPayload,
  type CandidateFormValues,
  type VacancyFormValues,
  type VacancyRow,
} from '@/modules/hris/lib/recruitment';
import { VacanciesOverview } from '@/modules/hris/components/recruitment/VacanciesOverview';
import { VacancyDetail } from '@/modules/hris/components/recruitment/VacancyDetail';
import { VacancyFormDialog } from '@/modules/hris/components/recruitment/VacancyFormDialog';
import { CandidateFormDialog } from '@/modules/hris/components/recruitment/CandidateFormDialog';
import { ApplicationDrawer } from '@/modules/hris/components/recruitment/ApplicationDrawer';

type FormState = { open: false } | { open: true; vacancy: VacancyRow | null };

/**
 * Recruitment › Vacancies. List mode shows KPIs and the vacancy table;
 * `?vacancy=<id>` opens the pipeline board and `?application=<id>` the
 * application drawer on top of it.
 */
const VacanciesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const access = useHrAccess();
  const canEdit = !access.loading && access.canEdit;

  const vacancyId = searchParams.get('vacancy');
  const applicationId = searchParams.get('application');

  const setParam = useCallback(
    (key: 'vacancy' | 'application', value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key === 'vacancy' && !value) next.delete('application');
          return next;
        },
        { replace: key === 'application' },
      );
    },
    [setSearchParams],
  );

  const { vessels } = useCompanyVessels();
  const { grades } = usePayGradeOptions();
  const { all } = useVacancies(DEFAULT_VACANCY_FILTERS);
  const vacancyMutations = useVacancyMutations();
  const candidateMutations = useCandidateMutations();
  const applicationMutations = useApplicationMutations();
  const myInterviews = useMyInterviews();

  const [formState, setFormState] = useState<FormState>({ open: false });
  const [candidateFormFor, setCandidateFormFor] = useState<VacancyRow | null>(null);

  const currentVacancy = useMemo(() => all.find((v) => v.id === vacancyId) ?? null, [all, vacancyId]);

  const handleVacancySubmit = async (values: VacancyFormValues) => {
    if (!formState.open) return;
    const payload = vacancyFormToPayload(values);
    if (formState.vacancy) {
      // Status is managed from the header; the form only edits details.
      const { status, ...rest } = payload;
      void status;
      await vacancyMutations.update.mutateAsync({ vacancy: formState.vacancy, payload: rest });
    } else {
      const created = await vacancyMutations.create.mutateAsync(payload);
      setParam('vacancy', created.id);
    }
    setFormState({ open: false });
  };

  const handleCandidateSubmit = async (values: CandidateFormValues) => {
    const target = candidateFormFor;
    const created = await candidateMutations.create.mutateAsync(candidateFormToPayload(values));
    if (target) await applicationMutations.apply.mutateAsync({ vacancyId: target.id, candidateId: created.id });
    setCandidateFormFor(null);
  };

  const upcoming = myInterviews.interviews.slice(0, 3);

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={Briefcase}
        title="Vacancies"
        description={vacancyId ? 'Pipeline, interviews and offers for this position.' : 'Open positions and how each pipeline is progressing.'}
        actions={
          !vacancyId && canEdit ? (
            <Button onClick={() => setFormState({ open: true, vacancy: null })} disabled={vacancyMutations.create.isPending}>
              <Plus className="mr-2 h-4 w-4" /> New vacancy
            </Button>
          ) : undefined
        }
        toolbar={
          !vacancyId && upcoming.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarDays className="h-4 w-4" /> Your next interviews:</span>
              {upcoming.map((iv) => (
                <Button
                  key={iv.id}
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    setParam('vacancy', iv.vacancy_id);
                    setParam('application', iv.application_id);
                  }}
                >
                  {iv.candidate_name}
                  <Badge variant="secondary" className="ml-2 text-[10px] font-normal">{formatDateTime(iv.scheduled_at)}</Badge>
                </Button>
              ))}
            </div>
          ) : undefined
        }
      />

      {access.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : vacancyId ? (
        <VacancyDetail
          vacancyId={vacancyId}
          canEdit={canEdit}
          onBack={() => setParam('vacancy', null)}
          onEdit={(vacancy) => setFormState({ open: true, vacancy })}
          onOpenApplication={(id) => setParam('application', id)}
          onCreateCandidate={() => setCandidateFormFor(currentVacancy)}
          onDeleted={() => setParam('vacancy', null)}
        />
      ) : (
        <VacanciesOverview onSelectVacancy={(id) => setParam('vacancy', id)} canEdit={canEdit} onCreate={() => setFormState({ open: true, vacancy: null })} />
      )}

      <VacancyFormDialog
        open={formState.open}
        onOpenChange={(open) => !open && setFormState({ open: false })}
        vacancy={formState.open ? formState.vacancy : null}
        vessels={vessels}
        payGrades={grades}
        nextSequence={all.length + 1}
        onSubmit={handleVacancySubmit}
        isPending={vacancyMutations.create.isPending || vacancyMutations.update.isPending}
      />

      <CandidateFormDialog
        open={Boolean(candidateFormFor)}
        onOpenChange={(open) => !open && setCandidateFormFor(null)}
        defaults={candidateFormFor ? { rank: candidateFormFor.rank ?? '', department: candidateFormFor.department ?? '' } : undefined}
        applyingTo={candidateFormFor?.title ?? null}
        onSubmit={handleCandidateSubmit}
        isPending={candidateMutations.create.isPending || applicationMutations.apply.isPending}
      />

      <ApplicationDrawer applicationId={applicationId} onClose={() => setParam('application', null)} canEdit={canEdit} />
    </div>
  );
};

export default VacanciesPage;
