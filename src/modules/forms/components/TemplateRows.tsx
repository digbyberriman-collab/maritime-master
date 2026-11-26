/**
 * The rows of an area page (gap/02 FC2, FC4, FC5, FC6): a published
 * template with its origin, where it is offered ("on k of n vessels"),
 * its cadence and its last run, the Customise action and a menu; a hidden
 * template with the vessels it is hidden on and why; a draft with whether
 * it is ready to publish.
 *
 * Laid out as a list: on a wide screen (1024 px and up) the values line
 * up in columns (with a header row), below that each row stacks. Every value carries
 * its own label for assistive tech. Tokens only; 44 px targets on coarse
 * pointers.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import { cadenceLabel } from '../lib/cadence';
import { formKindLabel } from '../lib/areaModel';
import { formatDay, lastRunText, plural, type CatalogueTemplate, type RunSummary, type TemplatePlacement, type VesselSetting } from '../lib/catalogueModel';
import { versionDisplay } from '../lib/templateMachine';
import { COARSE, COARSE_ICON, OriginChip } from './FormsParts';

/** One entry of a row's menu: a link or an action, optionally destructive. */
export interface RowAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  href?: string;
  onSelect?: () => void;
  destructive?: boolean;
  /** Draws a separator before this entry. */
  separated?: boolean;
}

/** The columns of an Available row and its header: the action column has a fixed width so the header lines up with every row. */
export const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_11rem_8rem_13rem_10rem] lg:items-center lg:gap-4';

/** The column headings above the rows (1024 px and up; hidden from assistive tech, each value names itself). */
export function RowHeader({ columns }: { columns: readonly [string, string, string, string] }) {
  return (
    <div aria-hidden="true" className={cn('hidden px-4 pb-1 type-eyebrow text-muted-foreground lg:grid', ROW_GRID)}>
      {columns.map((c) => (
        <span key={c}>{c}</span>
      ))}
      <span />
    </div>
  );
}

function Labelled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-baseline gap-1.5 type-body-sm lg:block', className)}>
      <span className="shrink-0 text-muted-foreground lg:sr-only">{label}:</span>
      <span className="min-w-0 text-foreground">{children}</span>
    </span>
  );
}

export function RowMenu({ name, actions }: { name: string; actions: readonly RowAction[] }) {
  if (!actions.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', COARSE_ICON)} aria-label={`More for ${name}`}>
          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {actions.map((a) => {
          const Icon = a.icon;
          const body = (
            <>
              {Icon ? <Icon aria-hidden="true" className="mr-2 h-4 w-4" /> : null}
              {a.label}
            </>
          );
          return (
            <React.Fragment key={a.key}>
              {a.separated ? <DropdownMenuSeparator /> : null}
              {a.href ? (
                <DropdownMenuItem asChild className={cn(a.destructive && 'text-destructive focus:text-destructive')}>
                  <Link to={a.href}>{body}</Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className={cn(a.destructive && 'text-destructive focus:text-destructive')} onSelect={() => a.onSelect?.()}>
                  {body}
                </DropdownMenuItem>
              )}
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NameCell({ template, href, position }: { template: CatalogueTemplate; href: string; position?: number }) {
  const kind = formKindLabel(template.kind);
  return (
    <span className="flex min-w-0 items-start gap-3">
      {position ? (
        <span aria-label={`Position ${position}`} className="mt-0.5 w-6 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
          {position}
        </span>
      ) : null}
      <span className="min-w-0">
        <Link to={href} className="block truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
          {template.name}
        </Link>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <OriginChip template={template} />
          <span className="type-mono rounded-sm border border-input px-1 leading-5 text-muted-foreground">{versionDisplay({ version: template.version, version_label: template.versionLabel })}</span>
          {kind ? <span className="type-caption text-muted-foreground">{kind}</span> : null}
        </span>
      </span>
    </span>
  );
}

export type RunState = 'ready' | 'loading' | 'not_set_up' | 'no_access' | 'error';

function LastRun({ run, state, today, vesselName }: { run: RunSummary | null; state: RunState; today: string; vesselName: (id: string) => string }) {
  if (state === 'loading') return <span className="text-muted-foreground">Loading…</span>;
  if (state === 'not_set_up') return <span className="text-muted-foreground" title="Run history is not set up yet">—</span>;
  if (state === 'no_access') return <span className="text-muted-foreground" title="You cannot see run history on these vessels">—</span>;
  if (state === 'error' || !run) return <span className="text-muted-foreground">—</span>;
  const when = lastRunText(run.lastRunOn, today);
  return (
    <span className="flex flex-col gap-1">
      <span>{when ?? 'No recorded runs'}</span>
      {run.overdueOn.length ? (
        <StatusPill
          tone="danger"
          className="w-fit"
          label={run.overdueOn.length === 1 ? `Overdue on ${vesselName(run.overdueOn[0])}` : `Overdue on ${run.overdueOn.length} vessels`}
        />
      ) : run.nextDue ? (
        <span className="type-caption text-muted-foreground">Next due {formatDay(run.nextDue)}</span>
      ) : null}
    </span>
  );
}

export interface TemplateRowProps {
  template: CatalogueTemplate;
  placement: TemplatePlacement;
  /** Vessels in view (the "n" of "on k of n"). */
  vesselCount: number;
  /** One vessel in view: its position in the vessel's order. */
  position?: number;
  run: RunSummary | null;
  runState: RunState;
  today: string;
  vesselName: (id: string) => string;
  previewHref: string;
  onCustomise?: () => void;
  customising?: boolean;
  actions: readonly RowAction[];
}

/** An offered template (the Available tab). */
export function TemplateRow({ template, placement, vesselCount, position, run, runState, today, vesselName, previewHref, onCustomise, customising, actions }: TemplateRowProps) {
  const onVessels =
    vesselCount === 1
      ? placement.shown.length
        ? 'Shown'
        : 'Hidden'
      : `On ${placement.shown.length.toLocaleString('en-GB')} of ${plural(vesselCount, 'vessel')}`;
  return (
    <li data-template-id={template.id} className={cn('flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3', ROW_GRID)}>
      <NameCell template={template} href={previewHref} position={position} />
      <Labelled label="Vessels">
        <span className="flex flex-col gap-1">
          <span>{onVessels}</span>
          {vesselCount > 1 && placement.hidden.length ? (
            <StatusPill domain="form_template" status="hidden" className="w-fit" label={`Hidden on ${plural(placement.hidden.length, 'vessel')}`} />
          ) : null}
        </span>
      </Labelled>
      <Labelled label="Cadence">{cadenceLabel(template.cadence) ?? <span className="text-muted-foreground">Not set</span>}</Labelled>
      <Labelled label="Last run">
        <LastRun run={run} state={runState} today={today} vesselName={vesselName} />
      </Labelled>
      <span className="flex items-center justify-end gap-1">
        {onCustomise ? (
          <Button type="button" variant="outline" size="sm" className={COARSE} onClick={onCustomise} disabled={customising} aria-label={`Customise ${template.name}`}>
            Customise
          </Button>
        ) : null}
        <RowMenu name={template.name} actions={actions} />
      </span>
    </li>
  );
}

export interface HiddenRowProps {
  template: CatalogueTemplate;
  hiddenOn: readonly VesselSetting[];
  vesselName: (id: string) => string;
  previewHref: string;
  /** One vessel in view and the reader may manage it: Show again. */
  onShow?: () => void;
  showing?: boolean;
  actions: readonly RowAction[];
}

/** A template hidden on at least one vessel in view (the Hidden tab). */
export function HiddenRow({ template, hiddenOn, vesselName, previewHref, onShow, showing, actions }: HiddenRowProps) {
  return (
    <li data-template-id={template.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 md:flex-row md:items-start md:justify-between">
      <span className="min-w-0 flex-1">
        <NameCell template={template} href={previewHref} />
        <ul aria-label={`Where ${template.name} is hidden`} className="mt-2 flex flex-col gap-1">
          {hiddenOn.map((s) => (
            <li key={s.vesselId} className="type-body-sm text-muted-foreground">
              <span className="font-medium text-foreground">Hidden on {vesselName(s.vesselId)}</span>
              {s.hiddenAt ? ` since ${formatDay(s.hiddenAt.slice(0, 10))}` : ''}
              {s.reason ? `: ${s.reason}` : ''}
            </li>
          ))}
        </ul>
      </span>
      <span className="flex shrink-0 items-center justify-end gap-1">
        {onShow ? (
          <Button type="button" variant="outline" size="sm" className={COARSE} onClick={onShow} disabled={showing}>
            Show again
          </Button>
        ) : null}
        <RowMenu name={template.name} actions={actions} />
      </span>
    </li>
  );
}

export interface DraftRowProps {
  template: CatalogueTemplate;
  /** Null: ready to publish; a sentence: what stops it; undefined: not known yet. */
  blocker: string | null | undefined;
  editHref: string | null;
  previewHref: string;
  actions: readonly RowAction[];
}

/** A draft of the area (the Drafts tab). */
export function DraftRow({ template, blocker, editHref, previewHref, actions }: DraftRowProps) {
  return (
    <li data-template-id={template.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium text-foreground">{template.name}</span>
          <StatusPill domain="form_template" status="draft" />
          <span className="type-mono rounded-sm border border-input px-1 leading-5 text-muted-foreground">
            {template.supersedesTemplateId ? `Next version, v${template.version}` : `v${template.version}`}
          </span>
        </span>
        <span className="mt-1 block type-body-sm">
          {blocker === undefined ? (
            <span className="text-muted-foreground">Checking whether it is ready…</span>
          ) : blocker === null ? (
            <span className="text-success">Ready to publish</span>
          ) : (
            <span className="text-muted-foreground">Not ready to publish: {blocker}</span>
          )}
        </span>
        {template.updatedAt ? <span className="mt-0.5 block type-caption text-muted-foreground">Last edited {formatDay(template.updatedAt.slice(0, 10))}</span> : null}
      </span>
      <span className="flex shrink-0 items-center justify-end gap-1">
        <Button asChild variant="outline" size="sm" className={COARSE}>
          <Link to={previewHref}>Preview</Link>
        </Button>
        {editHref ? (
          <Button asChild size="sm" className={COARSE}>
            <Link to={editHref}>Edit</Link>
          </Button>
        ) : null}
        <RowMenu name={template.name} actions={actions} />
      </span>
    </li>
  );
}
