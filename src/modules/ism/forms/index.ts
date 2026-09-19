// ISM Forms Module - Public API

// Components
export { default as FieldEditor } from './components/FieldEditor';
export { default as FieldRenderer } from './components/FieldRenderer';
export { default as FormProgressBar } from './components/FormProgressBar';
export { default as SignaturePad } from './components/SignaturePad';

// Hooks - useFormTemplates
export {
  useFormTemplates,
  useFormTemplate,
  useCreateFormTemplate,
  useUpdateFormTemplate,
  useDuplicateFormTemplate,
  useArchiveFormTemplate,
} from './hooks/useFormTemplates';
export type { FormTemplate } from './hooks/useFormTemplates';

// Hooks - useFormSubmissions
export {
  useFormSubmissions,
  useFormSubmission,
  useMyDraftSubmissions,
  useCreateSubmission,
  useUpdateSubmission,
  useSubmitForSignatures,
  useDeleteSubmission,
  useCreateAmendment as useCreateFormAmendment,
  usePendingSignatures as useFormPendingSignatures,
  useSignSubmission as useFormSignSubmission,
  useRejectSubmission as useFormRejectSubmission,
} from './hooks/useFormSubmissions';
export type { FormSignature } from './hooks/useFormSubmissions';

// Pages
export {
  FormTemplates,
  CreateTemplate,
  TemplateDetail,
  FormSubmission,
  SubmissionsList,
  MyDrafts,
  PendingSignatures,
} from './pages';

// Constants (primary source of truth for field types, status configs)
export * from './constants';
