/**
 * Medical settings (gap/02 M1, W8; D-X5-08; X5-08): which fitness
 * assessments count as an ENG1, which are accepted as equivalent (T-185)
 * and which vaccines every crew member must hold, for the whole company.
 * Opened from Fleet › Medical by medical admins
 * (`fleet.operations.fleet_medical.admin`); the server checks the same rule
 * with fleet reach (`fleet_medical_settings_save`).
 *
 * - React Hook Form + zod (../lib/medicalSettingsSchema.ts): each assessment
 *   type is an ENG1, an accepted equivalent or not counted (at least one
 *   ENG1); vaccines are added one by one, each name once, 40 at most.
 * - Saved only through the definer, with the `updated_at` the drawer read,
 *   so a change someone made meanwhile is refused in words, never
 *   overwritten; the stored row is checked before "Saved" (no fake success).
 * - The warning windows are the alert windows (C5): shown here, changed in
 *   Reports › Alert windows.
 * - D-01: while `fleet_medical_settings` is missing the defaults are shown
 *   read-only, with why; any other read error says so with Retry.
 *
 * 44 px targets on coarse pointers; the sheet fills a phone.
 */
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useCapability } from '@/lib/permissions/useCan';
import { cn } from '@/lib/utils';
import { AccessDenied, PageError, PageLoading } from '@/shared/components/states';
import { errorMessage, notify } from '@/shared/lib/notify';
import { useExpiryWindowRules } from '../hooks/useExpiryWindowRules';
import { useFleetMedicalSettings, useSaveFleetMedicalSettings, type MedicalSettingsView } from '../hooks/useFleetMedicalStatus';
import {
  ASSESSMENT_ROLES,
  ASSESSMENT_ROLE_LABELS,
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABELS,
  REQUIRED_VACCINES_MAX,
  VACCINE_NAME_MAX,
  addVaccine,
  formToSettings,
  medicalSettingsSchema,
  settingsToForm,
  type AssessmentRole,
  type MedicalSettingsFormValues,
} from '../lib/medicalSettingsSchema';
import { FLEET_CAPS } from '../paths';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

export interface MedicalSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

function SettingsForm({ view, companyId, onDone }: { view: MedicalSettingsView; companyId: string | null; onDone: () => void }) {
  const readOnly = view.source === 'not_set_up';
  const form = useForm<MedicalSettingsFormValues>({ resolver: zodResolver(medicalSettingsSchema), defaultValues: settingsToForm(view.settings) });
  const save = useSaveFleetMedicalSettings(companyId);
  const windows = useExpiryWindowRules(companyId);
  const [draft, setDraft] = React.useState('');
  const [draftError, setDraftError] = React.useState<string | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const id = React.useId();

  // Settings saved elsewhere (or here) reset the form.
  const { reset } = form;
  React.useEffect(() => {
    reset(settingsToForm(view.settings));
  }, [view.updatedAt, view.settings, reset]);

  const vaccines = form.watch('requiredVaccines');
  const rolesError = form.formState.errors.roles?.message ?? form.formState.errors.roles?.root?.message ?? null;
  const listErrors = form.formState.errors.requiredVaccines;
  const listError = Array.isArray(listErrors) ? listErrors.find(Boolean)?.message ?? null : (listErrors?.message ?? null);

  const add = () => {
    const next = addVaccine(vaccines, draft);
    setDraftError(next.error);
    if (next.error) return;
    form.setValue('requiredVaccines', next.list, { shouldDirty: true, shouldValidate: true });
    setDraft('');
  };
  const remove = (index: number) => {
    form.setValue(
      'requiredVaccines',
      vaccines.filter((_, i) => i !== index),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const settings = formToSettings(values);
    if (!settings) return;
    setRefusal(null);
    try {
      await save.mutateAsync({ settings, expectedUpdatedAt: view.updatedAt });
      notify.success('Medical settings saved');
      onDone();
    } catch (error) {
      const message = errorMessage(error, 'The medical settings were not saved.');
      setRefusal(message);
      notify.error(error, { title: 'Medical settings not saved' });
    }
  });

  const medical = windows.state === 'ready' || windows.state === 'not_set_up' ? windows.windowFor({ itemType: 'medical' }) : null;
  const vaccination = windows.state === 'ready' || windows.state === 'not_set_up' ? windows.windowFor({ itemType: 'vaccination' }) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col" aria-label="Medical settings">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {readOnly ? (
          <p role="note" className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            Medical settings can be changed once this part of STORM is set up. Until then the defaults apply: an ENG1 counts, no equivalents, no required vaccines.
          </p>
        ) : null}

        <fieldset className="space-y-3" aria-describedby={rolesError ? `${id}-roles-error` : undefined}>
          <legend className="text-sm font-medium text-foreground">Fitness assessments</legend>
          <p className="type-caption text-muted-foreground">
            Which fitness-to-work assessments in Health show that a crew member holds a valid ENG1. Medical fitness documents on a crew profile always count.
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {ASSESSMENT_TYPES.map((type) => {
              const fieldId = `${id}-${type}`;
              return (
                <li key={type} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <Label htmlFor={fieldId} className="text-sm text-foreground">
                    {ASSESSMENT_TYPE_LABELS[type]}
                  </Label>
                  <Controller
                    control={form.control}
                    name={`roles.${type}` as const}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => field.onChange(v as AssessmentRole)} disabled={readOnly || save.isPending}>
                        <SelectTrigger id={fieldId} className={cn('h-9 w-full sm:w-52', COARSE)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSESSMENT_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ASSESSMENT_ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </li>
              );
            })}
          </ul>
          {rolesError ? (
            <p id={`${id}-roles-error`} role="alert" className="text-sm text-destructive">
              {rolesError}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground">Required vaccines</legend>
          <p className="type-caption text-muted-foreground">
            {`Every crew member must hold these. A missing or expired one makes the person critical. Up to ${REQUIRED_VACCINES_MAX}.`}
          </p>
          {vaccines.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Required vaccines">
              {vaccines.map((name, index) => (
                <li key={`${name}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted py-0.5 pl-3 pr-1 text-sm text-foreground">
                  {name}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn('h-7 w-7 rounded-full', COARSE, '[@media(pointer:coarse)]:min-w-11')}
                    aria-label={`Remove ${name}`}
                    disabled={readOnly || save.isPending}
                    onClick={() => remove(index)}
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None set.</p>
          )}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`${id}-vaccine`} className="sr-only">
                Vaccine name
              </Label>
              <Input
                id={`${id}-vaccine`}
                value={draft}
                maxLength={VACCINE_NAME_MAX + 20}
                placeholder="Add a vaccine, e.g. Yellow fever"
                className={cn('h-9', COARSE)}
                aria-invalid={draftError ? true : undefined}
                aria-describedby={draftError ? `${id}-vaccine-error` : undefined}
                disabled={readOnly || save.isPending}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setDraftError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    add();
                  }
                }}
              />
            </div>
            <Button type="button" variant="outline" size="sm" className={cn('h-9', COARSE)} disabled={readOnly || save.isPending} onClick={add}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add
            </Button>
          </div>
          {draftError || listError ? (
            <p id={`${id}-vaccine-error`} role="alert" className="text-sm text-destructive">
              {draftError ?? listError}
            </p>
          ) : null}
        </fieldset>

        <section aria-label="Warning windows" className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">Warning windows</h3>
          <p className="text-sm text-muted-foreground">
            {medical === null || vaccination === null
              ? 'ENG1 and booster warnings use the company alert windows.'
              : `An ENG1 is at risk within ${Math.min(30, medical)} days of expiry (medical alert window: ${medical} days), and a booster is due within ${vaccination} days (vaccination alert window). Change them in Reports › Alert windows.`}
          </p>
        </section>

        {refusal ? (
          <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {refusal}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
        <SheetClose asChild>
          <Button type="button" variant="outline" className={COARSE}>
            Cancel
          </Button>
        </SheetClose>
        <Button type="submit" className={COARSE} disabled={readOnly || save.isPending || !form.formState.isDirty}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}

function DrawerBody({ companyId, onDone }: { companyId: string | null; onDone: () => void }) {
  const access = useCapability(FLEET_CAPS.medicalAdmin);
  const settings = useFleetMedicalSettings(companyId, { enabled: access.allowed });
  if (access.status === 'loading') return <PageLoading label="Checking your access" />;
  if (!access.allowed) {
    return <AccessDenied detail="Changing the medical settings needs the fleet medical admin permission. Ask your account admin." headingLevel={2} backTo={null} />;
  }
  if (settings.state === 'error') {
    return (
      <div className="p-4">
        <PageError variant="inline" error={settings.error} title="The medical settings could not load" onRetry={settings.retry} treatMissingAsOff={false} />
      </div>
    );
  }
  if (settings.state !== 'ready') return <PageLoading label="Loading the medical settings" />;
  return <SettingsForm view={settings} companyId={companyId} onDone={onDone} />;
}

export function MedicalSettingsDrawer({ open, onOpenChange, companyId }: MedicalSettingsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" hideClose className="flex w-full flex-col gap-0 p-0 sm:max-w-lg" aria-describedby="medical-settings-description">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <SheetTitle>Medical settings</SheetTitle>
            <SheetDescription id="medical-settings-description">
              What counts as an ENG1 and which vaccines are required, for every vessel of the company.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className={cn('shrink-0', COARSE)} aria-label="Close medical settings">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>
        {open ? <DrawerBody companyId={companyId} onDone={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

export default MedicalSettingsDrawer;
