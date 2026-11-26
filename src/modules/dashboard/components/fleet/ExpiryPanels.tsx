/**
 * "Documents and certificates" (gap/02 D9, W9; X5 spec X5-02B): the three
 * ranked expiry lists of `fleet_dashboard_panels` (vessel certificates, crew
 * documents, crew qualifications), most urgent first, "n of m", and "View
 * all" to the filtered report once the report registry knows its key.
 *
 * This file also holds the parts every dashboard panel shares (they are
 * components, so the module stays a component module):
 * - `PanelGroup`: a titled group of cards (h3), one grid.
 * - `PanelCard`: one ranked list (h4) as a region named by its title, with
 *   the count, the "View all" link and honest states: a list switched off on
 *   every vessel shown says so, an untracked source says "Not tracked yet.",
 *   an empty list says what is clear. A list the caller cannot read is not
 *   rendered at all (the server answers `no_access`).
 * - `PanelRows`: the rows, each a link to the record's vessel page where
 *   there is one (44 px rows on touch).
 * - `DaysPill`: "n d overdue", "Due today", "Due in n d".
 *
 * Scope `vessel` (the vessel home): one vessel, so rows leave the vessel
 * name out, and a list whose module is off on the vessel (server
 * `module_off`, or `isModuleOn` false) is left out instead of explained.
 *
 * Tokens only; at 390 px the cards stack.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Award, ChevronRight, FileWarning, GraduationCap, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Tone } from '@/components/ui/tones';
import { cn } from '@/lib/utils';
import { EXPIRY_BUCKETS, type ExpiryBucket } from '@/lib/records/expiry';
import { ExpiryPill, StatusPill } from '@/shared/components/status';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { FleetDashboardPanelsJson, FleetExpiryPanelItem, FleetPanelVessel } from '../../types/db.pending';

// ─── Shared panel parts ─────────────────────────────────────────────────

/** Every ranked list the dashboards show. */
export type PanelListKey =
  | 'vessel_certificates'
  | 'crew_documents'
  | 'crew_qualifications'
  | 'corrective_actions'
  | 'overdue_drills'
  | 'hess'
  | 'insurance'
  | 'surveys'
  | 'work_list';

/** Where the panels are shown and how they link. */
export interface PanelScope {
  /**
   * `fleet`: rows name their vessel and a list switched off on every vessel
   * shown says so. `vessel`: one vessel (the vessel home); rows leave the
   * vessel out and a list whose module is off is not shown.
   */
  scope: 'fleet' | 'vessel';
  /** The "View all" target of a list, or null / undefined for none. */
  viewAllHref?: (list: PanelListKey) => string | null | undefined;
  /**
   * Vessel scope: the vessel's module settings (`vessel_module_settings`
   * keys). A list whose module is off is left out. Omitted on the fleet
   * dashboard, where the server answers per vessel.
   */
  isModuleOn?: (moduleKey: string) => boolean;
}

/** The vessel module each list belongs to (gap/10 W4); null: not switched by a module. */
const LIST_MODULE: Readonly<Record<PanelListKey, string | null>> = {
  vessel_certificates: 'certificates',
  crew_documents: 'crew',
  crew_qualifications: 'crew',
  corrective_actions: 'safety',
  overdue_drills: 'safety',
  hess: 'safety',
  insurance: null,
  surveys: null,
  work_list: 'technical',
};

/** A list's server state as the panels read it. */
type ListState = 'ok' | 'no_access' | 'module_off' | 'not_tracked';

/** Whether a list is shown: never without access; on the vessel home not when its module is off (server or settings). */
function listShown(list: PanelListKey, state: ListState, scope: PanelScope): boolean {
  if (state === 'no_access') return false;
  if (scope.scope === 'vessel') {
    if (state === 'module_off') return false;
    const moduleKey = LIST_MODULE[list];
    if (moduleKey && scope.isModuleOn && !scope.isModuleOn(moduleKey)) return false;
  }
  return true;
}

export interface PanelRow {
  id: string;
  primary: string;
  secondary?: string;
  /** The record's page; the whole row becomes the link. */
  href?: string;
  badge: React.ReactNode;
}

export interface PanelCardProps {
  list: PanelListKey;
  title: string;
  /** A short scope line under the title ("Due in the next 14 days"). */
  hint?: string;
  icon: LucideIcon;
  state: 'ok' | 'module_off' | 'not_tracked';
  /** Every item of the list (the rows are the first few). */
  total?: number;
  rows?: PanelRow[];
  emptyText: string;
  /** What a list switched off on every vessel shown says. */
  offText?: string;
  viewAllHref?: string | null;
  /** A body other than rows (the work list table); the count then names all `total`. */
  children?: React.ReactNode;
  /** What the count counts ("vessel"); default "item". */
  countNoun?: string;
  className?: string;
}

const plural = (n: number, one: string, many: string = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** "1 of 4" while the list is cut short, else "4 items". */
function countLabel(shown: number, total: number, noun: string): string {
  return shown < total ? `${shown.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}` : plural(total, noun);
}

/** One ranked list: a region named by its title. */
export function PanelCard({
  list,
  title,
  hint,
  icon: Icon,
  state,
  total,
  rows = [],
  emptyText,
  offText,
  viewAllHref,
  children,
  countNoun = 'item',
  className,
}: PanelCardProps) {
  const headingId = React.useId();
  const showCount = state === 'ok' && total !== undefined && total > 0;
  return (
    <Card className={cn('flex h-full min-w-0 flex-col', className)} aria-labelledby={headingId} role="region" data-panel={list}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-1 space-y-0 pb-3">
        <div className="min-w-0 flex-1">
          <h4 id={headingId} className="flex min-w-0 items-center gap-2 type-subtitle text-foreground">
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{title}</span>
          </h4>
          {hint ? <p className="type-caption mt-0.5 pl-6 text-muted-foreground">{hint}</p> : null}
        </div>
        {showCount || (state === 'ok' && viewAllHref) ? (
          <div className="flex shrink-0 items-center gap-2">
            {showCount ? (
              <span className="type-caption tabular-nums text-muted-foreground" data-testid="list-count">
                {countLabel(children ? total : rows.length, total, countNoun)}
              </span>
            ) : null}
            {state === 'ok' && viewAllHref ? (
              <Link
                to={viewAllHref}
                className="inline-flex min-h-8 items-center gap-0.5 rounded-sm px-1 type-caption font-medium text-primary underline-offset-2 hover:underline focus-ring [@media(pointer:coarse)]:min-h-11"
                aria-label={`View all ${title.toLocaleLowerCase('en-GB')}`}
              >
                View all
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {state === 'module_off' ? (
          <p className="text-sm text-muted-foreground">{offText ?? 'Switched off on every vessel shown.'}</p>
        ) : state === 'not_tracked' ? (
          <p className="text-sm text-muted-foreground">Not tracked yet.</p>
        ) : children ? (
          children
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <PanelRows rows={rows} />
        )}
      </CardContent>
    </Card>
  );
}

/** The rows of a list; a row with a page is one link (44 px on touch). */
export function PanelRows({ rows }: { rows: readonly PanelRow[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const body = (
          <>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-words text-sm font-medium text-foreground">{row.primary}</p>
              {row.secondary ? <p className="truncate text-xs text-muted-foreground">{row.secondary}</p> : null}
            </div>
            <div className="shrink-0">{row.badge}</div>
          </>
        );
        return (
          <li key={row.id}>
            {row.href ? (
              <Link
                to={row.href}
                className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-quick ease-tide hover:bg-accent/40 focus-ring"
              >
                {body}
              </Link>
            ) : (
              <div className="flex min-h-11 items-center gap-3 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface PanelGroupProps {
  title: string;
  description?: string;
  /** Cards per row: 3 (md 2, xl 3; the default), 2 (from md) or 1. Always one below md. */
  columns?: 1 | 2 | 3;
  className?: string;
  children: React.ReactNode;
}

/** A titled group of panel cards (h3 under the page's h2). Not a landmark: the cards are. */
export function PanelGroup({ title, description, columns = 3, className, children }: PanelGroupProps) {
  const headingId = React.useId();
  return (
    <div role="group" aria-labelledby={headingId} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div>
        <h3 id={headingId} className="type-eyebrow text-muted-foreground">
          {title}
        </h3>
        {description ? <p className="type-caption text-muted-foreground">{description}</p> : null}
      </div>
      {/* flex-1: in a row of groups the cards stretch to the tallest group. */}
      <div className={cn('grid flex-1 grid-cols-1 gap-4', columns >= 2 && 'md:grid-cols-2', columns === 3 && 'xl:grid-cols-3')}>{children}</div>
    </div>
  );
}

/** Days to a due date: overdue in danger, today in orange, within 30 days in warn, later neutral. */
export function DaysPill({ daysLeft, dueLabel = 'Due' }: { daysLeft: number; dueLabel?: string }) {
  if (daysLeft < 0) return <StatusPill tone="danger" label={`${Math.abs(daysLeft)} d overdue`} />;
  if (daysLeft === 0) return <StatusPill tone="orange" label={`${dueLabel} today`} />;
  const tone: Tone = daysLeft <= 30 ? 'warn' : 'neutral';
  return <StatusPill tone={tone} label={`${dueLabel} in ${daysLeft} d`} />;
}

// ─── Row helpers (module-private) ───────────────────────────────────────

const BUCKETS: ReadonlySet<string> = new Set(EXPIRY_BUCKETS);
const asBucket = (value: string): ExpiryBucket | null => (BUCKETS.has(value) ? (value as ExpiryBucket) : null);

/** The vessel's name, or "Fleet" for a fleet-level item. */
function vesselName(v: FleetPanelVessel): string {
  return v.vessel_name ?? (v.vessel_id ? 'Vessel' : 'Fleet');
}

function expiryBadge(item: Pick<FleetExpiryPanelItem, 'bucket' | 'endorsement_state' | 'days_remaining' | 'expires_on'>): React.ReactNode {
  const bucket = asBucket(item.bucket);
  if (item.endorsement_state === 'overdue' && bucket !== 'expired') return <StatusPill tone="danger" label="Endorsement overdue" />;
  if (bucket) return <ExpiryPill bucket={bucket} daysRemaining={item.days_remaining} expiresOn={item.expires_on} />;
  // A bucket this client does not know: shown as written, never guessed.
  return <StatusPill tone="neutral" label={item.bucket} />;
}

function expiryRow(item: FleetExpiryPanelItem, scope: PanelScope): PanelRow {
  const parts = [item.person_name, scope.scope === 'fleet' ? vesselName(item) : null, item.detail];
  return {
    id: `${item.source_key}:${item.record_id}:${item.item_type}`,
    primary: item.label,
    secondary: parts.filter(Boolean).join(' · ') || undefined,
    href: item.link_scope === 'vessel' && item.vessel_code ? vesselPath(item.vessel_code, item.link_rel) : undefined,
    badge: expiryBadge(item),
  };
}

// ─── Documents and certificates ─────────────────────────────────────────

type ExpiryGroups = Extract<FleetDashboardPanelsJson['expiry'], { state: 'ok' }>['groups'];

const EXPIRY_LISTS: ReadonlyArray<{ list: keyof ExpiryGroups & PanelListKey; title: string; icon: LucideIcon; empty: string }> = [
  { list: 'vessel_certificates', title: 'Vessel certificates', icon: Award, empty: 'No certificate expired or expiring.' },
  { list: 'crew_documents', title: 'Crew documents', icon: FileWarning, empty: 'No crew document expired or expiring.' },
  { list: 'crew_qualifications', title: 'Crew qualifications', icon: GraduationCap, empty: 'No qualification expired or expiring.' },
];

export interface ExpiryPanelsProps extends PanelScope {
  expiry: FleetDashboardPanelsJson['expiry'];
}

/** The three expiry lists (D9) as one group; nothing without access. */
export function ExpiryPanels({ expiry, ...scope }: ExpiryPanelsProps) {
  if (expiry.state !== 'ok') return null;
  const lists = EXPIRY_LISTS.filter(({ list }) => listShown(list, 'ok', scope));
  if (lists.length === 0) return null;
  return (
    <PanelGroup title="Documents and certificates" description="Expired first, then by days left">
      {lists.map(({ list, title, icon, empty }) => {
        const group = expiry.groups[list];
        return (
          <PanelCard
            key={list}
            list={list}
            title={title}
            icon={icon}
            state="ok"
            total={group.total}
            rows={group.items.map((item) => expiryRow(item, scope))}
            emptyText={empty}
            viewAllHref={scope.viewAllHref?.(list)}
          />
        );
      })}
    </PanelGroup>
  );
}

/**
 * The panels' one visibility rule, for the pages that must tell "no list
 * for your role" from an empty dashboard. A static of the component, so
 * this module exports components only (fast refresh).
 */
ExpiryPanels.listShown = listShown;

export default ExpiryPanels;
