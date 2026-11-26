/**
 * Fleet › Documents › Acknowledgements (`/fleet/documents?tab=acknowledgements&doc=`;
 * gap/02 FD6, FD7 manual reminders, W1; X5 spec X5-05B; DECISIONS D-01,
 * D-X5-04, D-249). Who has read and acknowledged each published document,
 * on every vessel it reaches, with who still has to and why someone cannot.
 *
 * - Totals over every document that needs an acknowledgement: acknowledged,
 *   to acknowledge, overdue, unable to acknowledge (KpiTile).
 * - The documents (rail from 1024 px, a picker below): each with its
 *   "n of m acknowledged", a per-person bar and the overdue count, the most
 *   overdue first. `?doc=` picks one; the default is the first.
 * - The chosen document: per vessel acknowledged / still to acknowledge
 *   (overdue, unable, to acknowledge) / can sign now, and a per-person bar;
 *   a targeted vessel with nobody on its crew list says so. A vessel row
 *   expands into its people (one `fleet_document_ack_status` read for the
 *   document, not one per vessel): state, due or overdue date, the reason
 *   someone cannot acknowledge inline, how an acknowledgement was recorded.
 * - Remind (documents editors): everyone outstanding on every vessel, one
 *   vessel's, or one person (RemindDialog shows the 24-hour rule; the toast
 *   reports who was skipped). Reminders are in-app (D-249).
 * - Below 768 px the vessel table folds into cards.
 *
 * The counts come from `fleet_document_summary` (the page reads it once for
 * this tab and the library's Acknowledged column). D-01: missing is "not set
 * up yet", any other error PageError with Retry; never sample rows.
 */
import * as React from 'react';
import { BellRing, ChevronDown, ChevronRight, FileCheck2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { KpiGrid, KpiTile } from '@/shared/components/data';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import { EmptyState, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill, TONE_FILL, statusTone } from '@/shared/components/status';
import {
  BAR_STATES,
  EMPTY_COUNTS,
  REMIND_RULE,
  acknowledgedLabel,
  addCounts,
  compareByNeed,
  countsSentence,
  mayRemindRow,
  perPersonCells,
  personName,
  summariseByDocument,
  type AckCounts,
  type CrewCapacity,
} from '../lib/ackAdmin';
import { ACK_BLOCKED_LABELS, ACK_METHOD_LABELS, ackDueShort, formatAckDate } from '../lib/ackState';
import type { FleetDocumentLibrary, LibraryRow, LibraryVessel } from '../lib/fleetDocumentLibrary';
import { ACKS_NOT_SET_UP, useFleetDocumentAckStatus, type AckReadState } from '../hooks/useFleetDocumentAcks';
import type { FleetDocumentAckStatusRow, FleetDocumentSummaryRow } from '../types/db.pending';
import { RemindDialog, type RemindRequest } from './RemindDialog';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const RAIL_MIN_WIDTH = 1024;
const n = (v: number) => v.toLocaleString('en-GB');

// ─── The bar ────────────────────────────────────────────────────────────

const BAR_LABELS: Readonly<Record<(typeof BAR_STATES)[number], string>> = {
  acknowledged: 'Acknowledged',
  pending: 'To acknowledge',
  overdue: 'Overdue',
  blocked: 'Unable to acknowledge',
};
const fillFor = (state: (typeof BAR_STATES)[number]) => TONE_FILL[statusTone('document_ack', state)];

/**
 * A per-person bar: one segment per person in state order (acknowledged,
 * to acknowledge, overdue, unable) while there are few enough to tell
 * apart, else proportional segments. Its name says the counts.
 */
export function AckBar({ counts, className }: { counts: AckCounts; className?: string }) {
  const cells = perPersonCells(counts);
  return (
    <div role="img" aria-label={countsSentence(counts)} className={cn('flex h-2 w-full min-w-16 gap-px overflow-hidden rounded-full bg-muted', className)}>
      {counts.total === 0
        ? null
        : cells
          ? cells.map((state, i) => <span key={i} className={cn('h-full flex-1', fillFor(state))} />)
          : BAR_STATES.filter((s) => counts[s] > 0).map((s) => (
              <span key={s} className={cn('h-full', fillFor(s))} style={{ width: `${(counts[s] / counts.total) * 100}%` }} />
            ))}
    </div>
  );
}

export function AckLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-3 gap-y-1 type-caption text-muted-foreground', className)} aria-label="Bar colours">
      {BAR_STATES.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', fillFor(s))} />
          {BAR_LABELS[s]}
        </li>
      ))}
    </ul>
  );
}

/** "3 overdue · 1 unable · 4 to acknowledge" (each in its tone), or "Everyone acknowledged". */
export function NeedsLine({ counts, className, doneLabel = 'Everyone acknowledged' }: { counts: AckCounts; className?: string; doneLabel?: string }) {
  if (counts.total === 0) return <span className={cn('text-muted-foreground', className)}>Nobody on the crew list</span>;
  const parts: React.ReactNode[] = [];
  if (counts.overdue) parts.push(<span key="o" className="whitespace-nowrap text-critical">{`${n(counts.overdue)} overdue`}</span>);
  if (counts.blocked) parts.push(<span key="b" className="whitespace-nowrap text-warning">{`${n(counts.blocked)} unable`}</span>);
  if (counts.pending) parts.push(<span key="p" className="whitespace-nowrap">{`${n(counts.pending)} to acknowledge`}</span>);
  if (!parts.length) return <span className={cn('text-success', className)}>{doneLabel}</span>;
  return (
    <span className={cn('tabular-nums', className)}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <span className="text-muted-foreground"> · </span> : null}
          {p}
        </React.Fragment>
      ))}
    </span>
  );
}

// ─── The tab ────────────────────────────────────────────────────────────

export interface AcknowledgementsTabProps {
  companyId: string | null;
  library: FleetDocumentLibrary;
  /** The vessels the reader reaches (names and codes). */
  vessels: readonly LibraryVessel[];
  /** The page's one `fleet_document_summary` read. */
  summary: AckReadState<FleetDocumentSummaryRow[]>;
  /** fleet.operations.fleet_documents.edit (reminds any vessel). */
  canRemind: boolean;
  callerProfileId: string | null;
  /** `?doc=`. */
  documentId: string | null;
  onSelectDocument: (documentId: string | null) => void;
}

interface DocItem {
  row: LibraryRow;
  name: string;
  counts: AckCounts;
}

interface VesselItem {
  vesselId: string;
  name: string;
  code: string | null;
  counts: AckCounts;
  /** False: targeted, but nobody on its crew list (no summary row). */
  hasCrew: boolean;
}

export function AcknowledgementsTab({ companyId, library, vessels, summary, canRemind, callerProfileId, documentId, onSelectDocument }: AcknowledgementsTabProps) {
  const rail = useMinWidth(RAIL_MIN_WIDTH);
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const [remind, setRemind] = React.useState<RemindRequest | null>(null);

  const ackDocs = React.useMemo(() => library.rows.filter((r) => r.status === 'published' && r.ackRequired && r.current), [library.rows]);
  const summaries = React.useMemo(() => {
    if (summary.state !== 'ready') return null;
    const current = new Map(ackDocs.map((r) => [r.id, r.current?.id ?? null] as const));
    return summariseByDocument(summary.data, current);
  }, [summary, ackDocs]);
  const docItems = React.useMemo<DocItem[]>(
    () => ackDocs.map((row) => ({ row, name: row.title, counts: summaries?.get(row.id)?.counts ?? EMPTY_COUNTS })).sort(compareByNeed),
    [ackDocs, summaries],
  );
  const selected = docItems.find((d) => d.row.id === documentId) ?? docItems[0] ?? null;
  const people = useFleetDocumentAckStatus(companyId, { documentId: selected?.row.id ?? null, vesselIds: null }, { enabled: summary.state === 'ready' && !!selected });

  if (summary.state === 'idle' || summary.state === 'loading') return <PageLoading variant="list" label="Loading acknowledgements" />;
  if (summary.state === 'not_set_up') {
    return (
      <EmptyState
        kind="not-enabled"
        title={ACKS_NOT_SET_UP}
        body="Once they are, this tab shows who has read and acknowledged each document on every vessel, with due dates."
        bordered
      />
    );
  }
  if (summary.state === 'error') return <PageError error={summary.error} title="The acknowledgements could not load" onRetry={summary.retry} headingLevel={2} treatMissingAsOff={false} />;
  if (!selected) {
    return (
      <EmptyState
        icon={FileCheck2}
        title="Nothing to acknowledge yet"
        body="Published documents that need an acknowledgement appear here, with who has read them on each vessel."
        headingLevel={2}
        bordered
      />
    );
  }

  const totals = docItems.reduce((acc, d) => addCounts(acc, d.counts), EMPTY_COUNTS);
  const vesselName = (id: string) => vessels.find((v) => v.id === id) ?? null;
  const targetIds = selected.row.targetMode === 'all_including_future' ? vessels.filter((v) => v.counted).map((v) => v.id) : selected.row.targetVesselIds;
  const fromSummary = summaries?.get(selected.row.id)?.vessels ?? [];
  const vesselItems: VesselItem[] = [...new Set([...fromSummary.map((v) => v.vesselId), ...targetIds])]
    .map((vid) => {
      const s = fromSummary.find((v) => v.vesselId === vid);
      const v = vesselName(vid);
      return { vesselId: vid, name: v?.name ?? 'A vessel you do not reach', code: v?.code ?? null, counts: s?.counts ?? EMPTY_COUNTS, hasCrew: !!s };
    })
    .sort(compareByNeed);
  const peopleRows = people.state === 'ready' ? people.data : null;
  const fleetCapacity: CrewCapacity = {
    known: true,
    readsCrew: true,
    isMaster: false,
    isHod: false,
    hodDepartments: null,
    isFleetReader: true,
    isFleetEditor: canRemind,
    canWitness: false,
    canRemind,
    canChooseSigners: false,
  };
  const request = (scope: RemindRequest['scopes'], vessel: VesselItem | null, person: FleetDocumentAckStatusRow | null): RemindRequest => ({
    documentId: selected.row.id,
    title: selected.row.title,
    versionLabel: selected.row.current?.label ?? '',
    scopes: scope,
    vesselId: vessel?.vesselId ?? person?.vessel_id ?? null,
    vesselName: vessel?.name ?? (person ? vesselName(person.vessel_id)?.name ?? null : null),
    profileId: person?.profile_id ?? null,
    personName: person ? personName(person) : null,
  });

  return (
    <div className="space-y-4">
      <KpiGrid className="min-[1440px]:grid-cols-4">
        <KpiTile label="Acknowledged" value={totals.acknowledged} sub={totals.total ? `of ${n(totals.total)} across ${n(docItems.length)} documents` : undefined} zeroLabel="None yet" />
        <KpiTile label="To acknowledge" value={totals.pending} sub="Within their due date" zeroLabel="None" />
        <KpiTile label="Overdue" value={totals.overdue} tone={totals.overdue ? 'danger' : undefined} sub="Past their due date" zeroLabel="None overdue" />
        <KpiTile
          label="Unable to acknowledge"
          value={totals.blocked}
          tone={totals.blocked ? 'warn' : undefined}
          sub="No login, suspended, or not a signer"
          zeroLabel="None"
        />
      </KpiGrid>

      <div className={cn('grid gap-4', rail && 'grid-cols-[17rem_minmax(0,1fr)]')}>
        {rail ? (
          <DocumentRail items={docItems} activeId={selected.row.id} onSelect={onSelectDocument} />
        ) : (
          <Select value={selected.row.id} onValueChange={onSelectDocument}>
            <SelectTrigger aria-label="Document" className={cn('h-9 w-full', COARSE)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {docItems.map((d) => (
                <SelectItem key={d.row.id} value={d.row.id}>
                  {`${d.row.title} · ${acknowledgedLabel(d.counts)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <section aria-labelledby="ack-document-heading" className="min-w-0 space-y-3">
          <Card className="space-y-3 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <h2 id="ack-document-heading" className="type-title break-words text-foreground">
                  {selected.row.title}
                </h2>
                <p className="type-caption text-muted-foreground">
                  {[selected.row.typeName, selected.row.current ? `Version ${selected.row.current.label}` : null, `Vessels: ${selected.row.vesselsLabel}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {canRemind ? (
                <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
                  <Button
                    type="button"
                    size="sm"
                    className={COARSE}
                    disabled={selected.counts.canSign === 0}
                    onClick={() => setRemind(request(['all'], null, null))}
                  >
                    <BellRing aria-hidden="true" className="h-4 w-4" />
                    Remind all outstanding
                  </Button>
                  <p className="type-caption max-w-xs text-muted-foreground sm:text-right" data-testid="ack-remind-rule">
                    {REMIND_RULE}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                <span className="font-medium tabular-nums text-foreground">{acknowledgedLabel(selected.counts)}</span>
                <NeedsLine counts={selected.counts} />
              </p>
              <AckBar counts={selected.counts} />
              <AckLegend />
            </div>
          </Card>

          {vesselItems.length === 0 ? (
            <EmptyState icon={Users} title="No vessels yet" body="This document does not reach a vessel you can see." headingLevel={3} bordered compact />
          ) : (
            <VesselList
              items={vesselItems}
              wide={wide}
              people={people}
              peopleRows={peopleRows}
              capacity={fleetCapacity}
              callerProfileId={callerProfileId}
              onRemindVessel={canRemind ? (v) => setRemind(request(['vessel', 'all'], v, null)) : null}
              onRemindPerson={canRemind ? (r) => setRemind(request(['person', 'vessel'], null, r)) : null}
            />
          )}
        </section>
      </div>

      <RemindDialog
        open={remind !== null}
        onOpenChange={(open) => (!open ? setRemind(null) : undefined)}
        companyId={companyId}
        request={remind}
        rows={peopleRows}
        callerProfileId={callerProfileId}
      />
    </div>
  );
}

export default AcknowledgementsTab;

// ─── The documents ──────────────────────────────────────────────────────

function DocumentRail({ items, activeId, onSelect }: { items: readonly DocItem[]; activeId: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Documents to acknowledge">
      <ul className="space-y-1">
        {items.map((d) => (
          <li key={d.row.id}>
            <button
              type="button"
              aria-current={d.row.id === activeId ? 'true' : undefined}
              onClick={() => onSelect(d.row.id)}
              className={cn(
                'focus-ring flex w-full flex-col gap-1.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-quick',
                COARSE,
                d.row.id === activeId ? 'bg-signal-muted text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span className="block break-words font-medium text-foreground">{d.row.title}</span>
              <AckBar counts={d.counts} />
              <span className="flex flex-wrap justify-between gap-x-2 type-caption tabular-nums">
                <span>{d.counts.total ? acknowledgedLabel(d.counts) : 'Nobody on the crew lists'}</span>
                {d.counts.overdue ? <span className="text-critical">{`${n(d.counts.overdue)} overdue`}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ─── The vessels and their people ───────────────────────────────────────

interface VesselListProps {
  items: readonly VesselItem[];
  wide: boolean;
  people: AckReadState<FleetDocumentAckStatusRow[]>;
  peopleRows: readonly FleetDocumentAckStatusRow[] | null;
  capacity: CrewCapacity;
  callerProfileId: string | null;
  onRemindVessel: ((vessel: VesselItem) => void) | null;
  onRemindPerson: ((row: FleetDocumentAckStatusRow) => void) | null;
}

function VesselList({ items, wide, people, peopleRows, capacity, callerProfileId, onRemindVessel, onRemindPerson }: VesselListProps) {
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const panel = (v: VesselItem) => (
    <PeoplePanel
      vessel={v}
      people={people}
      rows={peopleRows?.filter((r) => r.vessel_id === v.vesselId && r.on_crew) ?? null}
      capacity={capacity}
      callerProfileId={callerProfileId}
      onRemindPerson={onRemindPerson}
    />
  );

  if (!wide) {
    return (
      <ul aria-label="Vessels" className="space-y-2">
        {items.map((v) => {
          const open = expanded.has(v.vesselId);
          return (
            <li key={v.vesselId}>
              <Card className="space-y-2 p-3" data-testid="ack-vessel-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-foreground">{v.name}</p>
                    <p className="type-caption tabular-nums text-muted-foreground">{v.hasCrew ? acknowledgedLabel(v.counts) : 'Nobody on the crew list'}</p>
                  </div>
                  {v.hasCrew ? <ExpandButton open={open} name={v.name} onClick={() => toggle(v.vesselId)} /> : null}
                </div>
                {v.hasCrew ? (
                  <>
                    <AckBar counts={v.counts} />
                    <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <NeedsLine counts={v.counts} />
                      <span className="tabular-nums text-muted-foreground">{`${n(v.counts.canSign)} can sign now`}</span>
                    </p>
                    {onRemindVessel && v.counts.canSign > 0 ? (
                      <Button type="button" variant="outline" size="sm" className={cn(COARSE, 'w-full')} onClick={() => onRemindVessel(v)}>
                        <BellRing aria-hidden="true" className="h-4 w-4" />
                        {`Remind ${v.name}`}
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {open ? panel(v) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm" aria-label="Vessels">
        <thead className="whitespace-nowrap bg-muted/40 text-left type-caption text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Vessel
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Acknowledged
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Still to acknowledge
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Can sign now
            </th>
            <th scope="col" className="w-32 px-3 py-2 font-medium">
              <span className="sr-only">Progress</span>
            </th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((v) => {
            const open = expanded.has(v.vesselId);
            return (
              <React.Fragment key={v.vesselId}>
                <tr className="border-t border-border" data-testid="ack-vessel-row">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">
                    <span className="flex items-center gap-1">
                      {v.hasCrew ? <ExpandButton open={open} name={v.name} onClick={() => toggle(v.vesselId)} compact /> : <span className="inline-block w-8" />}
                      <span className="whitespace-nowrap">{v.name}</span>
                      {v.code ? <span className="type-caption font-normal text-muted-foreground">{v.code}</span> : null}
                    </span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{v.hasCrew ? `${n(v.counts.acknowledged)} of ${n(v.counts.total)}` : '–'}</td>
                  <td className="px-3 py-2">{v.hasCrew ? <NeedsLine counts={v.counts} /> : <span className="text-muted-foreground">Nobody on the crew list</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{v.hasCrew ? n(v.counts.canSign) : '–'}</td>
                  <td className="px-3 py-2">{v.hasCrew ? <AckBar counts={v.counts} /> : null}</td>
                  <td className="px-3 py-2 text-right">
                    {onRemindVessel && v.counts.canSign > 0 ? (
                      <Button type="button" variant="ghost" size="sm" className={COARSE} onClick={() => onRemindVessel(v)} aria-label={`Remind the crew of ${v.name}`}>
                        <BellRing aria-hidden="true" className="h-4 w-4" />
                        Remind
                      </Button>
                    ) : null}
                  </td>
                </tr>
                {open ? (
                  <tr className="bg-muted/20">
                    <td colSpan={6} className="px-3 pb-3 pt-1">
                      {panel(v)}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function ExpandButton({ open, name, onClick, compact }: { open: boolean; name: string; onClick: () => void; compact?: boolean }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-expanded={open}
      aria-label={open ? `Hide the people on ${name}` : `Show the people on ${name}`}
      onClick={onClick}
      className={cn(compact ? 'h-8 w-8' : 'h-9 w-9', COARSE, '[@media(pointer:coarse)]:min-w-11 shrink-0')}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </Button>
  );
}

const STATE_ORDER: Readonly<Record<string, number>> = { overdue: 0, blocked: 1, pending: 2, acknowledged: 3, not_required: 4 };

function PeoplePanel({
  vessel,
  people,
  rows,
  capacity,
  callerProfileId,
  onRemindPerson,
}: {
  vessel: VesselItem;
  people: AckReadState<FleetDocumentAckStatusRow[]>;
  rows: readonly FleetDocumentAckStatusRow[] | null;
  capacity: CrewCapacity;
  callerProfileId: string | null;
  onRemindPerson: ((row: FleetDocumentAckStatusRow) => void) | null;
}) {
  if (people.state === 'loading' || people.state === 'idle') {
    return (
      <div aria-busy="true" aria-label={`Loading the people on ${vessel.name}`} className="space-y-2 pt-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  if (people.state === 'not_set_up') return <p className="pt-2 text-sm text-muted-foreground">{ACKS_NOT_SET_UP}.</p>;
  if (people.state === 'error') return <PageError error={people.error} title="The people could not load" onRetry={people.retry} variant="inline" treatMissingAsOff={false} />;
  const list = [...(rows ?? [])].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || personName(a).localeCompare(personName(b), 'en-GB', { sensitivity: 'base' }));
  if (!list.length) return <p className="pt-2 text-sm text-muted-foreground">Nobody on this vessel’s crew list that you can see.</p>;
  return (
    <ul aria-label={`People on ${vessel.name}`} className="divide-y divide-border">
      {list.map((r) => (
        <li key={r.profile_id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between" data-testid="ack-person">
          <div className="min-w-0">
            <p className="break-words font-medium text-foreground">{personName(r)}</p>
            <p className="type-caption break-words text-muted-foreground">
              {[r.position, r.department, r.is_planned && r.join_date ? `Joins ${formatAckDate(`${r.join_date}T00:00:00Z`)}` : null].filter(Boolean).join(' · ') || 'Crew'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
            <PersonState row={r} />
            {onRemindPerson && mayRemindRow(capacity, r, callerProfileId) ? (
              <Button type="button" variant="ghost" size="sm" className={COARSE} onClick={() => onRemindPerson(r)} aria-label={`Remind ${personName(r)}`}>
                <BellRing aria-hidden="true" className="h-4 w-4" />
                Remind
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A person's state with its date, the reason they cannot sign, or how it was recorded. */
export function PersonState({ row }: { row: Pick<FleetDocumentAckStatusRow, 'state' | 'due_at' | 'acknowledged_at' | 'blocked_reason' | 'method'> }) {
  const due = ackDueShort(row.state, row.due_at, row.acknowledged_at);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusPill domain="document_ack" status={row.state} size="sm" />
      {row.state === 'blocked' && row.blocked_reason ? <span className="text-sm text-warning">{ACK_BLOCKED_LABELS[row.blocked_reason]}</span> : null}
      {due ? <span className={cn('type-caption tabular-nums', row.state === 'overdue' ? 'text-critical' : 'text-muted-foreground')}>{due}</span> : null}
      {row.state === 'acknowledged' && row.method && row.method !== 'self' ? <span className="type-caption text-muted-foreground">{ACK_METHOD_LABELS[row.method]}</span> : null}
    </span>
  );
}
