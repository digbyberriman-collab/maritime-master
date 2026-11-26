/**
 * "Vessels shown" filter for the Fleet pages (gap/02 D1; D-X5-09): a button
 * with the current selection and a popover with every vessel the user
 * reaches.
 *
 * - The popover edits a draft: ticks, "All n" and the tick helpers change
 *   only the draft, "Show n vessels" (or Enter) applies it, Escape or
 *   Cancel drops it. A draft with no vessel cannot be applied.
 * - "All n" is the default selection: every counted vessel. Vessels that do
 *   not count in fleet totals (X3) are listed apart and are never ticked by
 *   "All"; they can be ticked one by one (D-X5-22).
 * - Tick helpers (`VesselTickHelpers`): tick every vessel of a flag state,
 *   a classification society or a fleet group. Shared with the fleet
 *   documents publish dialog (X5-04B), with `VesselChecklist`.
 * - Keyboard: the trigger opens it (Enter / Space), focus moves into the
 *   popover, Tab walks the search, "All", the helpers, each vessel and the
 *   buttons in that order, Space ticks, Enter applies, Escape closes and
 *   returns focus to the trigger. Every row is 44 px on a coarse pointer,
 *   and the popover never grows wider than the viewport less 2 rem.
 */
import * as React from 'react';
import { ChevronDown, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  normaliseSelection,
  sameSelection,
  tickVessels,
  toggleVessel,
  vesselTickOptions,
  vesselsShownSummary,
  type FleetGroupName,
  type ShownVessel,
  type VesselTickOption,
} from '../lib/vesselsShown';

/** Above this many vessels the popover offers a search box. */
const SEARCH_FROM = 9;

const ROW =
  'flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent/60 has-[:focus-visible]:bg-accent/60 [@media(pointer:coarse)]:min-h-11';

const plural = (n: number) => `${n} ${n === 1 ? 'vessel' : 'vessels'}`;

// ─── Tick helpers ─────────────────────────────────────────────────────────

export interface VesselTickHelpersProps {
  vessels: readonly ShownVessel[];
  fleetGroups?: readonly FleetGroupName[];
  /** Tick these vessels (added to the selection by the caller). */
  onTick: (vesselIds: string[]) => void;
  disabled?: boolean;
  className?: string;
}

/** A helper is worth showing when it splits the list: two choices, or one that leaves vessels out. */
const splits = (options: readonly VesselTickOption[], total: number) =>
  options.length >= 2 || (options.length === 1 && options[0].vesselIds.length < total);

function TickSelect({
  label,
  placeholder,
  options,
  onTick,
  disabled,
}: {
  label: string;
  placeholder: string;
  options: readonly VesselTickOption[];
  onTick: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value=""
      disabled={disabled}
      onChange={(event) => {
        const option = options.find((o) => o.key === event.target.value);
        if (option) onTick(option.vesselIds);
      }}
      className={cn(
        'h-9 min-w-0 flex-1 basis-24 truncate rounded-md border border-input bg-field px-2 type-body-sm text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
        'disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:h-11',
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label} ({o.vesselIds.length})
        </option>
      ))}
    </select>
  );
}

/**
 * "Tick by" choices: flag state, classification society, fleet group. Each
 * select ticks every vessel of the choice and returns to its placeholder.
 * Renders nothing when no helper would split the list.
 */
export function VesselTickHelpers({ vessels, fleetGroups = [], onTick, disabled, className }: VesselTickHelpersProps) {
  const options = React.useMemo(() => vesselTickOptions(vessels, fleetGroups), [vessels, fleetGroups]);
  const total = vessels.length;
  const shown = {
    flags: splits(options.flags, total),
    classes: splits(options.classes, total),
    groups: splits(options.fleetGroups, total),
  };
  if (!shown.flags && !shown.classes && !shown.groups) return null;
  return (
    <div role="group" aria-label="Tick vessels by" className={cn('flex flex-col gap-1.5', className)}>
      <span aria-hidden="true" className="type-caption text-muted-foreground">
        Tick by
      </span>
      <div className="flex min-w-0 flex-wrap gap-2">
        {shown.flags && (
          <TickSelect label="Tick the vessels of a flag state" placeholder="Flag" options={options.flags} onTick={onTick} disabled={disabled} />
        )}
        {shown.classes && (
          <TickSelect
            label="Tick the vessels of a classification society"
            placeholder="Class"
            options={options.classes}
            onTick={onTick}
            disabled={disabled}
          />
        )}
        {shown.groups && (
          <TickSelect label="Tick the vessels of a fleet group" placeholder="Group" options={options.fleetGroups} onTick={onTick} disabled={disabled} />
        )}
      </div>
    </div>
  );
}

// ─── Checklist ────────────────────────────────────────────────────────────

export interface VesselChecklistProps {
  vessels: readonly ShownVessel[];
  selectedIds: readonly string[];
  onToggle: (vesselId: string) => void;
  /** Accessible name of the list. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

function VesselRow({ vessel, checked, onToggle, disabled }: { vessel: ShownVessel; checked: boolean; onToggle: () => void; disabled?: boolean }) {
  const id = React.useId();
  const meta = [vessel.flagState, vessel.classificationSociety].filter(Boolean).join(' · ');
  return (
    <li>
      <label htmlFor={id} className={cn(ROW, disabled && 'cursor-not-allowed opacity-60')}>
        <Checkbox id={id} checked={checked} onCheckedChange={onToggle} disabled={disabled} data-vessel-id={vessel.id} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-[0.9375rem] font-semibold text-foreground">{vessel.name}</span>
            {vessel.code && (
              <span className="type-mono shrink-0 rounded-sm border border-input px-1 uppercase leading-4 text-muted-foreground">{vessel.code}</span>
            )}
          </span>
          {meta && <span className="truncate type-caption text-muted-foreground">{meta}</span>}
        </span>
      </label>
    </li>
  );
}

/**
 * The vessel checkboxes: counted vessels first, then the ones that do not
 * count in fleet totals under their own heading. Controlled.
 */
export function VesselChecklist({ vessels, selectedIds, onToggle, label = 'Vessels', disabled, className }: VesselChecklistProps) {
  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const counted = vessels.filter((v) => v.counted);
  const uncounted = vessels.filter((v) => !v.counted);
  const headingId = React.useId();
  return (
    <div className={cn('min-w-0', className)}>
      <ul aria-label={label} className="flex min-w-0 flex-col">
        {counted.map((v) => (
          <VesselRow key={v.id} vessel={v} checked={selected.has(v.id)} onToggle={() => onToggle(v.id)} disabled={disabled} />
        ))}
      </ul>
      {uncounted.length > 0 && (
        <>
          <p id={headingId} className="mt-2 px-2 pb-1 type-eyebrow text-muted-foreground">
            Not counted in fleet totals
          </p>
          <ul aria-labelledby={headingId} className="flex min-w-0 flex-col">
            {uncounted.map((v) => (
              <VesselRow key={v.id} vessel={v} checked={selected.has(v.id)} onToggle={() => onToggle(v.id)} disabled={disabled} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── Filter ───────────────────────────────────────────────────────────────

export interface FleetVesselsFilterProps {
  /** Every vessel the user reaches (`useFleetVesselsShown().vessels`). */
  vessels: readonly ShownVessel[];
  /** The vessels shown now. */
  selectedIds: readonly string[];
  /** The default selection: every counted vessel. */
  countedIds: readonly string[];
  fleetGroups?: readonly FleetGroupName[];
  /** `?vessels=` codes that matched no vessel, said once in the popover. */
  droppedCodes?: readonly string[];
  /** Apply a selection (never empty). */
  onApply: (vesselIds: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function FleetVesselsFilter({
  vessels,
  selectedIds,
  countedIds,
  fleetGroups,
  droppedCodes = [],
  onApply,
  disabled,
  className,
}: FleetVesselsFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>(() => normaliseSelection(vessels, selectedIds));
  const [query, setQuery] = React.useState('');
  const titleId = React.useId();
  const statusId = React.useId();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const allRef = React.useRef<HTMLButtonElement>(null);

  const isDefault = sameSelection(selectedIds, countedIds);
  const summary = vesselsShownSummary({ selected: selectedIds.length, total: vessels.length, counted: countedIds.length, isDefault });
  // "All": the counted vessels, or every vessel when none counts.
  const allIds = countedIds.length ? [...countedIds] : vessels.map((v) => v.id);
  const allLabel = countedIds.length && countedIds.length < vessels.length ? `All ${countedIds.length} counted` : `All ${allIds.length}`;
  const allState: boolean | 'indeterminate' = sameSelection(draft, allIds) ? true : draft.length === 0 ? false : 'indeterminate';

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraft(normaliseSelection(vessels, selectedIds));
      setQuery('');
    }
    setOpen(next);
  };

  const apply = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!draft.length) return;
    onApply(draft);
    setOpen(false);
  };

  const needle = query.trim().toLocaleLowerCase();
  const listed = needle
    ? vessels.filter((v) => v.name.toLocaleLowerCase().includes(needle) || (v.code ?? '').toLocaleLowerCase().includes(needle))
    : vessels;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || vessels.length === 0}
          aria-label={`Vessels shown: ${summary}`}
          className={cn('max-w-full justify-start gap-2', className)}
        >
          <Ship aria-hidden="true" />
          <span className="truncate">{summary}</span>
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        aria-labelledby={titleId}
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(event) => {
          // Start where the work is: the search box, else "All" (not the first helper).
          event.preventDefault();
          (searchRef.current ?? allRef.current)?.focus();
        }}
      >
        <form onSubmit={apply} className="flex max-h-[min(36rem,calc(100dvh-8rem))] min-w-0 flex-col">
          <div className="flex min-w-0 flex-col gap-3 border-b border-border p-3">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <p id={titleId} className="type-subtitle text-foreground">
                Vessels shown
              </p>
              <p id={statusId} aria-live="polite" className="shrink-0 type-caption tabular-nums text-muted-foreground">
                {draft.length ? `${draft.length} of ${vessels.length} ticked` : 'None ticked'}
              </p>
            </div>
            {droppedCodes.length > 0 && (
              <p className="type-caption text-muted-foreground">
                Not among your vessels, so left out: <span className="type-mono">{droppedCodes.join(', ')}</span>
              </p>
            )}
            {vessels.length >= SEARCH_FROM && (
              <Input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a vessel"
                aria-label="Find a vessel by name or code"
                autoComplete="off"
              />
            )}
            <VesselTickHelpers vessels={vessels} fleetGroups={fleetGroups} onTick={(ids) => setDraft((d) => tickVessels(vessels, d, ids))} />
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
            <label className={cn(ROW, 'font-medium')}>
              <Checkbox
                ref={allRef}
                checked={allState}
                onCheckedChange={() => setDraft(allState === true ? [] : normaliseSelection(vessels, allIds))}
                aria-describedby={statusId}
              />
              <span className="min-w-0 flex-1 truncate type-body-sm text-foreground">{allLabel}</span>
            </label>
            <div role="separator" className="mx-2 my-1 h-px bg-border" />
            {listed.length ? (
              <VesselChecklist vessels={listed} selectedIds={draft} onToggle={(id) => setDraft((d) => toggleVessel(vessels, d, id))} />
            ) : (
              <p className="px-2 py-3 type-body-sm text-muted-foreground">No vessel matches “{query.trim()}”.</p>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-border p-3">
            {!draft.length && <p className="w-full type-caption text-muted-foreground">Tick at least one vessel.</p>}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!draft.length}>
              {draft.length ? `Show ${plural(draft.length)}` : 'Show vessels'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export default FleetVesselsFilter;
