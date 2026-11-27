import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { notify } from '@/shared/lib/notify';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { PositionPicker, type PositionOption } from '@/modules/crew/components/PositionPicker';
import { usePositions } from '@/modules/crew/hooks/usePositions';
import { useDepartments } from '@/modules/crew/hooks/useReferenceData';
import { useContractTypes } from '@/modules/crew/hooks/useAddCrew';
import { EmploymentError, useSaveEmploymentTerms } from '@/modules/crew/hooks/useEmployment';
import { formatDay } from '@/modules/crew/hooks/useCrewProfile';
import type { CrewAssignmentTermsRow } from '@/modules/crew/types/db.pending';
import type { VesselPosition } from '@/modules/crew/types/domain';
import { LEAVE_METHODS, LEAVE_METHOD_LABEL, leaveDaysPerMonthText } from '@/modules/crew/lib/addCrewSchema';
import {
  NOTICE_DAYS_MAX,
  PROBATION_MONTHS_MAX,
  makeTermsSchema,
  termsChanges,
  termsDefaults,
  termsFieldFor,
  toContractNoticePatch,
  toTermsPayload,
  type ContractNotice,
  type ContractNoticePatch,
  type TermsFormValues,
} from '@/modules/crew/lib/employment';

const FIELD = 'min-h-10 [@media(pointer:coarse)]:min-h-11';

/** The active contract, as much of it as the dialog uses. */
export interface TermsContract {
  id: string;
  contractNumber: string | null;
  startDate: string;
  probationEndDate: string | null;
  noticePeriodDays: number | null;
}

export interface TermsEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel: { id: string; companyId: string; name: string };
  profileId: string;
  personName: string;
  /** The open terms on the vessel, or null (then Save adds them, from `fallbackStart`). */
  terms: CrewAssignmentTermsRow | null;
  fallbackStart: string | null;
  contract: TermsContract | null;
  notice: ContractNotice;
  /** May store terms (crew_onboarding_save: vessel.crew.crew_profiles.create on the vessel). */
  canEditTerms: boolean;
  /** May change the contract (HR edit: hris.employee_records.contracts_employment.edit). */
  canEditContract: boolean;
}

const toOption = (p: VesselPosition): PositionOption => ({
  id: p.positionId,
  name: p.name,
  departmentKey: p.departmentKey,
  departmentLabel: p.departmentLabel,
  departmentSort: p.departmentSort,
  rankTier: p.rankTier,
  sortOrder: p.sortOrder,
  hint: p.holderCount > 0 ? `${p.holderCount} on board` : undefined,
});

/**
 * Edit the employment terms (gap/04 C57; X1-11B): position and department,
 * contract type, the dates (the start date names the record and is fixed;
 * date joining the vessel, review date), the leave allowance and the place
 * of embarkation, saved through crew_onboarding_save's terms path (every
 * key: a save of the same start date replaces the row); and the active
 * contract's probation length and its two notice periods (061100 columns,
 * a crew_contracts update as HRIS's contract editor does, with
 * probation_end_date and notice_period_days kept in step for the legacy
 * readers).
 *
 * Each part opens only to its writers (the server decides again); a part
 * the viewer may not change is shown read-only with the reason. A refusal
 * that names a field (HINT) lands on it; a contract part refused after the
 * terms saved reads "Partly saved" and keeps the entries (D-218). D-01: the
 * position and department lists missing make them optional; the contract
 * columns missing leave the periods read-only with a notice.
 */
const TermsEditDialog: React.FC<TermsEditDialogProps> = ({
  open,
  onOpenChange,
  vessel,
  profileId,
  personName,
  terms,
  fallbackStart,
  contract,
  notice,
  canEditTerms,
  canEditContract,
}) => {
  const { user, profile } = useAuth();
  const positions = usePositions(vessel, { enabled: open && canEditTerms });
  const departments = useDepartments({ enabled: open && canEditTerms });
  const contractTypes = useContractTypes(vessel.companyId, { enabled: open && canEditTerms });
  const save = useSaveEmploymentTerms(vessel, profileId);

  const positionsFromCatalogue = positions.status === 'ready';
  const departmentsAvailable = departments.status === 'ready' && departments.items.length > 0;
  const contractEditable = canEditContract && Boolean(contract) && notice.known;
  const isNew = !terms;

  const initial = useMemo(() => termsDefaults(terms, notice, fallbackStart), [terms, notice, fallbackStart]);
  const schema = useMemo(
    () => makeTermsSchema({ editTerms: canEditTerms, editContract: contractEditable, positionsFromCatalogue, departmentsAvailable }),
    [canEditTerms, contractEditable, positionsFromCatalogue, departmentsAvailable],
  );
  const form = useForm<TermsFormValues>({ resolver: zodResolver(schema), defaultValues: initial });
  const { register, control, handleSubmit, setError, watch, formState, reset } = form;
  const [formError, setFormError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      reset(initial);
      setFormError(null);
      setPartial(null);
    }
  }, [open, initial, reset]);

  const values = watch();
  // The vessel's listed positions, and the stored one even if it is no longer listed.
  const options = useMemo(
    () => (positions.status === 'ready' ? positions.positions.filter((p) => p.isListed || p.positionId === initial.positionId).map(toOption) : []),
    [positions, initial.positionId],
  );
  const errorText = (name: keyof TermsFormValues) => {
    const message = formState.errors[name]?.message;
    return typeof message === 'string' ? message : null;
  };
  const busy = save.isPending;

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    const changes = termsChanges(v, initial);
    const termsPart = canEditTerms && (changes.terms || isNew) ? toTermsPayload(v, { positionsFromCatalogue, departmentsAvailable }) : null;
    let contractPart: { id: string; before: ContractNoticePatch; patch: ContractNoticePatch } | null = null;
    if (contractEditable && contract && changes.contract) {
      contractPart = {
        id: contract.id,
        before: {
          probation_months: notice.probationMonths,
          notice_during_probation_days: notice.noticeDuringProbationDays,
          notice_after_probation_days: notice.noticeAfterProbationDays,
          notice_period_days: contract.noticePeriodDays,
          probation_end_date: contract.probationEndDate,
        },
        patch: toContractNoticePatch(v, { start_date: contract.startDate }),
      };
    }
    if (!termsPart && !contractPart) {
      notify.info('Nothing changed');
      onOpenChange(false);
      return;
    }
    try {
      const outcome = await save.mutateAsync({
        profileId,
        vesselId: vessel.id,
        terms: termsPart,
        contract: contractPart,
        actor: { userId: user?.id ?? null, email: user?.email ?? null, role: profile?.role ?? null },
      });
      if (outcome.kind === 'partly_saved') {
        setPartial(outcome.contractError);
        return;
      }
      notify.success(outcome.terms && outcome.contract ? 'Employment terms and contract saved' : outcome.contract ? 'Contract periods saved' : 'Employment terms saved');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof EmploymentError) {
        const field = termsFieldFor(e.hint);
        if (field) {
          setError(field, { type: 'server', message: e.message });
          return;
        }
        setFormError(e.message);
        return;
      }
      setFormError(e instanceof Error ? e.message : 'The employment terms were not saved. Try again.');
    }
  });

  const perMonth = values.leaveMethod === 'days_per_year' ? leaveDaysPerMonthText(values.leaveDaysPerYear) : null;
  const contractNote = !contract
    ? 'No active contract. Add one in HR contracts; the probation and notice periods are kept on it.'
    : !notice.known
      ? 'The probation length and the two notice periods can be stored once the crew update is applied.'
      : !canEditContract
        ? 'Changing the contract needs HR edit access to contracts.'
        : `Kept on the active contract${contract.contractNumber ? ` ${contract.contractNumber}` : ''}, started ${formatDay(contract.startDate)}.`;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto" data-terms-edit="">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add employment terms' : 'Edit employment terms'}</DialogTitle>
          <DialogDescription>
            {personName} on {vessel.name}.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={submit} noValidate aria-label="Employment terms">
          <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2" disabled={!canEditTerms || busy} data-terms-section="role">
            <legend className="mb-1 type-eyebrow text-muted-foreground sm:col-span-2">Role</legend>
            {!canEditTerms ? (
              <p className="type-caption text-muted-foreground sm:col-span-2">Changing the terms needs crew profile creation on this vessel.</p>
            ) : null}
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terms-position">Position</Label>
              {positions.status === 'loading' || positions.status === 'idle' ? (
                <Skeleton className="h-10" aria-label="Loading positions" />
              ) : positionsFromCatalogue ? (
                <Controller
                  control={control}
                  name="positionId"
                  render={({ field }) => (
                    <PositionPicker
                      id="terms-position"
                      options={options}
                      value={field.value || null}
                      onChange={(id, option) => {
                        field.onChange(id ?? '');
                        if (option && option.departmentKey && departmentsAvailable && !form.getValues('departmentKey')) {
                          form.setValue('departmentKey', option.departmentKey, { shouldDirty: true });
                        }
                      }}
                      label="Position"
                      disabled={!canEditTerms || busy}
                      emptyText="No position matches. Add it in Positions on the crew list."
                      className={FIELD}
                    />
                  )}
                />
              ) : (
                <p className="type-caption text-muted-foreground">
                  {positions.status === 'error' ? 'The vessel’s positions could not be loaded; the position stays as it is.' : 'The vessel’s positions arrive with the crew update.'}
                </p>
              )}
              {errorText('positionId') ? <p className="type-caption text-critical">{errorText('positionId')}</p> : null}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terms-department">Department</Label>
              {departmentsAvailable ? (
                <Controller
                  control={control}
                  name="departmentKey"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!canEditTerms || busy}>
                      <SelectTrigger id="terms-department" className={FIELD} aria-invalid={Boolean(errorText('departmentKey'))}>
                        <SelectValue placeholder="Choose a department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.items.map((d) => (
                          <SelectItem key={d.key} value={d.key}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <p className="type-caption text-muted-foreground">The department list arrives with the crew update.</p>
              )}
              {errorText('departmentKey') ? <p className="type-caption text-critical">{errorText('departmentKey')}</p> : null}
            </div>
          </fieldset>

          <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2" disabled={!canEditTerms || busy} data-terms-section="dates">
            <legend className="mb-1 type-eyebrow text-muted-foreground sm:col-span-2">Dates</legend>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terms-start">Start date</Label>
              {isNew ? (
                <Input id="terms-start" type="date" className={FIELD} aria-invalid={Boolean(errorText('startDate'))} {...register('startDate')} />
              ) : (
                <p id="terms-start" className="flex min-h-10 items-center type-body text-foreground">
                  {formatDay(initial.startDate) ?? 'Not recorded'}
                </p>
              )}
              <p className="type-caption text-muted-foreground">{isNew ? 'When the contract or agreement starts.' : 'It names this record and stays as it is.'}</p>
              {errorText('startDate') ? <p className="type-caption text-critical">{errorText('startDate')}</p> : null}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terms-joining">Date joining the vessel</Label>
              <Input
                id="terms-joining"
                type="date"
                className={FIELD}
                min={values.startDate || undefined}
                aria-invalid={Boolean(errorText('joiningDate'))}
                {...register('joiningDate')}
              />
              {errorText('joiningDate') ? <p className="type-caption text-critical">{errorText('joiningDate')}</p> : null}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terms-review">Review date</Label>
              <Input
                id="terms-review"
                type="date"
                className={FIELD}
                min={values.startDate || undefined}
                aria-invalid={Boolean(errorText('reviewDate'))}
                aria-describedby="terms-review-help"
                {...register('reviewDate')}
              />
              <p id="terms-review-help" className="type-caption text-muted-foreground">
                For the probation or annual review.
              </p>
              {errorText('reviewDate') ? <p className="type-caption text-critical">{errorText('reviewDate')}</p> : null}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terms-port">Place of embarkation</Label>
              <Input id="terms-port" className={FIELD} maxLength={130} aria-invalid={Boolean(errorText('placeOfEmbarkation'))} {...register('placeOfEmbarkation')} />
              {errorText('placeOfEmbarkation') ? <p className="type-caption text-critical">{errorText('placeOfEmbarkation')}</p> : null}
            </div>
          </fieldset>

          <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2" data-terms-section="contract">
            <legend className="mb-1 type-eyebrow text-muted-foreground sm:col-span-2">Contract</legend>
            <div className="min-w-0 space-y-2 sm:col-span-2">
              <Label htmlFor="terms-contract-type">Contract type</Label>
              {contractTypes.status === 'ready' ? (
                <Controller
                  control={control}
                  name="contractTypeKey"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!canEditTerms || busy}>
                      <SelectTrigger id="terms-contract-type" className={FIELD} aria-invalid={Boolean(errorText('contractTypeKey'))}>
                        <SelectValue placeholder="Choose a contract type" />
                      </SelectTrigger>
                      <SelectContent>
                        {contractTypes.items.map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <p className="type-caption text-muted-foreground">
                  {contractTypes.status === 'loading' ? 'Loading the contract types…' : 'The contract types arrive with the crew update.'}
                </p>
              )}
              {errorText('contractTypeKey') ? <p className="type-caption text-critical">{errorText('contractTypeKey')}</p> : null}
            </div>
            <p className="type-caption text-muted-foreground sm:col-span-2" data-terms-contract-note="">
              {contractNote}{' '}
              {!contract ? (
                <Link className="text-primary underline-offset-4 hover:underline" to={`${HRIS_PATHS.contracts}?crew=${encodeURIComponent(profileId)}`}>
                  Open HR contracts
                </Link>
              ) : null}
            </p>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terms-probation">Probation (months)</Label>
              <Input
                id="terms-probation"
                inputMode="numeric"
                className={FIELD}
                disabled={!contractEditable || busy}
                aria-invalid={Boolean(errorText('probationMonths'))}
                aria-describedby="terms-probation-help"
                {...register('probationMonths')}
              />
              <p id="terms-probation-help" className="type-caption text-muted-foreground">
                0 to {PROBATION_MONTHS_MAX}; 0 is no probation.
              </p>
              {errorText('probationMonths') ? <p className="type-caption text-critical">{errorText('probationMonths')}</p> : null}
            </div>
            <div className="hidden sm:block" aria-hidden="true" />
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terms-notice-during">Notice during probation (days)</Label>
              <Input
                id="terms-notice-during"
                inputMode="numeric"
                className={FIELD}
                disabled={!contractEditable || busy}
                aria-invalid={Boolean(errorText('noticeDuringProbationDays'))}
                {...register('noticeDuringProbationDays')}
              />
              {errorText('noticeDuringProbationDays') ? <p className="type-caption text-critical">{errorText('noticeDuringProbationDays')}</p> : null}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terms-notice-after">Notice after probation (days)</Label>
              <Input
                id="terms-notice-after"
                inputMode="numeric"
                className={FIELD}
                disabled={!contractEditable || busy}
                aria-invalid={Boolean(errorText('noticeAfterProbationDays'))}
                aria-describedby="terms-notice-help"
                {...register('noticeAfterProbationDays')}
              />
              <p id="terms-notice-help" className="type-caption text-muted-foreground">
                0 to {NOTICE_DAYS_MAX} days.
              </p>
              {errorText('noticeAfterProbationDays') ? <p className="type-caption text-critical">{errorText('noticeAfterProbationDays')}</p> : null}
            </div>
          </fieldset>

          <fieldset className="min-w-0 space-y-3" disabled={!canEditTerms || busy} data-terms-section="leave">
            <legend className="mb-1 type-eyebrow text-muted-foreground">Leave allowance</legend>
            <Controller
              control={control}
              name="leaveMethod"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-wrap gap-x-6 gap-y-2" aria-label="How leave is earned">
                  {LEAVE_METHODS.map((m) => (
                    <label key={m} className="flex min-h-9 cursor-pointer items-center gap-2 type-body text-foreground [@media(pointer:coarse)]:min-h-11">
                      <RadioGroupItem value={m} />
                      {LEAVE_METHOD_LABEL[m]}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
            {values.leaveMethod === 'days_per_year' ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Input aria-label="Days per year" inputMode="decimal" className={`${FIELD} w-24`} {...register('leaveDaysPerYear')} />
                  <span className="type-body text-muted-foreground">days a year</span>
                  {perMonth ? <span className="type-body-sm tabular-nums text-foreground">{perMonth}</span> : null}
                </div>
                {errorText('leaveDaysPerYear') ? <p className="type-caption text-critical">{errorText('leaveDaysPerYear')}</p> : null}
              </div>
            ) : null}
            {values.leaveMethod === 'ratio' ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Input aria-label="Time on board" inputMode="numeric" placeholder="On" className={`${FIELD} w-20`} {...register('leaveRatioOn')} />
                  <span className="type-body text-muted-foreground">on :</span>
                  <Input aria-label="Time off" inputMode="numeric" placeholder="Off" className={`${FIELD} w-20`} {...register('leaveRatioOff')} />
                  <span className="type-body text-muted-foreground">off</span>
                </div>
                {errorText('leaveRatioOn') ?? errorText('leaveRatioOff') ? (
                  <p className="type-caption text-critical">{errorText('leaveRatioOn') ?? errorText('leaveRatioOff')}</p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          {partial ? (
            <Alert variant="warning" data-terms-partial="">
              <AlertTitle>Partly saved</AlertTitle>
              <AlertDescription>The employment terms were saved. The probation and notice periods were not saved: {partial}</AlertDescription>
            </Alert>
          ) : null}
          {formError ? (
            <Alert variant="destructive" data-terms-error="">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={() => onOpenChange(false)} disabled={busy}>
              {partial ? 'Close' : 'Cancel'}
            </Button>
            <Button type="submit" className="[@media(pointer:coarse)]:h-11" disabled={busy || (!canEditTerms && !contractEditable)}>
              {busy ? <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TermsEditDialog;
