import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus, UserSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { useCandidateMutations } from '@/modules/hris/hooks/useRecruitment';
import { candidateFormToPayload, type CandidateFormValues, type CandidateRow } from '@/modules/hris/lib/recruitment';
import { CandidatesTable } from '@/modules/hris/components/recruitment/CandidatesTable';
import { CandidateDetail } from '@/modules/hris/components/recruitment/CandidateDetail';
import { CandidateFormDialog } from '@/modules/hris/components/recruitment/CandidateFormDialog';
import { ApplicationDrawer } from '@/modules/hris/components/recruitment/ApplicationDrawer';

type FormState = { open: false } | { open: true; candidate: CandidateRow | null };

/**
 * Recruitment › Candidates. List mode is the candidate pool; `?candidate=<id>`
 * opens one record and `?application=<id>` the application drawer.
 */
const CandidatesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const access = useHrAccess();
  const canEdit = !access.loading && access.canEdit;

  const candidateId = searchParams.get('candidate');
  const applicationId = searchParams.get('application');

  const setParam = useCallback(
    (key: 'candidate' | 'application', value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key === 'candidate' && !value) next.delete('application');
          return next;
        },
        { replace: key === 'application' },
      );
    },
    [setSearchParams],
  );

  const mutations = useCandidateMutations();
  const [formState, setFormState] = useState<FormState>({ open: false });

  const handleSubmit = async (values: CandidateFormValues) => {
    if (!formState.open) return;
    if (formState.candidate) {
      const payload = candidateFormToPayload(values, { existingConsentAt: formState.candidate.gdpr_consent_at });
      await mutations.update.mutateAsync({ candidate: formState.candidate, payload });
    } else {
      const created = await mutations.create.mutateAsync(candidateFormToPayload(values));
      setParam('candidate', created.id);
    }
    setFormState({ open: false });
  };

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={UserSearch}
        title="Candidates"
        description={candidateId ? 'Profile, CV, consent and applications for this candidate.' : 'The talent pool: everyone who has applied or been sourced for a position.'}
        actions={
          !candidateId && canEdit ? (
            <Button onClick={() => setFormState({ open: true, candidate: null })} disabled={mutations.create.isPending}>
              <UserPlus className="mr-2 h-4 w-4" /> New candidate
            </Button>
          ) : undefined
        }
      />

      {access.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : candidateId ? (
        <CandidateDetail
          candidateId={candidateId}
          canEdit={canEdit}
          onBack={() => setParam('candidate', null)}
          onEdit={(candidate) => setFormState({ open: true, candidate })}
          onOpenApplication={(id) => setParam('application', id)}
          onDeleted={() => setParam('candidate', null)}
        />
      ) : (
        <CandidatesTable onSelectCandidate={(id) => setParam('candidate', id)} canEdit={canEdit} onCreate={() => setFormState({ open: true, candidate: null })} />
      )}

      <CandidateFormDialog
        open={formState.open}
        onOpenChange={(open) => !open && setFormState({ open: false })}
        candidate={formState.open ? formState.candidate : null}
        onSubmit={handleSubmit}
        isPending={mutations.create.isPending || mutations.update.isPending}
      />

      <ApplicationDrawer applicationId={applicationId} onClose={() => setParam('application', null)} canEdit={canEdit} />
    </div>
  );
};

export default CandidatesPage;
