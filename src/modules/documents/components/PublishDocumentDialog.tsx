/**
 * Publish a fleet document (gap/02 FD3, FD4, W1; X5 spec X5-04B;
 * DECISIONS D-01, D-X5-04, D-X5-17): the type, the title crew see, the
 * file, the version label, major or minor (the type's default), the date
 * the version takes effect, and where it goes: every vessel, also ones
 * added later, or the ticked vessels (tick every vessel of a flag, a class
 * society or a fleet group with the helpers of the fleet "Vessels shown"
 * filter).
 *
 * Three ways in:
 * - a new document (`document` null; `initialTypeId` preselects a type from
 *   the "Not uploaded" slots);
 * - a draft to finish (a draft document, or the draft version of a
 *   published one): its saved version details and vessels; its file is
 *   kept unless another one is chosen; a draft document can be deleted;
 * - a new version of a published document: a file is required, the label
 *   is numbered by the server when blank.
 *
 * The flow (hooks/usePublishFleetDocument.ts) runs create → upload (an
 * entity attachment, no envelope; real progress; Cancel stops the
 * transfer) → add the version → set the vessels → publish, and stops at
 * the first failure: the dialog then says which step did not happen, why
 * (the server's refusal as a sentence) and what is left (nothing, a draft
 * crew do not see, or the published version unchanged). Try again resumes
 * from that step. The success toast comes only after every definer's
 * returned row was checked; there is no other success path.
 *
 * Usable at 390 px: one column, a scrolling body between a fixed header
 * and footer, native pickers for the type and the date, 44 px targets on
 * coarse pointers, visible focus. Tokens only.
 */
import * as React from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp, Paperclip, RefreshCw, Trash2, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ACCEPTED_RECORD_MIME_TYPES } from '@/lib/records/services/attachments';
import { cn } from '@/lib/utils';
import { EmptyState, PageError } from '@/shared/components/states';
import { notify } from '@/shared/lib/notify';
import { todayDateOnly } from '@/shared/lib/form';
import { VesselChecklist, VesselTickHelpers, tickVessels, toggleVessel, type FleetGroupName, type ShownVessel } from '@/modules/fleet';
import { fleetDocumentKeys } from '../hooks/keys';
import {
  fetchFleetDocumentHistory,
  useFleetDocumentHistory,
  type FleetDocumentHistory,
  type FleetDocumentVersionDetail,
} from '../hooks/useFleetDocumentHistory';
import { usePublishFleetDocument } from '../hooks/usePublishFleetDocument';
import type { FleetDocumentSection, FleetDocumentType } from '../hooks/useFleetDocumentTaxonomy';
import type { LibraryRow } from '../lib/fleetDocumentLibrary';
import { autoVersionLabel, fleetDocumentRefusal, nextVersionNo } from '../lib/fleetDocumentMachine';
import {
  CHANGE_SUMMARY_MAX,
  EMPTY_PUBLISH_STATE,
  PUBLISH_STEP_FAILED,
  PUBLISH_STEP_RUNNING,
  TITLE_MAX,
  VERSION_LABEL_MAX,
  failureAftermath,
  formatFileSize,
  publishDocumentSchema,
  publishFormDefaults,
  targetsSummary,
  toPublishInput,
  uploadPercent,
  uploadProgressLabel,
  type PublishDocumentFormValues,
  type PublishFlowState,
  type PublishFlowVersion,
  type PublishIntent,
  type PublishMode,
} from '../lib/fleetDocumentSchema';
import { DeleteDraftDialog } from './WithdrawDocumentDialog';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const FIELD =
  'h-9 w-full min-w-0 rounded-md border border-input bg-field px-3 type-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:cursor-not-allowed disabled:opacity-60 [@media(pointer:coarse)]:h-11';
const ACCEPT = ACCEPTED_RECORD_MIME_TYPES.join(',');

export interface PublishDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** The company's document types and their sections, in order. */
  types: readonly FleetDocumentType[];
  sections: readonly FleetDocumentSection[];
  /** Every vessel the publisher reaches (`useFleetVesselsShown().vessels`). */
  vessels: readonly ShownVessel[];
  fleetGroups?: readonly FleetGroupName[];
  /** null: a new document; a draft: finish it; a published document: a new version. */
  document: LibraryRow | null;
  /** A new document's type (the "Not uploaded" slots). */
  initialTypeId?: string | null;
}

export function PublishDocumentDialog({ open, onOpenChange, ...rest }: PublishDocumentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full"
        aria-describedby="publish-document-description"
      >
        {open ? <PublishPanel key={rest.document?.id ?? `new:${rest.initialTypeId ?? ''}`} {...rest} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

type PanelProps = Omit<PublishDocumentDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void };

function modeOf(document: LibraryRow | null): PublishMode {
  if (!document) return 'new';
  if (document.status === 'draft' || document.draft) return 'resume';
  return 'new_version';
}

function dialogTitle(mode: PublishMode, document: LibraryRow | null): string {
  if (!document || mode === 'new') return 'Publish a document';
  if (document.status === 'draft') return `Finish publishing ${document.title}`;
  if (mode === 'resume' && document.draft) return `Finish ${document.draft.label} of ${document.title}`;
  return `New version of ${document.title}`;
}

const toFlowVersion = (v: FleetDocumentVersionDetail): PublishFlowVersion => ({
  id: v.id,
  versionNo: v.version_no,
  fileObjectId: v.file_object_id,
  fileName: v.file_name,
  label: v.version_label,
  kind: v.version_kind,
  effectiveDate: v.effective_date,
  changeSummary: v.change_summary,
});

/** The flow's starting point for an existing document: as the dialog read it. */
function flowStateFor(history: FleetDocumentHistory): PublishFlowState {
  const draft = history.versions.find((v) => v.state === 'draft');
  return {
    documentId: history.document.id,
    expectedUpdatedAt: history.document.updated_at,
    targets: { mode: history.document.target_mode, vesselIds: [...history.targetVesselIds] },
    uploaded: null,
    draftVersion: draft ? toFlowVersion(draft) : null,
  };
}

function PublishPanel(props: PanelProps) {
  const mode = modeOf(props.document);
  const history = useFleetDocumentHistory(props.companyId, props.document?.id, { enabled: !!props.document });
  const title = dialogTitle(mode, props.document);
  const header = (
    <div className="space-y-1 border-b border-border px-5 pb-3 pt-5 pr-12">
      <DialogTitle className="break-words font-display text-lg">{title}</DialogTitle>
      <DialogDescription id="publish-document-description">
        Crew on the vessels you choose find it in Safety, Fleet documents, once it is published.
      </DialogDescription>
    </div>
  );

  if (props.document && props.document.status === 'withdrawn') {
    return (
      <>
        {header}
        <div className="px-5 py-4">
          <Alert variant="info">
            <AlertDescription>{fleetDocumentRefusal('document_withdrawn')}</AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  if (props.document) {
    if (history.state === 'loading' || history.state === 'idle') {
      return (
        <>
          {header}
          <div role="status" aria-busy="true" className="space-y-3 px-5 py-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
            <Skeleton className="h-10" />
            <span className="sr-only">Loading the document</span>
          </div>
        </>
      );
    }
    if (history.state !== 'ready') {
      return (
        <>
          {header}
          <div className="px-5 py-4">
            {history.state === 'error' ? (
              <PageError error={history.error} title="The document could not load" onRetry={history.retry} variant="inline" />
            ) : history.state === 'not_set_up' ? (
              <EmptyState kind="not-enabled" title="Fleet documents are not set up yet" body="Publishing opens here once the library is set up." compact />
            ) : (
              <EmptyState title="This document is no longer in the library" body="Refresh the library to see the current documents." compact />
            )}
          </div>
        </>
      );
    }
    return <PublishForm {...props} mode={mode} header={header} history={history.history} />;
  }
  return <PublishForm {...props} mode={mode} header={header} history={null} />;
}

// ─── The form ───────────────────────────────────────────────────────────

interface FormProps extends PanelProps {
  mode: PublishMode;
  header: React.ReactNode;
  history: FleetDocumentHistory | null;
}

function PublishForm({ companyId, types, sections, vessels, fleetGroups = [], document, initialTypeId, onClose, mode, header, history }: FormProps) {
  const queryClient = useQueryClient();
  const id = React.useId();
  // The dialog's starting point, read once per open (the panel is keyed by document).
  const [initialState] = React.useState<PublishFlowState>(() => (history ? flowStateFor(history) : EMPTY_PUBLISH_STATE));
  const flow = usePublishFleetDocument(companyId, initialState);
  const { cancel } = flow;
  React.useEffect(() => () => cancel(), [cancel]);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const typeById = React.useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const [defaults] = React.useState<PublishDocumentFormValues>(() =>
    publishFormDefaults({
      mode,
      today: todayDateOnly(),
      typeId: initialTypeId ?? null,
      typeVersionKind: types.find((t) => t.id === (document?.typeId ?? initialTypeId ?? ''))?.version_kind_default ?? null,
      document: document
        ? {
            typeId: document.typeId,
            title: history?.document.title ?? document.title,
            description: history?.document.description ?? document.description,
            targetMode: history?.document.target_mode ?? document.targetMode,
            targetVesselIds: history?.targetVesselIds ?? document.targetVesselIds,
          }
        : null,
      draftVersion: initialState.draftVersion,
    }),
  );

  const fileRequiredRef = React.useRef(!flow.state.draftVersion);
  fileRequiredRef.current = !flow.state.draftVersion;
  const resolver = React.useCallback<Resolver<PublishDocumentFormValues>>(
    (values, context, options) => zodResolver(publishDocumentSchema({ fileRequired: fileRequiredRef.current }))(values, context, options),
    [],
  );
  const form = useForm<PublishDocumentFormValues>({ resolver, defaultValues: defaults });
  const errors = form.formState.errors;

  const documentExists = Boolean(flow.state.documentId);
  const documentPublished = document?.status === 'published';
  const documentStatus = documentPublished ? 'published' : 'draft';
  const running = flow.phase.kind === 'running';
  const typeId = form.watch('typeId');
  const targetMode = form.watch('targetMode');
  const vesselIds = form.watch('vesselIds');
  const versionKind = form.watch('versionKind');
  const file = form.watch('file');
  const type = typeById.get(typeId) ?? null;

  // A new document's version kind follows its type's default until the publisher picks one.
  React.useEffect(() => {
    if (mode !== 'new' || !type || form.getFieldState('versionKind').isDirty) return;
    form.setValue('versionKind', type.version_kind_default);
  }, [mode, type, form]);

  const versionNo = flow.state.draftVersion?.versionNo ?? (history ? nextVersionNo(history.versions) : 1);
  const ackRequired = document ? document.ackRequired : type?.ack_required_default ?? true;
  const ackLine = document
    ? ackRequired
      ? 'Crew on the vessels acknowledge it.'
      : 'Crew do not need to acknowledge it.'
    : type
      ? type.ack_required_default
        ? `Crew acknowledge it within ${type.ack_due_days_default.toLocaleString('en-GB')} days of publishing, or of joining the vessel.`
        : 'Crew do not need to acknowledge documents of this type.'
      : null;
  const kindHint = !ackRequired
    ? 'No acknowledgement is needed, so this only labels the change.'
    : !documentPublished
      ? 'The first version: everyone on the vessels acknowledges it.'
      : versionKind === 'minor'
        ? 'Acknowledgements of the version before carry over.'
        : 'Everyone on the vessels acknowledges it again.';

  const counted = vessels.filter((v) => v.counted);
  const titleForToast = (document?.title ?? form.getValues('title')).trim();

  const go = (intent: PublishIntent) =>
    form.handleSubmit(async (values) => {
      const input = toPublishInput(values, { fileRequired: !flow.state.draftVersion });
      if (!input) return;
      const result = await flow.run({
        intent,
        typeId: input.typeId,
        title: input.title,
        description: input.description,
        file: input.file,
        version: { label: input.versionLabel, kind: input.versionKind, effectiveDate: input.effectiveDate, changeSummary: input.changeSummary },
        targetMode: input.targetMode,
        vesselIds: input.vesselIds,
      });
      if (!result || result.status !== 'done') return;
      const reach =
        input.targetMode === 'all_including_future'
          ? 'every vessel, also ones added later'
          : `${input.vesselIds.length.toLocaleString('en-GB')} ${input.vesselIds.length === 1 ? 'vessel' : 'vessels'}`;
      if (intent === 'publish') notify.success(`${input.title} published`, { description: `Crew on ${reach} see it in Safety, Fleet documents.` });
      else notify.success(`Draft saved: ${input.title}`, { description: 'Crew do not see it until it is published.' });
      onClose();
    })();

  const reload = async () => {
    if (!companyId || !flow.state.documentId) return;
    const documentId = flow.state.documentId;
    const answer = await queryClient
      .fetchQuery({
        queryKey: fleetDocumentKeys.document(companyId, documentId),
        queryFn: () => fetchFleetDocumentHistory(companyId, documentId),
        staleTime: 0,
      })
      .catch(() => null);
    if (answer?.kind === 'ok') flow.reset(flowStateFor(answer.history));
  };

  const failed = flow.phase.kind === 'failed' ? flow.phase : null;
  const canDeleteDraft = documentExists && documentStatus === 'draft' && !running;

  return (
    <>
      {header}
      <form
        id={`${id}-form`}
        noValidate
        aria-label={dialogTitle(mode, document)}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void go('publish');
        }}
      >
        {/* Document */}
        <fieldset className="space-y-3" disabled={running}>
          <legend className="type-eyebrow mb-1 text-muted-foreground">Document</legend>
          {documentExists || document ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd className="break-words text-foreground">{typeById.get(typeId)?.name ?? document?.typeName ?? 'Unknown type'}</dd>
              <dt className="text-muted-foreground">Title</dt>
              <dd className="break-words font-medium text-foreground">{document?.title ?? form.getValues('title').trim()}</dd>
            </dl>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor={`${id}-type`}>Document type</Label>
                <select
                  id={`${id}-type`}
                  className={FIELD}
                  aria-invalid={errors.typeId ? true : undefined}
                  aria-describedby={errors.typeId ? `${id}-type-error` : ackLine ? `${id}-type-hint` : undefined}
                  {...form.register('typeId')}
                >
                  <option value="">Choose a type</option>
                  {sections.map((s) => {
                    const ofSection = types.filter((t) => t.section_id === s.id);
                    if (!ofSection.length) return null;
                    return (
                      <optgroup key={s.id} label={s.name}>
                        {ofSection.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                {errors.typeId ? <FieldError id={`${id}-type-error`} message={errors.typeId.message} /> : null}
                {ackLine && !errors.typeId ? (
                  <p id={`${id}-type-hint`} className="type-caption text-muted-foreground">
                    {ackLine}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-title`}>Title crew see</Label>
                <Input
                  id={`${id}-title`}
                  autoComplete="off"
                  maxLength={TITLE_MAX + 20}
                  className={cn('h-9', COARSE)}
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={errors.title ? `${id}-title-error` : undefined}
                  {...form.register('title')}
                />
                {errors.title ? <FieldError id={`${id}-title-error`} message={errors.title.message} /> : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-description`}>
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id={`${id}-description`}
                  rows={2}
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={errors.description ? `${id}-description-error` : undefined}
                  {...form.register('description')}
                />
                {errors.description ? <FieldError id={`${id}-description-error`} message={errors.description.message} /> : null}
              </div>
            </>
          )}
          {document && ackLine ? <p className="type-caption text-muted-foreground">{ackLine}</p> : null}
        </fieldset>

        {/* File */}
        <fieldset className="space-y-2" disabled={running}>
          <legend className="type-eyebrow mb-1 text-muted-foreground">File</legend>
          <Controller
            control={form.control}
            name="file"
            render={({ field }) => (
              <FileField
                id={`${id}-file`}
                file={field.value}
                onChange={(next) => field.onChange(next)}
                kept={flow.state.draftVersion && !field.value ? flow.state.draftVersion : null}
                error={errors.file?.message ?? null}
                disabled={running}
              />
            )}
          />
        </fieldset>

        {/* Version */}
        <fieldset className="space-y-3" disabled={running}>
          <legend className="type-eyebrow mb-1 text-muted-foreground">Version</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${id}-label`}>
                Version label <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`${id}-label`}
                autoComplete="off"
                maxLength={VERSION_LABEL_MAX + 10}
                placeholder={autoVersionLabel(versionNo)}
                className={cn('h-9 font-mono', COARSE)}
                aria-invalid={errors.versionLabel ? true : undefined}
                aria-describedby={`${id}-label-hint${errors.versionLabel ? ` ${id}-label-error` : ''}`}
                {...form.register('versionLabel')}
              />
              <p id={`${id}-label-hint`} className="type-caption text-muted-foreground">
                {`Left blank, it is ${autoVersionLabel(versionNo)}.`}
              </p>
              {errors.versionLabel ? <FieldError id={`${id}-label-error`} message={errors.versionLabel.message} /> : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-effective`}>Takes effect on</Label>
              <Input
                id={`${id}-effective`}
                type="date"
                className={cn('h-9 tabular-nums', COARSE)}
                aria-invalid={errors.effectiveDate ? true : undefined}
                aria-describedby={errors.effectiveDate ? `${id}-effective-error` : undefined}
                {...form.register('effectiveDate')}
              />
              {errors.effectiveDate ? <FieldError id={`${id}-effective-error`} message={errors.effectiveDate.message} /> : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <span id={`${id}-kind-label`} className="text-sm font-medium text-foreground">
              Kind of change
            </span>
            <Controller
              control={form.control}
              name="versionKind"
              render={({ field }) => (
                <RadioGroup
                  aria-labelledby={`${id}-kind-label`}
                  aria-describedby={`${id}-kind-hint`}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value)}
                  className="grid gap-2 sm:grid-cols-2"
                  disabled={running}
                >
                  <ChoiceCard id={`${id}-kind-major`} value="major" title="Major" detail={type?.version_kind_default === 'major' ? "The type's default" : undefined} />
                  <ChoiceCard id={`${id}-kind-minor`} value="minor" title="Minor" detail={type?.version_kind_default === 'minor' ? "The type's default" : undefined} />
                </RadioGroup>
              )}
            />
            <p id={`${id}-kind-hint`} className="type-caption text-muted-foreground">
              {kindHint}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-summary`}>
              What changed <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={`${id}-summary`}
              rows={2}
              maxLength={CHANGE_SUMMARY_MAX + 50}
              aria-invalid={errors.changeSummary ? true : undefined}
              aria-describedby={errors.changeSummary ? `${id}-summary-error` : undefined}
              {...form.register('changeSummary')}
            />
            {errors.changeSummary ? <FieldError id={`${id}-summary-error`} message={errors.changeSummary.message} /> : null}
          </div>
        </fieldset>

        {/* Vessels */}
        <fieldset className="space-y-2" disabled={running}>
          <legend className="type-eyebrow mb-1 text-muted-foreground">Vessels</legend>
          <Controller
            control={form.control}
            name="targetMode"
            render={({ field }) => (
              <RadioGroup
                aria-label="Publish to"
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
                className="grid gap-2 sm:grid-cols-2"
                disabled={running}
              >
                <ChoiceCard
                  id={`${id}-targets-all`}
                  value="all_including_future"
                  title="All vessels"
                  detail={`Every counted vessel (${counted.length.toLocaleString('en-GB')} now), also ones added later`}
                />
                <ChoiceCard id={`${id}-targets-selected`} value="selected" title="Chosen vessels" detail="Tick them below, or tick by flag, class or group" />
              </RadioGroup>
            )}
          />
          {targetMode === 'selected' ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-caption tabular-nums text-muted-foreground" aria-live="polite">
                  {targetsSummary('selected', vesselIds.length, counted.length, vessels.length)}
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={COARSE}
                    onClick={() => form.setValue('vesselIds', tickVessels(vessels, vesselIds, counted.map((v) => v.id)), { shouldValidate: form.formState.isSubmitted })}
                  >
                    Tick all counted
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={COARSE}
                    disabled={!vesselIds.length}
                    onClick={() => form.setValue('vesselIds', [], { shouldValidate: form.formState.isSubmitted })}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <VesselTickHelpers
                vessels={vessels}
                fleetGroups={fleetGroups}
                onTick={(ids) => form.setValue('vesselIds', tickVessels(vessels, vesselIds, ids), { shouldValidate: form.formState.isSubmitted })}
                disabled={running}
              />
              {vessels.length ? (
                <div className="rounded-md border border-border p-1 sm:max-h-64 sm:overflow-y-auto">
                  <VesselChecklist
                    vessels={vessels}
                    selectedIds={vesselIds}
                    label="Vessels to publish to"
                    onToggle={(vesselId) => form.setValue('vesselIds', toggleVessel(vessels, vesselIds, vesselId), { shouldValidate: form.formState.isSubmitted })}
                    disabled={running}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">You do not reach any vessel, so there is none to tick.</p>
              )}
              {errors.vesselIds ? <FieldError id={`${id}-vessels-error`} message={errors.vesselIds.message} /> : null}
            </div>
          ) : (
            <p className="type-caption text-muted-foreground">{targetsSummary('all_including_future', 0, counted.length, vessels.length)}</p>
          )}
        </fieldset>

        {flow.phase.kind === 'running' ? (
          <div role="status" aria-live="polite" className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground">{`${PUBLISH_STEP_RUNNING[flow.phase.step]}…`}</p>
            {flow.phase.step === 'upload' ? (
              <>
                <Progress value={uploadPercent(flow.phase.progress)} aria-label="Upload progress" className="h-2" />
                <p className="type-caption tabular-nums text-muted-foreground">{`${uploadProgressLabel(flow.phase.progress)} (${uploadPercent(flow.phase.progress)}%)`}</p>
              </>
            ) : null}
          </div>
        ) : null}

        {failed ? (
          <Alert variant="destructive">
            <AlertTitle>{PUBLISH_STEP_FAILED[failed.step]}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{failed.message}</p>
              <p>{failureAftermath({ step: failed.step, documentExists, documentPublished })}</p>
              {failed.code === 'stale_document' && document ? (
                <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => void reload()}>
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />
                  Load the latest
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </form>

      <div className="flex flex-col gap-2 border-t border-border px-5 py-3 sm:flex-row-reverse sm:items-center sm:justify-between">
        {/* Below 640 px: Publish on its own row, Save draft and Cancel side by side, Delete draft last. */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row-reverse">
          <Button type="submit" form={`${id}-form`} className={cn('col-span-2', COARSE)} disabled={running}>
            <FileUp aria-hidden="true" className="h-4 w-4" />
            {running ? 'Working…' : documentPublished ? 'Publish version' : 'Publish'}
          </Button>
          <Button type="button" variant="outline" className={COARSE} onClick={() => void go('draft')} disabled={running}>
            {documentPublished ? 'Save version as draft' : 'Save draft'}
          </Button>
          {running && flow.phase.kind === 'running' && flow.phase.step === 'upload' ? (
            <Button type="button" variant="outline" className={COARSE} onClick={flow.cancel}>
              <X aria-hidden="true" className="h-4 w-4" />
              Cancel upload
            </Button>
          ) : (
            <Button type="button" variant="outline" className={COARSE} onClick={onClose} disabled={running}>
              {documentExists && !document ? 'Close' : 'Cancel'}
            </Button>
          )}
        </div>
        {canDeleteDraft ? (
          <Button type="button" variant="ghost" className={cn('text-destructive', COARSE)} onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Delete draft
          </Button>
        ) : null}
      </div>

      <DeleteDraftDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        companyId={companyId}
        document={flow.state.documentId ? { id: flow.state.documentId, title: titleForToast || 'this document', status: 'draft' } : null}
        onDeleted={onClose}
      />
    </>
  );
}

// ─── Parts ──────────────────────────────────────────────────────────────

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

function ChoiceCard({ id, value, title, detail }: { id: string; value: string; title: string; detail?: string }) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border border-input p-3 font-normal transition-colors duration-quick hover:bg-accent/60',
        'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-signal-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
        COARSE,
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {detail ? <span className="type-caption block text-muted-foreground">{detail}</span> : null}
      </span>
    </Label>
  );
}

function FileField({
  id,
  file,
  onChange,
  kept,
  error,
  disabled,
}: {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
  /** The draft version's file, kept unless another one is chosen. */
  kept: PublishFlowVersion | null;
  error: string | null;
  disabled: boolean;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const pick = (files: FileList | null) => {
    const next = files?.[0] ?? null;
    if (next) onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <div
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!disabled) pick(event.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between',
          over ? 'border-primary bg-signal-muted' : 'border-input',
          error && 'border-destructive',
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <Paperclip aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {file ? (
            <p className="min-w-0 text-sm">
              <span className="block break-all font-medium text-foreground">{file.name}</span>
              <span className="type-caption text-muted-foreground">{formatFileSize(file.size)}</span>
            </p>
          ) : kept ? (
            <p className="min-w-0 text-sm">
              <span className="block break-all font-medium text-foreground">{kept.fileName}</span>
              <span className="type-caption text-muted-foreground">{`Saved with ${kept.label}; kept unless you choose another file`}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Drop the file here, or choose it. PDF, images or Office documents, up to 50 MB.</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {file ? (
            <Button type="button" variant="ghost" size="sm" className={COARSE} onClick={() => onChange(null)} disabled={disabled}>
              Remove
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => input.current?.click()} disabled={disabled}>
            {file || kept ? 'Choose another file' : 'Choose file'}
          </Button>
        </div>
        <input
          ref={input}
          id={id}
          type="file"
          accept={ACCEPT}
          aria-label="File to publish"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          onChange={(event) => {
            pick(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      {error ? <FieldError id={`${id}-error`} message={error} /> : null}
    </div>
  );
}

export default PublishDocumentDialog;
