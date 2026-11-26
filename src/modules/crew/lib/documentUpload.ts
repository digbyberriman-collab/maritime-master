/**
 * Crew document files (X1-04B; gap/04 C25; gap/08 UP1; D-X1-18): the one
 * path from a chosen file to a saved document.
 *
 * 1. The file is checked before anything is sent: at most 50 MB, a type on
 *    the UP1 list (PDF, JPG, PNG, WebP, HEIC/HEIF, GIF, Word, Excel), never
 *    empty. The sentences come from the storage helper, so the dialog, the
 *    helper and the bucket's own limit say the same thing.
 * 2. It is uploaded through PR-X1-F's uploadCrewDocumentFile(companyId,
 *    profileId, file) to `<company>/crew/<profile_id>/documents/<uuid>-<safe
 *    name>` in the private documents bucket. The database stores the path,
 *    never a URL; reads go through a signed URL (getCrewDocumentSignedUrl).
 * 3. The document row is saved with the stored path (crew_document_save).
 *
 * A failed upload never saves the row. A failed save removes the uploaded
 * object again, so no file is left behind without a document; the save's
 * own error is what the caller sees. Replacing the file of an existing
 * document keeps the earlier object: it is the record of what was held
 * (X1-05's version history reads it), and only an upload whose save failed
 * is removed.
 *
 * D-01: while the storage helper is not in the build (PR-X1-F not landed),
 * crewDocumentUploadsReady() is false and the tabs keep Add off with
 * UPLOADS_UNAVAILABLE_NOTICE.
 *
 * No React; the upload and removal functions can be passed in (tests).
 */
import * as crewStorage from '@/lib/storage/crewDocuments';
import {
  CREW_DOCUMENT_MAX_BYTES,
  CREW_DOCUMENT_MIME_TYPES,
  CREW_DOCUMENT_TYPES_TEXT,
  CrewDocumentFileError,
  crewDocumentMimeType,
  validateCrewDocumentFile,
} from '@/lib/storage/crewDocuments';

/** Add stays off with this sentence while the storage helper is missing (D-01). */
export const UPLOADS_UNAVAILABLE_NOTICE = 'Uploads become available once the storage update is applied.';

/** The limit and the types, in words, for the file field's hint. */
export const DOCUMENT_FILE_HINT = `${CREW_DOCUMENT_TYPES_TEXT}, up to ${Math.round(CREW_DOCUMENT_MAX_BYTES / (1024 * 1024))} MB.`;

/** The longest file name the server keeps (crew_document_save: file_name ≤ 255). */
export const DOCUMENT_FILE_NAME_MAX = 255;

/** The file input's `accept`: the UP1 types and their extensions (HEIC often has no type in the browser). */
export const DOCUMENT_FILE_ACCEPT = [
  ...CREW_DOCUMENT_MIME_TYPES,
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.doc', '.docx', '.xls', '.xlsx',
].join(',');

/** Whether the storage helper is in the build (PR-X1-F). */
export function crewDocumentUploadsReady(helpers: { uploadCrewDocumentFile?: unknown } = crewStorage): boolean {
  return typeof helpers.uploadCrewDocumentFile === 'function';
}

/** Why a file cannot be a crew document, as a sentence, or null when it can. */
export function documentFileProblem(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  return validateCrewDocumentFile(file)?.message ?? null;
}

/** How the file field can show a chosen file before it is uploaded. */
export type DocumentPreviewKind = 'image' | 'pdf' | 'none';

/**
 * Images the browser draws (JPG, PNG, WebP, GIF) and PDFs preview; HEIC,
 * Word and Excel show their name and size only.
 */
export function documentPreviewKind(mime: string | null | undefined): DocumentPreviewKind {
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m === 'image/jpeg' || m === 'image/png' || m === 'image/webp' || m === 'image/gif') return 'image';
  return 'none';
}

/** The stored reference of a document's file: the new path, else a legacy upload's reference (getCrewDocumentSignedUrl reads both). */
export function documentFileRef(doc: { filePath: string | null; fileUrl: string | null }): string | null {
  return doc.filePath ?? doc.fileUrl ?? null;
}

/** A stored file's type for the viewer: the recorded one, else from its name (legacy rows record none). */
export function documentFileMime(doc: { fileMime: string | null; fileName: string | null; filePath: string | null; fileUrl: string | null }): string | null {
  if (doc.fileMime) return doc.fileMime.toLowerCase();
  const name = (doc.fileName ?? documentFileRef(doc) ?? '').split('?')[0].toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  return null;
}

/** "182 KB", "3.4 MB": a file size for people. */
export function fileSizeText(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/** The file fields a saved document gets (crewDocumentSchema withDocumentFile). */
export interface StoredDocumentFile {
  path: string;
  name: string;
  size: number;
  mime: string | null;
}

/** Where saving with a file stopped before the row was asked for. */
export type DocumentUploadStage = 'check' | 'upload';

/**
 * The file was refused before the row was saved: by the check (size, type,
 * empty) or by storage. `message` is the sentence to show at the file field.
 */
export class DocumentUploadError extends Error {
  readonly stage: DocumentUploadStage;
  readonly answer: unknown;
  constructor(stage: DocumentUploadStage, message: string, answer: unknown) {
    super(message);
    this.name = 'DocumentUploadError';
    this.stage = stage;
    this.answer = answer;
  }
}

interface StorageErrorLike {
  message?: unknown;
  statusCode?: unknown;
  status?: unknown;
  error?: unknown;
}

const NOT_STORED = 'The file was not stored.';

/**
 * A storage refusal in words. The helper's own refusals (size, type, empty,
 * no person) keep their sentence; a 403 or a row-level policy says the
 * caller may not store files for this person; 413 and 415 name the limit and
 * the types; anything else asks to try again.
 */
export function documentUploadMessage(error: unknown): string {
  if (error instanceof CrewDocumentFileError) return error.message;
  if (error !== null && typeof error === 'object') {
    const e = error as StorageErrorLike;
    const status = String(e.statusCode ?? e.status ?? '');
    const text = `${typeof e.message === 'string' ? e.message : ''} ${typeof e.error === 'string' ? e.error : ''}`.toLowerCase();
    if (status === '403' || status === '401' || text.includes('row-level security') || text.includes('unauthorized')) {
      return `${NOT_STORED} You may not store documents for this person.`;
    }
    if (status === '413' || text.includes('payload too large') || text.includes('maximum allowed size')) {
      return `${NOT_STORED} Crew documents can be up to ${fileSizeText(CREW_DOCUMENT_MAX_BYTES)}.`;
    }
    if (status === '415' || text.includes('mime type')) {
      return `${NOT_STORED} Upload a ${CREW_DOCUMENT_TYPES_TEXT} file.`;
    }
  }
  return `${NOT_STORED} Check your connection and try again.`;
}

/** The display name sent with the row: the chosen file's name, trimmed to what the server keeps. */
export function documentFileName(name: string): string {
  const trimmed = name.trim() || 'document';
  return trimmed.length <= DOCUMENT_FILE_NAME_MAX ? trimmed : trimmed.slice(0, DOCUMENT_FILE_NAME_MAX);
}

export interface SaveWithFileArgs {
  companyId: string;
  profileId: string;
  /** The chosen file, or null to save the row as it is (no new file). */
  file: File | null;
  /** Saves the row (with the stored file's fields when there is one) and returns its id; throws on any refusal. */
  save: (file: StoredDocumentFile | null) => Promise<string>;
  /** Defaults to uploadCrewDocumentFile. */
  upload?: (companyId: string, profileId: string, file: File) => Promise<string>;
  /** Defaults to removeCrewDocument. */
  remove?: (path: string) => Promise<void>;
  /** Told when a failed save's file could not be removed again (the path stays in storage, unreferenced). */
  onCleanupFailed?: (path: string, error: unknown) => void;
}

export interface SaveWithFileResult {
  id: string;
  file: StoredDocumentFile | null;
}

/**
 * Checks and uploads the file (if any), then saves the row with its path.
 * A refused check or upload throws DocumentUploadError and never calls
 * `save`; a failed save removes the uploaded object and rethrows the save's
 * error unchanged (the caller reads it with crewDocumentRefusal).
 */
export async function saveDocumentWithFile(args: SaveWithFileArgs): Promise<SaveWithFileResult> {
  let stored: StoredDocumentFile | null = null;
  if (args.file) {
    const problem = validateCrewDocumentFile(args.file);
    if (problem) throw new DocumentUploadError('check', problem.message, problem);
    const upload = args.upload ?? crewStorage.uploadCrewDocumentFile;
    let path: string;
    try {
      path = await upload(args.companyId, args.profileId, args.file);
    } catch (error) {
      throw new DocumentUploadError('upload', documentUploadMessage(error), error);
    }
    if (typeof path !== 'string' || path.trim() === '') {
      throw new DocumentUploadError('upload', documentUploadMessage(null), path);
    }
    stored = { path, name: documentFileName(args.file.name), size: args.file.size, mime: crewDocumentMimeType(args.file) };
  }
  try {
    const id = await args.save(stored);
    return { id, file: stored };
  } catch (saveError) {
    if (stored) {
      const remove = args.remove ?? crewStorage.removeCrewDocument;
      try {
        await remove(stored.path);
      } catch (cleanupError) {
        args.onCleanupFailed?.(stored.path, cleanupError);
      }
    }
    throw saveError;
  }
}
