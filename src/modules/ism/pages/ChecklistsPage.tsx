/**
 * Vessel › Safety › Checklists (`/v/:vesselCode/safety/checklists`; gap/02
 * FC1, FC4, FC6, W2; DECISIONS D-01, D-04, D-27, D-88; X5 spec X5-06B).
 * The safety checklists the company offers on this vessel.
 *
 * - The list is `useVesselFormTemplates(vessel, 'safety')` from the Forms
 *   & Checklists module: published templates of the Safety area offered
 *   on the vessel, in the order set for it, with the ones hidden on it
 *   left out. Each row: name, version, how often it is run, its last run
 *   and when it is next due (or that it is overdue); Start opens a new
 *   run, Preview the template.
 * - The tiles come from `form_template_run_stats` for this vessel and
 *   area: checklists available, run today, due in the next 7 days and
 *   overdue. Never a hard-coded number: while run tracking is not set up
 *   the run tiles say so (not enabled); a reader who may not see runs here
 *   is told so; an error has Retry.
 * - D-01: while the area column is not applied, every published template
 *   offered on the vessel is listed, and the page says "Areas are not set
 *   up yet". Any other failure is PageError with Retry, never sample rows.
 * - The page keeps its scope gate (signed in, reaches the vessel, D-27);
 *   the server's row rules decide what is returned. Opened from a legacy
 *   URL with no vessel to show, it asks for a vessel.
 *
 * Tokens only; KpiTile and StatusPill; 44 px targets on coarse pointers;
 * usable at 390 px (rows stack).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, ClipboardList, ListChecks, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useCan } from '@/lib/permissions/useCan';
import { useVesselScope, useScopedPath } from '@/app/router/scopes';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import {
  FORMS_CAPS,
  cadenceLabel,
  fleetFormsPath,
  formatDay,
  formatUpdatedUtc,
  formsKeys,
  lastRunText,
  useFormTemplateRunStats,
  useVesselFormTemplates,
  versionDisplay,
  vesselRunTally,
  type CatalogueTemplate,
} from '@/modules/forms';
import { KpiGrid, KpiTile } from '@/shared/components/data';
import PageHeader from '@/shared/components/layout/PageHeader';
import { EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { todayDateOnly } from '@/shared/lib/form';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

const ChecklistsPage: React.FC = () => {
  const scope = useVesselScope();
  if (!scope) return <NoVessel />;
  return <VesselChecklists key={scope.vessel.id} vesselId={scope.vessel.id} vesselName={scope.vessel.name} />;
};

export default ChecklistsPage;

/** Opened from a legacy URL with no vessel to scope to (D-27): ask for one. */
function NoVessel() {
  const scoped = useScopedPath();
  const target = scoped('safety/checklists');
  return (
    <EmptyState
      headingLevel={1}
      icon={ClipboardList}
      title="Choose a vessel"
      body="Checklists belong to a vessel. Open a vessel to see the checklists its crew use."
      action={
        target !== '/' ? (
          <Button asChild size="sm" className={COARSE}>
            <Link to={target}>Open the vessel's checklists</Link>
          </Button>
        ) : undefined
      }
    />
  );
}

function VesselChecklists({ vesselId, vesselName }: { vesselId: string; vesselName: string }) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const canManage = useCan(FORMS_CAPS.admin);
  const today = todayDateOnly();
  const [search, setSearch] = React.useState('');

  const list = useVesselFormTemplates(vesselId, 'safety');
  const areasSetUp = list.status === 'ready' && list.areasSetUp;
  const stats = useFormTemplateRunStats([vesselId], 'safety', today, areasSetUp);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: formsKeys.company(companyId) });

  const header = (
    <PageHeader
      eyebrow={vesselName}
      title="Checklists"
      description={`The safety checklists the company offers on ${vesselName}, in the order set for this vessel.`}
      actions={
        <>
          {list.status === 'ready' ? (
            <span className="type-caption tabular-nums text-muted-foreground" data-testid="checklists-updated">
              {formatUpdatedUtc(list.updatedAt)}
            </span>
          ) : null}
          <Button type="button" variant="outline" size="sm" className={COARSE} onClick={refresh} disabled={list.status === 'ready' && list.refreshing}>
            <RefreshCw aria-hidden="true" className={cn('h-4 w-4', list.status === 'ready' && list.refreshing && 'motion-safe:animate-spin')} />
            Refresh
          </Button>
          {canManage ? (
            <Button asChild variant="outline" size="sm" className={COARSE}>
              <Link to={fleetFormsPath.area('safety')}>Manage templates</Link>
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (list.status === 'loading') {
    return (
      <div className="space-y-4">
        {header}
        <PageLoading variant="list" label="Loading checklists" />
      </div>
    );
  }
  if (list.status === 'error') {
    return (
      <div className="space-y-4">
        {header}
        <PageError error={list.error} title="The checklists could not be loaded" onRetry={list.retry} treatMissingAsOff={false} />
      </div>
    );
  }

  const templates = list.templates;
  const statsList = stats.status === 'ready' ? stats.stats : [];
  const tally = vesselRunTally(statsList, templates.map((t) => t.id), vesselId, today);
  const term = search.trim().toLowerCase();
  const shown = term ? templates.filter((t) => t.name.toLowerCase().includes(term) || (t.description ?? '').toLowerCase().includes(term)) : templates;

  const runTileState = (): { state?: 'loading' | 'not-enabled' | 'error'; reason?: string } => {
    if (!areasSetUp || stats.status === 'not_set_up') return { state: 'not-enabled', reason: 'Run tracking is not set up yet.' };
    if (stats.status === 'no_access') return { state: 'not-enabled', reason: 'Run history needs checklist access on this vessel.' };
    if (stats.status === 'loading') return { state: 'loading' };
    if (stats.status === 'error') return { state: 'error' };
    return {};
  };
  const run = runTileState();
  const retry = stats.status === 'error' ? stats.retry : undefined;

  return (
    <div className="space-y-4">
      {header}
      {!list.areasSetUp ? (
        <p role="note" className="rounded-md border border-border bg-muted/40 px-3 py-2 type-body-sm text-muted-foreground" data-testid="checklists-areas-not-set-up">
          Areas are not set up yet, so every published form and checklist offered on this vessel is listed here.
        </p>
      ) : null}

      <KpiGrid className="lg:grid-cols-4 min-[1440px]:grid-cols-4">
        <KpiTile label="Checklists available" icon={ListChecks} value={templates.length} zeroLabel="None offered yet" />
        <KpiTile label="Run today" icon={CheckCircle2} value={tally.ranToday} sub={`of ${templates.length.toLocaleString('en-GB')}`} state={run.state} notEnabledReason={run.reason} onRetry={retry} errorMessage="Run history could not be loaded" />
        <KpiTile label="Due in the next 7 days" icon={CalendarClock} value={tally.dueSoon} state={run.state} notEnabledReason={run.reason} onRetry={retry} errorMessage="Run history could not be loaded" />
        <KpiTile
          label="Overdue"
          icon={TriangleAlert}
          value={tally.overdue}
          tone={tally.overdue ? 'danger' : undefined}
          state={run.state}
          notEnabledReason={run.reason}
          onRetry={retry}
          errorMessage="Run history could not be loaded"
          zeroLabel="Nothing overdue"
        />
      </KpiGrid>

      {templates.length === 0 ? (
        <PageEmpty
          title="No checklists on this vessel yet"
          body={
            list.hiddenCount
              ? `${list.hiddenCount.toLocaleString('en-GB')} ${list.hiddenCount === 1 ? 'checklist is' : 'checklists are'} hidden on ${vesselName}.`
              : 'The company has not published a safety checklist for this vessel.'
          }
        />
      ) : (
        <section aria-labelledby="checklists-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="checklists-heading" className="font-display text-base font-semibold text-foreground">
              {`${templates.length.toLocaleString('en-GB')} ${templates.length === 1 ? 'checklist' : 'checklists'}`}
            </h2>
            <div className="relative w-full sm:max-w-xs">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search checklists" placeholder="Search checklists" value={search} onChange={(e) => setSearch(e.target.value)} className={cn('pl-9', COARSE)} />
            </div>
          </div>
          {shown.length === 0 ? (
            <PageEmpty filtered title="No checklist matches" body="Try another word." onClearFilters={() => setSearch('')} />
          ) : (
            <ol aria-label={`Checklists on ${vesselName}`} className="flex flex-col gap-2">
              {shown.map((t, i) => (
                <ChecklistRow key={t.id} template={t} position={term ? null : i + 1} stats={statsList} statsReady={stats.status === 'ready'} vesselId={vesselId} today={today} />
              ))}
            </ol>
          )}
          {list.hiddenCount && canManage ? (
            <p className="type-body-sm text-muted-foreground">{`${list.hiddenCount.toLocaleString('en-GB')} hidden on ${vesselName}. Manage templates shows them.`}</p>
          ) : null}
        </section>
      )}

      <p className="type-body-sm text-muted-foreground">
        <Link to="/ism/forms/submissions" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">
          All submitted forms and checklists
        </Link>
      </p>
    </div>
  );
}

function ChecklistRow({
  template,
  position,
  stats,
  statsReady,
  vesselId,
  today,
}: {
  template: CatalogueTemplate;
  position: number | null;
  stats: ReadonlyArray<{ template_id: string; vessel_id: string; last_run_on: string | null; next_due: string | null; overdue: boolean; hidden: boolean }>;
  statsReady: boolean;
  vesselId: string;
  today: string;
}) {
  const stat = stats.find((s) => s.template_id === template.id && s.vessel_id === vesselId) ?? null;
  const cadence = cadenceLabel(template.cadence);
  const last = stat ? lastRunText(stat.last_run_on, today) : null;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
      <span className="flex min-w-0 items-start gap-3">
        {position ? (
          <span aria-hidden="true" className="mt-0.5 w-6 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
            {position}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block font-medium text-foreground">{template.name}</span>
          {template.description ? <span className="mt-0.5 block line-clamp-2 type-body-sm text-muted-foreground">{template.description}</span> : null}
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-muted-foreground">
            <span className="type-mono rounded-sm border border-input px-1 leading-5">{versionDisplay({ version: template.version, version_label: template.versionLabel })}</span>
            {cadence ? <span>{cadence}</span> : null}
            {statsReady ? <span>{last ? `Last run ${last.toLowerCase() === 'today' || last.toLowerCase() === 'yesterday' ? last.toLowerCase() : last}` : 'No recorded runs'}</span> : null}
            {statsReady && stat?.next_due && !stat.overdue ? <span>{`Next due ${formatDay(stat.next_due)}`}</span> : null}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
        {stat?.overdue ? <StatusPill tone="danger" label={stat.next_due ? `Overdue since ${formatDay(stat.next_due)}` : 'Overdue'} /> : null}
        <Button asChild variant="outline" size="sm" className={COARSE}>
          <Link to={`/ism/forms/templates/${template.id}`} aria-label={`Preview ${template.name}`}>
            Preview
          </Link>
        </Button>
        <Button asChild size="sm" className={COARSE}>
          <Link to={`/ism/forms/new?templateId=${encodeURIComponent(template.id)}`} aria-label={`Start ${template.name}`}>
            Start
          </Link>
        </Button>
      </span>
    </li>
  );
}
