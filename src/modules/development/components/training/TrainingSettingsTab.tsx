/**
 * Fleet › Training › Settings (gap/02 TR10; X5-07B; D-X5-06, D-X5-19). The
 * company's training programme settings, one form:
 *
 * - Approvals and categories: the final approval rule (Captain and Purser
 *   both, or either one), the four fixed categories' names (clawback
 *   exemptions stay on the fixed keys).
 * - Travel: mileage per mile and per kilometre, exchange-rate overrides to
 *   USD by currency code (a currency not listed uses the rate typed on the
 *   application).
 * - Limits: accommodation cap, food per diem, the split-payment threshold,
 *   online hours per neutral day, the clawback window, service days before
 *   eligibility, probation, days between courses, business class flights.
 *
 * React Hook Form on settingsForm.ts; Save sends only what changed,
 * through `development_settings_save` with the row's `updated_at` (a
 * change made meanwhile is refused as stale, in words). Training admins
 * only; everyone else reads the settings.
 *
 * D-01: while the 040600 policy columns are missing, their fields read
 * "Not set up yet" and Save is disabled with that reason (the definer
 * ships in the same file); the live limits still show.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { PageError, PageLoading } from '@/shared/components/states';
import { cn } from '@/lib/utils';
import type { DevCategory } from '../../constants';
import { DEV_CATEGORIES } from '../../lib/settingsSchema';
import type { PolicyExtrasState } from '../../hooks/useProgramSettings';
import { changedSettings, settingsFormDefaults, settingsFormSchema, type SettingsFormValues } from './settingsForm';
import { COARSE, COARSE_ICON, NOT_SET_UP_YET, Notice } from './TrainingParts';
import { useSaveSettings, type ReadState, type SettingsRow } from './useFleetTrainingData';

export interface TrainingSettingsTabProps {
  companyId: string | null;
  settings: ReadState<{ row: SettingsRow | null }>;
  extras: { status: 'loading' } | { status: 'error'; error: unknown; retry: () => void } | { status: 'ready'; data: PolicyExtrasState };
  canAdmin: boolean;
}

type NumberKey =
  | 'accommodation_cap_per_night_usd'
  | 'food_per_diem_usd'
  | 'professional_split_threshold_usd'
  | 'online_neutral_threshold_hours'
  | 'clawback_months'
  | 'eligibility_service_days'
  | 'probation_default_days'
  | 'anniversary_window_days';

/** What each fixed category is for (D-X5-19: the keys never change, only their names). */
const CATEGORY_ROLE: Readonly<Record<DevCategory, string>> = {
  fleet_organised: 'Name for company-required courses',
  mandatory: 'Name for mandatory courses',
  professional: 'Name for professional development',
  extracurricular: 'Name for extracurricular courses',
};

const LIMITS: ReadonlyArray<{ key: NumberKey; label: string; unit: string; help?: string }> = [
  { key: 'accommodation_cap_per_night_usd', label: 'Accommodation cap per night', unit: 'USD' },
  { key: 'food_per_diem_usd', label: 'Food per diem', unit: 'USD a day' },
  { key: 'professional_split_threshold_usd', label: 'Split-payment threshold', unit: 'USD', help: 'Professional courses above this are paid half up front.' },
  { key: 'online_neutral_threshold_hours', label: 'Online hours per neutral day', unit: 'hours' },
  { key: 'clawback_months', label: 'Clawback window', unit: 'months', help: 'After reimbursement, for Professional and Extracurricular courses.' },
  { key: 'eligibility_service_days', label: 'Service before eligibility', unit: 'days' },
  { key: 'probation_default_days', label: 'Probation', unit: 'days' },
  { key: 'anniversary_window_days', label: 'Days between courses', unit: 'days' },
];

export function TrainingSettingsTab({ companyId, settings, extras, canAdmin }: TrainingSettingsTabProps) {
  const extrasData = extras.status === 'ready' ? extras.data : null;
  const extrasSetUp = extrasData !== null && !extrasData.notSetUp;
  const row = settings.status === 'ready' ? settings.row : null;
  const initial = useMemo<SettingsFormValues>(() => settingsFormDefaults(row, extrasData), [row, extrasData]);
  const form = useForm<SettingsFormValues>({ resolver: zodResolver(settingsFormSchema), defaultValues: initial });
  const fx = useFieldArray({ control: form.control, name: 'fx' });
  const save = useSaveSettings(companyId);
  const [message, setMessage] = useState<string | null>(null);
  const { reset } = form;

  useEffect(() => {
    reset(initial);
  }, [initial, reset]);

  if (settings.status === 'loading' || extras.status === 'loading') return <PageLoading variant="detail" label="Loading the programme settings" />;
  if (settings.status === 'error') {
    return <PageError error={settings.error} title="The programme settings could not be loaded" onRetry={settings.retry} treatMissingAsOff={false} />;
  }
  if (extras.status === 'error') {
    return <PageError error={extras.error} title="The programme settings could not be loaded" onRetry={extras.retry} treatMissingAsOff={false} />;
  }

  const readOnly = !canAdmin || !extrasSetUp;
  const busy = save.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    setMessage(null);
    const payload = changedSettings(values, initial);
    if (!payload) {
      setMessage('Nothing has changed.');
      return;
    }
    try {
      await save.mutateAsync({ values: payload, expectedUpdatedAt: row?.updated_at ?? null });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The settings were not saved. Try again.');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Programme settings">
        {!extrasSetUp ? (
          <Notice testId="settings-not-set-up">
            The approval rule, category names, mileage and exchange-rate overrides are not set up yet, so these settings cannot be saved here. The limits below are the
            company’s current ones.
          </Notice>
        ) : !canAdmin ? (
          <Notice testId="settings-read-only">Only training admins change these settings.</Notice>
        ) : null}
        {!row && extrasSetUp ? <Notice>The company has no settings of its own yet; these are the defaults. Saving keeps them for the company.</Notice> : null}

        <fieldset disabled={readOnly || busy} className="contents">
          <Card className="space-y-4 p-4">
            <h2 className="type-h3">Approvals and categories</h2>
            <FormField
              control={form.control}
              name="final_approval_mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Final approval</FormLabel>
                  {extrasSetUp ? (
                    <FormControl>
                      <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2 sm:grid-cols-2">
                        {(
                          [
                            ['both', 'Captain and Purser both approve'],
                            ['either', 'Either the Captain or the Purser approves'],
                          ] as const
                        ).map(([value, label]) => (
                          <Label key={value} htmlFor={`mode-${value}`} className={cn('flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 text-sm font-normal', COARSE)}>
                            <RadioGroupItem id={`mode-${value}`} value={value} />
                            {label}
                          </Label>
                        ))}
                      </RadioGroup>
                    </FormControl>
                  ) : (
                    <p className="text-sm text-muted-foreground">{NOT_SET_UP_YET}</p>
                  )}
                  <FormDescription>After the head of department. One person can never give both approvals.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DEV_CATEGORIES.map((key) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={`category_labels.${key}` as const}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{CATEGORY_ROLE[key]}</FormLabel>
                      <FormControl>
                        {extrasSetUp ? (
                          <Input {...field} maxLength={60} className={COARSE} />
                        ) : (
                          <Input value={field.value} disabled aria-describedby={`label-${key}-ns`} className={COARSE} />
                        )}
                      </FormControl>
                      <FormDescription id={`label-${key}-ns`}>{extrasSetUp ? 'The name crew and approvers see.' : NOT_SET_UP_YET}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <h2 className="type-h3">Travel</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(
                [
                  ['mileage_rate_per_mile', 'Mileage per mile'],
                  ['mileage_rate_per_km', 'Mileage per kilometre'],
                ] as const
              ).map(([key, label]) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={key}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label} (USD)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={extrasSetUp ? ((field.value as number | string | null | undefined) ?? '') : ''}
                          placeholder={extrasSetUp ? 'Not paid' : NOT_SET_UP_YET}
                          inputMode="decimal"
                          disabled={!extrasSetUp || readOnly || busy}
                          className={cn('tabular-nums', COARSE)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Exchange-rate overrides</p>
              <p className="type-caption text-muted-foreground">
                {extrasSetUp
                  ? 'The rate to USD used for a currency instead of the one typed on the application. A currency not listed keeps the typed rate.'
                  : NOT_SET_UP_YET}
              </p>
              {extrasSetUp ? (
                <ul className="space-y-2" aria-label="Exchange-rate overrides">
                  {fx.fields.map((item, index) => (
                    <li key={item.id} className="flex items-start gap-2">
                      <FormField
                        control={form.control}
                        name={`fx.${index}.code` as const}
                        render={({ field }) => (
                          <FormItem className="w-24">
                            <FormLabel className="sr-only">Currency code</FormLabel>
                            <FormControl>
                              <Input {...field} maxLength={3} placeholder="EUR" className={cn('uppercase', COARSE)} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`fx.${index}.rate` as const}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel className="sr-only">Rate to USD</FormLabel>
                            <FormControl>
                              <Input {...field} value={(field.value as number | string | undefined) ?? ''} inputMode="decimal" placeholder="Rate to USD" className={cn('tabular-nums', COARSE)} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="button" variant="ghost" size="icon" className={cn('h-10 w-10', COARSE_ICON)} aria-label={`Remove override ${index + 1}`} onClick={() => fx.remove(index)}>
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {extrasSetUp && !readOnly ? (
                <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => fx.append({ code: '', rate: 1 })} disabled={fx.fields.length >= 50}>
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add a currency
                </Button>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <h2 className="type-h3">Limits</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {LIMITS.map(({ key, label, unit, help }) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={key}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input {...field} value={(field.value as number | string | undefined) ?? ''} inputMode="decimal" className={cn('tabular-nums', COARSE)} />
                        </FormControl>
                        <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>
                      </div>
                      {help ? <FormDescription>{help}</FormDescription> : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="business_class_flights_allowed"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3 sm:col-span-2">
                    <FormLabel>Business class flights allowed</FormLabel>
                    <FormControl>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </Card>
        </fieldset>

        {message ? (
          <p role="alert" className={cn('text-sm', message === 'Nothing has changed.' ? 'text-muted-foreground' : 'text-destructive')}>
            {message}
          </p>
        ) : null}
        {canAdmin ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className={COARSE} disabled={readOnly || busy || !form.formState.isDirty} onClick={() => reset(initial)}>
              Undo changes
            </Button>
            <Button type="submit" className={COARSE} disabled={readOnly || busy} title={!extrasSetUp ? NOT_SET_UP_YET : undefined}>
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : null}
              Save settings
              {!extrasSetUp ? <span className="sr-only">: {NOT_SET_UP_YET}</span> : null}
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
}
