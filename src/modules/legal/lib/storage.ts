/**
 * Path conventions for the private `legal-attachments` bucket. The storage
 * policies (legal_attachment_path_allowed) require
 *   <company_id>/requests/<request_id>/<file>
 *   <company_id>/submissions/<submission_id>/<file>
 */
export const LEGAL_ATTACHMENTS_BUCKET = 'legal-attachments';
export const LEGAL_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const LEGAL_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

const sanitiseExt = (fileName: string): string => {
  const ext = fileName.includes('.') ? fileName.split('.').pop() ?? '' : '';
  return ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin';
};

export const buildAttachmentPath = (args: {
  companyId: string;
  kind: 'requests' | 'submissions';
  recordId: string;
  fileName: string;
  now?: number;
  random?: string;
}): string =>
  `${args.companyId}/${args.kind}/${args.recordId}/${args.now ?? Date.now()}-${args.random ?? Math.random().toString(36).slice(2, 8)}.${sanitiseExt(args.fileName)}`;

export const errorMessage = (error: unknown, fallback = 'Unexpected error'): string => {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message || fallback;
  }
  if (typeof error === 'string') return error;
  return fallback;
};
