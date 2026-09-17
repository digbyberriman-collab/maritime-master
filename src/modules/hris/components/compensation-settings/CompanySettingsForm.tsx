import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { LEAVE_STATUS_CODES } from '@/modules/crew/leaveConstants';
import { formatDateTime, humanise } from '@/modules/hris/lib/format';
import {
  CURRENCY_PRESETS,
  GRATUITY_METHODS,
  GRATUITY_METHOD_LABEL,
  OTHER_CURRENCY,
  PAY_PERIOD_TYPES,
  ROUNDING_OPTIONS,
  companySettingsFormSchema,
  companySettingsToFormValues,
  type CompanySettingsFormValues,
  type HrCompanySettingsRow,
} from '@/modules/hris/lib/compensation';

interface CompanySettingsFormProps {
  settings: HrCompanySettingsRow;
  canEdit: boolean;
  onSubmit: (values: CompanySettingsFormValues) => Promise<void>;
  isPending?: boolean;
}

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <Card className="bg-card">
    <CardHeader className="pb-3">
      <CardTitle className="text-base">{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
  </Card>
);

/** Every column of hr_company_settings, one form. */
export const CompanySettingsForm: React.FC<CompanySettingsFormProps> = ({ settings, canEdit, onSubmit, isPending }) => {
  const form = useForm<CompanySettingsFormValues>({
    resolver: zodResolver(companySettingsFormSchema),
    defaultValues: companySettingsToFormValues(settings),
  });

  useEffect(() => {
    form.reset(companySettingsToFormValues(settings));
    // Re-seed when a fresh row arrives from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.updated_at, settings.company_id]);

  const currencySelect = form.watch('default_currency');
  const disabled = !canEdit || isPending;

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-6">
        <Section title="Currency and pay calendar" description="Defaults for new compensation packages and payroll runs.">
          <FormField
            control={form.control}
            name="default_currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default currency</FormLabel>
                <Select value={field.value || 'EUR'} onValueChange={field.onChange} disabled={disabled}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CURRENCY_PRESETS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value={OTHER_CURRENCY}>Other…</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>Payroll cost KPIs are converted into this currency.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {currencySelect === OTHER_CURRENCY ? (
            <FormField
              control={form.control}
              name="default_currency_other"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency code</FormLabel>
                  <FormControl><Input placeholder="ISO 4217, e.g. NOK" maxLength={3} className="uppercase" disabled={disabled} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="hidden sm:block" />
          )}
          <FormField
            control={form.control}
            name="pay_period_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pay period type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PAY_PERIOD_TYPES.map((t) => <SelectItem key={t} value={t}>{humanise(t)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pay_cutoff_day"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cut-off day of month</FormLabel>
                <FormControl><Input inputMode="numeric" disabled={disabled} {...field} /></FormControl>
                <FormDescription>Changes after this day fall into the next run (1–28).</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pay_day_of_month"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pay day of month</FormLabel>
                <FormControl><Input inputMode="numeric" disabled={disabled} {...field} /></FormControl>
                <FormDescription>Day salaries are paid (1–31; clipped in short months).</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rounding_minor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Net pay rounding</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ROUNDING_OPTIONS.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r === 1 ? 'No rounding (to the cent)' : `Down to ${r} minor units`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section title="Leave and travel" description="How the leave calendar codes affect pro-rated pay.">
          <FormField
            control={form.control}
            name="unpaid_leave_codes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Unpaid leave codes</FormLabel>
                <FormDescription>Days with these codes are deducted from the pro-rated base.</FormDescription>
                <div className="grid gap-2 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                  {LEAVE_STATUS_CODES.map((code) => {
                    const checked = field.value.includes(code.code);
                    return (
                      <label key={code.code} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(v) => field.onChange(v === true ? [...field.value, code.code] : field.value.filter((c) => c !== code.code))}
                        />
                        <Badge variant="outline" className="w-10 justify-center font-mono">{code.code}</Badge>
                        <span className="truncate text-muted-foreground">{code.label}</span>
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="travel_days_paid"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                <div>
                  <FormLabel>Travel days are paid</FormLabel>
                  <FormDescription>Count “T” days as paid days when pro-rating.</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
                </FormControl>
              </FormItem>
            )}
          />
        </Section>

        <Section title="Gratuities" description="Defaults for new gratuity pools; each pool can override them.">
          <FormField
            control={form.control}
            name="gratuity_default_method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default split method</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {GRATUITY_METHODS.map((m) => <SelectItem key={m} value={m}>{GRATUITY_METHOD_LABEL[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="gratuity_default_points"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default gratuity points</FormLabel>
                <FormControl><Input inputMode="decimal" disabled={disabled} {...field} /></FormControl>
                <FormDescription>Used when neither the package nor the pay grade sets points.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section title="Payslips">
          <FormField
            control={form.control}
            name="payslip_footer"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Payslip footer</FormLabel>
                <FormControl><Textarea rows={3} placeholder="Company registration, contact for payroll queries…" disabled={disabled} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {settings.updated_by ? `Last saved ${formatDateTime(settings.updated_at)}` : 'Using table defaults — not saved yet.'}
          </p>
          {canEdit && (
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save settings
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default CompanySettingsForm;
