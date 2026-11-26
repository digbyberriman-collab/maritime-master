/**
 * Library settings (`/fleet/documents?settings=1`; gap/02 FD1, FD10, W1;
 * X5 spec X5-04A): the company's sections and document types, which group
 * the library here and each vessel's Fleet Documents menu.
 *
 * - Sections: add, rename, reorder (Move up / Move down buttons, or
 *   Alt + Arrow Up / Down on a section's handle) and delete. A section is
 *   deleted only while none of its types holds a document; its empty types
 *   go with it (W1 delete rules).
 * - Document types: add to a section, change the name, the section, the
 *   acknowledgement defaults (required, within 1-365 days), the version
 *   kind default (major or minor) and whether vessels hide it while nothing
 *   is published in it; delete while it holds no document. Each type shows
 *   how many documents it holds and how many are published.
 * - Gate: `fleet.operations.fleet_documents.edit` (nothing is read or
 *   offered until it is granted; deny while loading); deleting needs
 *   `fleet.operations.fleet_documents.delete`. The server checks the same
 *   rules with fleet reach.
 * - Writes only through the definers (hooks/useFleetDocumentMutations.ts:
 *   input checked first, the returned row checked, refusals as sentences
 *   under the row and as a toast). The counts come from the page's library
 *   read, so the drawer reads nothing of its own.
 *
 * 44 px targets on coarse pointers, visible focus, the sheet fills a phone.
 */
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useCapability } from '@/lib/permissions/useCan';
import { cn } from '@/lib/utils';
import { AccessDenied, EmptyState, PageError, PageLoading } from '@/shared/components/states';
import { errorMessage } from '@/shared/lib/notify';
import { DOCUMENTS_CAPS } from '../paths';
import {
  useDeleteSection,
  useDeleteType,
  useReorderSections,
  useSaveSection,
  useSaveType,
} from '../hooks/useFleetDocumentMutations';
import type { FleetDocumentTaxonomyState, FleetDocumentType } from '../hooks/useFleetDocumentTaxonomy';
import {
  ACK_DUE_DAYS_MAX,
  TAXONOMY_NAME_MAX,
  documentTypeFormDefaults,
  documentTypeSchema,
  moveInOrder,
  sectionSchema,
  toSaveTypeInput,
  toSectionName,
  type DocumentTypeFormValues,
  type SectionFormValues,
} from '../lib/documentTaxonomySchema';
import type { LibrarySectionSummary, LibraryTypeSummary } from '../lib/fleetDocumentLibrary';
import { sectionDeleteRefusal, typeDeleteRefusal, fleetDocumentRefusal } from '../lib/fleetDocumentMachine';

const COARSE = '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export interface DocumentSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  taxonomy: FleetDocumentTaxonomyState;
  /** Per-section and per-type document counts from the page's library read (null while it loads or failed). */
  sections: readonly LibrarySectionSummary[] | null;
}

// ─── Section name form (add and rename) ─────────────────────────────────

function SectionNameForm({
  initial,
  submitLabel,
  label,
  busy,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  initial: string;
  submitLabel: string;
  label: string;
  busy: boolean;
  onSubmit: (name: string) => Promise<boolean>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const form = useForm<SectionFormValues>({ resolver: zodResolver(sectionSchema), defaultValues: { name: initial } });
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const id = React.useId();
  const fieldError = form.formState.errors.name?.message ?? null;
  const message = fieldError ?? refusal;

  const submit = form.handleSubmit(async (values) => {
    const name = toSectionName(values);
    if (!name) return;
    setRefusal(null);
    const ok = await onSubmit(name).catch((error: unknown) => {
      setRefusal(errorMessage(error, 'The section was not saved.'));
      return false;
    });
    if (ok && !onCancel) form.reset({ name: '' });
  });

  return (
    <form onSubmit={submit} noValidate aria-label={label} className="space-y-1">
      <div className="flex items-center gap-2">
        <Label htmlFor={`${id}-name`} className="sr-only">
          {label}
        </Label>
        <Input
          id={`${id}-name`}
          autoComplete="off"
          maxLength={TAXONOMY_NAME_MAX + 20}
          placeholder="Section name"
          autoFocus={autoFocus}
          className={cn('h-9 min-w-0 flex-1', COARSE)}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && onCancel) {
              event.stopPropagation();
              onCancel();
            }
          }}
          {...form.register('name')}
        />
        <Button type="submit" size="sm" className={COARSE} disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" className={COARSE} onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </form>
  );
}

// ─── Document type form (add and edit) ──────────────────────────────────

function DocumentTypeForm({
  type,
  sectionId,
  sections,
  busy,
  onSubmit,
  onCancel,
}: {
  type: FleetDocumentType | null;
  sectionId: string;
  sections: readonly { id: string; name: string }[];
  busy: boolean;
  onSubmit: (values: DocumentTypeFormValues, sectionId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<DocumentTypeFormValues>({ resolver: zodResolver(documentTypeSchema), defaultValues: documentTypeFormDefaults(type ?? undefined) });
  const [targetSection, setTargetSection] = React.useState(sectionId);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const id = React.useId();
  const errors = form.formState.errors;
  const ackRequired = form.watch('ackRequiredDefault');

  const submit = form.handleSubmit(async (values) => {
    setRefusal(null);
    try {
      await onSubmit(values, targetSection);
    } catch (error) {
      setRefusal(errorMessage(error, 'The document type was not saved.'));
    }
  });

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={type ? `Edit ${type.name}` : 'New document type'}
      className="space-y-3 rounded-md border border-border bg-muted/40 p-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          autoComplete="off"
          autoFocus
          className={cn('h-9', COARSE)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
          disabled={busy}
          {...form.register('name')}
        />
        {errors.name ? (
          <p id={`${id}-name-error`} role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      {type ? (
        <div className="space-y-1">
          <Label htmlFor={`${id}-section`}>Section</Label>
          <Select value={targetSection} onValueChange={setTargetSection} disabled={busy}>
            <SelectTrigger id={`${id}-section`} className={cn('h-9', COARSE)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-ack`} className="font-normal">
          Crew acknowledge documents of this type
        </Label>
        <Controller
          control={form.control}
          name="ackRequiredDefault"
          render={({ field }) => (
            <Switch id={`${id}-ack`} checked={field.value} onCheckedChange={field.onChange} disabled={busy} className={COARSE} />
          )}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-days`}>Days to acknowledge</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`${id}-days`}
            inputMode="numeric"
            autoComplete="off"
            className={cn('h-9 w-24 tabular-nums', COARSE)}
            aria-invalid={errors.ackDueDaysDefault ? true : undefined}
            aria-describedby={`${id}-days-hint${errors.ackDueDaysDefault ? ` ${id}-days-error` : ''}`}
            disabled={busy || !ackRequired}
            {...form.register('ackDueDaysDefault')}
          />
          <span id={`${id}-days-hint`} className="type-caption text-muted-foreground">
            {`From publishing, or from joining the vessel; 1 to ${ACK_DUE_DAYS_MAX}`}
          </span>
        </div>
        {errors.ackDueDaysDefault ? (
          <p id={`${id}-days-error`} role="alert" className="text-sm text-destructive">
            {errors.ackDueDaysDefault.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-kind`}>New versions are</Label>
        <Controller
          control={form.control}
          name="versionKindDefault"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
              <SelectTrigger id={`${id}-kind`} className={cn('h-9', COARSE)} aria-describedby={`${id}-kind-hint`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="major">Major: everyone acknowledges again</SelectItem>
                <SelectItem value="minor">Minor: earlier acknowledgements carry over</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <p id={`${id}-kind-hint`} className="type-caption text-muted-foreground">
          The default for each upload; the publisher can change it.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-hide`} className="font-normal">
          Hide on vessels while nothing is published
        </Label>
        <Controller
          control={form.control}
          name="hideWhenEmpty"
          render={({ field }) => (
            <Switch id={`${id}-hide`} checked={field.value} onCheckedChange={field.onChange} disabled={busy} className={COARSE} />
          )}
        />
      </div>

      {refusal ? (
        <p role="alert" className="text-sm text-destructive">
          {refusal}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className={COARSE} onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className={COARSE} disabled={busy}>
          {busy ? 'Saving…' : type ? 'Save type' : 'Add type'}
        </Button>
      </div>
    </form>
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────

function typeSummaryLine(type: FleetDocumentType): string {
  const parts = [
    type.ack_required_default ? `Acknowledge within ${count(type.ack_due_days_default, 'day')}` : 'No acknowledgement',
    type.version_kind_default === 'minor' ? 'Minor versions' : 'Major versions',
  ];
  if (type.hide_when_empty) parts.push('Hidden on vessels while empty');
  return parts.join(' · ');
}

function TypeRow({
  type,
  summary,
  sections,
  companyId,
  canDelete,
  onDelete,
}: {
  type: FleetDocumentType;
  summary: LibraryTypeSummary | undefined;
  sections: readonly { id: string; name: string }[];
  companyId: string | null;
  canDelete: boolean;
  onDelete: (type: FleetDocumentType) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const save = useSaveType(companyId);
  const documents = summary?.documentCount ?? 0;
  const published = summary?.publishedCount ?? 0;
  const deleteBlock = summary ? typeDeleteRefusal(documents) : 'counts_unknown';

  if (editing) {
    return (
      <li className="py-2">
        <DocumentTypeForm
          type={type}
          sectionId={type.section_id}
          sections={sections}
          busy={save.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={async (values, sectionId) => {
            const input = toSaveTypeInput(values, { id: type.id, sectionId });
            if (!input) return;
            await save.mutateAsync(input);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-foreground">{type.name}</p>
        <p className="type-caption text-muted-foreground">{typeSummaryLine(type)}</p>
        <p className="type-caption tabular-nums text-muted-foreground" data-testid="type-counts">
          {summary ? (documents === 0 ? 'Nothing published yet' : `${count(documents, 'document')} · ${published.toLocaleString('en-GB')} published`) : 'Counts unavailable'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', COARSE)} aria-label={`Edit ${type.name}`} onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
        </Button>
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8 text-muted-foreground hover:text-destructive', COARSE)}
            aria-label={`Delete ${type.name}`}
            aria-disabled={deleteBlock ? true : undefined}
            title={deleteBlock === 'type_in_use' ? fleetDocumentRefusal('type_in_use') ?? undefined : deleteBlock ? 'Counts unavailable' : undefined}
            onClick={() => {
              if (!deleteBlock) onDelete(type);
            }}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

interface PendingDelete {
  kind: 'section' | 'type';
  id: string;
  name: string;
  detail: string;
}

function SectionItem({
  section,
  index,
  total,
  types,
  summary,
  sections,
  companyId,
  canDelete,
  busyOrder,
  onMove,
  onDelete,
}: {
  section: { id: string; name: string };
  index: number;
  total: number;
  types: FleetDocumentType[];
  summary: LibrarySectionSummary | undefined;
  sections: readonly { id: string; name: string }[];
  companyId: string | null;
  canDelete: boolean;
  busyOrder: boolean;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDelete: (pending: PendingDelete) => void;
}) {
  const [renaming, setRenaming] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const saveSection = useSaveSection(companyId);
  const saveType = useSaveType(companyId);
  const headingId = React.useId();
  const totalDocuments = summary?.totalCount ?? null;
  const deleteBlock = totalDocuments === null ? 'counts_unknown' : sectionDeleteRefusal(totalDocuments);

  return (
    <li className="rounded-lg border border-border bg-card" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1 border-b border-border px-3 py-2">
        <button
          type="button"
          className={cn(
            'mt-0.5 flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            COARSE,
          )}
          aria-label={`Reorder ${section.name}: Alt and the up or down arrow keys move it`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          disabled={busyOrder}
          onKeyDown={(event) => {
            if (!event.altKey) return;
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              onMove(section.id, 'up');
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              onMove(section.id, 'down');
            }
          }}
        >
          <GripVertical aria-hidden="true" className="h-4 w-4" />
        </button>
        <div className={cn('min-w-[10rem] flex-1', renaming && 'basis-full sm:basis-0')}>
          {renaming ? (
            <SectionNameForm
              initial={section.name}
              label={`Rename ${section.name}`}
              submitLabel="Save"
              autoFocus
              busy={saveSection.isPending}
              onCancel={() => setRenaming(false)}
              onSubmit={async (name) => {
                await saveSection.mutateAsync({ id: section.id, name });
                setRenaming(false);
                return true;
              }}
            />
          ) : (
            <>
              <h3 id={headingId} className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
                {section.name}
              </h3>
              <p className="type-caption tabular-nums text-muted-foreground" data-testid="section-counts">
                {`${count(types.length, 'type')} · ${summary ? count(summary.documentCount, 'document') : 'counts unavailable'}`}
              </p>
            </>
          )}
        </div>
        {renaming ? null : (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', COARSE)}
              aria-label={`Move ${section.name} up`}
              disabled={busyOrder || index === 0}
              onClick={() => onMove(section.id, 'up')}
            >
              <ArrowUp aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', COARSE)}
              aria-label={`Move ${section.name} down`}
              disabled={busyOrder || index === total - 1}
              onClick={() => onMove(section.id, 'down')}
            >
              <ArrowDown aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', COARSE)} aria-label={`Rename ${section.name}`} onClick={() => setRenaming(true)}>
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </Button>
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('h-8 w-8 text-muted-foreground hover:text-destructive', COARSE)}
                aria-label={`Delete ${section.name}`}
                aria-disabled={deleteBlock ? true : undefined}
                title={deleteBlock === 'section_in_use' ? fleetDocumentRefusal('section_in_use') ?? undefined : deleteBlock ? 'Counts unavailable' : undefined}
                onClick={() => {
                  if (deleteBlock) return;
                  onDelete({
                    kind: 'section',
                    id: section.id,
                    name: section.name,
                    detail: types.length
                      ? `Its ${count(types.length, 'document type')}, which hold nothing, are deleted with it.`
                      : 'It has no document types.',
                  });
                }}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        )}
      </div>
      <div className="px-3 pb-2">
        {types.length ? (
          <ul aria-label={`Document types in ${section.name}`} className="divide-y divide-border">
            {types.map((t) => (
              <TypeRow
                key={t.id}
                type={t}
                summary={summary?.types.find((s) => s.id === t.id)}
                sections={sections}
                companyId={companyId}
                canDelete={canDelete}
                onDelete={(type) =>
                  onDelete({ kind: 'type', id: type.id, name: type.name, detail: 'It holds no documents, so nothing else changes.' })
                }
              />
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">No document types yet.</p>
        )}
        {adding ? (
          <div className="pt-2">
            <DocumentTypeForm
              type={null}
              sectionId={section.id}
              sections={sections}
              busy={saveType.isPending}
              onCancel={() => setAdding(false)}
              onSubmit={async (values) => {
                const input = toSaveTypeInput(values, { id: null, sectionId: section.id });
                if (!input) return;
                await saveType.mutateAsync(input);
                setAdding(false);
              }}
            />
          </div>
        ) : (
          <Button type="button" variant="link" size="sm" className={cn('h-auto px-0 py-1', COARSE)} onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add document type
          </Button>
        )}
      </div>
    </li>
  );
}

// ─── Body ───────────────────────────────────────────────────────────────

function DrawerBody({ companyId, taxonomy, sections: summaries }: Omit<DocumentSettingsDrawerProps, 'open' | 'onOpenChange'>) {
  const edit = useCapability(DOCUMENTS_CAPS.edit);
  const del = useCapability(DOCUMENTS_CAPS.delete);
  const addSection = useSaveSection(companyId);
  const reorder = useReorderSections(companyId);
  const deleteSection = useDeleteSection(companyId);
  const deleteType = useDeleteType(companyId);
  const [pending, setPending] = React.useState<PendingDelete | null>(null);
  const [announcement, setAnnouncement] = React.useState('');

  if (edit.status === 'loading') return <PageLoading label="Checking your access" />;
  if (!edit.allowed) {
    return <AccessDenied detail="Changing the library's sections and document types needs the fleet documents edit permission. Ask your account admin." />;
  }
  if (taxonomy.state === 'error') return <PageError variant="inline" error={taxonomy.error} title="The sections could not load" onRetry={taxonomy.retry} />;
  if (taxonomy.state === 'not_set_up') {
    return (
      <EmptyState
        kind="not-enabled"
        title="Fleet documents are not set up yet"
        body="Sections and document types can be added once this part of STORM is set up."
        compact
      />
    );
  }
  if (taxonomy.state !== 'ready') return <PageLoading label="Loading the sections" />;

  const { sections, types } = taxonomy.taxonomy;
  const sectionOptions = sections.map((s) => ({ id: s.id, name: s.name }));
  const order = sections.map((s) => s.id);

  const move = (id: string, direction: 'up' | 'down') => {
    const next = moveInOrder(order, id, direction);
    if (next.every((v, i) => v === order[i])) return;
    const name = sections.find((s) => s.id === id)?.name ?? 'Section';
    reorder.mutate(next, {
      onSuccess: () => setAnnouncement(`${name} moved to position ${next.indexOf(id) + 1} of ${next.length}`),
    });
  };

  const confirmDelete = async () => {
    if (!pending) return;
    try {
      if (pending.kind === 'section') await deleteSection.mutateAsync(pending.id);
      else await deleteType.mutateAsync(pending.id);
    } catch {
      // The toast says why (the mutation's onError); the dialog closes either way.
    }
    setPending(null);
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <section aria-labelledby="settings-add-section" className="space-y-2">
        <h3 id="settings-add-section" className="type-caption text-muted-foreground">
          Add a section
        </h3>
        <SectionNameForm
          initial=""
          label="New section name"
          submitLabel="Add section"
          busy={addSection.isPending}
          onSubmit={async (name) => {
            await addSection.mutateAsync({ id: null, name });
            return true;
          }}
        />
      </section>

      {sections.length ? (
        <ol aria-label="Sections, in the order vessels see them" className="space-y-3">
          {sections.map((s, i) => (
            <SectionItem
              key={s.id}
              section={s}
              index={i}
              total={sections.length}
              types={types.filter((t) => t.section_id === s.id)}
              summary={summaries?.find((x) => x.id === s.id)}
              sections={sectionOptions}
              companyId={companyId}
              canDelete={del.allowed}
              busyOrder={reorder.isPending}
              onMove={move}
              onDelete={setPending}
            />
          ))}
        </ol>
      ) : (
        <EmptyState
          title="No sections yet"
          body="Add a section, then the document types it holds, for example a Safety Management section with Policies and Procedures."
          compact
          bordered
        />
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => (open ? null : setPending(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending ? `Delete ${pending.name}?` : 'Delete'}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.detail}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={COARSE}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn('bg-destructive text-destructive-foreground hover:bg-destructive/90', COARSE)}
              disabled={deleteSection.isPending || deleteType.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteSection.isPending || deleteType.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function DocumentSettingsDrawer({ open, onOpenChange, ...body }: DocumentSettingsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" hideClose className="flex w-full flex-col gap-0 p-0 sm:max-w-xl" aria-describedby="document-settings-description">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <SheetTitle>Library settings</SheetTitle>
            <SheetDescription id="document-settings-description">
              Sections and document types organise the library here and on every vessel. Each type sets the acknowledgement and version defaults of
              the documents published into it.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className={cn('shrink-0', COARSE)} aria-label="Close library settings">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">{open ? <DrawerBody {...body} /> : null}</div>
      </SheetContent>
    </Sheet>
  );
}

export default DocumentSettingsDrawer;
