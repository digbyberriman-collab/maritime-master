/**
 * Positions drawer (X1-01; gap/04 C12, C49, C70; DECISIONS C22): the
 * positions used on a vessel, grouped by department in the vessel's rank
 * order, with the manning minimum and optional maximum, each position's
 * default access set, "+ New position for this vessel" and the
 * "Unmatched titles" mapper. Opened from the crew list with `?positions=1`
 * and loaded lazily (X1-02 keeps it).
 *
 * - Gates (useCan, false while loading): vessel.crew.crew_list.view to see
 *   it; vessel.crew.crew_compliance.admin on the vessel to change it
 *   (read-only otherwise); the company-level answer of the same key to add
 *   a position for the whole company.
 * - Reorder inside a department by drag, or with Move up / Move down
 *   (keyboard, 44 px targets on touch). A department keeps its rank slots
 *   (assignSortSlots), so ranks stay interleaved by tier across departments.
 * - One save (crew_vessel_positions_save) for every change, checked
 *   against the affected count; refusals in a STORM sentence
 *   (positionRefusalMessage).
 * - D-01: no positions RPC yet -> "Positions are not set up yet"; any other
 *   error -> PageError with Retry. Nothing is mocked.
 */
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { notify } from '@/shared/lib/notify';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { CREW_CAPS } from '../paths';
import {
  ACCESS_SET_KEYS, ACCESS_SET_LABEL, DEFAULT_ACCESS_SET_FOR_TIER, POSITION_SCOPE_LABEL, RANK_TIERS, RANK_TIER_LABEL,
  type UnmatchedTitle, type VesselPosition,
} from '../types/domain';
import { groupByDepartment, heldBand, manningProblem, moveWithin, parseCount, positionRefusalMessage, toSaveRows } from '../lib/positions';
import { accessSetAfterTierChange, newPositionDefaults, newPositionSchemaFor, type NewPositionValues } from '../lib/positionSchema';
import { usePositions, useCreatePosition, useSaveVesselPositions, useSetPositionAlias, type PositionsVessel } from '../hooks/usePositions';
import { PositionPicker, type PositionOption } from './PositionPicker';

export interface PositionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel: PositionsVessel & { name: string };
}

// ---------------------------------------------------------------- draft model

interface CountText {
  min: string;
  max: string;
}

interface Draft {
  /** Listed positions, department by department, each department in its new order. */
  listed: VesselPosition[];
  /** Positions listed on the server and taken off the list here. */
  removed: VesselPosition[];
  counts: Record<string, CountText>;
}

const countsOf = (positions: readonly VesselPosition[]): Record<string, CountText> =>
  Object.fromEntries(positions.map((p) => [p.positionId, { min: String(p.minOnBoard), max: p.maxOnBoard === null ? '' : String(p.maxOnBoard) }]));

const listedOf = (positions: readonly VesselPosition[]) => groupByDepartment(positions.filter((p) => p.isListed)).flatMap((g) => g.positions);

const draftFrom = (positions: readonly VesselPosition[]): Draft => ({ listed: listedOf(positions), removed: [], counts: countsOf(positions) });

const valuesOf = (draft: Draft, p: VesselPosition) => {
  const c = draft.counts[p.positionId] ?? { min: '0', max: '' };
  return { min: parseCount(c.min) ?? 0, max: parseCount(c.max) };
};

const signature = (draft: Draft) =>
  draft.listed.map((p) => {
    const v = valuesOf(draft, p);
    return `${p.positionId}:${v.min}:${v.max ?? ''}`;
  }).join('|');

/** Insert a position into the listed array inside its department, by its rank order. */
function insertByRank(list: readonly VesselPosition[], p: VesselPosition): VesselPosition[] {
  const next = list.filter((x) => x.positionId !== p.positionId);
  const sameDept = next.map((x, i) => [x, i] as const).filter(([x]) => x.departmentKey === p.departmentKey);
  const after = sameDept.find(([x]) => x.sortOrder > p.sortOrder);
  if (after) next.splice(after[1], 0, p);
  else if (sameDept.length) next.splice(sameDept[sameDept.length - 1][1] + 1, 0, p);
  else next.push(p);
  return groupByDepartment(next).flatMap((g) => g.positions);
}

const toOption = (p: VesselPosition, hint?: string): PositionOption => ({
  id: p.positionId,
  name: p.name,
  departmentKey: p.departmentKey,
  departmentLabel: p.departmentLabel,
  departmentSort: p.departmentSort,
  rankTier: p.rankTier,
  sortOrder: p.sortOrder,
  hint,
});

const onBoardText = (n: number) => (n === 1 ? '1 on board' : `${n} on board`);

// ---------------------------------------------------------------- the drawer

export default function PositionsDrawer({ open, onOpenChange, vessel }: PositionsDrawerProps) {
  const [confirmClose, setConfirmClose] = React.useState(false);
  const dirtyRef = React.useRef(false);

  const requestOpenChange = (next: boolean) => {
    if (!next && dirtyRef.current) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        aria-describedby="positions-drawer-description"
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1 space-y-1">
            <SheetTitle className="type-title">Positions</SheetTitle>
            <SheetDescription id="positions-drawer-description" className="type-body-sm text-muted-foreground">
              {vessel.name}: the positions on board, their rank order, manning and default access.
            </SheetDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close positions" onClick={() => requestOpenChange(false)}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        {open ? <DrawerBody vessel={vessel} dirtyRef={dirtyRef} /> : null}
      </SheetContent>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close without saving?</AlertDialogTitle>
            <AlertDialogDescription>Your changes to the positions of {vessel.name} have not been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dirtyRef.current = false;
                setConfirmClose(false);
                onOpenChange(false);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function DrawerBody({ vessel, dirtyRef }: { vessel: PositionsDrawerProps['vessel']; dirtyRef: React.MutableRefObject<boolean> }) {
  const view = useCapability(CREW_CAPS.crewListView, { vesselId: vessel.id });
  const canAdmin = useCan(CREW_CAPS.complianceAdmin, { vesselId: vessel.id });
  const canCompanyAdmin = useCan(CREW_CAPS.complianceAdmin);
  const state = usePositions(vessel, { enabled: view.allowed });

  if (view.status === 'loading' || view.status === 'unknown') {
    return <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6"><PageLoading variant="list" rows={6} label="Checking your access" /></div>;
  }
  if (!view.allowed) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <AccessDenied
          title="You can't see this vessel's positions"
          detail="Seeing a vessel's crew list lets you see its positions. Ask a crew compliance administrator if you need it."
          backTo={null}
          headingLevel={3}
        />
      </div>
    );
  }
  if (state.status === 'idle' || state.status === 'loading') {
    return <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6"><PageLoading variant="list" rows={8} label="Loading positions" /></div>;
  }
  if (state.status === 'not-set-up') {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <PageEmpty
          title="Positions are not set up yet"
          body="The positions catalogue arrives with the crew update. Until then crew titles stay as they were typed."
          headingLevel={3}
        />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <PageError error={state.error} title="Positions could not load" onRetry={state.retry} treatMissingAsOff={false} headingLevel={3} />
      </div>
    );
  }
  return (
    <PositionsEditor
      vessel={vessel}
      positions={state.positions}
      unmatched={state.unmatched}
      canAdmin={canAdmin}
      canCompanyAdmin={canCompanyAdmin}
      dirtyRef={dirtyRef}
    />
  );
}

interface EditorProps {
  vessel: PositionsDrawerProps['vessel'];
  positions: VesselPosition[];
  unmatched: UnmatchedTitle[];
  canAdmin: boolean;
  canCompanyAdmin: boolean;
  dirtyRef: React.MutableRefObject<boolean>;
}

function PositionsEditor({ vessel, positions, unmatched, canAdmin, canCompanyAdmin, dirtyRef }: EditorProps) {
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(positions));
  const [showNew, setShowNew] = React.useState(false);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const resync = React.useRef(false);
  const save = useSaveVesselPositions(vessel);

  const serverSignature = React.useMemo(() => signature(draftFrom(positions)), [positions]);
  const dirty = signature(draft) !== serverSignature;
  React.useEffect(() => {
    dirtyRef.current = canAdmin && dirty;
  }, [canAdmin, dirty, dirtyRef]);

  // New server data: start again from it when nothing is pending (or just
  // after a save); otherwise keep the draft and add what was listed meanwhile.
  React.useEffect(() => {
    setDraft((current) => {
      if (resync.current || signature(current) === serverSignature) {
        resync.current = false;
        return draftFrom(positions);
      }
      const known = new Set([...current.listed, ...current.removed].map((p) => p.positionId));
      const fresh = new Map(positions.map((p) => [p.positionId, p]));
      let listed = current.listed.map((p) => fresh.get(p.positionId) ?? p);
      for (const p of positions) if (p.isListed && !known.has(p.positionId)) listed = insertByRank(listed, p);
      return { ...current, listed, counts: { ...countsOf(positions), ...current.counts } };
    });
  }, [positions, serverSignature]);

  const groups = React.useMemo(() => groupByDepartment(draft.listed), [draft.listed]);
  const listedIds = React.useMemo(() => new Set(draft.listed.map((p) => p.positionId)), [draft.listed]);
  const problems = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of draft.listed) {
      const v = valuesOf(draft, p);
      const problem = Number.isNaN(v.min) || (v.max !== null && Number.isNaN(v.max)) ? 'Use a whole number from 0 to 500.' : manningProblem(v.min, v.max);
      if (problem) out[p.positionId] = problem;
    }
    return out;
  }, [draft]);
  const hasProblems = Object.keys(problems).length > 0;

  const heldUnlisted = positions.filter((p) => p.holderCount > 0 && !listedIds.has(p.positionId));
  const catalogue = positions.filter((p) => !listedIds.has(p.positionId)).map((p) => toOption(p, p.holderCount ? onBoardText(p.holderCount) : undefined));
  const holders = draft.listed.reduce((n, p) => n + p.holderCount, 0);
  const short = draft.listed.filter((p) => heldBand(p.holderCount, valuesOf(draft, p).min, valuesOf(draft, p).max) === 'critical').length;

  const moveTo = (id: string, toIndex: number) =>
    setDraft((d) => {
      const gs = groupByDepartment(d.listed).map((g) =>
        g.positions.some((p) => p.positionId === id) ? { ...g, positions: moveWithin(g.positions, (p) => p.positionId, id, toIndex) } : g,
      );
      return { ...d, listed: gs.flatMap((g) => g.positions) };
    });

  const list = (p: VesselPosition) =>
    setDraft((d) => ({ ...d, listed: insertByRank(d.listed, p), removed: d.removed.filter((x) => x.positionId !== p.positionId) }));

  const unlist = (p: VesselPosition) =>
    setDraft((d) => ({
      ...d,
      listed: d.listed.filter((x) => x.positionId !== p.positionId),
      removed: p.isListed && !d.removed.some((x) => x.positionId === p.positionId) ? [...d.removed, p] : d.removed,
    }));

  const setCount = (id: string, field: keyof CountText, value: string) =>
    setDraft((d) => ({ ...d, counts: { ...d.counts, [id]: { ...(d.counts[id] ?? { min: '0', max: '' }), [field]: value } } }));

  const onSave = () => {
    const rows = toSaveRows(
      groupByDepartment(draft.listed).map((g) => ({
        positions: g.positions.map((p) => ({ ...p, minOnBoard: valuesOf(draft, p).min, maxOnBoard: valuesOf(draft, p).max })),
      })),
      draft.removed.filter((p) => !listedIds.has(p.positionId)),
    );
    save.mutate(rows, {
      onSuccess: () => {
        resync.current = true;
        notify.success(`Positions saved for ${vessel.name}`);
      },
      onError: (error) => notify.error(positionRefusalMessage(error), { title: 'The positions were not saved' }),
    });
  };

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
        <p className="type-body-sm text-muted-foreground" data-testid="positions-summary">
          <Users aria-hidden="true" className="mr-1.5 inline h-4 w-4 align-[-2px]" />
          {draft.listed.length === 1 ? '1 position listed' : `${draft.listed.length} positions listed`} · {onBoardText(holders)}
          {short ? ` · ${short === 1 ? '1 position' : `${short} positions`} below the minimum` : ''}
        </p>

        {!canAdmin ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 type-body-sm text-muted-foreground" role="note">
            You can see these positions. Changing them needs crew compliance administration on this vessel.
          </p>
        ) : null}

        {heldUnlisted.length ? (
          <div className="rounded-md border border-warning/40 bg-warning-muted px-3 py-2 type-body-sm" role="note" data-testid="held-unlisted">
            <p className="font-medium">Held on board but not listed</p>
            <ul className="mt-1 space-y-1">
              {heldUnlisted.map((p) => (
                <li key={p.positionId} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{p.name} · {onBoardText(p.holderCount)}</span>
                  {canAdmin ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => list(p)} aria-label={`List ${p.name} on this vessel`}>
                      List it
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {groups.length === 0 ? (
          <PageEmpty
            title="No positions listed yet"
            body={canAdmin ? 'Add the positions this vessel carries from the catalogue below, or create one.' : 'A crew compliance administrator lists the positions this vessel carries.'}
            headingLevel={3}
            compact
          />
        ) : (
          groups.map((g) => (
            <section key={g.departmentKey} aria-labelledby={`dept-${g.departmentKey}`} className="space-y-2">
              <h3 id={`dept-${g.departmentKey}`} className="flex items-center gap-2 type-eyebrow text-muted-foreground">
                <span>{g.departmentLabel}</span>
                <Badge variant="secondary" className="px-1.5 font-normal">{g.positions.length}</Badge>
              </h3>
              <ol className="divide-y divide-border rounded-md border border-border">
                {g.positions.map((p, index) => (
                  <PositionRow
                    key={p.positionId}
                    position={p}
                    index={index}
                    last={index === g.positions.length - 1}
                    counts={draft.counts[p.positionId] ?? { min: '0', max: '' }}
                    problem={problems[p.positionId]}
                    band={heldBand(p.holderCount, valuesOf(draft, p).min, valuesOf(draft, p).max)}
                    editable={canAdmin}
                    dragging={dragging === p.positionId}
                    onMove={(to) => moveTo(p.positionId, to)}
                    onUnlist={() => unlist(p)}
                    onCount={(field, value) => setCount(p.positionId, field, value)}
                    onDragStart={() => setDragging(p.positionId)}
                    onDragEnd={() => setDragging(null)}
                    onDropHere={() => {
                      if (dragging && g.positions.some((x) => x.positionId === dragging)) moveTo(dragging, index);
                      setDragging(null);
                    }}
                    acceptsDrop={Boolean(dragging) && g.positions.some((x) => x.positionId === dragging)}
                  />
                ))}
              </ol>
            </section>
          ))
        )}

        {canAdmin ? (
          <section aria-labelledby="positions-add" className="space-y-3 rounded-md border border-dashed border-border p-3">
            <h3 id="positions-add" className="type-subtitle">Add a position</h3>
            <PositionPicker
              label="Add a position from the catalogue"
              placeholder="List a position from the catalogue"
              options={catalogue}
              value={null}
              onChange={(id) => {
                const p = positions.find((x) => x.positionId === id);
                if (p) list(p);
              }}
              emptyText="No position matches. Create it below."
            />
            {showNew ? (
              <NewPositionForm
                vessel={vessel}
                positions={positions}
                canCompanyAdmin={canCompanyAdmin}
                onDone={() => setShowNew(false)}
              />
            ) : (
              <Button type="button" variant="outline" onClick={() => setShowNew(true)} className="w-full sm:w-auto" data-testid="new-position">
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                New position for this vessel
              </Button>
            )}
          </section>
        ) : null}

        <UnmatchedTitles vessel={vessel} titles={unmatched} positions={positions} editable={canAdmin} />
      </div>

      {canAdmin ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6" data-testid="positions-footer">
          {dirty ? <span className="basis-full type-caption text-muted-foreground sm:mr-auto sm:basis-auto">Unsaved changes</span> : null}
          <Button type="button" variant="outline" className="flex-1 sm:flex-none" disabled={!dirty || save.isPending} onClick={() => setDraft(draftFrom(positions))}>
            Discard changes
          </Button>
          <Button type="button" className="flex-1 sm:flex-none" disabled={!dirty || hasProblems || save.isPending} onClick={onSave}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- one row

interface RowProps {
  position: VesselPosition;
  index: number;
  last: boolean;
  counts: CountText;
  problem?: string;
  band: ReturnType<typeof heldBand>;
  editable: boolean;
  dragging: boolean;
  acceptsDrop: boolean;
  onMove: (toIndex: number) => void;
  onUnlist: () => void;
  onCount: (field: keyof CountText, value: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropHere: () => void;
}

function PositionRow({
  position: p, index, last, counts, problem, band, editable, dragging, acceptsDrop,
  onMove, onUnlist, onCount, onDragStart, onDragEnd, onDropHere,
}: RowProps) {
  const [over, setOver] = React.useState(false);
  const minId = `pos-min-${p.positionId}`;
  const maxId = `pos-max-${p.positionId}`;
  const errorId = `pos-err-${p.positionId}`;
  return (
    <li
      className={cn('space-y-2 px-3 py-2.5', dragging && 'opacity-50', over && acceptsDrop && 'bg-accent/40')}
      data-testid="position-row"
      data-position-id={p.positionId}
      draggable={editable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', p.positionId);
        onDragStart();
      }}
      onDragEnd={() => {
        setOver(false);
        onDragEnd();
      }}
      onDragOver={(event) => {
        if (!acceptsDrop) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onDropHere();
      }}
    >
      <div className="flex items-start gap-2">
        {editable ? <GripVertical aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" /> : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium">{p.name}</p>
            {p.scope !== 'system' ? <Badge variant="outline" className="font-normal">{POSITION_SCOPE_LABEL[p.scope]}</Badge> : null}
            {band === 'critical' || band === 'overmanned' ? <StatusPill domain="manning_band" status={band} /> : null}
          </div>
          <p className="type-caption text-muted-foreground">
            {RANK_TIER_LABEL[p.rankTier]} · {onBoardText(p.holderCount)}
            {p.defaultAccessSetKey ? ` · Access: ${ACCESS_SET_LABEL[p.defaultAccessSetKey]}` : ''}
            {p.stcwCapacity ? ` · ${p.stcwCapacity}` : ''}
          </p>
        </div>
      </div>
      {editable ? (
        <div className="flex flex-wrap items-end gap-3 sm:pl-6">
          <div className="space-y-1">
            <Label htmlFor={minId} className="type-caption text-muted-foreground">Min<span className="sr-only"> on board</span></Label>
            <Input
              id={minId}
              inputMode="numeric"
              value={counts.min}
              onChange={(event) => onCount('min', event.target.value)}
              className="w-[4.5rem]"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? errorId : undefined}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={maxId} className="type-caption text-muted-foreground">Max<span className="sr-only"> on board</span></Label>
            <Input
              id={maxId}
              inputMode="numeric"
              value={counts.max}
              placeholder="None"
              onChange={(event) => onCount('max', event.target.value)}
              className="w-[4.5rem]"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? errorId : undefined}
            />
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Move ${p.name} up`}>
              <ArrowUp aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" disabled={last} onClick={() => onMove(index + 1)} aria-label={`Move ${p.name} down`}>
              <ArrowDown aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onUnlist} aria-label={`Take ${p.name} off this vessel's list`}>
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
          {problem ? <p id={errorId} className="basis-full type-caption text-critical" role="alert">{problem}</p> : null}
        </div>
      ) : (
        <p className="type-caption text-muted-foreground">
          Minimum {p.minOnBoard} · Maximum {p.maxOnBoard ?? 'none'}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- new position

function NewPositionForm({
  vessel, positions, canCompanyAdmin, onDone,
}: { vessel: PositionsDrawerProps['vessel']; positions: VesselPosition[]; canCompanyAdmin: boolean; onDone: () => void }) {
  const create = useCreatePosition(vessel);
  const departments = React.useMemo(() => {
    const seen = new Map<string, { key: string; label: string; sort: number }>();
    for (const p of positions) if (!seen.has(p.departmentKey)) seen.set(p.departmentKey, { key: p.departmentKey, label: p.departmentLabel, sort: p.departmentSort });
    return [...seen.values()].sort((a, b) => a.sort - b.sort);
  }, [positions]);
  const schema = React.useMemo(() => newPositionSchemaFor(positions), [positions]);
  const form = useForm<NewPositionValues>({ resolver: zodResolver(schema), defaultValues: newPositionDefaults() });
  const tier = form.watch('rankTier');
  const previousTier = React.useRef(tier);
  React.useEffect(() => {
    if (previousTier.current !== tier) {
      form.setValue('defaultAccessSetKey', accessSetAfterTierChange(form.getValues('defaultAccessSetKey'), previousTier.current, tier));
      previousTier.current = tier;
    }
  }, [tier, form]);

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(
      {
        name: values.name,
        departmentKey: values.departmentKey,
        rankTier: values.rankTier,
        defaultAccessSetKey: values.defaultAccessSetKey,
        vesselOnly: canCompanyAdmin ? values.vesselOnly : true,
      },
      {
        onSuccess: (row) => {
          notify.success(`${row.name} added to ${values.vesselOnly || !canCompanyAdmin ? vessel.name : 'the company'}`);
          form.reset(newPositionDefaults());
          onDone();
        },
        onError: (error) => notify.error(positionRefusalMessage(error), { title: 'The position was not created' }),
      },
    );
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-border p-3" aria-labelledby="new-position-title" noValidate>
        <h4 id="new-position-title" className="type-subtitle">New position</h4>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl><Input {...field} maxLength={80} placeholder="For example Tender Operator" autoComplete="off" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="departmentKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Choose a department" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {departments.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rankTier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rank tier</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {RANK_TIERS.map((t) => <SelectItem key={t} value={t}>{RANK_TIER_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="defaultAccessSetKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default access set</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {ACCESS_SET_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {ACCESS_SET_LABEL[k]}{k === DEFAULT_ACCESS_SET_FOR_TIER[tier] ? ' (usual for this tier)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>New crew in this position start from this access set.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {canCompanyAdmin ? (
          <FormField
            control={form.control}
            name="vesselOnly"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Where it applies</FormLabel>
                <FormControl>
                  <RadioGroup value={field.value ? 'vessel' : 'company'} onValueChange={(v) => field.onChange(v === 'vessel')} className="gap-2">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="vessel" id="new-position-vessel" />
                      <Label htmlFor="new-position-vessel" className="font-normal">Only {vessel.name}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="company" id="new-position-company" />
                      <Label htmlFor="new-position-company" className="font-normal">Every vessel of the company</Label>
                    </div>
                  </RadioGroup>
                </FormControl>
              </FormItem>
            )}
          />
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create position'}</Button>
        </div>
      </form>
    </Form>
  );
}

// ---------------------------------------------------------------- unmatched titles

function UnmatchedTitles({
  vessel, titles, positions, editable,
}: { vessel: PositionsDrawerProps['vessel']; titles: UnmatchedTitle[]; positions: VesselPosition[]; editable: boolean }) {
  const [open, setOpen] = React.useState(titles.length > 0 && titles.length <= 5);
  const alias = useSetPositionAlias(vessel);
  const options = React.useMemo(() => positions.map((p) => toOption(p)), [positions]);
  const people = titles.reduce((n, t) => n + t.holderCount, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-[var(--control-h)] w-full items-center justify-between gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="unmatched-toggle"
        >
          <span className="type-subtitle">Unmatched titles ({titles.length})</span>
          <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 transition-transform duration-quick', open && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t border-border px-3 py-3">
        {titles.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">Every title used on {vessel.name} matches a position.</p>
        ) : (
          <>
            <p className="type-body-sm text-muted-foreground">
              {people === 1 ? '1 crew member has' : `${people} crew members have`} a title that matches no position.
              {editable ? ' Map each title once and it counts for every vessel of the company.' : ''}
            </p>
            <ul className="space-y-3">
              {titles.map((t) => (
                <li key={t.titleKey} className="space-y-1.5" data-testid="unmatched-title">
                  <p className="type-body-sm"><span className="font-medium">{t.title}</span> · {onBoardText(t.holderCount)}</p>
                  {editable ? (
                    <PositionPicker
                      label={`Map ${t.title} to a position`}
                      placeholder="Map to a position"
                      options={options}
                      value={null}
                      disabled={alias.isPending}
                      onChange={(id, option) => {
                        if (!id || !option) return;
                        alias.mutate(
                          { title: t.title, positionId: id },
                          {
                            onSuccess: () => notify.success(`"${t.title}" now counts as ${option.name}`),
                            onError: (error) => notify.error(positionRefusalMessage(error), { title: 'The title was not mapped' }),
                          },
                        );
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
