/** Route paths for the Legal module (department shell at /departments/legal). */
export const LEGAL_ROOT = '/departments/legal';

export const LEGAL_PATHS = {
  root: LEGAL_ROOT,
  dashboard: `${LEGAL_ROOT}/dashboard`,
  requests: `${LEGAL_ROOT}/requests`,
  newRequest: `${LEGAL_ROOT}/requests/new`,
  request: (id: string) => `${LEGAL_ROOT}/requests/${id}`,
  documents: `${LEGAL_ROOT}/documents`,
  document: (id: string) => `${LEGAL_ROOT}/documents/${id}`,
  forms: `${LEGAL_ROOT}/forms`,
  formFill: (templateId: string) => `${LEGAL_ROOT}/forms/${templateId}/fill`,
  formSubmissions: (templateId: string) => `${LEGAL_ROOT}/forms/${templateId}/submissions`,
  /** Sitemap placeholder path the module replaced; redirected to `root`. */
  legacyPlaceholder: '/vessel/departments/management/legal',
} as const;

export type LegalTabId = 'dashboard' | 'requests' | 'documents' | 'forms';

export const LEGAL_TABS: { id: LegalTabId; label: string; path: string }[] = [
  { id: 'dashboard', label: 'Dashboard', path: LEGAL_PATHS.dashboard },
  { id: 'requests', label: 'Requests', path: LEGAL_PATHS.requests },
  { id: 'documents', label: 'Documents', path: LEGAL_PATHS.documents },
  { id: 'forms', label: 'Forms', path: LEGAL_PATHS.forms },
];

export const legalTabForPath = (pathname: string): LegalTabId => {
  if (pathname.startsWith(LEGAL_PATHS.requests)) return 'requests';
  if (pathname.startsWith(LEGAL_PATHS.documents)) return 'documents';
  if (pathname.startsWith(LEGAL_PATHS.forms)) return 'forms';
  return 'dashboard';
};
