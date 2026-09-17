import React, { useMemo, useState } from 'react';
import { Gavel, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useDisciplinaryMutations, useDisciplinaryRecords, type DisciplinaryRecord } from '@/modules/hris/hooks/useDisciplinary';
import { DEFAULT_DISCIPLINARY_FILTERS, caseFormToPayload, type CaseFormValues, type DisciplinaryRecordRow } from '@/modules/hris/lib/disciplinary';
import { ConfidentialityBanner } from '@/modules/hris/components/disciplinary/ConfidentialityBanner';
import { DisciplinaryOverview } from '@/modules/hris/components/disciplinary/DisciplinaryOverview';
import { CaseTimeline } from '@/modules/hris/components/disciplinary/CaseTimeline';
import { CaseFormDialog } from '@/modules/hris/components/disciplinary/CaseFormDialog';
import { CaseDetail } from '@/modules/hris/components/disciplinary/CaseDetail';

type FormState = { open: false } | { open: true; record: DisciplinaryRecordRow | null };

/** HR-editor-only route (gated in routes.tsx). Crew see their own matters via MyDisciplinaryCard elsewhere. */
const DisciplinaryPage: React.FC = () => {
  const { profileId, entry, setProfileId, access } = useSelectedCrew();
  const { vessels } = useCompanyVessels();
  const mutations = useDisciplinaryMutations();

  const [formState, setFormState] = useState<FormState>({ open: false });
  const [detailId, setDetailId] = useState<string | null>(null);

  const canEdit = !access.loading && access.canEdit;
  const canAdmin = !access.loading && access.canAdmin;
  const crewMode = Boolean(profileId);

  const crewFilters = useMemo(() => ({ ...DEFAULT_DISCIPLINARY_FILTERS, crewId: profileId ?? 'all' }), [profileId]);
  const crew = useDisciplinaryRecords(crewFilters, { enabled: crewMode });

  const newCase = () => setFormState({ open: true, record: null });
  const editFromDetail = (record: DisciplinaryRecord) => {
    setDetailId(null);
    setFormState({ open: true, record });
  };

  const handleSubmit = async (values: CaseFormValues) => {
    if (!formState.open) return;
    const payload = caseFormToPayload(values);
    if (formState.record) {
      await mutations.update.mutateAsync({ record: formState.record, payload });
    } else {
      const created = await mutations.create.mutateAsync({ profileId: values.profile_id, payload });
      if (!profileId) setProfileId(created.profile_id);
    }
    setFormState({ open: false });
  };

  const formDefaults = useMemo<Partial<CaseFormValues>>(
    () => (profileId ? { profile_id: profileId, vessel_id: entry?.vessel_id ?? '' } : {}),
    [profileId, entry?.vessel_id],
  );

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={Gavel}
        title="Disciplinary Matters"
        description={
          crewMode
            ? 'Progressive-discipline history and case files for the selected crew member.'
            : 'Open cases, live warnings and the disciplinary register across the company.'
        }
        actions={
          <>
            {crewMode && (
              <Button variant="outline" onClick={() => setProfileId(null)}>
                <Users className="mr-2 h-4 w-4" /> All crew
              </Button>
            )}
            {canEdit && (
              <Button onClick={newCase} disabled={mutations.create.isPending}>
                <Plus className="mr-2 h-4 w-4" /> New case
              </Button>
            )}
          </>
        }
        toolbar={
          <CrewPicker
            value={profileId}
            onChange={(id) => setProfileId(id)}
            includeInactive
            className="md:w-[420px]"
            placeholder="Select a crew member to open their file"
          />
        }
      />

      <ConfidentialityBanner />

      {access.loading || !canEdit ? (
        <Skeleton className="h-40 w-full" />
      ) : !crewMode ? (
        <DisciplinaryOverview onSelectCrew={setProfileId} onOpenRecord={setDetailId} />
      ) : (
        <CaseTimeline
          records={crew.all}
          isLoading={crew.isLoading}
          crewName={entry?.displayName}
          onOpen={(r) => setDetailId(r.id)}
          onCreate={newCase}
        />
      )}

      <CaseFormDialog
        open={formState.open}
        onOpenChange={(open) => !open && setFormState({ open: false })}
        record={formState.open ? formState.record : null}
        defaults={formDefaults}
        lockSubject={crewMode}
        vessels={vessels}
        existingRecords={crewMode ? crew.all : undefined}
        onSubmit={handleSubmit}
        isPending={mutations.create.isPending || mutations.update.isPending}
      />

      <CaseDetail recordId={detailId} onOpenChange={(open) => !open && setDetailId(null)} canAdmin={canAdmin} onEdit={editFromDetail} />
    </div>
  );
};

export default DisciplinaryPage;
