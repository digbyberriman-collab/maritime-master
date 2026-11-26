/**
 * ISM › Form templates (`/ism/forms/templates`; until the fleet Forms &
 * Checklists pages land, X5-06B, this is where templates are managed).
 *
 * Reads through RLS (`useFormTemplates`); every status change goes through
 * the Forms & Checklists definers (@/modules/forms, gap/02 W2, D-X5-13):
 *
 * - Publish a draft (form_template_publish; while the definers are missing,
 *   today's write as the D-01 fallback, D-X5-20).
 * - New version of a published template, and "Restore as a new draft" of
 *   an archived one (form_template_new_version: the old 24-hour restore
 *   that flipped an archived row back to published is gone).
 * - Duplicate as a Customise copy (form_template_customise).
 * - Archive (form_template_archive; same fallback as publish).
 * - Delete a draft that was never published and has no runs
 *   (form_template_delete_draft, after the admin PIN); when the server
 *   refuses because the template has runs or was published, archiving is
 *   offered instead. The schedules and extraction jobs of the draft are
 *   removed by the server, never by the browser first.
 *
 * The actions offered follow the status (lib/templateMachine.ts) and need
 * fleet.operations.fleet_checklists.admin (the server checks again and
 * refuses in words); while the capability loads, none is offered.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, Copy, Eye, FilePlus2, FileText, Layers, MoreHorizontal, Plus, Search, Send, ShieldAlert, Trash2, RotateCcw } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { StatusPill } from '@/shared/components/status';
import { EmptyState, PageError, PageLoading } from '@/shared/components/states';
import AdminPinModal from '@/modules/crew/components/AdminPinModal';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useCan } from '@/lib/permissions/useCan';
import { useFormTemplates, type FormTemplate } from '@/modules/ism/forms/hooks/useFormTemplates';
import { FORM_TEMPLATE_STATUSES, FORM_TYPES, type FormTemplateStatus, type FormType } from '@/modules/ism/forms/constants';
import {
  FormTemplateRefusalError,
  areaLabel,
  formTemplateTransition,
  normaliseFormTemplateStatus,
  useFormTemplateMutations,
  versionDisplay,
} from '@/modules/forms';

const ADMIN_KEY = 'fleet.operations.fleet_checklists.admin';
const COARSE = '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';

/** A row with the catalogue columns once 040500 is applied (absent before it, so optional). */
type TemplateCard = FormTemplate & { area?: string | null; version_label?: string | null };

const STATUS_FILTER_LABELS: Record<FormTemplateStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  SUPERSEDED: 'Superseded',
  ARCHIVED: 'Archived',
};

const formTypeLabel = (type: string) => FORM_TYPES.find((t) => t.value === type)?.label ?? type;

/** Codes the server answers when a template must be archived rather than deleted. */
const ARCHIVE_INSTEAD = new Set(['template_has_runs', 'template_published']);

const FormTemplates: React.FC = () => {
  const navigate = useNavigate();
  const { selectedVesselId } = useVessel();
  const canManage = useCan(ADMIN_KEY);
  const mutations = useFormTemplateMutations();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FormType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<FormTemplateStatus | 'all'>('PUBLISHED');
  const [pendingDelete, setPendingDelete] = useState<TemplateCard | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveOffered, setArchiveOffered] = useState(false);
  const pinConfirmedRef = useRef(false);

  const templatesQuery = useFormTemplates({ status: filterStatus, formType: filterType, vesselId: selectedVesselId ?? undefined });
  const templates = useMemo(() => (templatesQuery.data ?? []) as TemplateCard[], [templatesQuery.data]);

  const filteredTemplates = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter((t) => t.template_name.toLowerCase().includes(term) || t.template_code.toLowerCase().includes(term));
  }, [templates, searchTerm]);

  const closeDelete = () => {
    setConfirmOpen(false);
    setPendingDelete(null);
    setDeleteError(null);
    setArchiveOffered(false);
    pinConfirmedRef.current = false;
  };

  const handleDeleteClick = (template: TemplateCard) => {
    pinConfirmedRef.current = false;
    setDeleteError(null);
    setArchiveOffered(false);
    setPendingDelete(template);
    setPinOpen(true);
  };

  const handlePinConfirmed = () => {
    pinConfirmedRef.current = true;
    setPinOpen(false);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await mutations.deleteDraft.mutateAsync(pendingDelete.id);
      closeDelete();
    } catch (error) {
      const code = error instanceof FormTemplateRefusalError ? error.code : null;
      setDeleteError(error instanceof Error ? error.message : 'The template was not deleted.');
      setArchiveOffered(code !== null && ARCHIVE_INSTEAD.has(code));
    }
  };

  const handleArchiveInstead = async () => {
    if (!pendingDelete) return;
    try {
      await mutations.archive.mutateAsync({ templateId: pendingDelete.id });
      closeDelete();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The template was not archived.');
      setArchiveOffered(false);
    }
  };

  const busy = mutations.deleteDraft.isPending || mutations.archive.isPending;

  const startNewVersion = async (template: TemplateCard) => {
    try {
      const draft = await mutations.newVersion.mutateAsync(template.id);
      navigate(`/ism/forms/templates/${draft.id}`);
    } catch {
      // The mutation toasts the refusal.
    }
  };

  const duplicate = async (template: TemplateCard) => {
    try {
      const copy = await mutations.customise.mutateAsync(template.id);
      navigate(`/ism/forms/templates/${copy.id}`);
    } catch {
      // The mutation toasts the refusal.
    }
  };

  const renderActions = (template: TemplateCard) => {
    const status = normaliseFormTemplateStatus(template.status);
    const can = (action: Parameters<typeof formTemplateTransition>[1]) => canManage && status !== null && formTemplateTransition(status, action).ok;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={COARSE}
            aria-label={`View ${template.template_name}`}
            onClick={() => navigate(`/ism/forms/templates/${template.id}`)}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </Button>
          {canManage && status ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={COARSE} aria-label={`More actions for ${template.template_name}`}>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can('new_version') && status === 'PUBLISHED' ? (
                  <DropdownMenuItem onClick={() => void startNewVersion(template)}>
                    <Layers className="mr-2 h-4 w-4" aria-hidden="true" />
                    New version
                  </DropdownMenuItem>
                ) : null}
                {can('customise') ? (
                  <DropdownMenuItem onClick={() => void duplicate(template)}>
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Duplicate as a copy
                  </DropdownMenuItem>
                ) : null}
                {can('archive') ? (
                  <DropdownMenuItem onClick={() => mutations.archive.mutate({ templateId: template.id })}>
                    <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                    Archive
                  </DropdownMenuItem>
                ) : null}
                {can('delete_draft') ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteClick(template)}>
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Delete draft (admin PIN)
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {status === 'PUBLISHED' ? (
          <Button size="sm" className={COARSE} onClick={() => navigate(`/ism/forms/new?template=${template.id}`)}>
            Start form
          </Button>
        ) : null}
        {status === 'DRAFT' && can('publish') ? (
          <Button
            size="sm"
            className={COARSE}
            disabled={mutations.publish.isPending}
            onClick={() => mutations.publish.mutate({ templateId: template.id, expectedUpdatedAt: template.updated_at })}
          >
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            Publish
          </Button>
        ) : null}
        {status === 'ARCHIVED' && can('new_version') ? (
          <Button size="sm" variant="secondary" className={COARSE} disabled={mutations.newVersion.isPending} onClick={() => void startNewVersion(template)}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Restore as a new draft
          </Button>
        ) : null}
      </div>
    );
  };

  const renderBody = () => {
    if (templatesQuery.isLoading) return <PageLoading variant="cards" rows={6} label="Loading templates" />;
    if (templatesQuery.isError) {
      return <PageError error={templatesQuery.error} title="Templates could not be loaded" onRetry={() => void templatesQuery.refetch()} />;
    }
    if (filteredTemplates.length === 0) {
      const filtered = templates.length > 0 || searchTerm.trim() !== '' || filterType !== 'all' || filterStatus !== 'all';
      return (
        <EmptyState
          kind={filtered ? 'filtered' : 'first-use'}
          bordered
          icon={FileText}
          title={filtered ? 'No templates match these filters' : 'No templates yet'}
          body={filtered ? 'Change the search, the type or the status to see more.' : 'Create the first checklist or form your crews will fill in.'}
          action={
            !filtered ? (
              <Button onClick={() => navigate('/ism/forms/templates/create')}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Create template
              </Button>
            ) : undefined
          }
        />
      );
    }
    return (
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Templates">
        {filteredTemplates.map((template) => (
          <li key={template.id}>
            <Card className="flex h-full flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="type-title break-words">{template.template_name}</CardTitle>
                    <CardDescription className="type-mono mt-0.5 break-all">{template.template_code}</CardDescription>
                  </div>
                  <StatusPill domain="form_template" status={template.status} />
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4 pb-4">
                <div className="space-y-2">
                  {template.description ? <p className="type-body line-clamp-2 text-muted-foreground">{template.description}</p> : null}
                  <dl className="type-caption flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                    <div className="flex gap-1">
                      <dt className="sr-only">Version</dt>
                      <dd>{versionDisplay(template)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="sr-only">Type</dt>
                      <dd>{formTypeLabel(template.form_type)}</dd>
                    </div>
                    {'area' in template ? (
                      <div className="flex gap-1">
                        <dt className="sr-only">Area</dt>
                        <dd>{areaLabel(template.area)}</dd>
                      </div>
                    ) : null}
                    <div className="flex gap-1">
                      <dt className="sr-only">Vessels</dt>
                      <dd>{template.vessel_scope === 'VESSEL_SPECIFIC' ? 'Selected vessels' : 'All vessels'}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="sr-only">Started</dt>
                      <dd>{template.initiation_mode === 'SCHEDULED' ? 'Scheduled' : template.initiation_mode === 'BOTH' ? 'Manual or scheduled' : 'Manual'}</dd>
                    </div>
                  </dl>
                </div>
                {renderActions(template)}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Form templates"
          description="Checklists, forms and permits your crews fill in. Publishing, new versions and archiving are recorded in each template's history."
          actions={
            <Button className={COARSE} onClick={() => navigate('/ism/forms/templates/create')}>
              <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Create template
            </Button>
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  placeholder="Search by name or code"
                  aria-label="Search templates"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterType} onValueChange={(value) => setFilterType(value as FormType | 'all')}>
                <SelectTrigger className="w-full sm:w-[180px]" aria-label="Type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {FORM_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as FormTemplateStatus | 'all')}>
                <SelectTrigger className="w-full sm:w-[180px]" aria-label="Status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {FORM_TEMPLATE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_FILTER_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {renderBody()}
      </div>

      <AdminPinModal
        open={pinOpen}
        onOpenChange={(open) => {
          setPinOpen(open);
          if (!open && !pinConfirmedRef.current) setPendingDelete(null);
        }}
        onConfirmed={handlePinConfirmed}
        title="Admin PIN required"
        description="Deleting a draft template cannot be undone. Enter the admin PIN to continue."
      />

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !busy) closeDelete();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
              Delete this draft?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  <strong>{pendingDelete.template_name}</strong> ({pendingDelete.template_code}) and its schedules are removed for good. Only a draft that was never
                  published and has no filled-in forms can be deleted; anything else is archived.
                </>
              ) : (
                <>This cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 type-body text-destructive">
              <p className="font-semibold">The draft was not deleted</p>
              <p className="mt-1 break-words">{deleteError}</p>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            {archiveOffered ? (
              <Button variant="secondary" onClick={() => void handleArchiveInstead()} disabled={busy}>
                {mutations.archive.isPending ? 'Archiving…' : 'Archive instead'}
              </Button>
            ) : null}
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mutations.deleteDraft.isPending ? 'Deleting…' : 'Delete draft'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default FormTemplates;
