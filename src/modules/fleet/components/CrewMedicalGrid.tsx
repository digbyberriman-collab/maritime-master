/**
 * The crew medical grid (gap/02 M1, W8; gap/04 C61; D-X5-08; X5-08): one
 * row per current crew member with ENG1, vaccinations, boosters, rest over
 * 30 days, health checks, the condition / allergy flags the viewer may see,
 * and a rolled-up status (Critical, At risk, Incomplete, Up to date) whose
 * reasons are shown as chips, so every status explains itself. Most severe
 * first.
 *
 * One component for both pages:
 * - Fleet › Medical (no `vesselId`): the vessels shown (the fleet's
 *   "Vessels shown" filter, `?vessels=`; `?vessel=<code>` is accepted as a
 *   link to one vessel and turned into it); the default sends no ids, so
 *   the server counts the caller's counted vessels (D-X5-22);
 * - Vessel › Crew › Crew Medical (`vesselId`): that vessel only (the vessel
 *   comes from the URL scope, never a name filter).
 *
 * - KPI tiles per status, each a link that filters the list to it (and
 *   back); the status filter is in the URL (`?status=`), so a link
 *   reproduces the view. Search narrows by name, position, department,
 *   vessel or reason.
 * - A DataTable from 768 px (sticky name column, sortable, most severe
 *   first), cards below.
 * - "How the status is worked out": the W8 rules with the company's own
 *   settings and alert windows, never hidden rules.
 * - Export (CSV, Excel) of the rows shown through the export engine,
 *   logged first; it holds personal data, so it is refused while the export
 *   log is not set up (D-X5-12); vessel-scoped on the vessel page.
 * - One freshness stamp with Refresh in the page header (D-88).
 * - D-01: the RPC missing → "Fleet medical status is not set up yet"; any
 *   other failure → PageError with Retry (a vessel out of reach has its own
 *   sentence); never sample rows.
 *
 * The page gates before it mounts the grid (deny while loading, AccessDenied
 * when denied), so the grid reads as soon as it renders. Tokens only; 44 px
 * targets on coarse pointers; usable at 390 px.
 */
import * as React from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ClipboardList, FileQuestion, RefreshCw, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TONE_TEXT } from '@/components/ui/tones';
import type { Json } from '@/integrations/supabase/types';
import { runExport } from '@/lib/export';
import { cn } from '@/lib/utils';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { DataTable, KpiTile, SearchField, type DataTableColumn } from '@/shared/components/data';
import { ExportMenu } from '@/shared/components/data/ExportMenu';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import PageHeader from '@/shared/components/layout/PageHeader';
import { EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { ExpiryPill, StatusPill } from '@/shared/components/status';
import { statusMeta } from '@/shared/components/status/statusTone';
import { fromDateOnly, todayDateOnly } from '@/shared/lib/form';
import { useExpiryWindowRules } from '../hooks/useExpiryWindowRules';
import { useFleetVesselsShown } from '../hooks/useFleetVesselsShown';
import {
  MEDICAL_EXPORT_COLUMNS,
  fleetMedicalKeys,
  useFleetMedicalSettings,
  useFleetMedicalStatus,
  type CrewMedicalRow,
  type FleetMedicalScope,
  type MedicalSettingsState,
} from '../hooks/useFleetMedicalStatus';
import { ASSESSMENT_TYPE_LABELS } from '../lib/medicalSettingsSchema';
import {
  ENG1_STATE_LABELS,
  MEDICAL_REASONS,
  MEDICAL_REASON_HELP,
  MEDICAL_REASON_LABELS,
  MEDICAL_REASON_LEVEL,
  MEDICAL_STATUSES,
  compareMedicalRows,
  parseMedicalStatusParam,
  tallyMedicalStatus,
  type MedicalReasonLevel,
  type MedicalStatus,
} from '../lib/medicalStatus';
import { VESSELS_SHOWN_PARAM } from '../lib/vesselsShown';
import { FleetVesselsFilter } from './FleetVesselsFilter';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

/** The URL parameters of the grid. */
export const MEDICAL_GRID_PARAMS = {
  status: 'status',
  /** A link to one vessel on the fleet grid (turned into `?vessels=`). */
  vessel: 'vessel',
} as const;

export interface CrewMedicalGridProps {
  /** The vessel the grid is for (vessel Crew Medical); omitted on Fleet › Medical, which shows the vessels shown. */
  vesselId?: string | null;
  /** That vessel's code (links and the export file name). */
  vesselCode?: string | null;
  /** That vessel's name (the empty state). */
  vesselName?: string | null;
  /** The page heading; the grid adds the one freshness stamp and Refresh (D-88). */
  header: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode };
  /** More header actions (Medical settings). */
  actions?: React.ReactNode;
  /** Whether the viewer may export (the page's export key). */
  canExport: boolean;
}

// ─── Formatting ───────────────────────────────────────────────────────────

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const FRESHNESS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** `yyyy-MM-dd` as "12 Dec 2026" (local calendar day); null when not a date. */
function formatDay(value: string | null | undefined): string | null {
  const date = fromDateOnly(value);
  return date ? DATE_FORMAT.format(date) : null;
}

/** The D-88 freshness stamp. */
const formatUpdated = (at: number): string => `Updated ${FRESHNESS_FORMAT.format(at)} UTC`;

const plural = (n: number, one: string, other = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : other}`;

const STATUS_LABEL = (status: MedicalStatus) => statusMeta('medical_status', status).label;

const TILE: Readonly<Record<MedicalStatus, { icon: typeof AlertOctagon; hint: string }>> = {
  critical: { icon: AlertOctagon, hint: 'ENG1, a required vaccine or a serious rest breach' },
  at_risk: { icon: AlertTriangle, hint: 'Expiring soon, boosters, rest or health checks' },
  incomplete: { icon: FileQuestion, hint: 'Records missing to judge by' },
  ok: { icon: CheckCircle2, hint: 'Nothing to act on' },
};

// ─── Cells ────────────────────────────────────────────────────────────────

function ReasonChips({ row, className }: { row: CrewMedicalRow; className?: string }) {
  if (!row.reasons.length) return <span className="type-caption text-muted-foreground">Nothing to act on</span>;
  return (
    <ul className={cn('flex flex-wrap gap-1', className)} aria-label={`Why ${STATUS_LABEL(row.status).toLowerCase()}`}>
      {row.reasons.map((reason) => (
        <li key={reason}>
          <StatusPill domain="medical_status" status={MEDICAL_REASON_LEVEL[reason]} label={MEDICAL_REASON_LABELS[reason]} data-reason={reason} />
        </li>
      ))}
    </ul>
  );
}

function Eng1Cell({ row, today }: { row: CrewMedicalRow; today: string }) {
  const equivalent = row.eng1IsEquivalent ? <span className="type-caption text-muted-foreground">Accepted equivalent</span> : null;
  let pill: React.ReactNode;
  switch (row.eng1State) {
    case 'unfit':
      pill = <StatusPill tone="danger">{ENG1_STATE_LABELS.unfit}</StatusPill>;
      break;
    case 'missing':
      pill = row.hasHealthRecord ? <StatusPill tone="danger">{ENG1_STATE_LABELS.missing}</StatusPill> : <StatusPill tone="neutral">Not known</StatusPill>;
      break;
    case 'no_expiry':
      pill = <StatusPill tone="info">{ENG1_STATE_LABELS.no_expiry}</StatusPill>;
      break;
    default:
      pill = <ExpiryPill bucket={row.eng1State} expiresOn={row.eng1ExpiresOn} today={today} />;
  }
  return (
    <span className="flex flex-col items-start gap-0.5">
      {pill}
      {equivalent}
    </span>
  );
}

function VaccinesCell({ row }: { row: CrewMedicalRow }) {
  if (row.vaccinesValid === null) return <span className="text-muted-foreground">No health record</span>;
  const parts: React.ReactNode[] = [
    <span key="valid" className="tabular-nums">
      {row.vaccinesValid} valid
    </span>,
  ];
  if ((row.vaccinesExpired ?? 0) > 0) {
    parts.push(
      <span key="expired" className={cn('font-medium tabular-nums', TONE_TEXT.danger)}>
        {row.vaccinesExpired} expired
      </span>,
    );
  }
  if ((row.vaccinesMissing ?? 0) > 0) {
    parts.push(
      <span key="missing" className={cn('font-medium tabular-nums', TONE_TEXT.danger)}>
        {row.vaccinesMissing} missing
      </span>,
    );
  }
  if ((row.boostersDue ?? 0) > 0) {
    parts.push(
      <span key="boosters" className={cn('font-medium tabular-nums', TONE_TEXT.warn)}>
        {plural(row.boostersDue ?? 0, 'booster')} due
      </span>,
    );
  }
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <span aria-hidden="true" className="text-muted-foreground">·</span> : null}
          {part}
        </React.Fragment>
      ))}
    </span>
  );
}

function RestCell({ row }: { row: CrewMedicalRow }) {
  if (!row.restTracked || row.restNoncompliant30d === null) {
    return (
      <span className="text-muted-foreground" title="No app login, or Hours of Rest is off on this vessel">
        Not tracked
      </span>
    );
  }
  const serious = row.seriousRestBreach30d ?? 0;
  const days = row.restNoncompliant30d;
  if (!days && !serious) return <span className="text-muted-foreground">No breaches</span>;
  return (
    <span className="flex flex-col text-sm">
      {serious > 0 ? <span className={cn('font-medium tabular-nums', TONE_TEXT.danger)}>{plural(serious, 'serious breach', 'serious breaches')}</span> : null}
      <span className={cn('tabular-nums', serious > 0 ? 'text-muted-foreground' : cn('font-medium', TONE_TEXT.warn))}>{plural(days, 'breach day')}</span>
    </span>
  );
}

function HealthCheckCell({ row }: { row: CrewMedicalRow }) {
  const due = formatDay(row.occHealthDueOn);
  switch (row.occHealthState) {
    case null:
      return <span className="text-muted-foreground">No health record</span>;
    case 'overdue':
      return <StatusPill tone="warn">{due ? `Overdue since ${due}` : 'Overdue'}</StatusPill>;
    case 'none':
      return <StatusPill tone="info">None on file</StatusPill>;
    default:
      return <span className="text-sm text-muted-foreground">{due ? `Next due ${due}` : 'Up to date'}</span>;
  }
}

function FlagsCell({ row }: { row: CrewMedicalRow }) {
  if (row.conditionFlag === null && row.allergyFlag === null) {
    return (
      <span className="text-muted-foreground" title="Shown to medical staff, or when the person shares safety flags">
        Not shared
      </span>
    );
  }
  if (!row.conditionFlag && !row.allergyFlag) return <span className="text-muted-foreground">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {row.conditionFlag ? (
        <StatusPill tone="info" icon={null}>
          Condition
        </StatusPill>
      ) : null}
      {row.allergyFlag ? (
        <StatusPill tone="info" icon={null}>
          Allergy
        </StatusPill>
      ) : null}
    </span>
  );
}

function PersonCell({ row, profileHref }: { row: CrewMedicalRow; profileHref: string | null }) {
  const sub = [row.position, row.department].filter(Boolean).join(' · ');
  const joining = formatDay(row.joinDate);
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      {profileHref ? (
        <Link to={profileHref} className="focus-ring rounded-sm font-medium text-foreground underline-offset-4 hover:underline">
          {row.personName}
        </Link>
      ) : (
        <span className="font-medium text-foreground">{row.personName}</span>
      )}
      {sub ? <span className="type-caption text-muted-foreground">{sub}</span> : null}
      {row.isPlanned ? (
        <StatusPill tone="signal" icon={null}>
          {joining ? `Joining ${joining}` : 'Joining'}
        </StatusPill>
      ) : null}
    </span>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────

function searchText(row: CrewMedicalRow): string {
  return [row.personName, row.position, row.department, row.vesselName, STATUS_LABEL(row.status), ...row.reasons.map((r) => MEDICAL_REASON_LABELS[r])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const LEVEL_HEADINGS: Readonly<Record<MedicalReasonLevel, string>> = {
  critical: 'Critical when',
  at_risk: 'At risk when',
  incomplete: 'Incomplete when',
};

/** The W8 rules, with the company's settings and windows. */
function RulesPanel({ settings, medicalWindow, vaccinationWindow }: { settings: MedicalSettingsState; medicalWindow: number | null; vaccinationWindow: number | null }) {
  const ready = settings.state === 'ready' ? settings : null;
  const types = ready ? ready.settings.eng1Types.map((t) => ASSESSMENT_TYPE_LABELS[t]).join(', ') : null;
  const equivalents = ready ? ready.settings.equivalentTypes.map((t) => ASSESSMENT_TYPE_LABELS[t]).join(', ') : null;
  const vaccines = ready ? ready.settings.requiredVaccines.join(', ') : null;
  const atRiskDays = medicalWindow === null ? 30 : Math.min(30, medicalWindow);
  return (
    <details className="group rounded-lg border border-border bg-card text-card-foreground" data-testid="medical-rules">
      <summary className={cn('focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium', COARSE)}>
        How the status is worked out
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-quick group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-3 text-sm">
        <div className="grid gap-4 md:grid-cols-3">
          {(['critical', 'at_risk', 'incomplete'] as const).map((level) => (
            <section key={level} aria-label={LEVEL_HEADINGS[level]}>
              <h3 className="mb-1 flex items-center gap-2 font-medium text-foreground">
                <StatusPill domain="medical_status" status={level} />
                <span>when</span>
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {MEDICAL_REASONS.filter((r) => MEDICAL_REASON_LEVEL[r] === level).map((r) => (
                  <li key={r}>{MEDICAL_REASON_HELP[r]}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="type-caption">Counts as ENG1</dt>
            <dd className="text-foreground">{types ?? '…'}</dd>
          </div>
          <div>
            <dt className="type-caption">Accepted equivalents</dt>
            <dd className="text-foreground">{equivalents === null ? '…' : equivalents || 'None'}</dd>
          </div>
          <div>
            <dt className="type-caption">Required vaccines</dt>
            <dd className="text-foreground">{vaccines === null ? '…' : vaccines || 'None set'}</dd>
          </div>
          <div>
            <dt className="type-caption">Alert windows</dt>
            <dd className="text-foreground">
              {`ENG1 at risk within ${atRiskDays} days; boosters due within ${vaccinationWindow ?? 90} days (Reports › Alert windows)`}
            </dd>
          </div>
        </dl>
        {ready?.source === 'not_set_up' ? (
          <p className="type-caption text-muted-foreground">Medical settings are not set up yet, so the defaults apply.</p>
        ) : null}
        <p className="type-caption text-muted-foreground">
          Medical fitness and vaccinations come from Health, rest from Hours of Rest. Only dates and states are shown here, never clinical details.
        </p>
      </div>
    </details>
  );
}

function StatusTiles({
  rows,
  active,
  hrefFor,
}: {
  rows: readonly CrewMedicalRow[] | null;
  active: MedicalStatus | null;
  hrefFor: (status: MedicalStatus) => string;
}) {
  const tally = rows ? tallyMedicalStatus(rows) : null;
  const total = rows?.length ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Crew by medical status">
      {MEDICAL_STATUSES.map((status) => {
        const meta = statusMeta('medical_status', status);
        const n = tally ? tally[status] : null;
        const selected = active === status;
        return (
          <KpiTile
            key={status}
            label={meta.label}
            icon={TILE[status].icon}
            value={n}
            state={tally ? 'ready' : 'loading'}
            tone={status === 'ok' ? undefined : n ? meta.tone : undefined}
            href={hrefFor(status)}
            sub={
              selected ? (
                <span className="font-medium text-primary">Shown below · select again for everyone</span>
              ) : total ? (
                `${Math.round(((n ?? 0) / total) * 100)}% of ${plural(total, 'person', 'people')}`
              ) : (
                TILE[status].hint
              )
            }
            className={cn('min-h-[116px]', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
          />
        );
      })}
    </div>
  );
}

function MedicalCards({ rows, today, profileHref, showVessel }: { rows: readonly CrewMedicalRow[]; today: string; profileHref: (r: CrewMedicalRow) => string | null; showVessel: boolean }) {
  return (
    <ul className="space-y-3" aria-label="Crew medical status">
      {rows.map((row) => (
        <li key={row.profileId}>
          <Card className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <PersonCell row={row} profileHref={profileHref(row)} />
                {showVessel ? <p className="type-caption mt-0.5 text-muted-foreground">{row.vesselName}</p> : null}
              </div>
              <StatusPill domain="medical_status" status={row.status} size="md" />
            </div>
            <ReasonChips row={row} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3">
              {/* The ENG1 and health check pills carry a date: full width, never cut. */}
              <div className="col-span-2 min-w-0">
                <dt className="type-caption text-muted-foreground">ENG1</dt>
                <dd>
                  <Eng1Cell row={row} today={today} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="type-caption text-muted-foreground">Vaccinations</dt>
                <dd>
                  <VaccinesCell row={row} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="type-caption text-muted-foreground">Rest, 30 days</dt>
                <dd className="text-sm">
                  <RestCell row={row} />
                </dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="type-caption text-muted-foreground">Health check</dt>
                <dd className="text-sm">
                  <HealthCheckCell row={row} />
                </dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="type-caption text-muted-foreground">Condition / allergy</dt>
                <dd className="text-sm">
                  <FlagsCell row={row} />
                </dd>
              </div>
            </dl>
          </Card>
        </li>
      ))}
    </ul>
  );
}

// ─── The grid ─────────────────────────────────────────────────────────────

const ALL = '__all__';
const NO_ROWS: readonly CrewMedicalRow[] = [];

/** The crew medical grid: for one vessel with `vesselId`, else for the fleet's vessels shown. */
export function CrewMedicalGrid(props: CrewMedicalGridProps) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  if (props.vesselId) {
    const scope = companyId ? { companyId, vesselIds: [props.vesselId] } : null;
    return <MedicalGridBody {...props} companyId={companyId} scope={scope} exportVessels={[props.vesselCode ?? null]} />;
  }
  return <FleetMedicalGrid {...props} companyId={companyId} />;
}

/** The fleet grid: the vessels shown (`?vessels=`; a `?vessel=<code>` link becomes `?vessels=<code>`, with no history entry). */
function FleetMedicalGrid(props: CrewMedicalGridProps & { companyId: string | null }) {
  const shown = useFleetVesselsShown();
  const [params, setParams] = useSearchParams();
  const ready = shown.status === 'ready' ? shown : null;
  const linkedVessel = params.get(MEDICAL_GRID_PARAMS.vessel);
  React.useEffect(() => {
    if (!linkedVessel) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(MEDICAL_GRID_PARAMS.vessel);
        if (!next.get(VESSELS_SHOWN_PARAM)) next.set(VESSELS_SHOWN_PARAM, linkedVessel.toLowerCase());
        return next;
      },
      { replace: true },
    );
  }, [linkedVessel, setParams]);

  const { companyId } = props;
  const scope = React.useMemo<FleetMedicalScope | null>(
    // The default sends no ids: the server counts the caller's counted vessels (D-X5-22).
    () => (companyId && ready && !linkedVessel ? { companyId, vesselIds: ready.isDefault ? null : ready.shownIds } : null),
    [companyId, ready, linkedVessel],
  );
  const vesselFilter = ready ? (
    <div className="flex flex-col gap-1">
      <span className="type-caption text-muted-foreground">Vessels</span>
      <FleetVesselsFilter
        vessels={ready.vessels}
        selectedIds={ready.shownIds}
        countedIds={ready.countedIds}
        fleetGroups={ready.fleetGroups}
        droppedCodes={ready.droppedCodes}
        onApply={ready.setShown}
      />
    </div>
  ) : null;
  return (
    <MedicalGridBody
      {...props}
      scope={scope}
      scopeError={shown.status === 'error' ? { error: shown.error, retry: shown.retry } : null}
      vesselFilter={vesselFilter}
      exportVessels={ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted'}
    />
  );
}

interface MedicalGridBodyProps extends CrewMedicalGridProps {
  companyId: string | null;
  /** null while the vessels are not known yet (no request). */
  scope: FleetMedicalScope | null;
  /** The vessels could not be loaded. */
  scopeError?: { error: unknown; retry: () => void } | null;
  /** The "Vessels shown" control (the fleet grid). */
  vesselFilter?: React.ReactNode;
  /** The vessels logged with an export (codes, or `counted`). */
  exportVessels: Json;
}

function MedicalGridBody({
  vesselId = null,
  vesselCode = null,
  vesselName = null,
  header,
  actions,
  canExport,
  companyId,
  scope,
  scopeError = null,
  vesselFilter = null,
  exportVessels,
}: MedicalGridBodyProps) {
  const vesselMode = Boolean(vesselId);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const today = todayDateOnly();
  const [search, setSearch] = React.useState('');

  const status = useFleetMedicalStatus(scope);
  const settings = useFleetMedicalSettings(companyId);
  const windows = useExpiryWindowRules(companyId);
  const medicalWindow = windows.state === 'ready' || windows.state === 'not_set_up' ? windows.windowFor({ itemType: 'medical' }) : null;
  const vaccinationWindow = windows.state === 'ready' || windows.state === 'not_set_up' ? windows.windowFor({ itemType: 'vaccination' }) : null;

  const queryClient = useQueryClient();
  const medicalPrefix = fleetMedicalKeys.all(companyId);
  const refreshing = useIsFetching({ queryKey: medicalPrefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: medicalPrefix });

  const activeStatus = parseMedicalStatusParam(params.get(MEDICAL_GRID_PARAMS.status));
  const setStatus = (next: MedicalStatus | null) =>
    setParams(
      (current) => {
        const out = new URLSearchParams(current);
        if (next) out.set(MEDICAL_GRID_PARAMS.status, next);
        else out.delete(MEDICAL_GRID_PARAMS.status);
        return out;
      },
      { replace: true },
    );
  const hrefFor = (s: MedicalStatus) => {
    const out = new URLSearchParams(params);
    if (activeStatus === s) out.delete(MEDICAL_GRID_PARAMS.status);
    else out.set(MEDICAL_GRID_PARAMS.status, s);
    const query = out.toString();
    return query ? `${location.pathname}?${query}` : location.pathname;
  };

  const allRows = status.state === 'ready' ? status.data : NO_ROWS;
  const needle = search.trim().toLowerCase();
  const rows = React.useMemo(
    () => allRows.filter((r) => (!activeStatus || r.status === activeStatus) && (!needle || searchText(r).includes(needle))),
    [allRows, activeStatus, needle],
  );
  const filtered = Boolean(activeStatus || needle);
  const clearFilters = () => {
    setSearch('');
    setStatus(null);
  };

  const profileHref = React.useCallback(
    (row: CrewMedicalRow) => {
      const code = vesselMode ? vesselCode : row.vesselCode;
      return code ? vesselPath(code, `crew/people/${row.profileId}`) : null;
    },
    [vesselMode, vesselCode],
  );

  const columns = React.useMemo<ReadonlyArray<DataTableColumn<CrewMedicalRow>>>(() => {
    const cols: DataTableColumn<CrewMedicalRow>[] = [
      {
        id: 'person',
        header: 'Crew member',
        value: (r) => r.personName,
        cell: (r) => <PersonCell row={r} profileHref={profileHref(r)} />,
        sticky: true,
        minWidth: 184,
      },
    ];
    if (!vesselMode) cols.push({ id: 'vessel', header: 'Vessel', value: (r) => r.vesselName, minWidth: 104 });
    cols.push(
      {
        id: 'status',
        header: 'Status',
        value: (r) => STATUS_LABEL(r.status),
        compare: compareMedicalRows,
        // The status and the reasons behind it, in one cell: the pill, then a
        // chip per reason (most severe first).
        cell: (r) => (
          <div className="flex flex-col items-start gap-1.5">
            <StatusPill domain="medical_status" status={r.status} />
            {r.reasons.length ? <ReasonChips row={r} /> : null}
          </div>
        ),
        minWidth: 220,
      },
      { id: 'eng1', header: 'ENG1', cell: (r) => <Eng1Cell row={r} today={today} />, sortable: false, minWidth: 150 },
      { id: 'vaccines', header: 'Vaccinations', cell: (r) => <VaccinesCell row={r} />, sortable: false, minWidth: 120 },
      { id: 'rest', header: 'Rest, 30 days', cell: (r) => <RestCell row={r} />, sortable: false, minWidth: 116 },
      { id: 'health', header: 'Health check', cell: (r) => <HealthCheckCell row={r} />, sortable: false, minWidth: 128 },
      { id: 'flags', header: 'Condition / allergy', cell: (r) => <FlagsCell row={r} />, sortable: false, minWidth: 112 },
    );
    return cols;
  }, [vesselMode, profileHref, today]);

  const exportMenu = (
    <ExportMenu
      formats={['csv', 'xlsx']}
      disabledReason={
        !canExport
          ? 'Exporting needs medical export access'
          : status.state !== 'ready'
            ? 'Available once the list has loaded'
            : rows.length === 0
              ? 'Nothing to export with these filters'
              : null
      }
      onExport={(format) =>
        runExport({
          format,
          kind: 'Crew medical status',
          sourceKey: 'fleet.crew_medical_status',
          personalData: true,
          vesselId: vesselMode ? vesselId : null,
          vesselCode: vesselMode ? vesselCode : null,
          columns: MEDICAL_EXPORT_COLUMNS,
          rows: [...rows].sort(compareMedicalRows),
          params: { status: activeStatus, vessels: exportVessels, searched: Boolean(needle) },
        })
      }
    />
  );

  const statusFieldId = React.useId();
  const toolbar = (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filter the crew">
      {vesselFilter}
      <div className="flex flex-col gap-1">
        <Label htmlFor={statusFieldId} className="type-caption text-muted-foreground">
          Status
        </Label>
        <Select value={activeStatus ?? ALL} onValueChange={(v) => setStatus(v === ALL ? null : (v as MedicalStatus))}>
          <SelectTrigger id={statusFieldId} className={cn('h-9 w-full sm:w-44', COARSE)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Every status</SelectItem>
            {MEDICAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const headerActions = (
    <>
      {status.state === 'ready' ? (
        <span className="type-caption tabular-nums text-muted-foreground" data-testid="medical-updated">
          {formatUpdated(status.updatedAt)}
        </span>
      ) : null}
      <Button type="button" variant="outline" size="sm" className={COARSE} onClick={refresh} disabled={refreshing || !scope}>
        <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} />
        Refresh
      </Button>
      {actions}
    </>
  );

  let body: React.ReactNode;
  if (scopeError) {
    body = <PageError error={scopeError.error} title="Your vessels could not be loaded" onRetry={scopeError.retry} treatMissingAsOff={false} headingLevel={2} />;
  } else if (status.state === 'not_set_up') {
    body = (
      <PageEmpty
        icon={Stethoscope}
        title="Fleet medical status is not set up yet"
        body="The medical grid appears here once it is switched on for your company. Medical records are still kept in Health."
        headingLevel={2}
        bordered
      />
    );
  } else if (status.state === 'error') {
    body = <PageError error={status.error} title="The medical status could not be loaded" onRetry={status.retry} treatMissingAsOff={false} headingLevel={2} />;
  } else if (status.state === 'no_vessels') {
    body = <EmptyState title="No vessels shown" body="Choose the vessels to show above." headingLevel={2} bordered />;
  } else {
    const loading = status.state !== 'ready';
    let list: React.ReactNode;
    if (loading) {
      list = <PageLoading variant="list" rows={6} label="Loading the medical status" />;
    } else if (allRows.length === 0) {
      list = (
        <EmptyState
          icon={ClipboardList}
          title={vesselMode ? `Nobody is on ${vesselName ?? 'this vessel'}'s crew list` : 'Nobody is on the crew lists of the vessels shown'}
          body="Crew appear here once they are on a vessel's crew list, joining crew included. Medical status is shown only for vessels where you can see medical fitness."
          headingLevel={2}
          bordered
        />
      );
    } else if (wide) {
      list = (
        <DataTable
          label="Crew medical status"
          noun={{ one: 'person', other: 'people' }}
          data={rows}
          columns={columns}
          getRowId={(r) => r.profileId}
          rowLabel={(r) => r.personName}
          search={search}
          onSearchChange={setSearch}
          searchText={searchText}
          searchPlaceholder="Search name, position or reason"
          toolbar={toolbar}
          toolbarEnd={() => exportMenu}
          hasExternalFilters={filtered}
          onClearFilters={clearFilters}
          defaultSort={{ columnId: 'status', direction: 'asc' }}
          showDensityToggle={false}
          maxHeight="70vh"
        />
      );
    } else {
      const sorted = [...rows].sort(compareMedicalRows);
      list = (
        <div className="space-y-3">
          <SearchField value={search} onChange={setSearch} placeholder="Search name, position or reason" className="sm:w-full" />
          {toolbar}
          <div className="flex items-center justify-between gap-2">
            <span className="type-caption tabular-nums text-muted-foreground" aria-live="polite">
              {`${plural(rows.length, 'person', 'people')} of ${allRows.length.toLocaleString('en-GB')}`}
            </span>
            {exportMenu}
          </div>
          {sorted.length === 0 ? (
            <PageEmpty filtered onClearFilters={clearFilters} title="Nobody matches these filters" headingLevel={2} bordered />
          ) : (
            <MedicalCards rows={sorted} today={today} profileHref={profileHref} showVessel={!vesselMode} />
          )}
        </div>
      );
    }
    body = (
      <div className="space-y-4">
        <StatusTiles rows={loading ? null : allRows} active={activeStatus} hrefFor={hrefFor} />
        <RulesPanel settings={settings} medicalWindow={medicalWindow} vaccinationWindow={vaccinationWindow} />
        {list}
        {!loading && allRows.some((r) => r.isPlanned) ? (
          <p className="type-caption text-muted-foreground">Crew who are joining are included and marked with their join date.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={header.eyebrow} title={header.title} description={header.description} actions={headerActions} />
      {body}
    </div>
  );
}

export default CrewMedicalGrid;
