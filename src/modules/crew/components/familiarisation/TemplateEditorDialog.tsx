import React from 'react';
import { useFieldArray, useForm, type Control, type FieldPath, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDown, ArrowUp, Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/shared/lib/notify';
import { usePositions } from '@/modules/crew/hooks/usePositions';
import {
  familiarisationRefusalHint,
  familiarisationRefusalMessage,
  useSaveFamiliarisationTemplate,
  type FamiliarisationTemplate,
} from '@/modules/crew/hooks/useFamiliarisation';
import { FAMILIARISATION_PRESETS, SECTION_LIMITS } from '@/modules/crew/lib/familiarisation';
import { PositionMultiPicker, type PositionChoice } from './PositionMultiPicker';
import {
  TEMPLATE_NAME_MAX,
  blankTemplateValues,
  presetTemplateValues,
  templateFieldFor,
  templateFormValues,
  templateSchema,
  toTemplatePayload,
  variantTemplateValues,
  type TemplateFormValues,
} from './templateSchema';

const COARSE = '[@media(pointer:coarse)]:h-11';
const ICON_BUTTON = 'h-9 w-9 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11';

export interface TemplateEditorDialogProps {
  vessel: { id: string; companyId: string; name: string };
  /** The template to edit; null for a new one. */
  template: FamiliarisationTemplate | null;
  /** The caller may keep this vessel's templates / the fleet's (the overview's answer). */
  canEditVessel: boolean;
  canEditFleet: boolean;
  /** Active fleet templates this vessel could make its own version of (T-134). */
  fleetTemplates: readonly FamiliarisationTemplate[];
  onOpenChange: (open: boolean) => void;
  onSaved?: (template: FamiliarisationTemplate) => void;
}

type StartFrom = 'blank' | `preset:${string}` | `variant:${string}`;

/**
 * Familiarisation template editor (gap/04 C63, W11; T-15, T-134): name,
 * description, due within N days of joining, the signatures it needs, the
 * positions it is required for, and its sections and items. A new template
 * is for this vessel or the whole fleet (the fleet office), and can start
 * from a STORM preset (24-hour safety, two-week vessel familiarisation) or
 * as this vessel's own version of a fleet template. React Hook Form + zod
 * (templateSchema); a server refusal lands on the field its HINT names.
 */
export const TemplateEditorDialog: React.FC<TemplateEditorDialogProps> = ({
  vessel,
  template,
  canEditVessel,
  canEditFleet,
  fleetTemplates,
  onOpenChange,
  onSaved,
}) => {
  const creating = template === null;
  const save = useSaveFamiliarisationTemplate({ id: vessel.id, companyId: vessel.companyId });
  const positions = usePositions({ id: vessel.id, companyId: vessel.companyId });
  const [startFrom, setStartFrom] = React.useState<StartFrom>('blank');
  const [rootError, setRootError] = React.useState<string | null>(null);
  const defaultScope: 'vessel' | 'fleet' = canEditVessel ? 'vessel' : 'fleet';

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: template ? templateFormValues(template) : blankTemplateValues(defaultScope),
    mode: 'onTouched',
  });
  const sections = useFieldArray({ control: form.control, name: 'sections' });
  const scope = form.watch('scope');
  const variantOf = form.watch('variantOf');

  const choices: PositionChoice[] = React.useMemo(() => {
    if (positions.status !== 'ready') return [];
    return positions.positions
      .filter((p) => scope === 'vessel' || p.scope !== 'vessel')
      .map((p) => ({
        id: p.positionId,
        name: p.name,
        departmentKey: p.departmentKey,
        departmentLabel: p.departmentLabel,
        departmentSort: p.departmentSort,
        rankTier: p.rankTier,
        sortOrder: p.sortOrder,
      }));
  }, [positions, scope]);

  const applyStart = (value: StartFrom) => {
    setStartFrom(value);
    const currentScope = form.getValues('scope');
    if (value === 'blank') {
      form.reset(blankTemplateValues(currentScope));
      return;
    }
    if (value.startsWith('preset:')) {
      const preset = FAMILIARISATION_PRESETS.find((p) => `preset:${p.key}` === value);
      if (preset) form.reset(presetTemplateValues(preset, currentScope));
      return;
    }
    const fleet = fleetTemplates.find((t) => `variant:${t.id}` === value);
    if (fleet) form.reset(variantTemplateValues(fleet, vessel.name));
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setRootError(null);
    try {
      const saved = await save.mutateAsync({ templateId: template?.id ?? null, payload: toTemplatePayload(values, creating) });
      notify.success(creating ? `${saved.name} is saved${saved.code ? ` as ${saved.code}` : ''}.` : `${saved.name} is saved.`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      const message = familiarisationRefusalMessage(error);
      const target = templateFieldFor(familiarisationRefusalHint(error));
      if (target) form.setError(target.field as FieldPath<TemplateFormValues>, { type: 'server', message }, { shouldFocus: true });
      else setRootError(message);
    }
  });

  const title = creating ? 'New familiarisation template' : `Edit ${template.name}`;
  const scopeLocked = !creating;
  const fleetOnlyVariant = variantOf !== null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto" data-template-editor="">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {template?.code ? <span className="type-mono mr-2">{template.code}</span> : null}
            The checklist each person completes after joining, the positions it is required for and who signs it.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="min-w-0 space-y-5" noValidate>
            {creating ? (
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="fam-start-from">Start from</Label>
                  <Select value={startFrom} onValueChange={(v) => applyStart(v as StartFrom)}>
                    <SelectTrigger id="fam-start-from" className={COARSE}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blank">A blank template</SelectItem>
                      {FAMILIARISATION_PRESETS.map((p) => (
                        <SelectItem key={p.key} value={`preset:${p.key}`}>
                          STORM preset: {p.name}
                        </SelectItem>
                      ))}
                      {canEditVessel
                        ? fleetTemplates.map((t) => (
                            <SelectItem key={t.id} value={`variant:${t.id}`}>
                              {vessel.name} version of {t.name}
                            </SelectItem>
                          ))
                        : null}
                    </SelectContent>
                  </Select>
                </div>
                <FormField
                  control={form.control}
                  name="scope"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Used on</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v)}
                        disabled={scopeLocked || fleetOnlyVariant || !canEditVessel || !canEditFleet}
                      >
                        <FormControl>
                          <SelectTrigger className={COARSE}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="vessel" disabled={!canEditVessel}>
                            {vessel.name} only
                          </SelectItem>
                          <SelectItem value="fleet" disabled={!canEditFleet}>
                            Every vessel of the fleet
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {fleetOnlyVariant
                          ? `Replaces the fleet template on ${vessel.name} while it is active.`
                          : !canEditFleet
                            ? 'Fleet-wide templates are kept by the fleet office.'
                            : 'A fleet template applies on every vessel unless a vessel has its own version.'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              <p className="type-body text-muted-foreground" data-template-scope={template.scope}>
                {template.scope === 'fleet' ? 'Used on every vessel of the fleet.' : `Used on ${vessel.name} only.`}
              </p>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={TEMPLATE_NAME_MAX} className={COARSE} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ''} rows={2} />
                  </FormControl>
                  <FormDescription>Optional: what it covers and who it is for.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dueWithinDays"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Due within (days of joining)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={365}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value === undefined || field.value === null ? '' : String(field.value)}
                        onChange={(e) => field.onChange(e.target.value)}
                        className={COARSE}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <fieldset className="min-w-0 space-y-2">
                <legend className="type-body font-medium text-foreground">Signatures</legend>
                <FormField
                  control={form.control}
                  name="requiresCrewSignature"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                      </FormControl>
                      <FormLabel className="font-normal">The crew member signs</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requiresSupervisorSignature"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                      </FormControl>
                      <FormLabel className="font-normal">Their supervisor signs</FormLabel>
                    </FormItem>
                  )}
                />
              </fieldset>
            </div>

            <FormField
              control={form.control}
              name="positionIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Required for</FormLabel>
                  {positions.status === 'ready' ? (
                    <PositionMultiPicker options={choices} value={field.value} onChange={field.onChange} label="Required for positions" />
                  ) : positions.status === 'loading' || positions.status === 'idle' ? (
                    <p className="type-body text-muted-foreground">Loading the positions…</p>
                  ) : (
                    <Alert variant="info">
                      <Info aria-hidden="true" className="size-4" />
                      <AlertDescription>
                        {positions.status === 'not-set-up'
                          ? 'Positions are not set up yet. The template can be saved now and its positions chosen later.'
                          : 'The positions could not be loaded. The template can be saved and its positions chosen later.'}
                      </AlertDescription>
                    </Alert>
                  )}
                  <FormDescription>
                    People joining in these positions get it opened automatically, and Crew Compliance counts it for them.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <section aria-labelledby="fam-sections-heading" className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="fam-sections-heading" className="type-body font-medium text-foreground">
                  Sections and items
                </h3>
                <span className="type-caption text-muted-foreground">
                  {sections.fields.length} of {SECTION_LIMITS.sections} sections
                </span>
              </div>
              {form.formState.errors.sections?.root?.message || form.formState.errors.sections?.message ? (
                <p className="type-caption text-destructive" role="alert">
                  {form.formState.errors.sections?.root?.message ?? form.formState.errors.sections?.message}
                </p>
              ) : null}
              <ol className="min-w-0 space-y-3">
                {sections.fields.map((s, index) => (
                  <li key={s.id} className="min-w-0 rounded-md border border-border bg-card p-3" data-template-section={index}>
                    <SectionEditor
                      control={form.control}
                      register={form.register}
                      index={index}
                      count={sections.fields.length}
                      onMove={(to) => sections.move(index, to)}
                      onRemove={() => sections.remove(index)}
                    />
                  </li>
                ))}
              </ol>
              <Button
                type="button"
                variant="outline"
                className={COARSE}
                disabled={sections.fields.length >= SECTION_LIMITS.sections}
                onClick={() => sections.append({ name: '', items: [{ text: '' }] })}
              >
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                Add section
              </Button>
            </section>

            {!creating ? (
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-md border border-border p-3 space-y-0">
                    <div className="min-w-0">
                      <FormLabel>In use</FormLabel>
                      <FormDescription>A template not in use opens no new records; its records are kept.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="In use" />
                    </FormControl>
                  </FormItem>
                )}
              />
            ) : null}

            {rootError ? (
              <p className="type-body text-destructive" role="alert" data-template-error="">
                {rootError}
              </p>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className={COARSE} disabled={save.isPending}>
                {save.isPending ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
                {creating ? 'Save template' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

const SectionEditor: React.FC<{
  control: Control<TemplateFormValues>;
  register: UseFormRegister<TemplateFormValues>;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}> = ({ control, index, count, onMove, onRemove }) => {
  const items = useFieldArray({ control, name: `sections.${index}.items` });
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 items-start gap-2">
        <FormField
          control={control}
          name={`sections.${index}.name`}
          render={({ field }) => (
            <FormItem className="min-w-0 flex-1">
              <FormLabel className="sr-only">Section {index + 1} name</FormLabel>
              <FormControl>
                <Input {...field} placeholder={`Section ${index + 1}, e.g. Alarms and muster`} maxLength={SECTION_LIMITS.name} className={COARSE} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon" className={ICON_BUTTON} disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Move section ${index + 1} up`}>
            <ArrowUp aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className={ICON_BUTTON} disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Move section ${index + 1} down`}>
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className={ICON_BUTTON} disabled={count <= 1} onClick={onRemove} aria-label={`Remove section ${index + 1}`}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ol className="min-w-0 space-y-2 pl-1">
        {items.fields.map((it, i) => (
          <li key={it.id} className="flex min-w-0 items-start gap-2">
            <span aria-hidden="true" className="type-caption mt-2.5 w-5 shrink-0 text-right text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <FormField
              control={control}
              name={`sections.${index}.items.${i}.text`}
              render={({ field }) => (
                <FormItem className="min-w-0 flex-1">
                  <FormLabel className="sr-only">
                    Section {index + 1}, item {i + 1}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="What to show or check" maxLength={SECTION_LIMITS.item} className={COARSE} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={ICON_BUTTON}
              disabled={items.fields.length <= 1}
              onClick={() => items.remove(i)}
              aria-label={`Remove item ${i + 1} of section ${index + 1}`}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={COARSE}
        disabled={items.fields.length >= SECTION_LIMITS.items}
        onClick={() => items.append({ text: '' })}
      >
        <Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />
        Add item
      </Button>
    </div>
  );
};

export default TemplateEditorDialog;
