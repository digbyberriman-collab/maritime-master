/**
 * Uploads and attachments (gap/08 §I, UP1–UP3; DECISIONS C7; Phase 2 spec
 * §A.13). Files go to the private `records` bucket at
 * `<company>/<vessel|fleet>/<module>/<entity_type>/<entity_id>/<uuid>-<name>`;
 * `register_file_object` records the stored object and `attach_record_file`
 * links it to a record. The limits equal
 * `supabase/tests/fixtures/upload-policy.json` (a test pins them).
 *
 * `uploadRecordFile` sends the bytes with an XHR (the only browser API that
 * reports real upload progress), so the progress callback only ever reports
 * bytes the browser has actually sent; there is no simulated progress. Every
 * failure comes back as `refused` with the storage or SQL code (or
 * `missing` when the bucket or the RPCs are not live yet, D-01); nothing
 * says "uploaded" unless the object is stored, registered and attached.
 */
import { recordsDb } from './client';
import { isMissingRelation } from '@/integrations/supabase/missingRelation';
import { missingOrThrow, refusedOrThrow, type ServiceResult } from './results';
import type { FileObjectRow, RecordAttachmentRow } from './db.pending';

export const RECORD_FILES_BUCKET = 'records';
export const MAX_RECORD_FILE_BYTES = 52_428_800;
export const ACCEPTED_RECORD_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export type FileRejection = 'too_large' | 'empty' | 'type_not_allowed';

export function validateRecordFile(file: Pick<File, 'size' | 'type'>): FileRejection | null {
  if (file.size <= 0) return 'empty';
  if (file.size > MAX_RECORD_FILE_BYTES) return 'too_large';
  if (!ACCEPTED_RECORD_MIME_TYPES.includes(file.type)) return 'type_not_allowed';
  return null;
}

/**
 * A storage-safe file name matching upload-policy.json `safeNamePattern`
 * (`^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$`): accents dropped, other characters
 * become `-`, never a leading `.`, `_` or `-`, at most 200 characters.
 */
export function safeFileName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+/, '');
  return (base || 'file').slice(0, 200);
}

export interface RecordFileScope {
  companyId: string;
  /** null = a fleet-level record (`fleet` segment). */
  vesselId: string | null;
  moduleKey: string;
  entityType: string;
  entityId: string;
}

export function buildRecordFilePath(scope: RecordFileScope, fileId: string, name: string): string {
  return [scope.companyId, scope.vesselId ?? 'fleet', scope.moduleKey, scope.entityType, scope.entityId, `${fileId}-${safeFileName(name)}`].join('/');
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadRecordFileRequest {
  file: File;
  scope: RecordFileScope;
  envelopeId?: string;
  sectionKey?: string;
  caption?: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

export type UploadRecordFileResult =
  | { status: 'ok'; value: { file: FileObjectRow; attachment: RecordAttachmentRow | null } }
  | { status: 'missing' }
  | { status: 'refused'; code: FileRejection | string; message: string };

/** STORM copy for each refusal the upload can end in. */
export const UPLOAD_REFUSAL_MESSAGES: Readonly<Record<string, string>> = {
  empty: 'This file is empty.',
  too_large: 'This file is larger than 50 MB.',
  type_not_allowed: 'This file type cannot be attached. Use a PDF, an image or an Office document.',
  aborted: 'The upload was cancelled.',
  not_signed_in: 'Sign in again to attach files.',
  not_configured: 'File uploads are not set up in this app.',
  network_error: 'The file could not be uploaded. Check the connection and try again.',
  storage_forbidden: 'You cannot add files to this record.',
  storage_conflict: 'A file with this name is already stored. Try again.',
  storage_too_large: 'This file is larger than 50 MB.',
  storage_type_not_allowed: 'This file type cannot be attached. Use a PDF, an image or an Office document.',
  storage_error: 'The file could not be uploaded. Try again.',
  register_failed: 'The file was uploaded but could not be recorded. Try again.',
  attach_failed: 'The file was uploaded but could not be attached to the record. Try again.',
};

const refused = (code: string, message = UPLOAD_REFUSAL_MESSAGES[code] ?? UPLOAD_REFUSAL_MESSAGES.storage_error) =>
  ({ status: 'refused', code, message }) as const;

/** The storage object endpoint for a path in the records bucket, or null when the app has no Supabase URL. */
export function recordFileUploadUrl(path: string): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (typeof base !== 'string' || !base.trim()) return null;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${base.replace(/\/+$/, '')}/storage/v1/object/${RECORD_FILES_BUCKET}/${encoded}`;
}

/** Fresh uuid for the file segment (`<uuid>-<safe name>`), so two uploads never share a path. */
const newFileId = (): string => crypto.randomUUID();

export type StorageAnswer =
  | { kind: 'stored' }
  | { kind: 'bucket_missing' }
  | { kind: 'refused'; code: string }
  | { kind: 'network_error' }
  | { kind: 'aborted' };

/**
 * The Storage API answers `{ statusCode, error, message }`. A missing bucket
 * means the records migration is not live (D-01); every other answer maps
 * to a stable code, never to the provider's text.
 */
export function classifyStorageAnswer(status: number, body: unknown): StorageAnswer {
  const b = (body && typeof body === 'object' ? body : {}) as { statusCode?: unknown; error?: unknown; message?: unknown };
  const text = `${typeof b.error === 'string' ? b.error : ''} ${typeof b.message === 'string' ? b.message : ''}`;
  const code = Number(typeof b.statusCode === 'string' || typeof b.statusCode === 'number' ? b.statusCode : status) || status;
  if (/bucket not found/i.test(text)) return { kind: 'bucket_missing' };
  if (code === 401 || code === 403) return { kind: 'refused', code: 'storage_forbidden' };
  if (code === 409) return { kind: 'refused', code: 'storage_conflict' };
  if (code === 413) return { kind: 'refused', code: 'storage_too_large' };
  if (code === 415 || /mime type|invalid_mime/i.test(text)) return { kind: 'refused', code: 'storage_type_not_allowed' };
  return { kind: 'refused', code: 'storage_error' };
}

function sendToStorage(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: ((progress: UploadProgress) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<StorageAnswer> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const done = (answer: StorageAnswer) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve(answer);
    };
    const onAbort = () => {
      xhr.abort();
      done({ kind: 'aborted' });
    };
    xhr.open('POST', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    // Real progress only: the bytes the browser has sent, as it reports them.
    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (onProgress && event.lengthComputable) onProgress({ loaded: event.loaded, total: event.total });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return done({ kind: 'stored' });
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      done(classifyStorageAnswer(xhr.status, body));
    };
    xhr.onerror = () => done({ kind: 'network_error' });
    xhr.onabort = () => done({ kind: 'aborted' });
    xhr.ontimeout = () => done({ kind: 'network_error' });
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(file);
  });
}

/** An RPC error after the bytes are stored: not live → `missing`; anything else → `refused` with its SQL code. */
function rpcRefusal(error: { code?: string; message?: string }, fallback: 'register_failed' | 'attach_failed'): UploadRecordFileResult {
  if (isMissingRelation(error)) return { status: 'missing' };
  const code = typeof error.code === 'string' && error.code ? error.code : fallback;
  // A business rule (22023) carries its stable code as the message (e.g. record_closed).
  const message = typeof error.message === 'string' && /^[a-z][a-z0-9_]{0,62}$/.test(error.message.trim()) ? error.message.trim() : null;
  return refused(message ?? code, UPLOAD_REFUSAL_MESSAGES[fallback]);
}

/**
 * Upload one file to the record's folder, then register and attach it
 * (Phase 2 spec §B.6): validate → a fresh uuid and the C7 path → XHR `POST`
 * to `{VITE_SUPABASE_URL}/storage/v1/object/records/<path>` with the
 * session's bearer token and the publishable key (`x-upsert: false`, so an
 * existing object is never overwritten) → `register_file_object` →
 * `attach_record_file`.
 *
 * `onProgress` reports the bytes actually sent; `signal` cancels the
 * transfer (once the bytes are stored the registration runs to the end, so
 * a stored object is always recorded). A refused registration or attachment
 * leaves the stored object for the storage purge job (no delete policy for
 * browsers: files are removed softly).
 */
export async function uploadRecordFile(request: UploadRecordFileRequest): Promise<UploadRecordFileResult> {
  const { file, scope, signal } = request;
  const rejection = validateRecordFile(file);
  if (rejection) return refused(rejection);
  if (signal?.aborted) return refused('aborted');

  const path = buildRecordFilePath(scope, newFileId(), file.name);
  const url = recordFileUploadUrl(path);
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || typeof apiKey !== 'string' || !apiKey) return refused('not_configured');

  const { data: sessionData, error: sessionError } = await recordsDb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionError || !token) return refused('not_signed_in');

  const stored = await sendToStorage(
    url,
    file,
    { Authorization: `Bearer ${token}`, apikey: apiKey, 'Content-Type': file.type, 'x-upsert': 'false' },
    request.onProgress,
    signal,
  );
  if (stored.kind === 'bucket_missing') return { status: 'missing' };
  if (stored.kind === 'aborted') return refused('aborted');
  if (stored.kind === 'network_error') return refused('network_error');
  if (stored.kind === 'refused') return refused(stored.code);

  const registered = await recordsDb.rpc('register_file_object', {
    p_bucket: RECORD_FILES_BUCKET,
    p_path: path,
    p_original_name: file.name.slice(0, 255) || 'file',
    p_mime_type: file.type,
    p_size_bytes: file.size,
  });
  if (registered.error) return rpcRefusal(registered.error, 'register_failed');
  if (!registered.data) return refused('register_failed');

  const attached = await recordsDb.rpc('attach_record_file', {
    p_file_id: registered.data.id,
    p_envelope_id: request.envelopeId,
    p_section_key: request.sectionKey,
    p_caption: request.caption,
  });
  if (attached.error) return rpcRefusal(attached.error, 'attach_failed');
  return { status: 'ok', value: { file: registered.data, attachment: attached.data ?? null } };
}

/** Soft-remove an attachment (uploader before submit; a company actor with a reason after). */
export async function removeRecordAttachment(attachmentId: string, reason?: string): Promise<ServiceResult<RecordAttachmentRow>> {
  const { data, error } = await recordsDb.rpc('remove_record_attachment', { p_attachment_id: attachmentId, p_reason: reason });
  if (error) return refusedOrThrow(error);
  return { status: 'ok', value: data };
}

export async function fetchAttachments(envelopeId: string): Promise<ServiceResult<RecordAttachmentRow[]>> {
  const { data, error } = await recordsDb
    .from('record_attachments')
    .select('*')
    .eq('envelope_id', envelopeId)
    .is('removed_at', null)
    .order('sort_order');
  if (error) return missingOrThrow(error);
  return { status: 'ok', value: data ?? [] };
}
