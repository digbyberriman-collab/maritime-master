/**
 * The publish and withdraw forms of the fleet document library (gap/02
 * FD3, FD4, W1; X5 spec X5-04B; DECISIONS D-X5-04, D-X5-17), and the plan
 * of definer calls a publish makes.
 *
 * - `publishDocumentSchema`: React Hook Form + zod with the shared form
 *   helpers, checked before any request with the server's own limits
 *   (title 1-160, description up to 2,000, version label up to 40, change
 *   summary up to 1,000, a date-only effective date in local time, at
 *   least one vessel when the targets are ticked) and the records bucket's
 *   upload rules (50 MB, the allow-listed types; `validateRecordFile`).
 * - `publishFormDefaults`: a new document (the type's major / minor
 *   default, today, all vessels including future ones), a draft to finish
 *   (its saved version details and vessels) or a new version of a
 *   published document (its vessels, the type's default kind).
 * - `planPublish`: the steps still to run, in the one order the server
 *   needs (X5 spec §10): `fleet_document_create` (draft) → upload the file
 *   (an entity attachment, no envelope) → `fleet_document_add_version` →
 *   `fleet_document_set_targets` → `fleet_document_publish` (publish only).
 *   A step that already succeeded is not repeated on a retry: the draft is
 *   created once, a file is uploaded once, a version is added once.
 * - `withdrawSchema`: the reason, 1 to 500 characters.
 *
 * No React and no requests; the upload limits come from the records
 * service (`@/lib/records/services/attachments`), the one source the
 * bucket's policy fixture pins.
 */
import { z } from 'zod';
import { dateOnly, optionalText, requiredText } from '@/shared/lib/form';
import { UPLOAD_REFUSAL_MESSAGES, validateRecordFile, type UploadProgress } from '@/lib/records/services/attachments';
import { autoVersionLabel, type FleetDocumentTargetMode, type FleetDocumentVersionKind } from './fleetDocumentMachine';

// ─── Limits (the definers' checks) ──────────────────────────────────────

export const TITLE_MAX = 160;
export const DESCRIPTION_MAX = 2000;
export const VERSION_LABEL_MAX = 40;
export const CHANGE_SUMMARY_MAX = 1000;
export const WITHDRAW_REASON_MAX = 500;

export const TYPE_REQUIRED = 'Choose the document type';
export const TITLE_REQUIRED = 'Enter the title crew will see';
export const FILE_REQUIRED = 'Choose the file to publish';
export const DATE_REQUIRED = 'Enter the date this version takes effect';
export const TARGETS_REQUIRED = 'Tick at least one vessel, or publish to all vessels';
export const REASON_REQUIRED = 'Enter the reason for withdrawing it';

const tooLong = (max: number) => `Keep it to ${max.toLocaleString('en-GB')} characters or fewer`;

// ─── Files ──────────────────────────────────────────────────────────────

/** The sentence for a file the records bucket would refuse (empty, over 50 MB, a type not allowed), or null. */
export function fileRefusal(file: Pick<File, 'size' | 'type'> | null | undefined): string | null {
  if (!file) return null;
  const rejection = validateRecordFile(file);
  return rejection ? UPLOAD_REFUSAL_MESSAGES[rejection] : null;
}

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File;

const KB = 1024;
const MB = KB * 1024;

/** "820 KB", "3.2 MB". */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / KB)).toLocaleString('en-GB')} KB`;
  return `${(bytes / MB).toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

/** The share of the file the browser has actually sent, 0-100 (never simulated). */
export function uploadPercent(progress: UploadProgress | null | undefined): number {
  if (!progress || !(progress.total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((progress.loaded / progress.total) * 100)));
}

/** "3.2 MB of 10.4 MB sent". */
export function uploadProgressLabel(progress: UploadProgress | null | undefined): string {
  if (!progress || !(progress.total > 0)) return 'Starting the upload';
  return `${formatFileSize(progress.loaded)} of ${formatFileSize(progress.total)} sent`;
}

// ─── The publish form ───────────────────────────────────────────────────

/** What the dialog does: publish a new document, finish a draft, or add a version to a published document. */
export type PublishMode = 'new' | 'resume' | 'new_version';

/** Publish now, or keep it as a draft. */
export type PublishIntent = 'publish' | 'draft';

export interface PublishDocumentFormValues {
  typeId: string;
  title: string;
  description: string;
  file: File | null;
  /** Blank: the server numbers it (`v<n>`). */
  versionLabel: string;
  versionKind: FleetDocumentVersionKind;
  /** Date-only `yyyy-MM-dd`, local time. */
  effectiveDate: string;
  changeSummary: string;
  targetMode: FleetDocumentTargetMode;
  /** The ticked vessels (selected mode). */
  vesselIds: string[];
}

/**
 * The publish form's schema. `fileRequired` is false only when a draft
 * version already holds a file (finishing a draft keeps its file unless
 * another is chosen).
 */
export function publishDocumentSchema(options: { fileRequired: boolean }) {
  return z
    .object({
      typeId: z.string({ required_error: TYPE_REQUIRED }).trim().min(1, TYPE_REQUIRED),
      title: requiredText(TITLE_REQUIRED, TITLE_MAX),
      description: optionalText(DESCRIPTION_MAX, tooLong(DESCRIPTION_MAX)),
      file: z.custom<File | null>((value) => value === null || value === undefined || isFile(value), { message: FILE_REQUIRED }),
      versionLabel: optionalText(VERSION_LABEL_MAX, tooLong(VERSION_LABEL_MAX)),
      versionKind: z.enum(['major', 'minor']),
      effectiveDate: dateOnly(DATE_REQUIRED),
      changeSummary: optionalText(CHANGE_SUMMARY_MAX, tooLong(CHANGE_SUMMARY_MAX)),
      targetMode: z.enum(['all_including_future', 'selected']),
      vesselIds: z.array(z.string().min(1)),
    })
    .superRefine((values, ctx) => {
      const file = values.file ?? null;
      if (!file && options.fileRequired) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file'], message: FILE_REQUIRED });
      const refusal = fileRefusal(file);
      if (refusal) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file'], message: refusal });
      if (values.targetMode === 'selected' && values.vesselIds.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vesselIds'], message: TARGETS_REQUIRED });
      }
    });
}

/** The form once the schema has passed: trimmed, blanks as null, targets de-duplicated. */
export interface PublishDocumentInput {
  typeId: string;
  title: string;
  description: string | null;
  file: File | null;
  versionLabel: string | null;
  versionKind: FleetDocumentVersionKind;
  effectiveDate: string;
  changeSummary: string | null;
  targetMode: FleetDocumentTargetMode;
  /** Empty for all vessels. */
  vesselIds: string[];
}

/** The parsed publish input, or null when the form does not pass. */
export function toPublishInput(values: PublishDocumentFormValues, options: { fileRequired: boolean }): PublishDocumentInput | null {
  const parsed = publishDocumentSchema(options).safeParse(values);
  if (!parsed.success) return null;
  const v = parsed.data;
  return {
    typeId: v.typeId,
    title: v.title,
    description: v.description ?? null,
    file: v.file ?? null,
    versionLabel: v.versionLabel ?? null,
    versionKind: v.versionKind,
    effectiveDate: v.effectiveDate,
    changeSummary: v.changeSummary ?? null,
    targetMode: v.targetMode,
    vesselIds: v.targetMode === 'selected' ? [...new Set(v.vesselIds)] : [],
  };
}

/** A version as the flow and the form know it. */
export interface PublishFlowVersion {
  id: string;
  versionNo: number;
  fileObjectId: string;
  fileName: string;
  label: string;
  kind: FleetDocumentVersionKind;
  /** Date-only `yyyy-MM-dd`. */
  effectiveDate: string;
  changeSummary: string | null;
}

export interface PublishDefaultsInput {
  mode: PublishMode;
  /** Today in local time (`todayDateOnly()`). */
  today: string;
  /** A new document's type (the "Not uploaded" slots preselect one). */
  typeId?: string | null;
  /** The type's defaults (major / minor). */
  typeVersionKind?: FleetDocumentVersionKind | null;
  /** The document being finished or versioned. */
  document?: {
    typeId: string;
    title: string;
    description: string | null;
    targetMode: FleetDocumentTargetMode;
    targetVesselIds: readonly string[];
  } | null;
  /** Its draft version (finishing a draft). */
  draftVersion?: PublishFlowVersion | null;
}

/** The form's starting values for each mode. */
export function publishFormDefaults(input: PublishDefaultsInput): PublishDocumentFormValues {
  const doc = input.document ?? null;
  const draft = input.mode === 'resume' ? input.draftVersion ?? null : null;
  return {
    typeId: doc?.typeId ?? input.typeId ?? '',
    title: doc?.title ?? '',
    description: doc?.description ?? '',
    file: null,
    versionLabel: draft?.label ?? '',
    versionKind: draft?.kind ?? input.typeVersionKind ?? 'major',
    effectiveDate: draft?.effectiveDate ?? input.today,
    changeSummary: draft?.changeSummary ?? '',
    targetMode: doc?.targetMode ?? 'all_including_future',
    vesselIds: doc ? [...doc.targetVesselIds] : [],
  };
}

// ─── The plan of definer calls ──────────────────────────────────────────

export const PUBLISH_STEPS = ['create', 'upload', 'add_version', 'set_targets', 'publish'] as const;
export type PublishStep = (typeof PUBLISH_STEPS)[number];

/** The targets as the flow last knew them (sorted ids). */
export interface KnownTargets {
  mode: FleetDocumentTargetMode;
  vesselIds: string[];
}

/**
 * What the publish flow knows: the document (once created or when it
 * already exists), the document's `updated_at` as the flow last saw it
 * (the publish refuses a stale one), its targets, the file uploaded in
 * this dialog and the file object it became, and the document's draft
 * version.
 */
export interface PublishFlowState {
  documentId: string | null;
  /**
   * The document's `updated_at` after the flow's own last change, or as the
   * dialog read it. `fleet_document_add_version` returns the version, whose
   * `updated_at` is the document's (both are written by one transaction,
   * so `now()` is the same; supabase/tests/sql/fleet/documents_library
   * pins it).
   */
  expectedUpdatedAt: string | null;
  targets: KnownTargets | null;
  uploaded: { file: File; fileObjectId: string } | null;
  draftVersion: PublishFlowVersion | null;
}

export const EMPTY_PUBLISH_STATE: PublishFlowState = {
  documentId: null,
  expectedUpdatedAt: null,
  targets: null,
  uploaded: null,
  draftVersion: null,
};

export interface PublishFlowRequest {
  intent: PublishIntent;
  file: File | null;
  version: {
    label: string | null;
    kind: FleetDocumentVersionKind;
    effectiveDate: string;
    changeSummary: string | null;
  };
  targetMode: FleetDocumentTargetMode;
  vesselIds: readonly string[];
}

export type PublishPlan = { ok: true; steps: PublishStep[] } | { ok: false; refusal: 'file_required' };

const sortedIds = (ids: readonly string[]) => [...new Set(ids)].sort();

/** The targets a request asks for, normalised (no vessels for all vessels). */
export function requestedTargets(request: Pick<PublishFlowRequest, 'targetMode' | 'vesselIds'>): KnownTargets {
  return { mode: request.targetMode, vesselIds: request.targetMode === 'selected' ? sortedIds(request.vesselIds) : [] };
}

/** Whether two target sets are the same. */
export function sameTargets(a: KnownTargets | null, b: KnownTargets | null): boolean {
  if (!a || !b) return false;
  if (a.mode !== b.mode) return false;
  const x = sortedIds(a.vesselIds);
  const y = sortedIds(b.vesselIds);
  return x.length === y.length && x.every((id, i) => id === y[i]);
}

/** Whether the request changes the draft version's label, kind, effective date or change summary. */
export function versionDetailsChanged(draft: PublishFlowVersion, version: PublishFlowRequest['version']): boolean {
  const label = version.label?.trim() || autoVersionLabel(draft.versionNo);
  return (
    label !== draft.label ||
    version.kind !== draft.kind ||
    version.effectiveDate !== draft.effectiveDate ||
    (version.changeSummary?.trim() || null) !== (draft.changeSummary?.trim() || null)
  );
}

/**
 * The steps a publish (or a draft save) still needs, in order:
 *
 * - `create` until the document exists;
 * - `upload` when a file is chosen that this dialog has not uploaded yet;
 * - `add_version` when that file is not yet the draft version, or when a
 *   kept draft's details change (a draft version is replaced in place);
 * - `set_targets` always (a call that changes nothing writes nothing);
 * - `publish` only to publish.
 *
 * Without a file and without a draft version there is nothing to publish.
 */
export function planPublish(state: PublishFlowState, request: PublishFlowRequest): PublishPlan {
  if (!request.file && !state.draftVersion) return { ok: false, refusal: 'file_required' };
  const steps: PublishStep[] = [];
  if (!state.documentId) steps.push('create');
  const newFile = request.file !== null && state.uploaded?.file !== request.file;
  if (newFile) steps.push('upload');
  const fileObjectId = request.file ? (newFile ? null : state.uploaded?.fileObjectId ?? null) : state.draftVersion?.fileObjectId ?? null;
  const versionNeeded =
    newFile ||
    !state.draftVersion ||
    state.draftVersion.fileObjectId !== fileObjectId ||
    versionDetailsChanged(state.draftVersion, request.version);
  if (versionNeeded) steps.push('add_version');
  steps.push('set_targets');
  if (request.intent === 'publish') steps.push('publish');
  return { ok: true, steps };
}

/** What each step was doing, for the progress line. */
export const PUBLISH_STEP_RUNNING: Readonly<Record<PublishStep, string>> = {
  create: 'Creating the draft',
  upload: 'Uploading the file',
  add_version: 'Adding the version',
  set_targets: 'Saving the vessels',
  publish: 'Publishing',
};

/** What did not happen when a step failed. */
export const PUBLISH_STEP_FAILED: Readonly<Record<PublishStep, string>> = {
  create: 'The draft was not created',
  upload: 'The file was not uploaded',
  add_version: 'The file was not added as a version',
  set_targets: 'The vessels were not saved',
  publish: 'The document was not published',
};

/**
 * What is left after a failure, so nobody wonders whether crew see a half
 * published document: nothing (the draft was not created), a draft to
 * finish or delete, or a published document whose published version is
 * unchanged.
 */
export function failureAftermath(input: { step: PublishStep; documentExists: boolean; documentPublished: boolean }): string {
  if (input.step === 'create' || !input.documentExists) return 'Nothing was saved.';
  if (input.documentPublished) return 'Crew still see the version published before; nothing new reached them.';
  return 'The draft is saved in the library and crew do not see it. Try again, or close this and finish it later from the library.';
}

/** "All vessels: 6 now, and any added later" / "3 of 7 vessels ticked". */
export function targetsSummary(mode: FleetDocumentTargetMode, tickedCount: number, countedCount: number, listedCount: number): string {
  if (mode === 'all_including_future') {
    return `All vessels: ${countedCount.toLocaleString('en-GB')} now, and any added later`;
  }
  return `${tickedCount.toLocaleString('en-GB')} of ${listedCount.toLocaleString('en-GB')} ${listedCount === 1 ? 'vessel' : 'vessels'} ticked`;
}

// ─── Withdraw ───────────────────────────────────────────────────────────

export const withdrawSchema = z.object({
  reason: requiredText(REASON_REQUIRED, WITHDRAW_REASON_MAX),
});

export interface WithdrawFormValues {
  reason: string;
}

/** The trimmed reason when the form passes, or null. */
export function toWithdrawReason(values: WithdrawFormValues): string | null {
  const parsed = withdrawSchema.safeParse(values);
  return parsed.success ? parsed.data.reason : null;
}
