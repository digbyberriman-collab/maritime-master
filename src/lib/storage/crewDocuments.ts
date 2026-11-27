import { supabase } from '@/integrations/supabase/client';

/**
 * Crew document storage helpers.
 *
 * All crew HR documents live in the private `documents` bucket under a
 * company-scoped prefix, because every RLS policy on that bucket requires
 * the first folder to be the caller's company:
 *
 *   <company_id>/crew/<crew_user_id>/<kind>/<timestamp>.<ext>   (HR files, `uploadCrewDocument`)
 *   <company_id>/crew/<profile_id>/documents/<uuid>-<name>      (crew documents, `uploadCrewDocumentFile`)
 *
 * Every object under `<company_id>/crew/` goes through one action-aware gate,
 * storage_crew_document_allowed(name, action) in
 * supabase/migrations/20261124000100_platform_storage_crew_documents.sql
 * (D-373): `documents`, `certificates` and `attachments` follow X1's
 * crew-document predicates; contracts, payslips, disciplinary, evaluations,
 * right-to-work, next-of-kin, onboarding and recruitment follow the HR rights
 * (payslips also payroll, evaluations also the reviewer); any other kind, a
 * malformed name or an unknown subject is refused. Segment 3 must be a
 * lower-case uuid (a login id or a profile id) and the file name a safe name.
 * No `CrewDocumentKind` is `documents`, so the two writers never share a
 * folder.
 *
 * The database stores the object *path* (not a URL). Reads go through a
 * short-lived signed URL, since the bucket is not public.
 */

export const CREW_DOCUMENTS_BUCKET = 'documents';
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** The HR file kinds of `uploadCrewDocument` (the fourth path segment); never `documents`. */
export const CREW_DOCUMENT_KINDS = [
  'certificates',
  'attachments',
  'contracts',
  'next-of-kin',
  'evaluations',
  'disciplinary',
  'payslips',
  'right-to-work',
  'recruitment',
  'onboarding',
] as const;

export type CrewDocumentKind = (typeof CREW_DOCUMENT_KINDS)[number];

export interface UploadCrewDocumentArgs {
  file: File;
  companyId: string;
  crewUserId: string;
  kind: CrewDocumentKind;
}

export interface UploadedCrewDocument {
  /** Storage object path, to be persisted in the database. */
  path: string;
  name: string;
  size: number;
  mimeType: string;
}

const sanitiseExt = (fileName: string): string => {
  const ext = fileName.includes('.') ? fileName.split('.').pop() ?? '' : '';
  return ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin';
};

export const buildCrewDocumentPath = (args: Omit<UploadCrewDocumentArgs, 'file'> & { fileName: string }): string =>
  `${args.companyId}/crew/${args.crewUserId}/${args.kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${sanitiseExt(args.fileName)}`;

export const uploadCrewDocument = async (args: UploadCrewDocumentArgs): Promise<UploadedCrewDocument> => {
  if (!args.companyId) throw new Error('Cannot upload a crew document without a company');
  if (!args.crewUserId) throw new Error('Cannot upload a crew document without a crew member');

  const path = buildCrewDocumentPath({ ...args, fileName: args.file.name });
  const { error } = await supabase.storage
    .from(CREW_DOCUMENTS_BUCKET)
    .upload(path, args.file, { contentType: args.file.type || undefined, upsert: false });
  if (error) throw error;

  return { path, name: args.file.name, size: args.file.size, mimeType: args.file.type };
};

/**
 * Accepts either a stored object path (new convention) or a legacy public
 * URL (old convention: `.../storage/v1/object/public/documents/<path>`), and
 * returns the object path if it can be determined.
 */
export const resolveCrewDocumentPath = (stored: string | null | undefined): string | null => {
  if (!stored) return null;
  if (!/^https?:\/\//i.test(stored)) return stored;
  const marker = `/object/public/${CREW_DOCUMENTS_BUCKET}/`;
  const idx = stored.indexOf(marker);
  if (idx === -1) {
    const signedMarker = `/object/sign/${CREW_DOCUMENTS_BUCKET}/`;
    const sIdx = stored.indexOf(signedMarker);
    if (sIdx === -1) return null;
    return decodeURIComponent(stored.slice(sIdx + signedMarker.length).split('?')[0]);
  }
  return decodeURIComponent(stored.slice(idx + marker.length).split('?')[0]);
};

export const getCrewDocumentSignedUrl = async (
  stored: string | null | undefined,
  options: { download?: string | boolean } = {},
): Promise<string | null> => {
  const path = resolveCrewDocumentPath(stored);
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(CREW_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, options.download ? { download: options.download } : undefined);
  if (error) throw error;
  return data.signedUrl;
};

export const removeCrewDocument = async (stored: string | null | undefined): Promise<void> => {
  const path = resolveCrewDocumentPath(stored);
  if (!path) return;
  const { error } = await supabase.storage.from(CREW_DOCUMENTS_BUCKET).remove([path]);
  if (error) throw error;
};

// ─── Crew documents (X1; PR-X1-F; gap/08 UP1; D-X1-18) ────────────────────
//
// Passports, visas, certificates, medicals and the other crew documents
// live under a prefix keyed on the person's profile (most crew have no
// login), which the documents-bucket policies close to everyone but the
// people X1's predicates allow (supabase/migrations/
// 20261124000100_platform_storage_crew_documents.sql):
//
//   <company_id>/crew/<profile_id>/documents/<uuid>-<safe name>
//
// Until that file and X1's predicates are applied, the prefix accepts no
// upload at all (the storage API answers 403), and the caller shows that
// as a real error, never as a saved document.

/** The documents bucket's limit for crew documents (gap/08 UP1; C25). */
export const CREW_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

/** The UP1 MIME allow-list (= supabase/tests/fixtures/upload-policy.json, the documents bucket's list). */
export const CREW_DOCUMENT_MIME_TYPES = [
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
] as const;

export type CrewDocumentMimeType = (typeof CREW_DOCUMENT_MIME_TYPES)[number];

/** The type of a file whose browser reports none (HEIC on some systems), by extension. */
const MIME_BY_EXTENSION: Readonly<Record<string, CrewDocumentMimeType>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** The file kinds as people know them, for the rejection sentence. */
export const CREW_DOCUMENT_TYPES_TEXT = 'PDF, JPG, PNG, WebP, HEIC, GIF, Word or Excel';

/** The prefix segment that marks a crew document (never a legacy CrewDocumentKind). */
export const CREW_DOCUMENTS_SEGMENT = 'documents';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export type CrewDocumentFileErrorCode = 'missing_company' | 'missing_profile' | 'file_empty' | 'file_too_large' | 'file_type_not_allowed';

/** A file or target STORM refuses before uploading; `message` is the sentence to show. */
export class CrewDocumentFileError extends Error {
  readonly code: CrewDocumentFileErrorCode;
  constructor(code: CrewDocumentFileErrorCode, message: string) {
    super(message);
    this.name = 'CrewDocumentFileError';
    this.code = code;
  }
}

const sizeText = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** The allowed type of a file (its own, or by extension when the browser gives none), or null. */
export function crewDocumentMimeType(file: Pick<File, 'name' | 'type'>): CrewDocumentMimeType | null {
  const own = (file.type ?? '').trim().toLowerCase();
  if (own) return (CREW_DOCUMENT_MIME_TYPES as readonly string[]).includes(own) ? (own as CrewDocumentMimeType) : null;
  const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '';
  return MIME_BY_EXTENSION[ext] ?? null;
}

/** Why a file cannot be a crew document, or null when it can. */
export function validateCrewDocumentFile(file: Pick<File, 'name' | 'type' | 'size'>): CrewDocumentFileError | null {
  if (!file.size) return new CrewDocumentFileError('file_empty', `"${file.name}" is empty. Choose the file again.`);
  if (file.size > CREW_DOCUMENT_MAX_BYTES) {
    return new CrewDocumentFileError(
      'file_too_large',
      `"${file.name}" is ${sizeText(file.size)}. Crew documents can be up to ${sizeText(CREW_DOCUMENT_MAX_BYTES)}.`,
    );
  }
  if (!crewDocumentMimeType(file)) {
    return new CrewDocumentFileError('file_type_not_allowed', `"${file.name}" is not a file type STORM accepts. Upload a ${CREW_DOCUMENT_TYPES_TEXT} file.`);
  }
  return null;
}

/** A name the storage rule accepts: letters, digits, `.`, `_`, `-`; no leading dot, no `..`; the extension kept. */
export function safeCrewDocumentName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 10) : '';
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[._-]+$/, '');
  const room = 200 - (ext ? ext.length + 1 : 0);
  const name = `${(stem || 'document').slice(0, room)}${ext ? `.${ext}` : ''}`;
  return SAFE_NAME.test(name) ? name : 'document';
}

/** `<company_id>/crew/<profile_id>/documents/<uuid>-<safe name>`; ids lower-case canonical uuids. */
export function buildCrewDocumentFilePath(companyId: string, profileId: string, fileName: string, id: string = crypto.randomUUID()): string {
  const company = companyId.trim().toLowerCase();
  const profile = profileId.trim().toLowerCase();
  if (!UUID.test(company)) throw new CrewDocumentFileError('missing_company', 'Cannot upload a crew document without a company.');
  if (!UUID.test(profile)) throw new CrewDocumentFileError('missing_profile', 'Cannot upload a crew document without the crew member it belongs to.');
  return `${company}/crew/${profile}/${CREW_DOCUMENTS_SEGMENT}/${id.toLowerCase()}-${safeCrewDocumentName(fileName)}`;
}

/**
 * Uploads one crew document file and returns its stored path (never a
 * URL); the caller saves the path on its row, and reads go through
 * `getCrewDocumentSignedUrl`. Refuses an empty file, a file over 50 MB and
 * a type outside the UP1 list with a `CrewDocumentFileError` whose message
 * is the sentence to show. A storage error (no access, the prefix not open
 * yet, a network failure) is thrown as it is, for `notify()`. Never
 * overwrites (`upsert: false`); `removeCrewDocument(path)` cleans up when
 * the row that would hold the path fails to save.
 */
export async function uploadCrewDocumentFile(companyId: string, profileId: string, file: File): Promise<string> {
  const path = buildCrewDocumentFilePath(companyId, profileId, file.name);
  const problem = validateCrewDocumentFile(file);
  if (problem) throw problem;
  const { error } = await supabase.storage
    .from(CREW_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: crewDocumentMimeType(file) ?? undefined, upsert: false });
  if (error) throw error;
  return path;
}

/** Triggers a browser download of a stored crew document via a signed URL. */
export const downloadCrewDocument = async (stored: string | null | undefined, fileName: string): Promise<void> => {
  const url = await getCrewDocumentSignedUrl(stored, { download: fileName });
  if (!url) throw new Error('Document has no storage path');
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
