/**
 * One day of work and rest on a 24-hour track (gap/04 C37, W6). Work
 * periods are stored; every minute that is not work is rest, as the engine
 * reads it (lib/complianceEngine.ts, work_rest_save_day).
 *
 * Mouse and touch: press on the track and drag to paint. Starting on rest
 * paints work, starting on work paints rest; a tap switches one quarter
 * hour.
 *
 * Keyboard (T-143; the track is a slider over the 96 quarter hours, with a
 * visible focus ring and cursor):
 *   ← →            move the cursor 15 minutes
 *   PgUp PgDn      move it 1 hour
 *   Home End       the start or the end of the day
 *   Space, Enter   switch the quarter hour under the cursor between rest and work
 *   Shift + ← →    move and carry the cursor's rest or work along
 *
 * With `showPeriods` (the day editor) the logged periods are listed under
 * the track, rest and work in turn from 00:00 to 24:00, with Add period
 * (work or rest, any minute) and Edit for a work period (times, category,
 * note). Times that are not on the quarter hour are kept as entered.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusPill } from '@/shared/components/status';
import type { WorkRestBlock } from '../types';

const DAY = 1440;
const SLOT = 15;
const SLOTS = DAY / SLOT;
const HOUR_SLOTS = 60 / SLOT;

type Span = readonly [number, number];

const clampMinute = (m: number) => Math.max(0, Math.min(DAY, Math.round(m)));

function fmtTime(min: number): string {
  const m = clampMinute(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "6 h 15 m", "45 m", "24 h". */
function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} m`;
  return h ? `${h} h` : `${m} m`;
}

/** "HH:MM" (00:00 to 24:00) to minutes, or null. */
function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}

/** The work periods, sorted and merged (overlapping or touching periods become one; distinct notes are kept). */
function mergeWork(blocks: readonly WorkRestBlock[]): WorkRestBlock[] {
  const work = blocks
    .filter((b) => b.block_type === 'work')
    .map((b) => ({ ...b, start_minute: clampMinute(b.start_minute), end_minute: clampMinute(b.end_minute) }))
    .filter((b) => b.end_minute > b.start_minute)
    .sort((a, b) => a.start_minute - b.start_minute);
  const out: WorkRestBlock[] = [];
  for (const b of work) {
    const last = out[out.length - 1];
    if (last && b.start_minute <= last.end_minute) {
      last.end_minute = Math.max(last.end_minute, b.end_minute);
      if (b.notes && b.notes !== last.notes) last.notes = last.notes ? `${last.notes}; ${b.notes}` : b.notes;
      if (!last.category && b.category) last.category = b.category;
    } else {
      out.push({ block_type: 'work', start_minute: b.start_minute, end_minute: b.end_minute, category: b.category ?? null, notes: b.notes ?? null });
    }
  }
  return out;
}

/** Marks [from, to) as work. */
function addWork(blocks: readonly WorkRestBlock[], from: number, to: number): WorkRestBlock[] {
  if (to <= from) return mergeWork(blocks);
  return mergeWork([...blocks, { block_type: 'work', start_minute: from, end_minute: to }]);
}

/** Marks [from, to) as rest: work periods are cut around it, keeping their category and note. */
function addRest(blocks: readonly WorkRestBlock[], from: number, to: number): WorkRestBlock[] {
  if (to <= from) return mergeWork(blocks);
  const out: WorkRestBlock[] = [];
  for (const b of mergeWork(blocks)) {
    if (b.end_minute <= from || b.start_minute >= to) {
      out.push(b);
      continue;
    }
    if (b.start_minute < from) out.push({ ...b, end_minute: from });
    if (b.end_minute > to) out.push({ ...b, start_minute: to });
  }
  return mergeWork(out);
}

/** True when work covers the whole of [from, to). */
function isWork(work: readonly WorkRestBlock[], from: number, to: number): boolean {
  return work.some((b) => b.start_minute <= from && b.end_minute >= to);
}

/** The day as periods of rest and work in turn, 00:00 to 24:00. */
function periodsOf(work: readonly WorkRestBlock[]): Array<{ kind: 'rest' | 'work'; from: number; to: number; block?: WorkRestBlock }> {
  const out: Array<{ kind: 'rest' | 'work'; from: number; to: number; block?: WorkRestBlock }> = [];
  let cursor = 0;
  for (const b of work) {
    if (b.start_minute > cursor) out.push({ kind: 'rest', from: cursor, to: b.start_minute });
    out.push({ kind: 'work', from: b.start_minute, to: b.end_minute, block: b });
    cursor = b.end_minute;
  }
  if (cursor < DAY) out.push({ kind: 'rest', from: cursor, to: DAY });
  return out;
}

const spanOf = (a: number, b: number): Span => [Math.min(a, b) * SLOT, (Math.max(a, b) + 1) * SLOT];

export interface DayTimelineProps {
  /** YYYY-MM-DD */
  date: string;
  /** How the day is named to assistive technology ("Saturday 21 November"). */
  label: string;
  blocks: readonly WorkRestBlock[];
  /** Called with the day's work periods, merged. */
  onChange: (blocks: WorkRestBlock[]) => void;
  disabled?: boolean;
  /** Why the day cannot be changed (shown under the track). */
  disabledReason?: string | null;
  /** `md` for the day editor, `sm` for a week row. */
  size?: 'md' | 'sm';
  /** The logged periods with Add period and Edit (the day editor). */
  showPeriods?: boolean;
  /** Show the keyboard help line (the day editor). */
  showHelp?: boolean;
}

export const DayTimeline: React.FC<DayTimelineProps> = ({
  date,
  label,
  blocks,
  onChange,
  disabled = false,
  disabledReason,
  size = 'md',
  showPeriods = false,
  showHelp = false,
}) => {
  const work = useMemo(() => mergeWork(blocks), [blocks]);
  const trackRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const [cursor, setCursor] = useState(32); // 08:00
  const [focused, setFocused] = useState(false);
  const [drag, setDrag] = useState<{ anchor: number; current: number; mode: 'work' | 'rest' } | null>(null);
  const [editing, setEditing] = useState<WorkRestBlock | null>(null);

  // A new day starts with the cursor at 08:00 again.
  useEffect(() => setCursor(32), [date]);

  const slotIsWork = useCallback((slot: number) => isWork(work, slot * SLOT, (slot + 1) * SLOT), [work]);

  const apply = useCallback(
    (mode: 'work' | 'rest', [from, to]: Span) => onChange(mode === 'work' ? addWork(work, from, to) : addRest(work, from, to)),
    [onChange, work],
  );

  const slotFromX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width > 0 && Number.isFinite(clientX) ? (clientX - rect.left) / rect.width : 0;
    return Math.max(0, Math.min(SLOTS - 1, Math.floor(ratio * SLOTS)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button > 0) return;
    e.preventDefault();
    trackRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const slot = slotFromX(e.clientX);
    setCursor(slot);
    setDrag({ anchor: slot, current: slot, mode: slotIsWork(slot) ? 'rest' : 'work' });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const slot = slotFromX(e.clientX);
    if (slot !== drag.current) setDrag({ ...drag, current: slot });
  };
  const onPointerUp = () => {
    if (!drag) return;
    apply(drag.mode, spanOf(drag.anchor, drag.current));
    setCursor(drag.current);
    setDrag(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = cursor + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = cursor - 1;
        break;
      case 'PageUp':
        next = cursor + HOUR_SLOTS;
        break;
      case 'PageDown':
        next = cursor - HOUR_SLOTS;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = SLOTS - 1;
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        if (!disabled) apply(slotIsWork(cursor) ? 'rest' : 'work', spanOf(cursor, cursor));
        return;
      default:
        return;
    }
    e.preventDefault();
    const target = Math.max(0, Math.min(SLOTS - 1, next));
    if (e.shiftKey && !disabled && target !== cursor) {
      // Carry the cursor's state along: the quarter hours passed take it.
      apply(slotIsWork(cursor) ? 'work' : 'rest', spanOf(cursor, target));
    }
    setCursor(target);
  };

  const cursorWork = slotIsWork(cursor);
  const valueText = `${fmtTime(cursor * SLOT)} to ${fmtTime((cursor + 1) * SLOT)}, ${cursorWork ? 'work' : 'rest'}`;
  const labels = size === 'md' ? [0, 3, 6, 9, 12, 15, 18, 21, 24] : [0, 6, 12, 18, 24];
  const preview = drag ? spanOf(drag.anchor, drag.current) : null;
  const totalWork = work.reduce((sum, b) => sum + (b.end_minute - b.start_minute), 0);

  return (
    <div className="min-w-0 space-y-1.5" data-day-timeline={date}>
      <div className="relative h-4 type-caption tabular-nums text-muted-foreground" aria-hidden="true">
        {labels.map((h) => (
          <span
            key={h}
            className={cn('absolute top-0', h === 0 ? 'translate-x-0' : h === 24 ? '-translate-x-full' : '-translate-x-1/2')}
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`Work and rest, ${label}`}
        aria-valuemin={0}
        aria-valuemax={DAY - SLOT}
        aria-valuenow={cursor * SLOT}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        aria-describedby={showHelp ? helpId : undefined}
        data-cursor={cursor}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        className={cn(
          'relative w-full touch-none select-none overflow-hidden rounded-md border border-success/30 bg-success-muted outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          size === 'md' ? 'h-14' : 'h-10 [@media(pointer:coarse)]:h-11',
          disabled ? 'cursor-default opacity-70' : 'cursor-crosshair',
        )}
      >
        {Array.from({ length: 23 }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn('pointer-events-none absolute inset-y-0 border-l', (i + 1) % 6 === 0 ? 'border-border' : 'border-border/40')}
            style={{ left: `${((i + 1) / 24) * 100}%` }}
          />
        ))}
        {work.map((b) => (
          <span
            key={`${b.start_minute}-${b.end_minute}`}
            aria-hidden="true"
            data-work-block={`${fmtTime(b.start_minute)}-${fmtTime(b.end_minute)}`}
            className="pointer-events-none absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-sm bg-primary px-1 text-primary-foreground shadow-sm"
            style={{ left: `${(b.start_minute / DAY) * 100}%`, width: `${((b.end_minute - b.start_minute) / DAY) * 100}%` }}
          >
            {b.end_minute - b.start_minute >= (size === 'md' ? 120 : 240) ? (
              <span
                className={cn(
                  'truncate type-caption font-medium tabular-nums',
                  // On a phone the bar is narrow: a label that would be cut short is left to the periods list.
                  b.end_minute - b.start_minute < (size === 'md' ? 420 : 600) && 'hidden sm:inline',
                )}
              >
                {fmtTime(b.start_minute)}–{fmtTime(b.end_minute)}
              </span>
            ) : null}
          </span>
        ))}
        {preview ? (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-y-0 rounded-sm border-2',
              drag?.mode === 'work' ? 'border-primary bg-primary/40' : 'border-success bg-success-muted',
            )}
            style={{ left: `${(preview[0] / DAY) * 100}%`, width: `${((preview[1] - preview[0]) / DAY) * 100}%` }}
          />
        ) : null}
        {focused ? (
          <span
            aria-hidden="true"
            data-timeline-cursor=""
            className="pointer-events-none absolute inset-y-0 rounded-sm border-2 border-ring bg-ring/20"
            style={{ left: `${(cursor / SLOTS) * 100}%`, width: `${(1 / SLOTS) * 100}%` }}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 type-caption text-muted-foreground">
        <span className="tabular-nums">
          Work {fmtDuration(totalWork)} · Rest {fmtDuration(DAY - totalWork)}
        </span>
        {focused ? <span className="tabular-nums text-foreground">{valueText}</span> : null}
      </div>
      {disabled && disabledReason ? <p className="type-caption text-muted-foreground">{disabledReason}</p> : null}
      {showHelp ? (
        <p id={helpId} className="type-caption text-muted-foreground">
          Drag on the bar to mark work or rest. With the keyboard: arrow keys move 15 minutes, Page Up and Page Down an hour, Space switches rest
          and work, Shift with an arrow carries it along.
        </p>
      ) : null}
      {showPeriods ? <PeriodList work={work} disabled={disabled} onChange={onChange} onEdit={setEditing} /> : null}
      {editing ? (
        <WorkPeriodDialog
          block={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            const without = addRest(work, editing.start_minute, editing.end_minute);
            onChange(mergeWork([...without, next]));
            setEditing(null);
          }}
          onRemove={() => {
            onChange(addRest(work, editing.start_minute, editing.end_minute));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- periods

const timeField = z
  .string()
  .trim()
  .refine((v) => parseTime(v) !== null, { message: 'Use HH:MM, 00:00 to 24:00' });

const periodSchema = z
  .object({ kind: z.enum(['work', 'rest']), from: timeField, to: timeField })
  .refine((v) => (parseTime(v.to) ?? 0) > (parseTime(v.from) ?? 0), { message: 'The end comes after the start', path: ['to'] });
type PeriodValues = z.infer<typeof periodSchema>;

const PeriodList: React.FC<{
  work: readonly WorkRestBlock[];
  disabled: boolean;
  onChange: (blocks: WorkRestBlock[]) => void;
  onEdit: (block: WorkRestBlock) => void;
}> = ({ work, disabled, onChange, onEdit }) => {
  const periods = periodsOf(work);
  const form = useForm<PeriodValues>({ resolver: zodResolver(periodSchema), defaultValues: { kind: 'work', from: '', to: '' } });
  const submit = form.handleSubmit((values) => {
    const from = parseTime(values.from) ?? 0;
    const to = parseTime(values.to) ?? 0;
    onChange(values.kind === 'work' ? addWork(work, from, to) : addRest(work, from, to));
    form.reset({ kind: values.kind, from: '', to: '' });
  });

  return (
    <div className="space-y-3 pt-1" data-period-list="">
      <h3 className="type-eyebrow text-muted-foreground">Logged periods</h3>
      <ul className="divide-y divide-border rounded-md border border-border">
        {periods.map((p) => (
          <li key={`${p.kind}-${p.from}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="w-[7.5rem] shrink-0 type-mono tabular-nums">
              {fmtTime(p.from)}–{fmtTime(p.to)}
            </span>
            <StatusPill tone={p.kind === 'work' ? 'signal' : 'ok'} icon={null}>
              {p.kind === 'work' ? 'Work' : 'Rest'}
            </StatusPill>
            <span className="type-body-sm tabular-nums text-muted-foreground">{fmtDuration(p.to - p.from)}</span>
            {p.block?.category || p.block?.notes ? (
              <span className="min-w-0 flex-1 truncate type-body-sm text-muted-foreground">
                {[p.block.category, p.block.notes].filter(Boolean).join(' · ')}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            {p.kind === 'work' && p.block && !disabled ? (
              <span className="flex items-center gap-1">
                <Button type="button" size="sm" variant="ghost" className="[@media(pointer:coarse)]:h-11" onClick={() => p.block && onEdit(p.block)} aria-label={`Edit work ${fmtTime(p.from)} to ${fmtTime(p.to)}`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="[@media(pointer:coarse)]:h-11"
                  onClick={() => onChange(addRest(work, p.from, p.to))}
                  aria-label={`Mark ${fmtTime(p.from)} to ${fmtTime(p.to)} as rest`}
                >
                  <Trash2 aria-hidden="true" />
                  Rest
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {disabled ? null : (
        <Form {...form}>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-label="Add period" noValidate>
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem className="w-28">
                  <FormLabel>Period</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger aria-label="Period type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="work">Work</SelectItem>
                      <SelectItem value="rest">Rest</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="from"
              render={({ field }) => (
                <FormItem className="w-24">
                  <FormLabel>From</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" placeholder="08:00" autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem className="w-24">
                  <FormLabel>To</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" placeholder="12:00" autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" variant="outline">
              <Plus aria-hidden="true" />
              Add period
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
};

const workSchema = z
  .object({ from: timeField, to: timeField, category: z.string().trim().max(60, 'Keep it to 60 characters'), notes: z.string().trim().max(500, 'Keep it to 500 characters') })
  .refine((v) => (parseTime(v.to) ?? 0) > (parseTime(v.from) ?? 0), { message: 'The end comes after the start', path: ['to'] });
type WorkValues = z.infer<typeof workSchema>;

const WorkPeriodDialog: React.FC<{
  block: WorkRestBlock;
  onClose: () => void;
  onSave: (block: WorkRestBlock) => void;
  onRemove: () => void;
}> = ({ block, onClose, onSave, onRemove }) => {
  const form = useForm<WorkValues>({
    resolver: zodResolver(workSchema),
    defaultValues: { from: fmtTime(block.start_minute), to: fmtTime(block.end_minute), category: block.category ?? '', notes: block.notes ?? '' },
  });
  const submit = form.handleSubmit((v) =>
    onSave({
      block_type: 'work',
      start_minute: parseTime(v.from) ?? block.start_minute,
      end_minute: parseTime(v.to) ?? block.end_minute,
      category: v.category || null,
      notes: v.notes || null,
    }),
  );
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit work period</DialogTitle>
          <DialogDescription>Change the times, or add what the work was. Rest is every minute outside work.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-3" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>To</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Watch, drill, port, maintenance" autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={onRemove}>
                <Trash2 aria-hidden="true" />
                Mark as rest
              </Button>
              <span className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit">Save period</Button>
              </span>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default DayTimeline;
