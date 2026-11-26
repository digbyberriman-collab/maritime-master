/**
 * The builder's panels (gap/02 FC3, W2 "Targets"; X5 spec X5-06B):
 *
 * - `DetailsPanel`: name, code (made from the name when blank, fixed once
 *   a later version exists), area, kind, cadence, description and
 *   "Signature on completion". While the catalogue columns are missing
 *   (D-01) area, kind, cadence and the signature cannot be saved, so those
 *   fields are disabled and say why.
 * - `TargetsPanel`: all vessels, including ones added later (`FLEET`), or
 *   chosen vessels (`VESSEL_SPECIFIC` + `vessel_ids`) with the fleet
 *   filter's tick helpers (flag, class, fleet group), Tick all counted,
 *   Clear and the ticked count.
 * - `PublishDialog`: what stops a publish (the server's checks, each with
 *   a way to the field), else the version number for this publish (blank
 *   numbers it) and Publish. A refusal stays in the dialog, in words.
 *
 * Inside the page's FormProvider. Tokens only; 44 px targets on coarse
 * pointers; usable at 390 px.
 */
import React from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { VesselChecklist, VesselTickHelpers, tickVessels, toggleVessel, type FleetGroupName, type ShownVessel } from '@/modules/fleet';
import { errorMessage } from '@/shared/lib/notify';
import { AREA_LABELS, FORM_KIND_LABELS, FORM_TEMPLATE_AREAS, FORM_TEMPLATE_KINDS } from '../lib/areaModel';
import { CADENCES, CADENCE_LABELS } from '../lib/cadence';
import { VERSION_LABEL_MAX } from '../lib/templateMachine';
import { CODE_MAX, DESCRIPTION_MAX, NAME_MAX, type TemplateFormValues } from '../lib/templateSchema';
import { COARSE } from './FormsParts';

function FieldError({ id, message }: { id: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

function Panel({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 id={id ? `${id}-title` : undefined} className="font-display text-base font-semibold text-foreground">
          {title}
        </h2>
        {description ? <p className="mt-0.5 type-body-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

// ─── Details ───────────────────────────────────────────────────────────

export interface DetailsPanelProps {
  areasSetUp: boolean;
  codeEditable: boolean;
  /** The code a blank code becomes. */
  codeSuggestion: string;
  disabled?: boolean;
}

export function DetailsPanel({ areasSetUp, codeEditable, codeSuggestion, disabled }: DetailsPanelProps) {
  const { control, register, formState } = useFormContext<TemplateFormValues>();
  const id = React.useId();
  const errors = formState.errors;
  const description = useWatch({ control, name: 'description' }) ?? '';
  const catalogueOff = !areasSetUp || disabled;
  return (
    <Panel id={`${id}-details`} title="Details" description="What it is and where crews find it on board.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            maxLength={NAME_MAX + 20}
            placeholder="For example: Fire patrol rounds"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
            className={COARSE}
            disabled={disabled}
            {...register('name')}
          />
          <FieldError id={`${id}-name-error`} message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-code`}>Code</Label>
          <Input
            id={`${id}-code`}
            maxLength={CODE_MAX + 10}
            placeholder={codeSuggestion}
            aria-invalid={errors.code ? true : undefined}
            aria-describedby={`${id}-code-hint${errors.code ? ` ${id}-code-error` : ''}`}
            className={cn('font-mono uppercase', COARSE)}
            disabled={disabled || !codeEditable}
            {...register('code')}
          />
          <p id={`${id}-code-hint`} className="type-caption text-muted-foreground">
            {codeEditable ? 'Left blank, it is made from the name.' : 'Every version of a template keeps its code.'}
          </p>
          <FieldError id={`${id}-code-error`} message={errors.code?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-area`}>Where crews find it</Label>
          <Controller
            control={control}
            name="area"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange} disabled={catalogueOff}>
                <SelectTrigger id={`${id}-area`} className={COARSE} aria-invalid={errors.area ? true : undefined} aria-describedby={!areasSetUp ? `${id}-catalogue-off` : undefined}>
                  <SelectValue placeholder="Choose an area" />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TEMPLATE_AREAS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {AREA_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError id={`${id}-area-error`} message={errors.area?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-kind`}>Kind</Label>
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                <SelectTrigger id={`${id}-kind`} className={COARSE}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TEMPLATE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {FORM_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-cadence`}>How often it is run</Label>
          <Controller
            control={control}
            name="cadence"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={catalogueOff}>
                <SelectTrigger id={`${id}-cadence`} className={COARSE} aria-describedby={!areasSetUp ? `${id}-catalogue-off` : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CADENCE_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor={`${id}-description`}>Description (optional)</Label>
          <Textarea id={`${id}-description`} rows={2} maxLength={DESCRIPTION_MAX + 50} disabled={disabled} aria-describedby={`${id}-description-count`} {...register('description')} />
          <p id={`${id}-description-count`} className={cn('type-caption tabular-nums', description.length > DESCRIPTION_MAX ? 'text-destructive' : 'text-muted-foreground')}>
            {`Crews see it above the first item. ${description.length.toLocaleString('en-GB')} / ${DESCRIPTION_MAX.toLocaleString('en-GB')}`}
          </p>
          <FieldError id={`${id}-description-error`} message={errors.description?.message} />
        </div>
        <Controller
          control={control}
          name="requiresSignature"
          render={({ field }) => (
            <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3 md:col-span-2">
              <span className="min-w-0">
                <Label htmlFor={`${id}-signature`} className="cursor-pointer">
                  Signature on completion
                </Label>
                <span className="block type-body-sm text-muted-foreground">The person who completes it signs before it can be submitted.</span>
              </span>
              <Switch id={`${id}-signature`} checked={field.value} onCheckedChange={field.onChange} disabled={catalogueOff} aria-describedby={!areasSetUp ? `${id}-catalogue-off` : undefined} />
            </div>
          )}
        />
      </div>
      {!areasSetUp ? (
        <p id={`${id}-catalogue-off`} className="type-body-sm text-muted-foreground">
          Areas are not set up yet, so the area, how often it is run and the completion signature cannot be saved. Name, items and vessels are saved.
        </p>
      ) : null}
    </Panel>
  );
}

// ─── Where it applies ──────────────────────────────────────────────────

export interface TargetsPanelProps {
  vessels: readonly ShownVessel[] | null;
  fleetGroups: readonly FleetGroupName[];
  vesselsError: string | null;
  flagged: boolean;
  disabled?: boolean;
}

export function TargetsPanel({ vessels, fleetGroups, vesselsError, flagged, disabled }: TargetsPanelProps) {
  const { control, setValue } = useFormContext<TemplateFormValues>();
  const scope = useWatch({ control, name: 'vesselScope' });
  const ids = useWatch({ control, name: 'vesselIds' }) ?? [];
  const list = vessels ?? [];
  const known = new Set(list.map((v) => v.id));
  const unknownTicked = ids.filter((v) => !known.has(v)).length;
  const set = (next: string[]) => setValue('vesselIds', next, { shouldDirty: true });
  return (
    <Panel id="template-targets" title="Where it applies" description="The vessels whose crews are offered it.">
      <Controller
        control={control}
        name="vesselScope"
        render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2" disabled={disabled} aria-label="Where it applies">
            <Label htmlFor="targets-fleet" className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 [@media(pointer:coarse)]:min-h-11">
              <RadioGroupItem id="targets-fleet" value="FLEET" className="mt-0.5" />
              <span>
                <span className="block font-medium text-foreground">All vessels, including ones added later</span>
                <span className="block type-body-sm text-muted-foreground">A new vessel gets it as soon as it joins the fleet.</span>
              </span>
            </Label>
            <Label htmlFor="targets-chosen" className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3 [@media(pointer:coarse)]:min-h-11', flagged ? 'border-critical/60' : 'border-border')}>
              <RadioGroupItem id="targets-chosen" value="VESSEL_SPECIFIC" className="mt-0.5" />
              <span>
                <span className="block font-medium text-foreground">Chosen vessels</span>
                <span className="block type-body-sm text-muted-foreground">Only the vessels ticked below. New vessels do not get it.</span>
              </span>
            </Label>
          </RadioGroup>
        )}
      />
      {scope === 'VESSEL_SPECIFIC' ? (
        vesselsError ? (
          <Alert variant="destructive">
            <AlertDescription>{vesselsError}</AlertDescription>
          </Alert>
        ) : vessels === null ? (
          <p className="type-body-sm text-muted-foreground">Loading your vessels…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <VesselTickHelpers vessels={list} fleetGroups={fleetGroups} onTick={(add) => set(tickVessels(list, ids, add))} disabled={disabled} className="min-w-0 flex-1" />
              <span className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className={COARSE} disabled={disabled} onClick={() => set(tickVessels(list, ids, list.filter((v) => v.counted).map((v) => v.id)))}>
                  Tick all counted
                </Button>
                <Button type="button" variant="ghost" size="sm" className={COARSE} disabled={disabled || ids.length === 0} onClick={() => set([])}>
                  Clear
                </Button>
              </span>
            </div>
            <VesselChecklist vessels={list} selectedIds={ids} onToggle={(v) => set(toggleVessel(list, ids, v))} disabled={disabled} className="rounded-md border border-border p-1" />
            <p className={cn('type-body-sm', flagged && ids.length === 0 ? 'text-critical' : 'text-muted-foreground')} aria-live="polite">
              {`${(ids.length - unknownTicked).toLocaleString('en-GB')} of ${list.length.toLocaleString('en-GB')} ticked`}
              {unknownTicked ? `, and ${unknownTicked} you cannot see` : ''}
            </p>
          </div>
        )
      ) : null}
    </Panel>
  );
}

// ─── Publish ───────────────────────────────────────────────────────────

export interface PublishProblem {
  key: string;
  sentence: string;
  onShow: () => void;
}

export interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problems: readonly PublishProblem[];
  /** "v3": what a blank version number publishes as. */
  nextVersion: string;
  /** "On every vessel, including ones added later" / "On 3 vessels". */
  targets: string;
  /** The draft has unsaved changes: they are saved first. */
  willSave: boolean;
  onPublish: (versionLabel: string | null) => Promise<void>;
}

export function PublishDialog({ open, onOpenChange, problems, nextVersion, targets, willSave, onPublish }: PublishDialogProps) {
  const [label, setLabel] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const id = React.useId();
  React.useEffect(() => {
    if (open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);
  const trimmed = label.trim();
  const tooLong = trimmed.length > VERSION_LABEL_MAX;
  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await onPublish(trimmed || null);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full" aria-describedby={`${id}-description`}>
        <DialogHeader>
          <DialogTitle>{problems.length ? 'Not ready to publish' : 'Publish this template'}</DialogTitle>
          <DialogDescription id={`${id}-description`}>
            {problems.length
              ? 'Fix these first. Crews never see a template with an empty section or an item without a label.'
              : `${targets}. Crews see it straight away; a version it replaces stops being offered, and its runs keep their version.`}
          </DialogDescription>
        </DialogHeader>
        {problems.length ? (
          <ul className="flex flex-col gap-2" aria-label="What stops it">
            {problems.map((p) => (
              <li key={p.key} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
                <span className="type-body-sm text-foreground">{p.sentence}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn('shrink-0', COARSE)}
                  onClick={() => {
                    onOpenChange(false);
                    window.setTimeout(p.onShow, 0);
                  }}
                >
                  Show me
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-version`}>Version number (optional)</Label>
            <Input
              id={`${id}-version`}
              value={label}
              maxLength={VERSION_LABEL_MAX + 10}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={nextVersion}
              aria-invalid={tooLong ? true : undefined}
              aria-describedby={`${id}-version-hint`}
              className={COARSE}
              disabled={busy}
            />
            <p id={`${id}-version-hint`} className={cn('type-caption', tooLong ? 'text-destructive' : 'text-muted-foreground')}>
              {tooLong ? `Up to ${VERSION_LABEL_MAX} characters.` : `Leave blank to publish it as ${nextVersion}, or type your controlled-document number.`}
            </p>
            {willSave ? <p className="type-caption text-muted-foreground">Your changes are saved first.</p> : null}
          </div>
        )}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Not published</AlertTitle>
            <AlertDescription>{errorMessage(error, 'Try again.')}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)} disabled={busy}>
            {problems.length ? 'Close' : 'Cancel'}
          </Button>
          {problems.length ? null : (
            <Button type="button" className={COARSE} onClick={() => void publish()} disabled={busy || tooLong}>
              {busy ? 'Publishing…' : 'Publish'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
