/**
 * Vessel › Safety › Fleet documents › Crew (`?view=crew`; gap/02 FD6, FD7
 * manual reminders, FD8, W1; X5 spec X5-05B; DECISIONS D-X5-04, D-249).
 * The Master's and heads of department's view of who on this vessel has
 * acknowledged the fleet documents, who still has to, and why someone
 * cannot.
 *
 * - One read (`fleet_document_ack_status` for this vessel, every
 *   document): the server returns only the rows the caller may read (the
 *   Master every person, a head of department their department, a fleet
 *   documents viewer everyone), so the list is exactly the caller's crew.
 * - Per person: name, position and department (a planned joiner says when
 *   they join), what is outstanding with the reason someone cannot sign
 *   inline ("No app login", "Not on the signer list"); a row opens into the
 *   person's documents with their state and due dates. With one document
 *   chosen, each person shows that document's state directly.
 * - Actions, offered only to whom the definers allow (lib/ackAdmin.ts
 *   crewCapacity; the server checks again and refuses in words):
 *   - Record witnessed acknowledgement (Master; HoD for their department):
 *     WitnessedAcknowledgementDialog, pick the person and confirm on this
 *     device;
 *   - Remind (Master, HoD, fleet editors): one person, or everyone
 *     outstanding on the vessel for a document (RemindDialog, the 24-hour
 *     rule shown, the skipped count reported);
 *   - Choose who can sign (the Master, fleet document admins):
 *     SignerRuleDialog; the current rule is shown to every reader.
 * - Folds to stacked rows below 768 px; 44 px targets on coarse pointers.
 *
 * D-01: missing RPC or table is "not set up yet"; any other error is an
 * error with Retry; never sample rows.
 */
import * as React from 'react';
import { BellRing, ChevronDown, ChevronRight, ShieldCheck, UserCog, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CountChips } from '@/shared/components/data';
import { EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import {
  acknowledgedLabel,
  blockedLabels,
  countsFromRows,
  crewPositions,
  effectiveSignerRule,
  groupCrew,
  mayRemindRow,
  mayWitnessRow,
  needsCount,
  signerRuleSummary,
  type CrewCapacity,
  type CrewPerson,
} from '../lib/ackAdmin';
import { formatAckDate } from '../lib/ackState';
import { ACKS_NOT_SET_UP, useFleetDocumentAckStatus, useVesselSignerRules } from '../hooks/useFleetDocumentAcks';
import type { FleetDocumentAckStatusRow, FleetDocumentVesselDocumentRow } from '../types/db.pending';
import { AckBar, NeedsLine, PersonState } from './AcknowledgementsTab';
import { RemindDialog, type RemindRequest } from './RemindDialog';
import { SignerRuleDialog } from './SignerRuleDialog';
import { WitnessedAcknowledgementDialog, type WitnessDocument } from './WitnessedAcknowledgementDialog';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const ALL = '__all__';
const n = (v: number) => v.toLocaleString('en-GB');
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

type Filter = 'needs' | 'everyone';

export interface CrewAcknowledgementsTabProps {
  companyId: string | null;
  vessel: { id: string; name: string };
  /** The vessel's published documents (the page's `fleet_document_vessel_documents` read). */
  documents: readonly FleetDocumentVesselDocumentRow[];
  capacity: CrewCapacity;
  callerProfileId: string | null;
}

type Overlay =
  | { kind: 'witness'; initial: { documentId: string; profileId: string } | null }
  | { kind: 'remind'; request: RemindRequest }
  | { kind: 'signers' }
  | null;

export function CrewAcknowledgementsTab({ companyId, vessel, documents, capacity, callerProfileId }: CrewAcknowledgementsTabProps) {
  const status = useFleetDocumentAckStatus(companyId, { documentId: null, vesselIds: [vessel.id] }, { enabled: capacity.readsCrew });
  const rules = useVesselSignerRules(companyId, vessel.id, { enabled: capacity.readsCrew });
  const [documentId, setDocumentId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>('needs');
  const [overlay, setOverlay] = React.useState<Overlay>(null);
  const close = () => setOverlay(null);

  const ackDocs = React.useMemo(() => documents.filter((d) => d.ack_required), [documents]);
  const docById = React.useMemo(() => new Map(ackDocs.map((d) => [d.document_id, d] as const)), [ackDocs]);
  // Only rows of the version each document has published now (a stale read never mixes versions).
  const rows = React.useMemo(
    () => (status.state === 'ready' ? status.data.filter((r) => docById.get(r.document_id)?.version_id === r.version_id) : []),
    [status, docById],
  );
  const chosen = documentId && docById.has(documentId) ? documentId : null;
  const crew = React.useMemo(() => groupCrew(rows, { vesselId: vessel.id, documentId: chosen }), [rows, vessel.id, chosen]);
  const everyone = React.useMemo(() => groupCrew(rows, { vesselId: vessel.id }), [rows, vessel.id]);
  const shown = filter === 'needs' ? crew.filter((p) => needsCount(p.counts) > 0) : crew;
  const totals = countsFromRows(crew.flatMap((p) => p.rows));

  if (!capacity.readsCrew) return null;
  if (status.state === 'idle' || status.state === 'loading') return <PageLoading variant="list" label="Loading the crew’s acknowledgements" />;
  if (status.state === 'not_set_up') {
    return <PageEmpty icon={Users} title={ACKS_NOT_SET_UP} body="The crew’s acknowledgements appear here once fleet documents are set up for your account." headingLevel={2} bordered />;
  }
  if (status.state === 'error') return <PageError error={status.error} title="The crew’s acknowledgements could not load" onRetry={status.retry} headingLevel={2} treatMissingAsOff={false} />;

  const ruleList = rules.state === 'ready' ? rules.data : [];
  const nameOf = (profileId: string) => everyone.find((p) => p.profileId === profileId)?.name ?? null;
  const allTypesRule = ruleList.find((r) => r.type_id === null) ?? null;
  const typeRules = ruleList.filter((r) => r.type_id !== null);
  const types = [...new Map(ackDocs.map((d) => [d.type_id, { id: d.type_id, name: d.type_name }] as const)).values()];
  const witnessDocs: WitnessDocument[] = ackDocs.map((d) => ({
    documentId: d.document_id,
    versionId: d.version_id,
    title: d.title,
    versionLabel: d.version_label,
    storagePath: d.storage_path,
  }));
  const canWitnessAnyone = rows.some((r) => mayWitnessRow(capacity, r, callerProfileId));
  const chosenDoc = chosen ? docById.get(chosen) ?? null : null;
  const remindRequest = (doc: FleetDocumentVesselDocumentRow, person: CrewPerson | null): RemindRequest => ({
    documentId: doc.document_id,
    title: doc.title,
    versionLabel: doc.version_label,
    scopes: person ? ['person', 'vessel'] : ['vessel'],
    vesselId: vessel.id,
    vesselName: vessel.name,
    profileId: person?.profileId ?? null,
    personName: person?.name ?? null,
  });
  const vesselOutstanding = chosenDoc ? rows.filter((r) => r.document_id === chosenDoc.document_id && mayRemindRow(capacity, r, callerProfileId)).length : 0;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="space-y-3">
          <div className="min-w-0 space-y-1">
            <h2 className="type-title text-foreground">Crew acknowledgements</h2>
            <p className="text-sm text-muted-foreground" data-testid="crew-ack-scope">
              {capacity.isMaster || capacity.isFleetReader
                ? `Everyone on ${vessel.name}’s crew list.`
                : capacity.hodDepartments
                  ? `Your department on ${vessel.name}: ${capacity.hodDepartments.map((d) => d.replace(/^\w/, (c) => c.toUpperCase())).join(', ')}.`
                  : `The departments you head on ${vessel.name}.`}
            </p>
            <p className="text-sm text-foreground" data-testid="crew-ack-signers">
              <span className="text-muted-foreground">Who can sign: </span>
              {rules.state === 'ready'
                ? signerRuleSummary(allTypesRule, nameOf)
                : rules.state === 'error'
                  ? 'could not load'
                  : rules.state === 'not_set_up'
                    ? 'not set up yet'
                    : '…'}
              {typeRules.length ? <span className="text-muted-foreground">{` · ${plural(typeRules.length, 'document type')} with ${typeRules.length === 1 ? 'its' : 'their'} own rule`}</span> : null}
            </p>
            {rules.state === 'error' ? (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={rules.retry}>
                Try loading who can sign again
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {capacity.canWitness ? (
              <Button type="button" size="sm" className={COARSE} onClick={() => setOverlay({ kind: 'witness', initial: null })} disabled={!canWitnessAnyone}>
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                Record witnessed acknowledgement
              </Button>
            ) : null}
            {capacity.canChooseSigners ? (
              <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => setOverlay({ kind: 'signers' })} disabled={rules.state !== 'ready'}>
                <UserCog aria-hidden="true" className="h-4 w-4" />
                Choose who can sign
              </Button>
            ) : null}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
            <span className="font-medium tabular-nums text-foreground">
              {totals.total ? `${plural(crew.length, 'person', 'people')} · ${acknowledgedLabel(totals)}` : 'Nobody to acknowledge'}
            </span>
            {totals.total ? <NeedsLine counts={totals} /> : null}
          </p>
          <AckBar counts={totals} />
        </div>
      </Card>

      {ackDocs.length === 0 ? (
        <EmptyState icon={Users} title="Nothing to acknowledge on this vessel" body="None of the documents published to this vessel needs an acknowledgement." headingLevel={3} bordered compact />
      ) : (
        <>
          <div role="group" aria-label="Filter the crew" className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={chosen ?? ALL} onValueChange={(v) => setDocumentId(v === ALL ? null : v)}>
                <SelectTrigger aria-label="Document" className={cn('h-9 w-full sm:w-72', COARSE)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All documents</SelectItem>
                  {ackDocs.map((d) => (
                    <SelectItem key={d.document_id} value={d.document_id}>
                      {`${d.title} · ${d.version_label}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CountChips
                label="Show"
                activeId={filter}
                onChange={(id) => setFilter(id === 'everyone' ? 'everyone' : 'needs')}
                chips={[
                  { id: 'needs', label: 'Still to acknowledge', count: crew.filter((p) => needsCount(p.counts) > 0).length },
                  { id: 'everyone', label: 'Everyone', count: crew.length },
                ]}
              />
            </div>
            {chosenDoc && capacity.canRemind ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={COARSE}
                disabled={vesselOutstanding === 0}
                onClick={() => setOverlay({ kind: 'remind', request: remindRequest(chosenDoc, null) })}
              >
                <BellRing aria-hidden="true" className="h-4 w-4" />
                Remind everyone outstanding
              </Button>
            ) : null}
          </div>

          {crew.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nobody on the crew list you look after"
              body="People appear here once they are on this vessel’s crew list and a document they need to acknowledge is published."
              headingLevel={3}
              bordered
              compact
            />
          ) : shown.length === 0 ? (
            <EmptyState
              kind="filtered"
              title="Everyone has acknowledged"
              body={chosenDoc ? `Everyone you look after has acknowledged ${chosenDoc.title}.` : 'Everyone you look after has acknowledged every document.'}
              headingLevel={3}
              bordered
              compact
              action={
                <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => setFilter('everyone')}>
                  Show everyone
                </Button>
              }
            />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {shown.map((person) => (
                <PersonRow
                  key={person.profileId}
                  person={person}
                  isCaller={person.profileId === callerProfileId}
                  chosen={chosenDoc}
                  docById={docById}
                  capacity={capacity}
                  callerProfileId={callerProfileId}
                  onWitness={(row) => setOverlay({ kind: 'witness', initial: { documentId: row.document_id, profileId: row.profile_id } })}
                  onRemind={(row) => {
                    const doc = docById.get(row.document_id);
                    if (doc) setOverlay({ kind: 'remind', request: remindRequest(doc, person) });
                  }}
                />
              ))}
            </Card>
          )}
        </>
      )}

      <WitnessedAcknowledgementDialog
        open={overlay?.kind === 'witness'}
        onOpenChange={(open) => (!open ? close() : undefined)}
        companyId={companyId}
        vesselId={vessel.id}
        vesselName={vessel.name}
        documents={witnessDocs}
        rows={rows}
        capacity={capacity}
        callerProfileId={callerProfileId}
        initial={overlay?.kind === 'witness' ? overlay.initial : null}
      />
      <RemindDialog
        open={overlay?.kind === 'remind'}
        onOpenChange={(open) => (!open ? close() : undefined)}
        companyId={companyId}
        request={overlay?.kind === 'remind' ? overlay.request : null}
        rows={rows}
        callerProfileId={callerProfileId}
      />
      {capacity.canChooseSigners && rules.state === 'ready' ? (
        <SignerRuleDialog
          open={overlay?.kind === 'signers'}
          onOpenChange={(open) => (!open ? close() : undefined)}
          companyId={companyId}
          vesselId={vessel.id}
          vesselName={vessel.name}
          types={types}
          rules={ruleList}
          positions={crewPositions(rows)}
          people={everyone.map((p) => ({ profileId: p.profileId, name: p.name, position: p.position }))}
        />
      ) : null}
    </div>
  );
}

export default CrewAcknowledgementsTab;

// ─── A person ───────────────────────────────────────────────────────────

const STATE_ORDER: Readonly<Record<string, number>> = { overdue: 0, blocked: 1, pending: 2, acknowledged: 3, not_required: 4 };

interface PersonRowProps {
  person: CrewPerson;
  isCaller: boolean;
  chosen: FleetDocumentVesselDocumentRow | null;
  docById: ReadonlyMap<string, FleetDocumentVesselDocumentRow>;
  capacity: CrewCapacity;
  callerProfileId: string | null;
  onWitness: (row: FleetDocumentAckStatusRow) => void;
  onRemind: (row: FleetDocumentAckStatusRow) => void;
}

function PersonRow({ person, isCaller, chosen, docById, capacity, callerProfileId, onWitness, onRemind }: PersonRowProps) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const meta = [person.position, person.department, person.isPlanned && person.joinDate ? `Joins ${formatAckDate(`${person.joinDate}T00:00:00Z`)}` : null]
    .filter(Boolean)
    .join(' · ');
  const reasons = blockedLabels(person.rows);
  const single = chosen ? person.rows.find((r) => r.document_id === chosen.document_id) ?? null : null;

  return (
    <div className="px-4 py-3" data-testid="crew-ack-person">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {!chosen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={open ? `Hide ${person.name}’s documents` : `Show ${person.name}’s documents`}
              onClick={() => setOpen((v) => !v)}
              className={cn('h-8 w-8 shrink-0', COARSE, '[@media(pointer:coarse)]:min-w-11')}
            >
              {open ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
            </Button>
          ) : null}
          <div className="min-w-0">
            <p className="break-words font-medium text-foreground">
              {person.name}
              {isCaller ? <span className="type-caption ml-2 font-normal text-muted-foreground">You</span> : null}
            </p>
            <p className="type-caption break-words text-muted-foreground">{meta || 'Crew'}</p>
          </div>
        </div>
        {single ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:justify-end">
            <PersonState row={single} />
            <RowActions row={single} capacity={capacity} callerProfileId={callerProfileId} name={person.name} onWitness={onWitness} onRemind={onRemind} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm md:justify-end">
            <NeedsLine counts={person.counts} doneLabel="Up to date" />
            {reasons.length ? <span className="text-warning">{reasons.join(', ')}</span> : null}
            <AckBar counts={person.counts} className="w-24" />
          </div>
        )}
      </div>
      {!chosen && open ? (
        <ul id={panelId} aria-label={`${person.name}’s documents`} className="mt-2 divide-y divide-border rounded-md border border-border md:ml-10">
          {[...person.rows]
            .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (docById.get(a.document_id)?.title ?? '').localeCompare(docById.get(b.document_id)?.title ?? ''))
            .map((row) => {
              const doc = docById.get(row.document_id);
              return (
                <li key={row.document_id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm text-foreground">{doc?.title ?? 'A document'}</p>
                    <p className="type-caption text-muted-foreground">{doc ? `${doc.section_name} · ${doc.version_label}` : null}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
                    <PersonState row={row} />
                    <RowActions row={row} capacity={capacity} callerProfileId={callerProfileId} name={person.name} onWitness={onWitness} onRemind={onRemind} />
                  </div>
                </li>
              );
            })}
        </ul>
      ) : null}
    </div>
  );
}

function RowActions({
  row,
  capacity,
  callerProfileId,
  name,
  onWitness,
  onRemind,
}: {
  row: FleetDocumentAckStatusRow;
  capacity: CrewCapacity;
  callerProfileId: string | null;
  name: string;
  onWitness: (row: FleetDocumentAckStatusRow) => void;
  onRemind: (row: FleetDocumentAckStatusRow) => void;
}) {
  const witness = mayWitnessRow(capacity, row, callerProfileId);
  const remind = mayRemindRow(capacity, row, callerProfileId);
  if (!witness && !remind) return null;
  return (
    <span className="flex gap-1">
      {witness ? (
        <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => onWitness(row)} aria-label={`Record a witnessed acknowledgement for ${name}`}>
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          Witness
        </Button>
      ) : null}
      {remind ? (
        <Button type="button" variant="ghost" size="sm" className={COARSE} onClick={() => onRemind(row)} aria-label={`Remind ${name}`}>
          <BellRing aria-hidden="true" className="h-4 w-4" />
          Remind
        </Button>
      ) : null}
    </span>
  );
}
