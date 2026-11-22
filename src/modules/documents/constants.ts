import { statusMeta } from '@/shared/components/status/statusTone';
import { TONE_SURFACE } from '@/components/ui/tones';

// ISM Code sections
export const ISM_SECTIONS = [
  { value: 1, label: 'Section 1: General' },
  { value: 2, label: 'Section 2: Safety & Environmental Policy' },
  { value: 3, label: 'Section 3: Company Responsibilities & Authority' },
  { value: 4, label: 'Section 4: Designated Person(s)' },
  { value: 5, label: "Section 5: Master's Responsibility & Authority" },
  { value: 6, label: 'Section 6: Resources & Personnel' },
  { value: 7, label: 'Section 7: Shipboard Operations' },
  { value: 8, label: 'Section 8: Emergency Preparedness' },
  { value: 9, label: 'Section 9: Non-Conformities & Corrective Actions' },
  { value: 10, label: 'Section 10: Maintenance' },
  { value: 11, label: 'Section 11: Documentation' },
  { value: 12, label: 'Section 12: Company Verification & Audits' },
  { value: 13, label: 'Section 13: Certification & Verification' },
];

/**
 * Controlled-document statuses. Tone and label come from the status registry
 * (`statusTone('document', …)`, gap/10 §A.8); render them with
 * `<StatusPill domain="document" status={doc.status} />`. `color` is the same
 * tone as a tinted pill class string, for callers that still build their own
 * badge.
 */
const documentStatus = (value: string) => {
  const meta = statusMeta('document', value);
  return { value, label: meta.label, tone: meta.tone, color: TONE_SURFACE[meta.tone] };
};

export const DOCUMENT_STATUSES = [
  documentStatus('Draft'),
  documentStatus('Under_Review'),
  documentStatus('Approved'),
  documentStatus('Obsolete'),
];

export const LANGUAGES = [
  { value: 'EN', label: 'English' },
  { value: 'ES', label: 'Spanish' },
  { value: 'FR', label: 'French' },
  { value: 'DE', label: 'German' },
  { value: 'PT', label: 'Portuguese' },
  { value: 'ZH', label: 'Chinese' },
  { value: 'JA', label: 'Japanese' },
  { value: 'KO', label: 'Korean' },
  { value: 'RU', label: 'Russian' },
  { value: 'AR', label: 'Arabic' },
];

export const FILE_TYPE_ICONS: Record<string, string> = {
  'application/pdf': 'file-text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file-type',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet',
  'image/png': 'image',
  'image/jpeg': 'image',
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileExtension = (fileName: string): string => {
  return fileName.split('.').pop()?.toUpperCase() || 'FILE';
};
