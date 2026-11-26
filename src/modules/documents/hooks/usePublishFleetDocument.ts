/**
 * The publish flow of the fleet document library (gap/02 FD3, FD4, W1;
 * X5 spec X5-04B; DECISIONS D-01, D-X5-17).
 *
 * `runPublishFlow` runs the steps `planPublish` (lib/fleetDocumentSchema.ts)
 * gives, in the one order the server needs:
 *
 * 1. `fleet_document_create` → a draft (only for a new document);
 * 2. `uploadRecordFile` with the document as the file's entity and no
 *    envelope (`<company>/fleet/documents/fleet_document/<document>/…`,
 *    D-X5-17): validated (50 MB, the allow-list), real XHR progress, a
 *    signal that cancels the transfer;
 * 3. `fleet_document_add_version` with the registered file object;
 * 4. `fleet_document_set_targets` (all vessels including future ones, or
 *    the ticked vessels);
 * 5. `fleet_document_publish` with the document's `updated_at` as the flow
 *    last changed it (publish only).
 *
 * Each step's answer is checked before the next one runs (the mutation
 * wrappers check the returned row; the upload's file object must be the
 * company's, for this document, in the documents module), so a step that
 * did not really happen never counts. A failure stops the flow and keeps
 * what is already done: the draft stays (visible, resumable, deletable),
 * an uploaded file is not uploaded again on a retry, a published document
 * keeps its published version. The flow never publishes half a document:
 * publish is the last step and only runs when every earlier one succeeded.
 *
 * `usePublishFleetDocument` holds that state for the dialog, the step on
 * screen, the upload's progress, a cancel, and invalidates the company's
 * library queries after every run (a refusal can mean the screen was
 * stale, and a failed run may have left a draft to show). The dialog shows
 * the outcome; this hook toasts nothing.
 */
import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { uploadRecordFile, type UploadProgress, type UploadRecordFileRequest, type UploadRecordFileResult } from '@/lib/records/services/attachments';
import { errorMessage } from '@/shared/lib/notify';
import {
  FILE_REQUIRED,
  planPublish,
  requestedTargets,
  sameTargets,
  type PublishFlowRequest,
  type PublishFlowState,
  type PublishFlowVersion,
  type PublishIntent,
  type PublishStep,
} from '../lib/fleetDocumentSchema';
import type { FleetDocumentRow, FleetDocumentVersionRow } from '../types/db.pending';
import { fleetDocumentKeys } from './keys';
import {
  FleetDocumentRefusalError,
  addVersion,
  createDocument,
  publishDocument,
  setTargets,
} from './useFleetDocumentMutations';

/** The calls the flow makes (tests pass fakes). */
export interface PublishFlowDeps {
  createDocument: typeof createDocument;
  uploadRecordFile: (request: UploadRecordFileRequest) => Promise<UploadRecordFileResult>;
  addVersion: typeof addVersion;
  setTargets: typeof setTargets;
  publishDocument: typeof publishDocument;
}

const DEFAULT_DEPS: PublishFlowDeps = { createDocument, uploadRecordFile, addVersion, setTargets, publishDocument };

/** The records bucket's module and entity for library files (D-X5-17). */
export const FLEET_DOCUMENT_FILE_SCOPE = { moduleKey: 'documents', entityType: 'fleet_document' } as const;

export const UPLOADS_NOT_SET_UP = 'File uploads are not set up yet, so the file was not uploaded.';
export const UPLOAD_NOT_CONFIRMED = 'The file was sent but STORM could not confirm it was stored for this document. Try again.';
export const FLOW_STOPPED = 'Stopped before finishing.';

export interface PublishFlowInput {
  companyId: string;
  state: PublishFlowState;
  request: PublishFlowRequest & { typeId: string; title: string; description: string | null };
  signal?: AbortSignal;
  onStep?: (step: PublishStep) => void;
  onUploadProgress?: (progress: UploadProgress) => void;
}

export type PublishFlowResult =
  | { status: 'done'; intent: PublishIntent; state: PublishFlowState; document: FleetDocumentRow }
  | { status: 'failed'; step: PublishStep; state: PublishFlowState; error: unknown };

const toFlowVersion = (v: FleetDocumentVersionRow): PublishFlowVersion => ({
  id: v.id,
  versionNo: v.version_no,
  fileObjectId: v.file_object_id,
  fileName: v.file_name,
  label: v.version_label,
  kind: v.version_kind,
  effectiveDate: v.effective_date,
  changeSummary: v.change_summary,
});

/** The file object an upload produced, checked against what was asked; a refusal or a doubt throws. */
function uploadedFileId(result: UploadRecordFileResult, companyId: string, documentId: string): string {
  if (result.status === 'missing') throw new FleetDocumentRefusalError('uploads_not_set_up', UPLOADS_NOT_SET_UP);
  if (result.status === 'refused') throw new FleetDocumentRefusalError(result.code, result.message);
  const file = result.value?.file;
  const ok =
    !!file &&
    typeof file.id === 'string' &&
    file.id.length > 0 &&
    file.company_id === companyId &&
    file.vessel_id === null &&
    file.module_key === FLEET_DOCUMENT_FILE_SCOPE.moduleKey &&
    file.entity_type === FLEET_DOCUMENT_FILE_SCOPE.entityType &&
    file.entity_id === documentId &&
    !file.removed_at;
  if (!ok) throw new FleetDocumentRefusalError('upload_not_confirmed', UPLOAD_NOT_CONFIRMED);
  return file.id;
}

/** Run the steps still needed; stops at the first failure and returns what is done so far. */
export async function runPublishFlow(input: PublishFlowInput, deps: PublishFlowDeps = DEFAULT_DEPS): Promise<PublishFlowResult> {
  const { companyId, request, signal } = input;
  let state = input.state;
  const plan = planPublish(state, request);
  if (!plan.ok) {
    return { status: 'failed', step: state.documentId ? 'upload' : 'create', state, error: new FleetDocumentRefusalError('file_required', `${FILE_REQUIRED}.`) };
  }
  let document: FleetDocumentRow | null = null;
  const wanted = requestedTargets(request);

  for (const step of plan.steps) {
    if (signal?.aborted) return { status: 'failed', step, state, error: new FleetDocumentRefusalError('aborted', FLOW_STOPPED) };
    input.onStep?.(step);
    try {
      switch (step) {
        case 'create': {
          const row = await deps.createDocument(companyId, { typeId: request.typeId, title: request.title, description: request.description });
          document = row;
          state = {
            ...state,
            documentId: row.id,
            expectedUpdatedAt: row.updated_at,
            targets: { mode: row.target_mode, vesselIds: [] },
          };
          break;
        }
        case 'upload': {
          const documentId = state.documentId as string;
          const file = request.file as File;
          const result = await deps.uploadRecordFile({
            file,
            scope: { companyId, vesselId: null, moduleKey: FLEET_DOCUMENT_FILE_SCOPE.moduleKey, entityType: FLEET_DOCUMENT_FILE_SCOPE.entityType, entityId: documentId },
            onProgress: input.onUploadProgress,
            signal,
          });
          state = { ...state, uploaded: { file, fileObjectId: uploadedFileId(result, companyId, documentId) } };
          break;
        }
        case 'add_version': {
          const fileObjectId = request.file ? state.uploaded?.fileObjectId : state.draftVersion?.fileObjectId;
          if (!fileObjectId) throw new FleetDocumentRefusalError('file_required', `${FILE_REQUIRED}.`);
          const version = await deps.addVersion(companyId, {
            documentId: state.documentId as string,
            fileObjectId,
            versionLabel: request.version.label,
            versionKind: request.version.kind,
            effectiveDate: request.version.effectiveDate,
            changeSummary: request.version.changeSummary,
          });
          // One transaction writes the version and the document, so the
          // version's updated_at is the document's (see PublishFlowState).
          state = { ...state, draftVersion: toFlowVersion(version), expectedUpdatedAt: version.updated_at };
          break;
        }
        case 'set_targets': {
          const row = await deps.setTargets(companyId, { documentId: state.documentId as string, targetMode: wanted.mode, vesselIds: wanted.vesselIds });
          document = row;
          // A call that changes nothing returns the row as it is: keep the
          // updated_at the flow expects, so the publish still notices a
          // change someone else made meanwhile. A real change is the flow's own.
          const changed = !sameTargets(state.targets, wanted);
          state = { ...state, targets: wanted, expectedUpdatedAt: changed || !state.expectedUpdatedAt ? row.updated_at : state.expectedUpdatedAt };
          break;
        }
        case 'publish': {
          const versionId = state.draftVersion?.id;
          if (!versionId) throw new FleetDocumentRefusalError('version_not_found', 'There is no draft version to publish. Choose the file again.');
          const row = await deps.publishDocument(companyId, {
            documentId: state.documentId as string,
            versionId,
            expectedUpdatedAt: state.expectedUpdatedAt ?? '',
          });
          document = row;
          state = { ...state, expectedUpdatedAt: row.updated_at, draftVersion: null, uploaded: null };
          break;
        }
      }
    } catch (error) {
      return { status: 'failed', step, state, error };
    }
  }
  if (!document) return { status: 'failed', step: 'set_targets', state, error: new FleetDocumentRefusalError('not_saved', 'The change was not saved. Try again.') };
  return { status: 'done', intent: request.intent, state, document };
}

export type PublishPhase =
  | { kind: 'idle' }
  | { kind: 'running'; step: PublishStep; progress: UploadProgress | null }
  | { kind: 'failed'; step: PublishStep; code: string | null; message: string };

export interface UsePublishFleetDocument {
  state: PublishFlowState;
  phase: PublishPhase;
  /** Run the flow; resolves with the result (also when it failed). */
  run: (request: PublishFlowInput['request']) => Promise<PublishFlowResult | null>;
  /** Cancel the upload in flight; the flow stops before its next step. */
  cancel: () => void;
  /** Start again from this state (the dialog reopened). */
  reset: (next: PublishFlowState) => void;
}

export function usePublishFleetDocument(
  companyId: string | null | undefined,
  initial: PublishFlowState,
  deps: PublishFlowDeps = DEFAULT_DEPS,
): UsePublishFleetDocument {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PublishFlowState>(initial);
  const [phase, setPhase] = useState<PublishPhase>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const run = useCallback<UsePublishFleetDocument['run']>(
    async (request) => {
      if (controller.current) return null;
      if (!companyId) {
        setPhase({ kind: 'failed', step: 'create', code: 'no_company', message: 'Your account is not linked to a company.' });
        return null;
      }
      const abort = new AbortController();
      controller.current = abort;
      setPhase({ kind: 'running', step: stateRef.current.documentId ? 'set_targets' : 'create', progress: null });
      const result = await runPublishFlow(
        {
          companyId,
          state: stateRef.current,
          request,
          signal: abort.signal,
          onStep: (step) => setPhase({ kind: 'running', step, progress: null }),
          onUploadProgress: (progress) => setPhase({ kind: 'running', step: 'upload', progress }),
        },
        deps,
      );
      controller.current = null;
      stateRef.current = result.state;
      setState(result.state);
      void queryClient.invalidateQueries({ queryKey: fleetDocumentKeys.company(companyId) });
      if (result.status === 'done') setPhase({ kind: 'idle' });
      else {
        const code = result.error instanceof FleetDocumentRefusalError ? result.error.code : null;
        setPhase({ kind: 'failed', step: result.step, code, message: errorMessage(result.error, 'Something went wrong. Try again.') });
      }
      return result;
    },
    [companyId, deps, queryClient],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);

  const reset = useCallback((next: PublishFlowState) => {
    controller.current?.abort();
    controller.current = null;
    stateRef.current = next;
    setState(next);
    setPhase({ kind: 'idle' });
  }, []);

  return { state, phase, run, cancel, reset };
}
