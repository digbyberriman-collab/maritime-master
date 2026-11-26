import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CountrySelect } from '@/modules/crew/components/CountrySelect';
import { formatDay } from '@/modules/crew/hooks/useCrewProfile';
import type { IssuingSuggestion } from '@/modules/crew/hooks/useCrewDocuments';
import {
  DOCUMENT_FIELD_LABEL,
  VISA_ENTRIES,
  VISA_ENTRIES_LABEL,
  documentFormFields,
  suggestedExpiryDate,
  type CrewDocumentFormField,
  type CrewDocumentFormValues,
  type DocumentTypeForForm,
  type VisaEntries,
} from '@/modules/crew/lib/crewDocumentSchema';

const NONE = '__none__';

/** How many earlier issuing offices are offered as one-tap choices (T-170). */
export const ISSUING_SUGGESTIONS_SHOWN = 5;

/** The passport flag's one-per-person rule, in words, when another document holds it. */
function reportPassportTakenText(other: { name: string; number: string | null }): string {
  const which = other.number ? `${other.name} ${other.number}` : `The ${other.name.toLowerCase()} already recorded`;
  return `${which} is used in the crew report. Untick it there first: one passport per person.`;
}

export interface DocumentFieldsProps {
  form: UseFormReturn<CrewDocumentFormValues>;
  type: DocumentTypeForForm;
  /** Earlier issuing offices of the type in the company (crew_document_issuing_suggestions). */
  suggestions: readonly IssuingSuggestion[];
  /** Another of the person's documents already used in the crew report (the flag is one per person). */
  reportPassportElsewhere: { name: string; number: string | null } | null;
  today: string;
  disabled?: boolean;
}

const Required: React.FC<{ on: boolean }> = ({ on }) =>
  on ? (
    <>
      <span aria-hidden="true" className="text-critical">
        {' '}
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  ) : null;

const LABEL: Partial<Record<CrewDocumentFormField, string>> = {
  ...DOCUMENT_FIELD_LABEL,
};

/**
 * Step 2 of the add-document dialog (gap/04 C25, C26): the fields of the
 * chosen type, from its field_schema (lib/crewDocumentSchema.ts
 * documentFormFields), in the order the paper document reads. Every
 * document has a number, issuing country, issue date, expiry date or "No
 * expiry" (ticking it clears the date) and notes; the type adds issuing
 * office (with earlier offices as one-tap suggestions, T-170), endorsement
 * date, capacity, limitations, visa type, entries or grade. A passport needs
 * its issuing country and issue date, and may be the one used in the crew
 * report. A default validity suggests the expiry date from the issue date;
 * the person confirms it.
 */
export const DocumentFields: React.FC<DocumentFieldsProps> = ({ form, type, suggestions, reportPassportElsewhere, today, disabled }) => {
  const fields = React.useMemo(() => documentFormFields(type), [type]);
  const required = React.useMemo(() => new Set(fields.filter((f) => f.required).map((f) => f.field)), [fields]);
  const has = (field: CrewDocumentFormField) => fields.some((f) => f.field === field);
  const passport = type.expiry_item_type === 'passport';
  const noExpiry = form.watch('no_expiry');
  const issueDate = form.watch('issue_date');
  const expiryDate = form.watch('expiry_date');
  const suggestedExpiry = !noExpiry && !expiryDate ? suggestedExpiryDate(issueDate, type.default_validity_months ?? null) : null;

  const label = (field: CrewDocumentFormField, override?: string) => (
    <>
      {override ?? LABEL[field]}
      <Required on={required.has(field)} />
    </>
  );

  const text = (field: 'number' | 'issuing_office' | 'capacity' | 'visa_type' | 'grade', max: number, opts: { label?: string; description?: string } = {}) => (
    <FormField
      control={form.control}
      name={field}
      render={({ field: f }) => (
        <FormItem>
          <FormLabel>{label(field, opts.label)}</FormLabel>
          <FormControl>
            <Input
              {...f}
              value={typeof f.value === 'string' ? f.value : ''}
              maxLength={max}
              autoComplete="off"
              aria-required={required.has(field) || undefined}
              disabled={disabled}
              className={field === 'number' ? 'type-mono' : undefined}
            />
          </FormControl>
          {opts.description ? <FormDescription>{opts.description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const date = (field: 'issue_date' | 'expiry_date' | 'endorsement_due_date', opts: { max?: string; min?: string; off?: boolean; description?: React.ReactNode } = {}) => (
    <FormField
      control={form.control}
      name={field}
      render={({ field: f }) => (
        <FormItem>
          <FormLabel>{label(field)}</FormLabel>
          <FormControl>
            <Input
              {...f}
              type="date"
              value={typeof f.value === 'string' ? f.value : ''}
              max={opts.max}
              min={opts.min}
              aria-required={required.has(field) || undefined}
              disabled={disabled || opts.off}
            />
          </FormControl>
          {opts.description ? <FormDescription>{opts.description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const area = (field: 'limitations' | 'notes', max: number, rows: number) => (
    <FormField
      control={form.control}
      name={field}
      render={({ field: f }) => (
        <FormItem className="sm:col-span-2">
          <FormLabel>{label(field)}</FormLabel>
          <FormControl>
            <Textarea {...f} value={typeof f.value === 'string' ? f.value : ''} maxLength={max} rows={rows} aria-required={required.has(field) || undefined} disabled={disabled} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2" data-document-fields="">
      {text('number', 60, { label: passport ? 'Passport number' : 'Number' })}
      <FormField
        control={form.control}
        name="issuing_country_code"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label('issuing_country_code')}</FormLabel>
            <FormControl>
              <CountrySelect
                value={field.value}
                onChange={(iso2) => field.onChange(iso2)}
                label="Issuing country"
                disabled={disabled}
                freeText={field.value ?? ''}
                onFreeTextChange={(t) => field.onChange(t)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {has('issuing_office') ? (
        <div className="min-w-0 space-y-2 sm:col-span-2">
          {text('issuing_office', 120, { label: passport ? 'Issuing office' : 'Issuing office or authority' })}
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5" data-issuing-suggestions="">
              <span className="type-caption text-muted-foreground">Used before:</span>
              {suggestions.slice(0, ISSUING_SUGGESTIONS_SHOWN).map((s) => (
                <Button
                  key={s.office}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => form.setValue('issuing_office', s.office, { shouldDirty: true, shouldValidate: true })}
                  className="h-7 rounded-full px-2.5 type-caption [@media(pointer:coarse)]:h-11"
                >
                  {s.office}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {date('issue_date', { max: today })}
      {date('expiry_date', {
        min: issueDate ?? undefined,
        off: noExpiry,
        description: suggestedExpiry ? (
          <span className="inline-flex flex-wrap items-center gap-x-2">
            Usually valid until {formatDay(suggestedExpiry)}.
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
              onClick={() => form.setValue('expiry_date', suggestedExpiry, { shouldDirty: true, shouldValidate: true })}
              disabled={disabled}
            >
              Use this date
            </button>
          </span>
        ) : noExpiry ? undefined : (
          'Or tick No expiry below.'
        ),
      })}
      <FormField
        control={form.control}
        name="no_expiry"
        render={({ field }) => (
          <FormItem className="flex min-h-11 flex-row items-center gap-3 space-y-0 sm:col-span-2">
            <FormControl>
              <Checkbox
                checked={field.value}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const on = checked === true;
                  field.onChange(on);
                  if (on) form.setValue('expiry_date', null, { shouldDirty: true });
                  void form.trigger('expiry_date');
                }}
                className="[@media(pointer:coarse)]:size-5"
              />
            </FormControl>
            <FormLabel className="font-normal">No expiry: this document does not expire</FormLabel>
          </FormItem>
        )}
      />
      {has('endorsement_due_date') ? date('endorsement_due_date', { description: 'The date the next endorsement or revalidation is due.' }) : null}
      {has('capacity') ? text('capacity', 120) : null}
      {has('visa_type') ? text('visa_type', 60) : null}
      {has('entries') ? (
        <FormField
          control={form.control}
          name="entries"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{label('entries')}</FormLabel>
              <Select
                value={field.value ?? NONE}
                onValueChange={(next) => field.onChange(next === NONE ? null : (next as VisaEntries))}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger aria-required={required.has('entries') || undefined}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NONE}>Not recorded</SelectItem>
                  {VISA_ENTRIES.map((e) => (
                    <SelectItem key={e} value={e}>
                      {VISA_ENTRIES_LABEL[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
      {has('grade') ? text('grade', 60) : null}
      {has('limitations') ? area('limitations', 500, 2) : null}
      {passport ? (
        <FormField
          control={form.control}
          name="use_in_crew_report"
          render={({ field }) => {
            const taken = reportPassportElsewhere && !field.value ? reportPassportTakenText(reportPassportElsewhere) : null;
            return (
              <FormItem className="sm:col-span-2" data-crew-report-flag="">
                <div className="flex min-h-11 items-center gap-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      disabled={disabled || Boolean(taken)}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      className="[@media(pointer:coarse)]:size-5"
                    />
                  </FormControl>
                  <FormLabel className="font-normal">{DOCUMENT_FIELD_LABEL.use_in_crew_report}</FormLabel>
                </div>
                <FormDescription>{taken ?? 'The crew list and its reports print this passport. One passport per person.'}</FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      ) : null}
      {area('notes', 2000, 3)}
    </div>
  );
};

export default DocumentFields;
