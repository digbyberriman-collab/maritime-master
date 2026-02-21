// Components
export { default as DeleteDocumentDialog } from './components/DeleteDocumentDialog';
export { default as DocumentCard } from './components/DocumentCard';
export { default as DocumentFilters } from './components/DocumentFilters';
export { default as DocumentTable } from './components/DocumentTable';
export { default as DocumentViewModal } from './components/DocumentViewModal';
export { default as DocumentViewerModal } from './components/DocumentViewerModal';
export { default as PDFViewer } from './components/PDFViewer';
export { default as UploadDocumentModal } from './components/UploadDocumentModal';

// Hooks
export {
  useDocumentCategories,
  useDocuments,
  useDocument,
  useDocumentMutations,
  useDocumentStats,
} from './hooks/useDocuments';
export type { DocumentCategory, Document, DocumentFilters as DocumentFiltersType, UploadDocumentData } from './hooks/useDocuments';

export {
  useDocumentReviews,
  useOverdueReviewCount,
  useUpcomingReviewCount,
  useMarkAsReviewed,
} from './hooks/useDocumentReviews';
export type { ReviewDocument } from './hooks/useDocumentReviews';

export {
  usePendingReviews,
  usePendingReviewCount,
  useReviewers,
  useApprovers,
  useDocumentWorkflowMutations,
  useExistingTags,
  useCheckDocumentNumber,
} from './hooks/useDocumentWorkflow';
export type { PendingReview, ReviewAction } from './hooks/useDocumentWorkflow';

// Constants
export {
  ISM_SECTIONS,
  DOCUMENT_STATUSES,
  LANGUAGES,
  FILE_TYPE_ICONS,
  formatFileSize,
  getFileExtension,
} from './constants';

// Pages
export { default as Documents } from './pages/Documents';
export { default as DocumentSearch } from './pages/DocumentSearch';
export { default as MasterDocumentIndex } from './pages/MasterDocumentIndex';
export { default as ReviewDashboard } from './pages/ReviewDashboard';
export { default as ReviewQueue } from './pages/ReviewQueue';
export { default as Manuals } from './pages/Manuals';
export { default as Policies } from './pages/Policies';
export { default as Procedures } from './pages/Procedures';
export { default as ISM_SMS } from './pages/ISM_SMS';
export { default as Drawings } from './pages/Drawings';
