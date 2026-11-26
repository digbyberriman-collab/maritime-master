/**
 * ISM › Draft templates (`/ism/forms/drafts`): the company's templates in
 * draft, with what still stops each one from being published.
 *
 * - Reads the live columns only (the old select named columns the table
 *   has never had, failed, and showed "no drafts" whatever was there); a
 *   failed read is an error with Retry, never an empty list.
 * - "Ready to publish" uses the server's own publish checks
 *   (@/modules/forms publishBlocker): a draft that is not ready says why.
 * - Publish goes through form_template_publish (today's write as its D-01
 *   fallback while the definer is missing, D-X5-20); Delete through
 *   form_template_delete_draft, after a confirmation. Both toast the real
 *   outcome; nothing is reported as done before the server answers.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, Clock, Edit, Eye, FilePlus2, FileText, Search, Send, Trash2 } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useCan } from '@/lib/permissions/useCan';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { KpiTile, type KpiTileState } from '@/shared/components/data';
import { StatusPill } from '@/shared/components/status';
import { EmptyState, PageError, PageLoading } from '@/shared/components/states';
import { formTemplateRefusal, publishBlocker, schemaFields, useFormTemplateMutations, versionDisplay } from '@/modules/forms';

const ADMIN_KEY = 'fleet.operations.fleet_checklists.admin';
const COARSE = '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';
const DAY_MS = 24 * 60 * 60 * 1000;

interface DraftRow {
  id: string;
  template_code: string;
  template_name: string;
  description: string | null;
  status: string;
  version: number | null;
  vessel_scope: string | null;
  vessel_ids: string[] | null;
  form_schema: unknown;
  updated_at: string | null;
}

const DRAFT_COLUMNS = 'id, template_code, template_name, description, status, version, vessel_scope, vessel_ids, form_schema, updated_at';

/** The fields that are items (not section headers). */
const itemCount = (schema: unknown) =>
  schemaFields(schema).filter((f) => !(typeof f === 'object' && f !== null && String((f as { type?: unknown }).type ?? '').trim().toLowerCase() === 'section')).length;

export default function DraftTemplates() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canManage = useCan(ADMIN_KEY);
  const mutations = useFormTemplateMutations();
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<DraftRow | null>(null);

  const drafts = useQuery({
    queryKey: ['form-templates', companyId, 'drafts'],
    enabled: !!companyId,
    queryFn: async (): Promise<DraftRow[]> => {
      const { data, error } = await supabase
        .from('form_templates')
        .select(DRAFT_COLUMNS)
        .eq('company_id', companyId as string)
        .eq('status', 'DRAFT')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DraftRow[];
    },
  });

  const rows = useMemo(() => drafts.data ?? [], [drafts.data]);
  const withBlocker = useMemo(
    () =>
      rows.map((row) => ({
        row,
        blocker: publishBlocker({ templateName: row.template_name, formSchema: row.form_schema, vesselScope: row.vessel_scope, vesselIds: row.vessel_ids }),
        items: itemCount(row.form_schema),
      })),
    [rows],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return withBlocker;
    return withBlocker.filter(({ row }) =>
      [row.template_name, row.template_code, row.description ?? ''].some((v) => v.toLowerCase().includes(term)),
    );
  }, [withBlocker, search]);

  const updatedToday = rows.filter((r) => r.updated_at && Date.now() - new Date(r.updated_at).getTime() < DAY_MS).length;
  const ready = withBlocker.filter((d) => d.blocker === null).length;
  const tileState: KpiTileState = drafts.isError ? 'error' : drafts.isSuccess ? 'ready' : 'loading';

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await mutations.deleteDraft.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      // The mutation toasts the refusal; the dialog stays open to cancel.
    }
  };

  const renderList = () => {
    if (!companyId || drafts.isLoading) return <PageLoading variant="list" rows={4} label="Loading drafts" />;
    if (drafts.isError) return <PageError error={drafts.error} title="Drafts could not be loaded" onRetry={() => void drafts.refetch()} />;
    if (filtered.length === 0) {
      return (
        <EmptyState
          kind={rows.length > 0 ? 'filtered' : 'first-use'}
          bordered
          icon={FileText}
          title={rows.length > 0 ? 'No drafts match the search' : 'No draft templates'}
          body={rows.length > 0 ? 'Change the search to see more.' : 'Templates you save without publishing wait here.'}
          action={
            rows.length === 0 ? (
              <Button asChild>
                <Link to="/ism/forms/templates/create">Create template</Link>
              </Button>
            ) : undefined
          }
        />
      );
    }
    return (
      <ul className="space-y-3" aria-label="Draft templates">
        {filtered.map(({ row, blocker, items }) => (
          <li key={row.id}>
            <Card>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="type-title break-words">{row.template_name}</p>
                    <StatusPill domain="form_template" status={row.status} />
                    <span className="type-mono text-muted-foreground">{row.template_code}</span>
                  </div>
                  {row.description ? <p className="type-body line-clamp-1 text-muted-foreground">{row.description}</p> : null}
                  <p className="type-caption mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
                    <span>{versionDisplay(row)}</span>
                    <span>
                      {items} {items === 1 ? 'item' : 'items'}
                    </span>
                    {row.updated_at ? <span>Updated {format(new Date(row.updated_at), 'd MMM yyyy')}</span> : null}
                  </p>
                  {blocker ? (
                    <p className="type-caption mt-1 text-warning">Not ready to publish: {formTemplateRefusal(blocker)}</p>
                  ) : (
                    <p className="type-caption mt-1 text-success">Ready to publish</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" className={COARSE} asChild>
                    <Link to={`/ism/forms/templates/${row.id}`} aria-label={`View ${row.template_name}`}>
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" className={COARSE} asChild>
                    <Link to={`/ism/forms/templates/${row.id}/edit`} aria-label={`Edit ${row.template_name}`}>
                      <Edit className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                  {canManage ? (
                    <>
                      <Button
                        size="sm"
                        className={COARSE}
                        disabled={blocker !== null || mutations.publish.isPending}
                        title={blocker ? formTemplateRefusal(blocker) ?? undefined : undefined}
                        onClick={() => mutations.publish.mutate({ templateId: row.id, expectedUpdatedAt: row.updated_at })}
                      >
                        <Send className="mr-1 h-4 w-4" aria-hidden="true" />
                        Publish
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`${COARSE} text-destructive`}
                        aria-label={`Delete ${row.template_name}`}
                        onClick={() => setPendingDelete(row)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                </div>
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
          title="Draft templates"
          description="Templates saved but not published yet. Crews see a template only once it is published."
          actions={
            <Button asChild className={COARSE}>
              <Link to="/ism/forms/templates/create">
                <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Create template
              </Link>
            </Button>
          }
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiTile label="Drafts" icon={FileText} value={drafts.isSuccess ? rows.length : null} />
          {/* Counts, not alerts: none updated or ready is "0", never "All clear". */}
          <KpiTile label="Updated today" icon={Clock} state={tileState} value={drafts.isSuccess ? updatedToday : null} />
          <KpiTile label="Ready to publish" icon={CheckCircle2} state={tileState} value={drafts.isSuccess ? ready : null} sub="Pass the publish checks" />
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input placeholder="Search drafts" aria-label="Search drafts" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </CardContent>
        </Card>

        {renderList()}
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && !mutations.deleteDraft.isPending && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  <strong>{pendingDelete.template_name}</strong> is removed for good. A draft that was published before, or that crews have already filled in, is kept and
                  must be archived instead.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.deleteDraft.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={mutations.deleteDraft.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mutations.deleteDraft.isPending ? 'Deleting…' : 'Delete draft'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
