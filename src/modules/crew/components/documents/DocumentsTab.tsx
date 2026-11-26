import React, { Suspense } from 'react';
import { FileText, Info, Plus, RotateCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AccessDenied, EmptyState, PageError } from '@/shared/components/states';
import { useCountries } from '@/modules/crew/hooks/useReferenceData';
import {
  useCrewDocumentRights,
  useCrewDocuments,
  type CrewDocumentRightsState,
  type CrewDocumentView,
  type CrewDocumentsState,
} from '@/modules/crew/hooks/useCrewDocuments';
import { useDocumentTypes, type DocumentCatalogue, type DocumentTypesState } from '@/modules/crew/hooks/useDocumentTypes';
import type { CrewDocumentTab } from '@/modules/crew/types/db.pending';
import type { ProfileTabProps } from '@/modules/crew/lib/profileTabs';
import { countDocumentLegend } from '@/modules/crew/lib/documentState';
import { SYSTEM_CATEGORY_TAB } from '@/modules/crew/lib/documentTabs';
import { CATALOGUE_MISSING_NOTICE } from '@/modules/crew/lib/crewDocumentSchema';
import { UPLOADS_UNAVAILABLE_NOTICE, crewDocumentUploadsReady } from '@/modules/crew/lib/documentUpload';
import type { AddDocumentDialogMode } from './AddDocumentDialog';
import { DocumentLegend } from './DocumentLegend';
import { DocumentRow } from './DocumentRow';

const AddDocumentDialog = React.lazy(() => import('./AddDocumentDialog'));
const DocumentViewer = React.lazy(() => import('./DocumentViewer'));

/** Each tab's heading and the line under it. */
const DOCUMENT_TAB_COPY: Readonly<Record<CrewDocumentTab, { title: string; body: string }>> = {
  documents: { title: 'Documents', body: 'Passports, visas, seafarer identity, medical fitness and other personal documents.' },
  stcw: { title: 'STCW', body: 'STCW basic and advanced training, security, medical and passenger-ship certificates.' },
  qualifications: { title: 'Qualifications', body: 'Certificates of competency, endorsements, radio, ratings and trade qualifications.' },
};

/** Where a document with no category sits (a legacy row the catalogue could not classify). */
export const UNCLASSIFIED_GROUP_KEY = '__unclassified__';
export const UNCLASSIFIED_GROUP_LABEL = 'Not classified yet';

/**
 * Why Add is off, or null when it is on. `notice`: a not-applied sentence
 * shown as the tab's notice (D-01); `hint`: a short line under the button;
 * `loading`: the answer is not in yet (the button waits, no text).
 */
export type AddBlock = { reason: string; kind: 'notice' | 'hint' | 'loading' } | null;

/**
 * Whether Add is offered, and why not. In order: the documents are the
 * legacy fallback, or the catalogue or rights RPC is not applied (D-01:
 * CATALOGUE_MISSING_NOTICE); the storage helper is missing
 * (UPLOADS_UNAVAILABLE_NOTICE); the catalogue or the rights are still
 * loading or failed. `hidden` is true when the reader simply may not add
 * (no button at all).
 */
function addAvailability(args: {
  documents: CrewDocumentsState;
  catalogue: DocumentTypesState;
  rights: CrewDocumentRightsState;
  uploadsReady: boolean;
}): { hidden: boolean; block: AddBlock } {
  const { documents, catalogue, rights, uploadsReady } = args;
  if (documents.status === 'ready' && documents.catalogueMissing) return { hidden: false, block: { reason: CATALOGUE_MISSING_NOTICE, kind: 'notice' } };
  if (catalogue.status === 'not_set_up' || rights.status === 'unknown') return { hidden: false, block: { reason: CATALOGUE_MISSING_NOTICE, kind: 'notice' } };
  if (rights.status === 'ready' && !rights.rights.canAdd) return { hidden: true, block: null };
  if (!uploadsReady) return { hidden: false, block: { reason: UPLOADS_UNAVAILABLE_NOTICE, kind: 'notice' } };
  if (rights.status === 'error') return { hidden: false, block: { reason: 'Your rights to add documents could not be checked.', kind: 'hint' } };
  if (catalogue.status === 'error') return { hidden: false, block: { reason: 'The document types could not load.', kind: 'hint' } };
  if (rights.status !== 'ready' || catalogue.status !== 'ready') return { hidden: false, block: { reason: 'Checking whether you can add documents', kind: 'loading' } };
  return { hidden: false, block: null };
}

interface DocumentGroup {
  key: string;
  label: string;
  documents: CrewDocumentView[];
}

/**
 * The tab's documents by category, in catalogue order (the live categories
 * when the catalogue is loaded, else the seeded order and each row's own
 * label), unclassified last;
 * inside a category by name, then the latest expiry first.
 */
function groupDocuments(documents: readonly CrewDocumentView[], catalogue: DocumentCatalogue | null): DocumentGroup[] {
  // Without the live catalogue (D-01, or it failed to load) the seeded order stands in.
  const order: Map<string, { index: number; label: string | null }> = catalogue
    ? new Map(catalogue.categories.map((c, i) => [c.key, { index: i, label: c.label }]))
    : new Map(Object.keys(SYSTEM_CATEGORY_TAB).map((key, i) => [key, { index: i, label: null }]));
  const groups = new Map<string, DocumentGroup>();
  for (const doc of documents) {
    const key = doc.categoryKey ?? UNCLASSIFIED_GROUP_KEY;
    const label = doc.categoryKey ? (order.get(doc.categoryKey)?.label ?? doc.categoryLabel ?? humanise(doc.categoryKey)) : UNCLASSIFIED_GROUP_LABEL;
    const g = groups.get(key) ?? { key, label, documents: [] };
    g.documents.push(doc);
    groups.set(key, g);
  }
  const rank = (key: string) => (key === UNCLASSIFIED_GROUP_KEY ? Number.MAX_SAFE_INTEGER : order.get(key)?.index ?? Number.MAX_SAFE_INTEGER - 1);
  return [...groups.values()]
    .sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label))
    .map((g) => ({
      ...g,
      documents: [...g.documents].sort(
        (a, b) => a.name.localeCompare(b.name) || (b.expiryDate ?? '').localeCompare(a.expiryDate ?? '') || a.id.localeCompare(b.id),
      ),
    }));
}

const humanise = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const refusalCode = (error: unknown) => (error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined);

export interface DocumentsPanelProps {
  tab: CrewDocumentTab;
  profileId: string;
  /** The person's login, for the D-01 fallback (null: no login). */
  userId: string | null;
  companyId: string;
  /** 'profile': the crew profile (rows editable with the right); 'own': /me/documents (rows read-only). */
  context: 'profile' | 'own';
  /** Whose documents, for the dialogs. */
  personName?: string | null;
  /** Heading level of the tab title (2 under a page h1). */
  headingLevel?: 2 | 3;
}

/**
 * The documents of one profile tab (gap/04 C24; X1-04B): the tab's
 * documents grouped by category with counts and "+ Add", the legend with
 * counts (Valid, Expiring, Expired, Missing, Alerts off, Not uploaded) and
 * one DocumentRow per document. Add opens the two-step AddDocumentDialog
 * (lazy) on this tab, or on a category from its "+ Add"; Edit opens it on the
 * document; View opens the file through a signed URL (DocumentViewer, lazy).
 *
 * States: loading; a 42501 reads as no access and a P0002 as not found; any
 * other error is an error with Try again. D-01: the legacy fallback rows are
 * read-only with CATALOGUE_MISSING_NOTICE and Add off; without the storage
 * helper Add is off with UPLOADS_UNAVAILABLE_NOTICE. On /me/documents the
 * rows are read-only and Add follows the server's answer (crew certificate
 * creation, or crew uploads on for the person's vessel).
 */
export const DocumentsPanel: React.FC<DocumentsPanelProps> = ({ tab, profileId, userId, companyId, context, personName, headingLevel = 2 }) => {
  const documents = useCrewDocuments(profileId, { companyId, userId });
  const rights = useCrewDocumentRights(profileId, { companyId });
  const catalogue = useDocumentTypes(companyId);
  const countries = useCountries();
  const uploadsReady = crewDocumentUploadsReady();
  const [dialog, setDialog] = React.useState<AddDocumentDialogMode | null>(null);
  const [viewing, setViewing] = React.useState<CrewDocumentView | null>(null);
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const blockId = React.useId();

  const countryLabel = React.useCallback(
    (code: string | null) => {
      if (!code) return null;
      const c = countries.items.find((x) => x.iso2 === code);
      return c ? `${c.flagEmoji ? `${c.flagEmoji} ` : ''}${c.name}` : code;
    },
    [countries.items],
  );

  const copy = DOCUMENT_TAB_COPY[tab];
  const add = addAvailability({ documents, catalogue, rights, uploadsReady });
  const catalogueReady = catalogue.status === 'ready' ? catalogue.catalogue : null;
  const canOpenDialog = !add.hidden && !add.block && catalogueReady !== null;
  const readOnly = context === 'own' || (documents.status === 'ready' && documents.readOnly);
  const canEditRows = !readOnly && catalogueReady !== null && rights.status === 'ready' && rights.rights.canEdit;
  const openAdd = (categoryKey: string | null = null) => {
    if (canOpenDialog) setDialog({ kind: 'add', tab, categoryKey });
  };

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-[min(18rem,100%)] flex-1">
        <Heading className="type-title text-foreground">{copy.title}</Heading>
        <p className="type-body text-muted-foreground">{copy.body}</p>
      </div>
      {!add.hidden ? (
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            onClick={() => openAdd()}
            disabled={!canOpenDialog}
            aria-describedby={add.block ? blockId : undefined}
            aria-busy={add.block?.kind === 'loading' || undefined}
            className="[@media(pointer:coarse)]:h-11"
            data-add-document=""
          >
            <Plus aria-hidden="true" />
            Add document
          </Button>
          {add.block ? (
            <span id={blockId} className={add.block.kind === 'hint' ? 'type-caption text-muted-foreground' : 'sr-only'}>
              {add.block.reason}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (documents.status === 'idle' || documents.status === 'loading') {
    return (
      <div className="min-w-0 space-y-4" data-documents-state="loading">
        {header}
        <div className="space-y-2" aria-busy="true" aria-label={`Loading ${copy.title.toLowerCase()}`}>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }
  if (documents.status === 'error') {
    const code = refusalCode(documents.error);
    if (code === '42501') {
      return (
        <div className="min-w-0" data-documents-state="denied">
          <AccessDenied
            title="You can't see these documents"
            detail="Crew documents of others need crew profile and crew certificate access on one of this person's vessels."
            backTo={null}
            headingLevel={2}
          />
        </div>
      );
    }
    return (
      <div className="min-w-0 space-y-4" data-documents-state="error">
        {header}
        <PageError
          variant="inline"
          error={documents.error}
          onRetry={documents.retry}
          title={code === 'P0002' ? 'This crew member could not be found' : 'The documents could not load'}
          treatMissingAsOff={false}
        />
      </div>
    );
  }

  const onTab = documents.documents.filter((d) => d.tab === tab);
  const groups = groupDocuments(onTab, catalogueReady);
  const legend = countDocumentLegend(onTab.map((d) => d.state));
  const notice = add.block?.kind === 'notice' ? add.block.reason : documents.notice;

  return (
    <div className="min-w-0 space-y-4" data-documents-state="ready" data-documents-source={documents.source} data-documents-tab={tab}>
      {header}
      {notice ? (
        <Alert variant="info" data-documents-notice="">
          <Info aria-hidden="true" className="size-4" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {context === 'own' && add.hidden ? (
        <p className="type-body text-muted-foreground" data-own-uploads="off">
          Adding your own documents is not switched on for your vessel. The people who look after crew documents on board can add them for you.
        </p>
      ) : null}
      {catalogue.status === 'error' ? (
        <Button type="button" variant="ghost" size="sm" onClick={catalogue.retry} className="[@media(pointer:coarse)]:h-11">
          <RotateCw aria-hidden="true" />
          Load the document types again
        </Button>
      ) : null}
      {onTab.length === 0 ? (
        <EmptyState
          kind="first-use"
          icon={FileText}
          title={`No ${copy.title === 'STCW' ? 'STCW certificates' : copy.title.toLowerCase()} recorded yet`}
          body={
            canOpenDialog
              ? 'Add the first one. Choose its type and STORM files it on the right tab.'
              : 'None are recorded for this person on this tab.'
          }
          action={
            canOpenDialog ? (
              <Button type="button" onClick={() => openAdd()} className="[@media(pointer:coarse)]:h-11">
                <Plus aria-hidden="true" />
                Add document
              </Button>
            ) : null
          }
          bordered
        />
      ) : (
        <>
          <DocumentLegend counts={legend} />
          <div className="min-w-0 space-y-4">
            {groups.map((g) => (
              <Card key={g.key} className="min-w-0" data-document-group={g.key}>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 p-4 pb-2 sm:p-6 sm:pb-2">
                  <CardTitle className="type-subtitle flex min-w-0 items-center gap-2">
                    <span className="min-w-0 break-words">{g.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 type-caption tabular-nums text-muted-foreground" aria-label={`${g.documents.length} documents`}>
                      {g.documents.length}
                    </span>
                  </CardTitle>
                  {canOpenDialog && g.key !== UNCLASSIFIED_GROUP_KEY ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openAdd(g.key)}
                      aria-label={`Add to ${g.label}`}
                      className="[@media(pointer:coarse)]:h-11"
                    >
                      <Plus aria-hidden="true" />
                      Add
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="min-w-0 p-4 pt-0 sm:p-6 sm:pt-0">
                  <ul className="divide-y divide-border">
                    {g.documents.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        countryLabel={countryLabel}
                        onView={setViewing}
                        onEdit={canEditRows && doc.canEdit && doc.typeId ? (d) => setDialog({ kind: 'edit', document: d }) : null}
                      />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      {dialog && catalogueReady ? (
        <Suspense fallback={null}>
          <AddDocumentDialog
            mode={dialog}
            profileId={profileId}
            companyId={companyId}
            personName={personName}
            catalogue={catalogueReady}
            documents={documents.documents}
            uploadsReady={uploadsReady}
            onOpenChange={(open) => {
              if (!open) setDialog(null);
            }}
          />
        </Suspense>
      ) : null}
      {viewing ? (
        <Suspense fallback={null}>
          <DocumentViewer
            document={viewing}
            companyId={companyId}
            onOpenChange={(open) => {
              if (!open) setViewing(null);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

/** The profile tab (prop tab): the person's documents of one catalogue tab. */
export const DocumentsTab: React.FC<ProfileTabProps & { tab: CrewDocumentTab }> = ({ tab, profile, vessel }) => (
  <DocumentsPanel
    tab={tab}
    profileId={profile.profileId}
    userId={profile.userId}
    companyId={vessel.companyId}
    context="profile"
    personName={profile.displayName}
  />
);

/** The three profile tabs (lib/profileTabs.ts registers each). */
export const DocumentsProfileTab: React.FC<ProfileTabProps> = (props) => <DocumentsTab {...props} tab="documents" />;
export const StcwProfileTab: React.FC<ProfileTabProps> = (props) => <DocumentsTab {...props} tab="stcw" />;
export const QualificationsProfileTab: React.FC<ProfileTabProps> = (props) => <DocumentsTab {...props} tab="qualifications" />;

export default DocumentsTab;
