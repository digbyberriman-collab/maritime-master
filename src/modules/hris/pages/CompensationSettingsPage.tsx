import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import {
  useFxRateMutations,
  useFxRates,
  useHrCompanySettings,
  useHrCompanySettingsMutations,
  usePayGradeMutations,
  usePayGrades,
  usePayPeriodMutations,
  usePayPeriods,
  type PayPeriodFilters,
} from '@/modules/hris/hooks/useCompensationSettings';
import {
  formValuesToCompanySettingsPayload,
  formValuesToFxRatePayload,
  formValuesToPayGradePayload,
  type CompanySettingsFormValues,
  type FxRateFormValues,
  type FxRateRow,
  type PayGradeFormValues,
  type PayGradeRow,
} from '@/modules/hris/lib/compensation';
import { CompanySettingsForm } from '@/modules/hris/components/compensation-settings/CompanySettingsForm';
import { PayGradesTable } from '@/modules/hris/components/compensation-settings/PayGradesTable';
import { PayGradeFormDialog } from '@/modules/hris/components/compensation-settings/PayGradeFormDialog';
import { FxRatesTable } from '@/modules/hris/components/compensation-settings/FxRatesTable';
import { FxRateFormDialog } from '@/modules/hris/components/compensation-settings/FxRateFormDialog';
import { PayPeriodsTable } from '@/modules/hris/components/compensation-settings/PayPeriodsTable';
import { GeneratePeriodsDialog, type GeneratePeriodsValues } from '@/modules/hris/components/compensation-settings/GeneratePeriodsDialog';

const TABS = ['company', 'grades', 'fx', 'periods'] as const;
type Tab = (typeof TABS)[number];

type GradeFormState = { open: false } | { open: true; grade: PayGradeRow | null };

/**
 * Compensation Settings: company payroll defaults, pay grades, FX rates and
 * pay periods. The route is admin-gated; edit rights are still checked here
 * so a viewer who lands on a shared link sees a read-only page.
 */
const CompensationSettingsPage: React.FC = () => {
  const payroll = usePayrollAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(requestedTab ?? '') ? (requestedTab as Tab) : 'company';
  const setTab = (next: string) =>
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    }, { replace: true });

  const canAdmin = !payroll.loading && payroll.canAdmin;
  const canEdit = !payroll.loading && payroll.canEdit;

  const { vessels, vesselName } = useCompanyVessels();
  const settingsQuery = useHrCompanySettings();
  const settingsMutations = useHrCompanySettingsMutations();
  const gradesQuery = usePayGrades({ includeInactive: true });
  const gradeMutations = usePayGradeMutations();
  const fxQuery = useFxRates();
  const fxMutations = useFxRateMutations();
  const [periodFilters, setPeriodFilters] = useState<PayPeriodFilters>({ vesselId: 'all', year: new Date().getFullYear() });
  const periodsQuery = usePayPeriods(periodFilters);
  const periodMutations = usePayPeriodMutations();

  const [gradeForm, setGradeForm] = useState<GradeFormState>({ open: false });
  const [deletingGrade, setDeletingGrade] = useState<PayGradeRow | null>(null);
  const [fxForm, setFxForm] = useState<{ open: boolean; defaults?: Partial<FxRateFormValues> }>({ open: false });
  const [deletingRate, setDeletingRate] = useState<FxRateRow | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  const gradeBusy = gradeMutations.create.isPending || gradeMutations.update.isPending || gradeMutations.setActive.isPending || gradeMutations.remove.isPending;
  const periodBusy =
    periodMutations.generateForYear.isPending || periodMutations.lock.isPending || periodMutations.unlock.isPending || periodMutations.close.isPending;

  const defaultCurrency = settingsQuery.settings?.default_currency ?? 'EUR';
  const defaultPeriodType = settingsQuery.settings?.pay_period_type === 'four_weekly' ? 'four_weekly' : 'calendar_month';

  const saveSettings = async (values: CompanySettingsFormValues) => {
    await settingsMutations.upsert.mutateAsync({
      previous: settingsQuery.settings?.updated_by ? settingsQuery.settings : null,
      payload: formValuesToCompanySettingsPayload(values),
    });
  };

  const saveGrade = async (values: PayGradeFormValues) => {
    if (!gradeForm.open) return;
    const payload = formValuesToPayGradePayload(values);
    if (gradeForm.grade) await gradeMutations.update.mutateAsync({ grade: gradeForm.grade, payload });
    else await gradeMutations.create.mutateAsync(payload);
    setGradeForm({ open: false });
  };

  const saveRate = async (values: FxRateFormValues) => {
    await fxMutations.add.mutateAsync(formValuesToFxRatePayload(values));
    setFxForm({ open: false });
  };

  const generate = async (values: GeneratePeriodsValues) => {
    await periodMutations.generateForYear.mutateAsync(values);
    setPeriodFilters({ vesselId: values.vesselId ?? 'company', year: values.year });
    setGenerateOpen(false);
  };

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={Settings}
        title="Compensation Settings"
        description="Company payroll defaults, pay grades, exchange rates and pay periods."
      />

      {payroll.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="company">Company settings</TabsTrigger>
            <TabsTrigger value="grades">Pay grades</TabsTrigger>
            <TabsTrigger value="fx">FX rates</TabsTrigger>
            <TabsTrigger value="periods">Pay periods</TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="mt-0">
            {settingsQuery.isLoading || !settingsQuery.settings ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <CompanySettingsForm settings={settingsQuery.settings} canEdit={canAdmin} onSubmit={saveSettings} isPending={settingsMutations.upsert.isPending} />
            )}
          </TabsContent>

          <TabsContent value="grades" className="mt-0">
            <PayGradesTable
              grades={gradesQuery.all}
              isLoading={gradesQuery.isLoading}
              canEdit={canEdit}
              canDelete={canAdmin}
              busy={gradeBusy}
              onCreate={() => setGradeForm({ open: true, grade: null })}
              onEdit={(grade) => setGradeForm({ open: true, grade })}
              onToggleActive={(grade, isActive) => gradeMutations.setActive.mutate({ grade, isActive })}
              onDelete={setDeletingGrade}
            />
          </TabsContent>

          <TabsContent value="fx" className="mt-0">
            <FxRatesTable
              rates={fxQuery.rates}
              isLoading={fxQuery.isLoading}
              canEdit={canEdit}
              busy={fxMutations.add.isPending || fxMutations.remove.isPending}
              defaultCurrency={defaultCurrency}
              onAdd={(defaults) => setFxForm({ open: true, defaults })}
              onDelete={setDeletingRate}
            />
          </TabsContent>

          <TabsContent value="periods" className="mt-0">
            <PayPeriodsTable
              periods={periodsQuery.periods}
              isLoading={periodsQuery.isLoading}
              canEdit={canEdit}
              busy={periodBusy}
              vessels={vessels}
              vesselName={vesselName}
              filters={periodFilters}
              onFiltersChange={setPeriodFilters}
              onGenerate={() => setGenerateOpen(true)}
              onLock={(p) => periodMutations.lock.mutate(p)}
              onUnlock={(p) => periodMutations.unlock.mutate(p)}
              onClose={(p) => periodMutations.close.mutate(p)}
            />
          </TabsContent>
        </Tabs>
      )}

      <PayGradeFormDialog
        open={gradeForm.open}
        onOpenChange={(open) => !open && setGradeForm({ open: false })}
        grade={gradeForm.open ? gradeForm.grade : null}
        onSubmit={saveGrade}
        isPending={gradeMutations.create.isPending || gradeMutations.update.isPending}
      />

      <FxRateFormDialog
        open={fxForm.open}
        onOpenChange={(open) => !open && setFxForm({ open: false })}
        defaults={fxForm.defaults}
        onSubmit={saveRate}
        isPending={fxMutations.add.isPending}
      />

      <GeneratePeriodsDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        vessels={vessels}
        defaultType={defaultPeriodType}
        defaultYear={periodFilters.year ?? new Date().getFullYear()}
        onSubmit={generate}
        isPending={periodMutations.generateForYear.isPending}
      />

      <AlertDialog open={Boolean(deletingGrade)} onOpenChange={(open) => !open && setDeletingGrade(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pay grade {deletingGrade?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Compensation packages linked to this grade keep their figures but lose the link. Prefer deactivating a grade that has been used.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gradeMutations.remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={gradeMutations.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deletingGrade) void gradeMutations.remove.mutateAsync(deletingGrade).then(() => setDeletingGrade(null));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deletingRate)} onOpenChange={(open) => !open && setDeletingRate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this FX rate?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRate ? `${deletingRate.base_currency}/${deletingRate.quote_currency} from ${deletingRate.valid_from}. ` : ''}
              Payroll runs already calculated keep the rate they used; future conversions fall back to the previous rate for the pair.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={fxMutations.remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={fxMutations.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deletingRate) void fxMutations.remove.mutateAsync(deletingRate).then(() => setDeletingRate(null));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CompensationSettingsPage;
