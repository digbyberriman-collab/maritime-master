import React, { Suspense } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, Pencil, Play, Plus, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { DataTable, KpiGrid, KpiTile, type DataTableColumn } from '@/shared/components/data';
import { StatusPill } from '@/shared/components/status';
import { useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_CAPS, CREW_PATHS } from '@/modules/crew/paths';
import {
  personName,
  useFamiliarisationOverview,
  type FamiliarisationOverview,
  type FamiliarisationRecordSummary,
  type FamiliarisationTemplate,
} from '@/modules/crew/hooks/useFamiliarisation';
import { progressPercent } from '@/modules/crew/lib/familiarisation';
import { formatDateOnly } from '@/modules/crew/components/familiarisation/format';

// Dialogs and the D-01 fallback load only when opened (gap/00 I6).
const TemplateEditorDialog = React.lazy(() => import('@/modules/crew/components/familiarisation/TemplateEditorDialog'));
const StartFamiliarisationDialog = React.lazy(() => import('@/modules/crew/components/familiarisation/StartFamiliarisationDialog'));
const LegacyFamiliarisation = React.lazy(() => import('@/modules/crew/components/familiarisation/LegacyFamiliarisation'));

interface PageVessel {
  id: string;
  companyId: string;
  name: string;
}

/** The record page's path under the vessel (crew/familiarisation/:recordId). */
const familiarisationRecordPath = (recordId: string) => `${CREW_PATHS.familiarisation}/${recordId}`;

/**
 * Familiarisation (gap/04 C63, C36; X1-10) at crew/familiarisation: the
 * vessel's templates (its own and the fleet's, with the positions each is
 * required for and how many of the crew have completed it, are on it, are
 * overdue or have not started), and its recent forms; `?all=1` lists every
 * form. A record opens at crew/familiarisation/:recordId.
 *
 * Gate: vessel.crew.familiarisation.view on the route vessel (the route
 * guard checks it too): nothing is read while it loads, AccessDenied when
 * denied; the server asks again. Templates are kept with
 * familiarisation.edit (the fleet's from the office), forms started with
 * familiarisation.create; the page shows each control only when allowed.
 *
 * D-01: while 20261124061000 is not applied the overview RPC is missing;
 * the page says so and shows the legacy familiarisation list in its place.
 */
const FamiliarisationPage: React.FC = () => {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const gate = useCapability(CREW_CAPS.famView, { vesselId: vessel?.id ?? null });

  if (!vessel) {
    return <PageEmpty title="Choose a vessel" body="Familiarisation belongs to a vessel. Open it from a vessel's Crew tab." />;
  }
  if (gate.status === 'loading') return <PageLoading variant="tiles" rows={4} label="Checking your access" />;
  if (!gate.allowed) {
    return (
      <AccessDenied
        title="You can't see familiarisation on this vessel"
        detail="The vessel's familiarisation needs familiarisation access on this vessel. Your own familiarisation opens from your notifications."
      />
    );
  }
  return <FamiliarisationBody key={vessel.id} vessel={{ id: vessel.id, companyId: vessel.company_id, name: vessel.name }} />;
};

type EditorState = { template: FamiliarisationTemplate | null } | null;

const FamiliarisationBody: React.FC<{ vessel: PageVessel }> = ({ vessel }) => {
  const [params] = useSearchParams();
  const all = params.get('all') === '1';
  const overview = useFamiliarisationOverview(vessel, { all });
  const [editor, setEditor] = React.useState<EditorState>(null);
  const [startFor, setStartFor] = React.useState<{ templateId: string | null } | null>(null);

  const header = (actions?: React.ReactNode) => (
    <PageHeader
      eyebrow={vessel.name}
      title="Familiarisation"
      description="The checklists each person completes after joining, by vessel and position, and who has signed them off."
      actions={actions}
    />
  );

  if (overview.status === 'idle' || overview.status === 'loading') {
    return (
      <div className="min-w-0 space-y-4">
        {header()}
        <PageLoading variant="tiles" rows={4} label="Loading familiarisation" />
      </div>
    );
  }
  if (overview.status === 'not_set_up') {
    return (
      <div className="min-w-0 space-y-4" data-familiarisation="legacy">
        {header()}
        <Suspense fallback={<PageLoading variant="list" rows={4} label="Loading familiarisation" />}>
          <LegacyFamiliarisation vesselId={vessel.id} notice={overview.notice} />
        </Suspense>
      </div>
    );
  }
  if (overview.status === 'denied') {
    return <AccessDenied title="You can't see familiarisation on this vessel" detail={overview.notice ?? undefined} />;
  }
  if (overview.status === 'not_found') {
    return <PageEmpty title="This vessel could not be found" body="It may have been archived, or you no longer reach it." />;
  }
  if (overview.status === 'error') {
    return (
      <div className="min-w-0 space-y-4">
        {header()}
        <PageError error={overview.error} title="Familiarisation could not be loaded" onRetry={overview.retry} treatMissingAsOff={false} />
      </div>
    );
  }

  const data = overview.data;
  const startable = data.templates.filter((t) => t.applies && t.isActive && t.itemCount > 0);
  const canEditAny = data.canEditTemplates || data.canEditFleetTemplates;
  const actions =
    data.canCreate || canEditAny ? (
      <div className="flex flex-wrap gap-2">
        {canEditAny ? (
          <Button variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={() => setEditor({ template: null })}>
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
            New template
          </Button>
        ) : null}
        {data.canCreate ? (
          <Button className="[@media(pointer:coarse)]:h-11" onClick={() => setStartFor({ templateId: null })} disabled={startable.length === 0}>
            <Play aria-hidden="true" className="mr-2 h-4 w-4" />
            Start familiarisation
          </Button>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="min-w-0 space-y-6" data-familiarisation={all ? 'all' : 'overview'}>
      {header(actions)}
      <Kpis data={data} />
      <TemplatesSection
        data={data}
        onEdit={(template) => setEditor({ template })}
        onStart={data.canCreate ? (template) => setStartFor({ templateId: template.id }) : null}
        onCreate={canEditAny ? () => setEditor({ template: null }) : null}
      />
      <RecordsSection data={data} all={all} />

      {editor ? (
        <Suspense fallback={null}>
          <TemplateEditorDialog
            vessel={vessel}
            template={editor.template}
            canEditVessel={data.canEditTemplates}
            canEditFleet={data.canEditFleetTemplates}
            fleetTemplates={data.templates.filter((t) => t.scope === 'fleet' && t.isActive && !t.replacedByVariant)}
            onOpenChange={(open) => !open && setEditor(null)}
          />
        </Suspense>
      ) : null}
      {startFor ? (
        <Suspense fallback={null}>
          <StartFamiliarisationDialog
            vessel={vessel}
            templates={startable}
            members={data.members}
            templateId={startFor.templateId}
            onOpenChange={(open) => !open && setStartFor(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

const Kpis: React.FC<{ data: FamiliarisationOverview }> = ({ data }) => {
  const live = data.templates.filter((t) => t.applies);
  const sum = (pick: (t: FamiliarisationTemplate) => number) => live.reduce((n, t) => n + pick(t), 0);
  return (
    <KpiGrid className="lg:grid-cols-4 min-[1440px]:grid-cols-4" data-familiarisation-kpis="">
      <KpiTile label="Completed" icon={CheckCircle2} value={sum((t) => t.completed)} state="ready" tone="ok" sub="People who finished a template" />
      <KpiTile label="In progress" icon={Clock} value={sum((t) => t.inProgress)} state="ready" tone="signal" sub="Open, ticking or awaiting signatures" />
      <KpiTile label="Overdue" icon={AlertTriangle} value={sum((t) => t.overdue)} state="ready" tone={sum((t) => t.overdue) > 0 ? 'danger' : undefined} sub="Past their due date" />
      <KpiTile
        label="Missing"
        icon={UserX}
        value={sum((t) => t.missing)}
        state="ready"
        tone={sum((t) => t.missing) > 0 ? 'warn' : undefined}
        sub="Required by position, not completed"
      />
    </KpiGrid>
  );
};

function scopeLabel(t: FamiliarisationTemplate): { label: string; tone: 'info' | 'neutral' | 'signal' } {
  if (t.scope === 'fleet') return { label: 'Fleet', tone: 'info' };
  if (t.variantOf) return { label: 'Vessel version', tone: 'signal' };
  return { label: 'This vessel', tone: 'neutral' };
}

const TemplatesSection: React.FC<{
  data: FamiliarisationOverview;
  onEdit: (t: FamiliarisationTemplate) => void;
  onStart: ((t: FamiliarisationTemplate) => void) | null;
  onCreate: (() => void) | null;
}> = ({ data, onEdit, onStart, onCreate }) => {
  const canEdit = (t: FamiliarisationTemplate) => (t.scope === 'fleet' ? data.canEditFleetTemplates : data.canEditTemplates);
  const columns: DataTableColumn<FamiliarisationTemplate>[] = [
    {
      id: 'name',
      header: 'Template',
      value: (t) => t.name,
      minWidth: 220,
      cell: (t) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{t.name}</span>
          <span className="type-caption text-muted-foreground">
            {t.code ? <span className="type-mono">{t.code}</span> : null}
            {t.code ? ' · ' : null}
            {t.itemCount} {t.itemCount === 1 ? 'item' : 'items'}
            {t.dueWithinDays !== null ? ` · due within ${t.dueWithinDays} ${t.dueWithinDays === 1 ? 'day' : 'days'}` : ''}
          </span>
          {/* Phones: the counts under the name (the count columns scroll in the card). */}
          <span className="type-caption text-muted-foreground sm:hidden" data-template-counts="">
            {t.completed} completed · {t.inProgress} in progress{t.overdue ? ` · ${t.overdue} overdue` : ''}
            {t.missing ? ` · ${t.missing} missing` : ''}
          </span>
        </span>
      ),
    },
    {
      id: 'scope',
      header: 'Used on',
      value: (t) => scopeLabel(t).label,
      cell: (t) => {
        const s = scopeLabel(t);
        return <StatusPill tone={s.tone} label={s.label} icon={null} size="sm" />;
      },
    },
    {
      id: 'positions',
      header: 'Required for',
      minWidth: 140,
      value: (t) => t.positionIds.length,
      cell: (t) => (t.positionIds.length === 0 ? 'Started by hand' : `${t.positionIds.length} ${t.positionIds.length === 1 ? 'position' : 'positions'}`),
    },
    { id: 'completed', header: 'Completed', kind: 'number', value: (t) => t.completed },
    { id: 'inProgress', header: 'In progress', kind: 'number', value: (t) => t.inProgress },
    { id: 'overdue', header: 'Overdue', kind: 'number', value: (t) => t.overdue },
    { id: 'missing', header: 'Missing', kind: 'number', value: (t) => t.missing },
    {
      id: 'state',
      header: 'State',
      value: (t) => (t.replacedByVariant ? 'Replaced' : t.isActive ? 'In use' : 'Not in use'),
      cell: (t) =>
        t.replacedByVariant ? (
          <StatusPill tone="neutral" label="Replaced by the vessel's version" icon={null} size="sm" />
        ) : t.isActive ? (
          <StatusPill tone="ok" label="In use" size="sm" />
        ) : (
          <StatusPill tone="neutral" label="Not in use" icon={null} size="sm" />
        ),
    },
  ];
  return (
    <section aria-labelledby="fam-templates-heading" className="min-w-0 space-y-3">
      <h2 id="fam-templates-heading" className="type-title text-foreground">
        Templates
      </h2>
      <DataTable
        data={data.templates}
        columns={columns}
        getRowId={(t) => t.id}
        label="Familiarisation templates"
        noun={{ one: 'template', other: 'templates' }}
        searchable={data.templates.length > 6}
        searchPlaceholder="Search templates"
        rowClassName={(t) => (t.applies ? undefined : 'text-muted-foreground')}
        onRowClick={(t) => (canEdit(t) ? onEdit(t) : undefined)}
        rowActions={(t) => (
          <span className="flex items-center gap-1">
            {onStart && t.applies && t.isActive && t.itemCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="[@media(pointer:coarse)]:h-11"
                onClick={() => onStart(t)}
                aria-label={`Start ${t.name} for a crew member`}
                data-row-action=""
              >
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {canEdit(t) ? (
              <Button variant="ghost" size="sm" className="[@media(pointer:coarse)]:h-11" onClick={() => onEdit(t)} aria-label={`Edit ${t.name}`} data-row-action="">
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </span>
        )}
        empty={{
          icon: ClipboardList,
          title: 'No familiarisation templates yet',
          body: onCreate
            ? 'Start from a STORM preset (24-hour safety, two-week vessel familiarisation) or a blank template.'
            : 'The vessel or the fleet office adds the templates; ask them for one.',
          action: onCreate ? (
            <Button className="[@media(pointer:coarse)]:h-11" onClick={onCreate}>
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
              New template
            </Button>
          ) : undefined,
        }}
      />
    </section>
  );
};

const RecordsSection: React.FC<{ data: FamiliarisationOverview; all: boolean }> = ({ data, all }) => {
  const scopedPath = useScopedPath();
  const navigate = useNavigate();
  const base = scopedPath(CREW_PATHS.familiarisation);
  const columns: DataTableColumn<FamiliarisationRecordSummary>[] = [
    {
      id: 'person',
      header: 'Crew member',
      value: (r) => personName(r),
      minWidth: 180,
      cell: (r) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <Link
            to={scopedPath(familiarisationRecordPath(r.id))}
            className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-ring"
            data-row-action=""
          >
            {personName(r)}
          </Link>
          {/* Phones: status and progress under the name (the other columns scroll in the card). */}
          <span className="flex items-center gap-1.5 sm:hidden">
            <StatusPill domain="familiarization" status={r.overdue ? 'overdue' : r.status} size="sm" />
            <span className="type-caption tabular-nums text-muted-foreground">
              {r.itemsDone}/{r.itemsTotal}
            </span>
          </span>
        </span>
      ),
    },
    { id: 'template', header: 'Template', value: (r) => r.templateName, minWidth: 180 },
    {
      id: 'status',
      header: 'Status',
      value: (r) => (r.overdue ? 'overdue' : r.status),
      cell: (r) => <StatusPill domain="familiarization" status={r.overdue ? 'overdue' : r.status} size="sm" />,
    },
    {
      id: 'progress',
      header: 'Progress',
      value: (r) => progressPercent(r.itemsDone, r.itemsTotal),
      minWidth: 140,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <Progress value={progressPercent(r.itemsDone, r.itemsTotal)} className="h-1.5 w-16 shrink-0" aria-hidden="true" />
          <span className="type-caption tabular-nums text-muted-foreground">
            {r.itemsDone} of {r.itemsTotal}
          </span>
        </span>
      ),
    },
    { id: 'due', header: 'Due', kind: 'date', value: (r) => r.dueDate, cell: (r) => formatDateOnly(r.dueDate) },
    { id: 'completed', header: 'Completed', kind: 'date', value: (r) => r.completedOn, cell: (r) => formatDateOnly(r.completedOn), emptyReason: 'Not completed yet' },
  ];
  const more = !all && data.recordsTotal > data.records.length;
  return (
    <section aria-labelledby="fam-records-heading" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fam-records-heading" className="type-title text-foreground">
          {all ? 'All forms' : 'Recent forms'}
        </h2>
        {more ? (
          <Link to={`${base}?all=1`} className="rounded-sm type-body font-medium text-primary underline-offset-4 hover:underline focus-ring" data-fam-view-all="">
            View all ({data.recordsTotal.toLocaleString('en-GB')})
          </Link>
        ) : all ? (
          <Link to={base} className="rounded-sm type-body font-medium text-primary underline-offset-4 hover:underline focus-ring">
            Show recent only
          </Link>
        ) : null}
      </div>
      <DataTable
        data={data.records}
        columns={columns}
        getRowId={(r) => r.id}
        label={all ? 'All familiarisation forms' : 'Recent familiarisation forms'}
        noun={{ one: 'form', other: 'forms' }}
        searchable={all}
        searchPlaceholder="Search by name or template"
        defaultSort={all ? { columnId: 'due', direction: 'desc' } : null}
        onRowClick={(r) => navigate(scopedPath(familiarisationRecordPath(r.id)))}
        pageSize={all ? 50 : undefined}
        empty={{
          icon: ClipboardList,
          title: 'No familiarisation forms yet',
          body: 'A form opens when someone joins in a position a template is required for, or when one is started by hand.',
        }}
      />
      {all && data.recordsTotal > data.records.length ? (
        <p className="type-caption text-muted-foreground">
          Showing the latest {data.records.length.toLocaleString('en-GB')} of {data.recordsTotal.toLocaleString('en-GB')} forms.
        </p>
      ) : null}
    </section>
  );
};

export default FamiliarisationPage;
