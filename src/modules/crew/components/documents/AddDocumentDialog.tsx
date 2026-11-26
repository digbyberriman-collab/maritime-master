import React from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Info, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { notify } from '@/shared/lib/notify';
import { todayDateOnly } from '@/shared/lib/form';
import type { CrewDocumentTab } from '@/modules/crew/types/db.pending';
import type { DocumentCatalogue, DocumentType } from '@/modules/crew/hooks/useDocumentTypes';
import {
  CrewDocumentWriteError,
  useIssuingSuggestions,
  useSaveCrewDocument,
  type CrewDocumentView,
} from '@/modules/crew/hooks/useCrewDocuments';
import {
  DOCUMENT_FIELD_LABEL,
  buildCrewDocumentSchema,
  crewDocumentRefusal,
  documentFormDefaults,
  documentFormFields,
  emptyDocumentValues,
  toDocumentPayload,
  withDocumentFile,
  type CrewDocumentFormValues,
  type DocumentForForm,
  type DocumentTypeForForm,
} from '@/modules/crew/lib/crewDocumentSchema';
import { CREW_DOCUMENT_TAB_LABEL } from '@/modules/crew/lib/documentTabs';
import { DocumentUploadError, UPLOADS_UNAVAILABLE_NOTICE, saveDocumentWithFile } from '@/modules/crew/lib/documentUpload';
import { DocumentTypePicker } from './DocumentTypePicker';
import { DocumentFields } from './DocumentFields';
import { DocumentFileField } from './DocumentFileField';

export type AddDocumentDialogMode =
  | { kind: 'add'; tab: CrewDocumentTab; categoryKey?: string | null }
  | { kind: 'edit'; document: CrewDocumentView };

export interface AddDocumentDialogProps {
  mode: AddDocumentDialogMode;
  profileId: string;
  companyId: string;
  /** Whose document it is, for the dialog's description. */
  personName?: string | null;
  catalogue: DocumentCatalogue;
  /** The person's documents (the Added tiles and the one-passport rule). */
  documents: readonly CrewDocumentView[];
  /** The storage helper is in the build (PR-X1-F); without it no file can be attached. */
  uploadsReady: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: string) => void;
}

/** What the form needs of a catalogue type. */
function formTypeOf(type: DocumentType): DocumentTypeForForm {
  return { name: type.name, expiry_item_type: type.itemType, field_schema: type.fieldSchema, default_validity_months: type.defaultValidityMonths };
}

/** A stored document's fields as the form edits them. */
function documentForForm(doc: CrewDocumentView): DocumentForForm {
  return {
    number: doc.number,
    issue_date: doc.issueDate,
    expiry_date: doc.expiryDate,
    no_expiry: doc.noExpiry,
    issuing_country_code: doc.issuingCountryCode,
    issuing_office: doc.issuingOffice,
    endorsement_due_date: doc.endorsementDueDate,
    use_in_crew_report: doc.useInCrewReport,
    details: doc.details,
    notes: doc.notes,
  };
}

/** Changing these sends a verified document back to unverified (crew_certificates_guard). */
export const REVERIFY_NOTE = 'Changing the number, dates, issuing country, type or file sends this document back for verification.';

const FORM_FIELDS = new Set<string>(Object.keys(DOCUMENT_FIELD_LABEL));

/**
 * Add a crew document in two steps, or edit one (gap/04 C25, C26; X1-04B).
 *
 * 1. Choose the type (DocumentTypePicker): search by name, code or
 *    abbreviation, or browse a tab's categories; types the person holds are
 *    marked Added.
 * 2. The type's fields (DocumentFields, React Hook Form + the zod schema
 *    built from its field_schema) and the file (DocumentFileField, checked at
 *    once, previewed for images and PDFs).
 *
 * Save uploads the file first (lib/documentUpload.ts: a refused upload saves
 * nothing) and then calls crew_document_save, which must answer with the
 * row; a refused save removes the uploaded file again. A refusal lands on the
 * field it names (22023 HINT), the file, or a toast (crewDocumentRefusal,
 * 42501 DETAIL as is). An edit sends only the changed fields and keeps the
 * stored file unless another is chosen. The dialog stays open while saving.
 */
export const AddDocumentDialog: React.FC<AddDocumentDialogProps> = ({
  mode,
  profileId,
  companyId,
  personName,
  catalogue,
  documents,
  uploadsReady,
  onOpenChange,
  onSaved,
}) => {
  const editing = mode.kind === 'edit' ? mode.document : null;
  const editingType = editing?.typeId ? catalogue.byId.get(editing.typeId) ?? null : null;
  const [picked, setPicked] = React.useState<DocumentType | null>(null);
  const type = editing ? editingType : picked;
  const step: 'pick' | 'details' = type ? 'details' : 'pick';
  const [saving, setSaving] = React.useState(false);

  const held = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const d of documents) if (d.typeId) m.set(d.typeId, (m.get(d.typeId) ?? 0) + 1);
    return m;
  }, [documents]);

  const close = (open: boolean) => {
    if (!open && saving) return;
    onOpenChange(open);
  };

  const title = editing ? `Edit ${editing.name}` : type ? `Add ${type.name}` : 'Add a document';
  const whose = personName ? ` for ${personName}` : '';

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent
        className="flex max-h-[min(92dvh,52rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        data-add-document-dialog=""
        data-step={step}
        onInteractOutside={(e) => {
          if (saving) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-4 pr-12 text-left sm:px-6">
          {!editing ? <p className="type-eyebrow text-muted-foreground">Step {step === 'pick' ? 1 : 2} of 2</p> : null}
          <DialogTitle className="type-title break-words">{title}</DialogTitle>
          <DialogDescription>
            {step === 'pick'
              ? `Choose the document type${whose}. Its tab follows the type, wherever you started.`
              : editing
                ? `Change the details${whose}. Only what you change is saved.`
                : `Enter the details${whose} as they read on the document, and attach the file.`}
          </DialogDescription>
        </DialogHeader>
        {editing && !editingType ? (
          <div className="px-4 py-6 sm:px-6">
            <p className="type-body text-muted-foreground">This document's type is not in the catalogue you can see, so it cannot be changed here.</p>
          </div>
        ) : step === 'pick' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <DocumentTypePicker
              catalogue={catalogue}
              tab={mode.kind === 'add' ? mode.tab : 'documents'}
              initialCategory={mode.kind === 'add' ? mode.categoryKey ?? null : null}
              held={held}
              onPick={setPicked}
            />
          </div>
        ) : type ? (
          <DocumentForm
            key={`${type.id}:${editing?.id ?? 'new'}`}
            type={type}
            editing={editing}
            profileId={profileId}
            companyId={companyId}
            documents={documents}
            uploadsReady={uploadsReady}
            catalogue={catalogue}
            onBack={editing ? null : () => setPicked(null)}
            onCancel={() => close(false)}
            onSavingChange={setSaving}
            onSaved={(id) => {
              onSaved?.(id);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

interface DocumentFormProps {
  type: DocumentType;
  editing: CrewDocumentView | null;
  profileId: string;
  companyId: string;
  documents: readonly CrewDocumentView[];
  uploadsReady: boolean;
  catalogue: DocumentCatalogue;
  onBack: (() => void) | null;
  onCancel: () => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: (id: string) => void;
}

const DocumentForm: React.FC<DocumentFormProps> = ({
  type,
  editing,
  profileId,
  companyId,
  documents,
  uploadsReady,
  catalogue,
  onBack,
  onCancel,
  onSavingChange,
  onSaved,
}) => {
  const formType = React.useMemo(() => formTypeOf(type), [type]);
  const today = React.useMemo(() => todayDateOnly(), []);
  const schema = React.useMemo(() => buildCrewDocumentSchema(formType, { today }), [formType, today]);
  const original = React.useMemo(() => (editing ? documentFormDefaults(documentForForm(editing)) : null), [editing]);
  const form = useForm<CrewDocumentFormValues>({ resolver: zodResolver(schema), defaultValues: original ?? emptyDocumentValues() });
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const save = useSaveCrewDocument(companyId);
  const hasOffice = React.useMemo(() => documentFormFields(formType).some((f) => f.field === 'issuing_office'), [formType]);
  const suggestions = useIssuingSuggestions(type.id, { companyId, enabled: hasOffice });
  const reportElsewhere = React.useMemo(() => {
    const other = documents.find((d) => d.useInCrewReport && d.id !== editing?.id);
    return other ? { name: other.name, number: other.number } : null;
  }, [documents, editing]);
  const category = catalogue.categories.find((c) => c.key === type.categoryKey);

  const setBusy = (busy: boolean) => {
    setSaving(busy);
    onSavingChange(busy);
  };

  const submit = form.handleSubmit(async (values) => {
    setFileError(null);
    const payload = toDocumentPayload(values, formType, original);
    if (editing && Object.keys(payload).length === 0 && !file) {
      notify.info('Nothing changed');
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const result = await saveDocumentWithFile({
        companyId,
        profileId,
        file,
        save: (stored) =>
          save.mutateAsync({
            id: editing?.id ?? null,
            profileId,
            documentTypeId: editing ? null : type.id,
            payload: stored ? withDocumentFile(payload, stored) : payload,
          }),
      });
      setBusy(false);
      notify.success(editing ? `${type.name} saved` : `${type.name} added`);
      onSaved(result.id);
    } catch (error) {
      setBusy(false);
      if (error instanceof DocumentUploadError) {
        setFileError(error.message);
        return;
      }
      if (error instanceof CrewDocumentWriteError) {
        notify.error(error.message, { title: 'The document was not saved' });
        return;
      }
      const refusal = crewDocumentRefusal(error);
      if (refusal.field === 'file') setFileError(refusal.message);
      else if (refusal.field && FORM_FIELDS.has(refusal.field)) {
        form.setError(refusal.field as FieldPath<CrewDocumentFormValues>, { message: refusal.message }, { shouldFocus: true });
      } else notify.error(refusal.message, { title: 'The document was not saved' });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col" aria-label={editing ? `Edit ${type.name}` : `Add ${type.name}`}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <p className="type-caption text-muted-foreground" data-document-type-summary="">
            <span className="font-medium text-foreground">{type.name}</span>
            {category ? ` · ${category.label}` : ''} · shown on the {CREW_DOCUMENT_TAB_LABEL[type.tab]} tab
            {type.stcwReference ? ` · ${type.stcwReference}` : ''}
          </p>
          {editing && editing.verificationStatus !== 'unverified' ? (
            <Alert variant="info">
              <Info aria-hidden="true" className="size-4" />
              <AlertDescription>{REVERIFY_NOTE}</AlertDescription>
            </Alert>
          ) : null}
          <fieldset disabled={saving} className="min-w-0 border-0 p-0">
            <legend className="sr-only">Document details</legend>
            <div className="space-y-5">
              <DocumentFields
                form={form}
                type={formType}
                suggestions={suggestions.suggestions}
                reportPassportElsewhere={reportElsewhere}
                today={today}
                disabled={saving}
              />
              <DocumentFileField
                file={file}
                onChange={setFile}
                existing={editing?.hasFile ? { name: editing.fileName, size: editing.fileSize } : null}
                error={fileError}
                onError={setFileError}
                disabledReason={uploadsReady ? null : UPLOADS_UNAVAILABLE_NOTICE}
                disabled={saving}
              />
            </div>
          </fieldset>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={saving}
              aria-label="Back to the document types"
              className="mr-auto [@media(pointer:coarse)]:h-11"
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="[@media(pointer:coarse)]:h-11">
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="[@media(pointer:coarse)]:h-11">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {saving ? (file ? 'Uploading and saving…' : 'Saving…') : editing ? 'Save changes' : 'Save document'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default AddDocumentDialog;
