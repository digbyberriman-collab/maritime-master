import React, { useMemo, useState } from 'react';
import { Banknote, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import {
  useBankDetailMutations,
  useBankDetails,
  useCompensationMutations,
  useCrewCompensation,
  type CrewCompensation,
} from '@/modules/hris/hooks/useCompensation';
import { useHrCompanySettings, usePayGrades } from '@/modules/hris/hooks/useCompensationSettings';
import {
  formValuesToBankDetailPayload,
  formValuesToCompensationPayload,
  type BankDetailFormValues,
  type BankDetailRow,
  type CompensationFormValues,
} from '@/modules/hris/lib/compensation';
import { PayrollCostOverview } from '@/modules/hris/components/compensation/PayrollCostOverview';
import { CompensationCard } from '@/modules/hris/components/compensation/CompensationCard';
import { CompensationHistoryTable } from '@/modules/hris/components/compensation/CompensationHistoryTable';
import { CompensationFormDialog } from '@/modules/hris/components/compensation/CompensationFormDialog';
import { BankDetailsCard } from '@/modules/hris/components/compensation/BankDetailsCard';
import { BankDetailsFormDialog } from '@/modules/hris/components/compensation/BankDetailsFormDialog';

type CompFormState = { open: false } | { open: true; row: CrewCompensation | null };
type BankFormState = { open: false } | { open: true; row: BankDetailRow | null };

/**
 * Salaries & Compensation. Company overview when no crew member is selected
 * (payroll viewers only), otherwise the selected crew member's package,
 * history and bank details. Crew without payroll access are pinned to their
 * own record: compensation read-only, bank details editable.
 */
const SalariesPage: React.FC = () => {
  const { profile } = useAuth();
  const payroll = usePayrollAccess();
  const selection = useSelectedCrew();

  // Finance access is narrower than HR access: anyone without payroll view
  // rights only ever sees their own record, whatever the crew picker says.
  const payrollSelfOnly = !payroll.loading && !payroll.canView;
  const profileId = payrollSelfOnly ? profile?.id ?? null : selection.profileId;
  const isOwnRecord = Boolean(profile?.id && profileId === profile.id);
  const directory = useHrCrewDirectory({ includeInactive: true });
  const entry = useMemo(() => directory.all.find((e) => e.id === profileId) ?? null, [directory.all, profileId]);
  const crewName = entry?.displayName ?? (isOwnRecord ? 'you' : undefined);

  const canView = !payroll.loading && payroll.canView;
  const canEdit = !payroll.loading && payroll.canEdit;
  const canAdmin = !payroll.loading && payroll.canAdmin;
  const canEditBank = canEdit || isOwnRecord;

  const comp = useCrewCompensation(profileId);
  const bank = useBankDetails(profileId);
  const compMutations = useCompensationMutations();
  const bankMutations = useBankDetailMutations();
  const { grades } = usePayGrades({ includeInactive: true });
  const { settings } = useHrCompanySettings();

  const [compForm, setCompForm] = useState<CompFormState>({ open: false });
  const [bankForm, setBankForm] = useState<BankFormState>({ open: false });
  const [deletingComp, setDeletingComp] = useState<CrewCompensation | null>(null);
  const [deletingBank, setDeletingBank] = useState<BankDetailRow | null>(null);

  const busy =
    compMutations.create.isPending ||
    compMutations.update.isPending ||
    compMutations.activate.isPending ||
    compMutations.supersede.isPending ||
    compMutations.remove.isPending;
  const bankBusy =
    bankMutations.create.isPending ||
    bankMutations.update.isPending ||
    bankMutations.setPrimary.isPending ||
    bankMutations.verify.isPending ||
    bankMutations.remove.isPending;

  const newCompDefaults = useMemo<Partial<CompensationFormValues>>(() => {
    // Suggest the grade matching the crew member's rank, and the company currency.
    const grade = grades.find((g) => g.is_active && g.rank && entry?.rank && g.rank.toLowerCase() === entry.rank.toLowerCase());
    return { currency: settings?.default_currency ?? 'EUR', pay_grade_id: grade?.id ?? '' };
  }, [grades, entry?.rank, settings?.default_currency]);

  const newBankDefaults = useMemo<Partial<BankDetailFormValues>>(
    () => ({ account_holder: entry?.fullName ?? '', currency: comp.current?.currency ?? settings?.default_currency ?? '', is_primary: bank.accounts.length === 0 }),
    [entry?.fullName, comp.current?.currency, settings?.default_currency, bank.accounts.length],
  );

  const submitComp = async (values: CompensationFormValues) => {
    if (!profileId || !compForm.open) return;
    const payload = formValuesToCompensationPayload(values);
    if (compForm.row) {
      // A superseded package stays superseded; the form hides the status field for it.
      const { status, ...rest } = payload;
      await compMutations.update.mutateAsync({ row: compForm.row, payload: compForm.row.status === 'superseded' ? rest : { ...rest, status } });
    } else {
      await compMutations.create.mutateAsync({ profileId, payload });
    }
    setCompForm({ open: false });
  };

  const submitBank = async (values: BankDetailFormValues) => {
    if (!profileId || !bankForm.open) return;
    const payload = formValuesToBankDetailPayload(values);
    if (bankForm.row) await bankMutations.update.mutateAsync({ row: bankForm.row, payload });
    else await bankMutations.create.mutateAsync({ profileId, payload });
    setBankForm({ open: false });
  };

  const crewMode = Boolean(profileId);

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={Banknote}
        title="Salaries & Compensation"
        description={
          crewMode
            ? 'Base pay, allowances, gratuity eligibility and bank details for the selected crew member.'
            : 'Payroll cost and compensation coverage across the company.'
        }
        actions={
          <>
            {crewMode && !payrollSelfOnly && !selection.selfOnly && (
              <Button variant="outline" onClick={() => selection.setProfileId(null)}>
                <Users className="mr-2 h-4 w-4" /> All crew
              </Button>
            )}
            {crewMode && canEdit && (
              <Button onClick={() => setCompForm({ open: true, row: null })} disabled={busy}>
                <Plus className="mr-2 h-4 w-4" /> New compensation
              </Button>
            )}
          </>
        }
        toolbar={
          !payrollSelfOnly &&
          !selection.selfOnly && (
            <CrewPicker
              value={profileId}
              onChange={(id) => selection.setProfileId(id)}
              includeInactive
              className="md:w-[420px]"
              placeholder="Select a crew member to view their compensation"
            />
          )
        }
      />

      {payroll.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : !crewMode ? (
        canView ? (
          <PayrollCostOverview onSelectCrew={selection.setProfileId} showWage={canView} />
        ) : (
          <Alert>
            <AlertTitle>No payroll access</AlertTitle>
            <AlertDescription>Your account is not linked to a crew profile, so there is no compensation to show.</AlertDescription>
          </Alert>
        )
      ) : (
        <div className="space-y-6">
          {isOwnRecord && !canEdit && (
            <Alert>
              <AlertTitle>Your compensation</AlertTitle>
              <AlertDescription>
                Your package is shown read-only. You can keep your bank details up to date below; every change is recorded.
              </AlertDescription>
            </Alert>
          )}

          {comp.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : comp.current ? (
            <CompensationCard
              row={comp.current}
              canEdit={canEdit}
              canAdmin={canAdmin}
              busy={busy}
              onEdit={() => setCompForm({ open: true, row: comp.current })}
              onActivate={() => comp.current && compMutations.activate.mutate(comp.current)}
              onSupersede={() => comp.current && compMutations.supersede.mutate(comp.current)}
              onDelete={() => setDeletingComp(comp.current)}
            />
          ) : (
            <Card className="border-dashed bg-card">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <Banknote className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">No compensation on record{crewName && crewName !== 'you' ? ` for ${crewName}` : ''}</p>
                  <p className="text-sm text-muted-foreground">
                    {canEdit ? 'Create a package to set the base salary, allowances and gratuity points.' : 'A payroll editor can add one.'}
                  </p>
                </div>
                {canEdit && (
                  <Button onClick={() => setCompForm({ open: true, row: null })}>
                    <Plus className="mr-2 h-4 w-4" /> New compensation
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {!comp.isLoading && (comp.history.length > 0 || canEdit) && (
            <CompensationHistoryTable
              rows={comp.history}
              canEdit={canEdit}
              canAdmin={canAdmin}
              busy={busy}
              onEdit={(row) => setCompForm({ open: true, row })}
              onActivate={(row) => compMutations.activate.mutate(row)}
              onDelete={setDeletingComp}
            />
          )}

          <BankDetailsCard
            accounts={bank.accounts}
            isLoading={bank.isLoading}
            canEdit={canEditBank}
            canVerify={canEdit}
            busy={bankBusy}
            onAdd={() => setBankForm({ open: true, row: null })}
            onEdit={(row) => setBankForm({ open: true, row })}
            onDelete={setDeletingBank}
            onSetPrimary={(row) => bankMutations.setPrimary.mutate(row)}
            onVerify={(row, verified) => bankMutations.verify.mutate({ row, verified })}
          />
        </div>
      )}

      <CompensationFormDialog
        open={compForm.open}
        onOpenChange={(open) => !open && setCompForm({ open: false })}
        row={compForm.open ? compForm.row : null}
        defaults={newCompDefaults}
        grades={grades}
        crewName={crewName && crewName !== 'you' ? crewName : undefined}
        onSubmit={submitComp}
        isPending={compMutations.create.isPending || compMutations.update.isPending}
      />

      <BankDetailsFormDialog
        open={bankForm.open}
        onOpenChange={(open) => !open && setBankForm({ open: false })}
        row={bankForm.open ? bankForm.row : null}
        defaults={newBankDefaults}
        crewName={crewName && crewName !== 'you' ? crewName : undefined}
        onSubmit={submitBank}
        isPending={bankMutations.create.isPending || bankMutations.update.isPending}
      />

      <AlertDialog open={Boolean(deletingComp)} onOpenChange={(open) => !open && setDeletingComp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this compensation package?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the record. Prefer ending or superseding a package so the pay history stays complete for payroll and audits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={compMutations.remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={compMutations.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deletingComp) void compMutations.remove.mutateAsync(deletingComp).then(() => setDeletingComp(null));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deletingBank)} onOpenChange={(open) => !open && setDeletingBank(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingBank?.is_primary ? 'This is the primary account — payroll cannot be paid until another account is made primary. ' : ''}
              The removal is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bankMutations.remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bankMutations.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deletingBank) void bankMutations.remove.mutateAsync(deletingBank).then(() => setDeletingBank(null));
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SalariesPage;
