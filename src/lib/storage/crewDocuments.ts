import { supabase } from '@/integrations/supabase/client';

/**
 * Crew document storage helpers.
 *
 * All crew HR documents live in the private `documents` bucket under a
 * company-scoped prefix, because every RLS policy on that bucket requires
 * `(storage.foldername(name))[1] = <company_id>`:
 *
 *   <company_id>/crew/<crew_user_id>/<kind>/<timestamp>.<ext>
 *
 * The database stores the object *path* (not a URL). Reads go through a
 * short-lived signed URL, since the bucket is not public.
 */

export const CREW_DOCUMENTS_BUCKET = 'documents';
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type CrewDocumentKind =
  | 'certificates'
  | 'attachments'
  | 'contracts'
  | 'next-of-kin'
  | 'evaluations'
  | 'disciplinary'
  | 'payslips'
  | 'right-to-work'
  | 'recruitment'
  | 'onboarding';

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
