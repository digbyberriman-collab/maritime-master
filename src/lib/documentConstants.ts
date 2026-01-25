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

export const DOCUMENT_STATUSES = [
  { value: 'Draft', label: 'Draft', color: 'bg-muted text-muted-foreground' },
  { value: 'Under_Review', label: 'Under Review', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { value: 'Approved', label: 'Approved', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: 'Obsolete', label: 'Obsolete', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
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
