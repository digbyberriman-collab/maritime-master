/**
 * The area page's dialogs (gap/02 FC2, FC4, W2; `20261124040500`):
 *
 * - `VisibilityDialog` ("Change where hidden"): tick the vessels where a
 *   published template is hidden, with the reason when a vessel newly
 *   hides it (1–300 characters, the definer's limit). Each changed vessel
 *   is one `form_template_set_visibility` call, in order; the dialog
 *   reports what was saved and what was refused, in words, and never
 *   claims a change it did not see the server return.
 * - `MoveAreaDialog`: `form_template_move_area` (its open draft moves too).
 * - `ArchiveDialog`: `form_template_archive` with an optional reason (up to
 *   500); runs stay readable.
 * - `DeleteDraftDialog`: `form_template_delete_draft` (never published, no
 *   runs); the server's refusal offers Archive instead.
 *
 * React Hook Form + zod (lib/templateSchema.ts). Errors stay in the dialog;
 * the mutation hooks toast and refresh the catalogue.
 */
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/shared/lib/notify';
import { AREA_LABELS, FORM_TEMPLATE_AREAS } from '../lib/areaModel';
import { areaKeyLabel, type CatalogueTemplate, type VesselSetting } from '../lib/catalogueModel';
import {
  ARCHIVE_REASON_LIMIT,
  HIDE_REASON_LIMIT,
  archiveSchema,
  moveAreaSchema,
  visibilityChangeSchema,
  visibilityChanges,
  type ArchiveValues,
  type MoveAreaValues,
  type VisibilityChange,
  type VisibilityChangeValues,
} from '../lib/templateSchema';
import { COARSE } from './FormsParts';

const CONTENT = 'max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full';

function Counter({ id, value, max, hint }: { id: string; value: string; max: number; hint: string }) {
  const n = value.trim().length;
  return (
    <p id={id} className={cn('type-caption tabular-nums', n > max ? 'text-destructive' : 'text-muted-foreground')}>
      {`${hint} ${n.toLocaleString('en-GB')} / ${max.toLocaleString('en-GB')}`}
    </p>
  );
}

// ─── Change where hidden ────────────────────────────────────────────────

export interface VisibilityVessel {
  id: string;
  name: string;
}

export interface VisibilityOutcome {
  saved: VisibilityChange[];
  failed: Array<{ change: VisibilityChange; message: string }>;
}

export interface VisibilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: CatalogueTemplate | null;
  /** The vessels the template is offered on that the reader may manage. */
  vessels: readonly VisibilityVessel[];
  /** The current settings of those vessels. */
  settings: readonly VesselSetting[];
  /** Applies the changes one by one; resolves with what was saved and what was refused. */
  onApply: (changes: VisibilityChange[]) => Promise<VisibilityOutcome>;
}

export function VisibilityDialog({ open, onOpenChange, template, vessels, settings, onApply }: VisibilityDialogProps) {
  return (
    <Dialog open={open && !!template} onOpenChange={onOpenChange}>
      <DialogContent className={CONTENT} aria-describedby="visibility-description">
        {open && template ? <VisibilityForm key={template.id} template={template} vessels={vessels} settings={settings} onApply={onApply} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function VisibilityForm({
  template,
  vessels,
  settings,
  onApply,
  onDone,
}: Omit<VisibilityDialogProps, 'open' | 'onOpenChange' | 'template'> & { template: CatalogueTemplate; onDone: () => void }) {
  const id = React.useId();
  const before = React.useMemo(() => vessels.filter((v) => settings.some((s) => s.vesselId === v.id && s.visibility === 'hidden')).map((v) => v.id), [vessels, settings]);
  const form = useForm<VisibilityChangeValues>({ resolver: zodResolver(visibilityChangeSchema), defaultValues: { hidden: before, reason: '', newlyHidden: [] } });
  const [outcome, setOutcome] = React.useState<VisibilityOutcome | null>(null);
  const [busy, setBusy] = React.useState(false);
  const hidden = form.watch('hidden');
  const reason = form.watch('reason') ?? '';
  const newlyHidden = hidden.filter((v) => !before.includes(v));
  const changes = visibilityChanges(vessels.map((v) => v.id), before, hidden, reason);
  const reasonError = form.formState.errors.reason?.message ?? null;
  const vesselName = (vesselId: string) => vessels.find((v) => v.id === vesselId)?.name ?? 'a vessel';

  const toggle = (vesselId: string, on: boolean) => {
    const next = on ? [...new Set([...hidden, vesselId])] : hidden.filter((v) => v !== vesselId);
    form.setValue('hidden', next, { shouldDirty: true });
    form.setValue('newlyHidden', next.filter((v) => !before.includes(v)));
  };

  const submit = form.handleSubmit(async () => {
    if (!changes.length) return;
    setBusy(true);
    try {
      const result = await onApply(changes);
      setOutcome(result);
      if (!result.failed.length) onDone();
    } finally {
      setBusy(false);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="break-words">{`Where ${template.name} is hidden`}</DialogTitle>
        <DialogDescription id="visibility-description">
          Crews on a vessel where it is hidden do not see it. It stays published, and shown on every other vessel.
        </DialogDescription>
      </DialogHeader>
      {vessels.length === 0 ? (
        <Alert variant="info">
          <AlertDescription>It is not offered on a vessel you can manage.</AlertDescription>
        </Alert>
      ) : (
        <ul aria-label="Vessels" className="flex flex-col divide-y divide-border rounded-md border border-border">
          {vessels.map((v) => {
            const on = hidden.includes(v.id);
            const current = settings.find((s) => s.vesselId === v.id && s.visibility === 'hidden');
            return (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <Label htmlFor={`${id}-${v.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block truncate font-medium text-foreground">{v.name}</span>
                  {current?.reason ? <span className="block truncate type-caption text-muted-foreground">Hidden: {current.reason}</span> : null}
                </Label>
                <span className="flex shrink-0 items-center gap-2">
                  <span aria-hidden="true" className="type-caption text-muted-foreground">
                    {on ? 'Hidden' : 'Shown'}
                  </span>
                  <Switch id={`${id}-${v.id}`} checked={on} onCheckedChange={(c) => toggle(v.id, c)} disabled={busy} aria-label={`Hide on ${v.name}`} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {newlyHidden.length ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`}>Why it is hidden</Label>
          <Textarea
            id={`${id}-reason`}
            rows={2}
            maxLength={HIDE_REASON_LIMIT + 50}
            placeholder="For example: this vessel keeps a paper engine log"
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ''}`}
            disabled={busy}
            {...form.register('reason')}
          />
          <Counter id={`${id}-reason-hint`} value={reason} max={HIDE_REASON_LIMIT} hint="Shown with the template on the vessels that hide it." />
          {reasonError ? (
            <p id={`${id}-reason-error`} role="alert" className="text-sm text-destructive">
              {reasonError}
            </p>
          ) : null}
        </div>
      ) : null}
      {outcome?.failed.length ? (
        <Alert variant="destructive">
          <AlertTitle>{outcome.saved.length ? 'Some changes were not saved' : 'Nothing was changed'}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {outcome.failed.map((f) => (
                <li key={f.change.vesselId}>{`${vesselName(f.change.vesselId)}: ${f.message}`}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" className={COARSE} onClick={onDone} disabled={busy}>
          {outcome?.saved.length ? 'Close' : 'Cancel'}
        </Button>
        <Button type="submit" className={COARSE} disabled={busy || !changes.length}>
          {busy ? 'Saving…' : changes.length ? `Save ${changes.length === 1 ? 'the change' : `${changes.length} changes`}` : 'No changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Move to another area ──────────────────────────────────────────────

export interface MoveAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: CatalogueTemplate | null;
  onMove: (area: MoveAreaValues['area']) => Promise<unknown>;
}

export function MoveAreaDialog({ open, onOpenChange, template, onMove }: MoveAreaDialogProps) {
  return (
    <Dialog open={open && !!template} onOpenChange={onOpenChange}>
      <DialogContent className={CONTENT} aria-describedby="move-area-description">
        {open && template ? <MoveAreaForm key={template.id} template={template} onMove={onMove} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MoveAreaForm({ template, onMove, onDone }: { template: CatalogueTemplate; onMove: MoveAreaDialogProps['onMove']; onDone: () => void }) {
  const id = React.useId();
  const form = useForm<MoveAreaValues>({ resolver: zodResolver(moveAreaSchema), defaultValues: { area: undefined } });
  const [error, setError] = React.useState<unknown>(null);
  const busy = form.formState.isSubmitting;
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onMove(values.area);
      onDone();
    } catch (e) {
      setError(e);
    }
  });
  const areaError = form.formState.errors.area?.message ?? null;
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="break-words">{`Move ${template.name}`}</DialogTitle>
        <DialogDescription id="move-area-description">
          {`It is in ${areaKeyLabel(template.area)} now. Crews find it in the new area's place on board straight away; its runs and its draft come with it.`}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-area`}>New area</Label>
        <Controller
          control={form.control}
          name="area"
          render={({ field }) => (
            <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={busy}>
              <SelectTrigger id={`${id}-area`} className={COARSE} aria-invalid={areaError ? true : undefined}>
                <SelectValue placeholder="Choose an area" />
              </SelectTrigger>
              <SelectContent>
                {FORM_TEMPLATE_AREAS.filter((a) => a !== template.area).map((a) => (
                  <SelectItem key={a} value={a}>
                    {AREA_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {areaError ? (
          <p role="alert" className="text-sm text-destructive">
            {areaError}
          </p>
        ) : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The template was not moved</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Try again.')}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" className={COARSE} onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" className={COARSE} disabled={busy}>
          {busy ? 'Moving…' : 'Move template'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Archive ───────────────────────────────────────────────────────────

export interface ArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: CatalogueTemplate | null;
  onArchive: (reason: string | null) => Promise<unknown>;
}

export function ArchiveDialog({ open, onOpenChange, template, onArchive }: ArchiveDialogProps) {
  return (
    <Dialog open={open && !!template} onOpenChange={onOpenChange}>
      <DialogContent className={CONTENT} aria-describedby="archive-template-description">
        {open && template ? <ArchiveForm key={template.id} template={template} onArchive={onArchive} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ArchiveForm({ template, onArchive, onDone }: { template: CatalogueTemplate; onArchive: ArchiveDialogProps['onArchive']; onDone: () => void }) {
  const id = React.useId();
  const form = useForm<ArchiveValues>({ resolver: zodResolver(archiveSchema), defaultValues: { reason: '' } });
  const [error, setError] = React.useState<unknown>(null);
  const busy = form.formState.isSubmitting;
  const reason = form.watch('reason') ?? '';
  const reasonError = form.formState.errors.reason?.message ?? null;
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onArchive(values.reason.trim() || null);
      onDone();
    } catch (e) {
      setError(e);
    }
  });
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="break-words">{`Archive ${template.name}`}</DialogTitle>
        <DialogDescription id="archive-template-description">
          It is no longer offered on any vessel. Runs already recorded stay readable, and it can be started again as a new version.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-reason`}>Reason (optional)</Label>
        <Textarea
          id={`${id}-reason`}
          rows={3}
          maxLength={ARCHIVE_REASON_LIMIT + 50}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={`${id}-reason-hint`}
          disabled={busy}
          {...form.register('reason')}
        />
        <Counter id={`${id}-reason-hint`} value={reason} max={ARCHIVE_REASON_LIMIT} hint="Kept in the template's history." />
        {reasonError ? (
          <p role="alert" className="text-sm text-destructive">
            {reasonError}
          </p>
        ) : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The template was not archived</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Try again.')}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" className={COARSE} onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" className={COARSE} disabled={busy}>
          {busy ? 'Archiving…' : 'Archive template'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Delete a draft ────────────────────────────────────────────────────

export interface DeleteDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: CatalogueTemplate | null;
  onDelete: () => Promise<unknown>;
  /** The server kept it (published once, or runs): offer Archive instead. */
  onArchiveInstead?: () => void;
}

const ARCHIVE_INSTEAD = new Set(['template_has_runs', 'template_published']);

export function DeleteDraftDialog({ open, onOpenChange, template, onDelete, onArchiveInstead }: DeleteDraftDialogProps) {
  const [error, setError] = React.useState<unknown>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) setError(null);
  }, [open]);
  const code = (error as { code?: string } | null)?.code ?? null;
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      onOpenChange(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open && !!template} onOpenChange={onOpenChange}>
      <DialogContent className={CONTENT} aria-describedby="delete-draft-description">
        {template ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="break-words">{`Delete the draft ${template.name}`}</DialogTitle>
              <DialogDescription id="delete-draft-description">
                It was never published, so no vessel has used it. Deleting it cannot be undone; the history keeps a record that it existed.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>The draft was not deleted</AlertTitle>
                <AlertDescription>{errorMessage(error, 'Try again.')}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              {code && ARCHIVE_INSTEAD.has(code) && onArchiveInstead ? (
                <Button type="button" className={COARSE} onClick={onArchiveInstead}>
                  Archive instead
                </Button>
              ) : (
                <Button type="button" variant="destructive" className={COARSE} onClick={() => void run()} disabled={busy}>
                  {busy ? 'Deleting…' : 'Delete draft'}
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
