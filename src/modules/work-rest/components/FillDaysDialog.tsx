/**
 * Fill days (gap/04 C37: copy a template day or the previous day). The
 * person picks what to copy and where to:
 *
 * - from: the day before the first day filled, a day of this month that has
 *   an entry, or one of STORM's watch patterns;
 * - to: a range of days in the month on screen, only the days open to the
 *   viewer (expected, the month open), by default only those with no entry.
 *
 * Nothing is saved here: the filled days join the unsaved changes and Save
 * sends them through the engine one by one (work_rest_save_day), or the
 * legacy path while the engine is missing (D-01). The engine's own fill RPC
 * takes at most 31 days, and so does this.
 */
import React, { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WorkRestBlock } from '../types';

/** The most days one fill may change (the engine's work_rest_fill_days limit). */
const MAX_TARGETS = 31;

/** STORM's watch patterns (work periods; every other minute is rest). */
const PATTERNS: ReadonlyArray<{ key: string; label: string; work: ReadonlyArray<readonly [number, number]> }> = [
  { key: 'day_work', label: 'Day work 08:00–17:00, break 12:00–13:00', work: [[480, 720], [780, 1020]] },
  { key: 'watch_00_04', label: 'Watch 00–04 and 12–16', work: [[0, 240], [720, 960]] },
  { key: 'watch_04_08', label: 'Watch 04–08 and 16–20', work: [[240, 480], [960, 1200]] },
  { key: 'watch_08_12', label: 'Watch 08–12 and 20–24', work: [[480, 720], [1200, 1440]] },
  { key: 'six_on_six_off', label: '6 on, 6 off: 06–12 and 18–24', work: [[360, 720], [1080, 1440]] },
];

const patternBlocks = (key: string): WorkRestBlock[] =>
  (PATTERNS.find((p) => p.key === key)?.work ?? []).map(([s, e]) => ({ block_type: 'work', start_minute: s, end_minute: e }));

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** "08:00–12:00, 13:00–17:00", or "All rest". */
const blocksText = (blocks: readonly WorkRestBlock[]): string => {
  const work = blocks.filter((b) => b.block_type === 'work').sort((a, b) => a.start_minute - b.start_minute);
  return work.length ? work.map((b) => `${fmt(b.start_minute)}–${fmt(b.end_minute)}`).join(', ') : 'All rest';
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sat 31 Oct", for a day outside the list (the day before the month). */
const dayLabel = (date: string): string =>
  `${WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

const shiftDay = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export interface FillDay {
  /** YYYY-MM-DD */
  date: string;
  /** "Mon 16 Nov". */
  label: string;
  /** The day has an entry (saved or not). */
  entered: boolean;
  /** The viewer may change the day now. */
  editable: boolean;
}

export interface FillDaysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The days of the month on screen, in order. */
  days: readonly FillDay[];
  /** The work periods recorded on a day (this month or the six days before), or null when it has no entry. */
  blocksOn: (date: string) => WorkRestBlock[] | null;
  /** Where the fill starts, by default (the day open in the editor, else the first open day). */
  defaultFrom: string;
  defaultTo: string;
  onFill: (targets: string[], blocks: WorkRestBlock[], sourceText: string) => void;
}

type Values = {
  source: 'previous' | 'day' | 'pattern';
  sourceDate: string;
  pattern: string;
  from: string;
  to: string;
  onlyEmpty: boolean;
};

export const FillDaysDialog: React.FC<FillDaysDialogProps> = ({ open, onOpenChange, days, blocksOn, defaultFrom, defaultTo, onFill }) => {
  const enteredDays = useMemo(() => days.filter((d) => d.entered), [days]);

  /** The days the fill would change, and what it copies. */
  const plan = useMemo(
    () => (v: Values) => {
      const targets = days
        .filter((d) => d.date >= v.from && d.date <= v.to && d.editable && (!v.onlyEmpty || !d.entered))
        .map((d) => d.date);
      let blocks: WorkRestBlock[] | null = null;
      let sourceText = '';
      if (v.source === 'pattern') {
        blocks = patternBlocks(v.pattern);
        sourceText = PATTERNS.find((p) => p.key === v.pattern)?.label ?? '';
      } else {
        const sourceDate = v.source === 'previous' ? shiftDay(v.from, -1) : v.sourceDate;
        blocks = sourceDate ? blocksOn(sourceDate) : null;
        sourceText = sourceDate ? days.find((d) => d.date === sourceDate)?.label ?? dayLabel(sourceDate) : '';
      }
      return { targets: targets.filter((t) => v.source !== 'day' || t !== v.sourceDate), blocks, sourceText };
    },
    [days, blocksOn],
  );

  const schema = useMemo(
    () =>
      z
        .object({
          source: z.enum(['previous', 'day', 'pattern']),
          sourceDate: z.string(),
          pattern: z.string(),
          from: z.string().min(1, 'Choose the first day'),
          to: z.string().min(1, 'Choose the last day'),
          onlyEmpty: z.boolean(),
        })
        .superRefine((v, ctx) => {
          if (v.to < v.from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'The last day comes after the first' });
          if (v.source === 'day' && !v.sourceDate) ctx.addIssue({ code: 'custom', path: ['sourceDate'], message: 'Choose the day to copy' });
          if (v.source === 'pattern' && !PATTERNS.some((p) => p.key === v.pattern)) {
            ctx.addIssue({ code: 'custom', path: ['pattern'], message: 'Choose a pattern' });
          }
          const p = plan(v as Values);
          if (v.source !== 'pattern' && !p.blocks) {
            ctx.addIssue({
              code: 'custom',
              path: [v.source === 'previous' ? 'source' : 'sourceDate'],
              message: v.source === 'previous' ? 'The day before has no entry to copy' : 'That day has no entry to copy',
            });
          }
          if (p.targets.length === 0) ctx.addIssue({ code: 'custom', path: ['to'], message: 'No day in that range can be filled' });
          if (p.targets.length > MAX_TARGETS) ctx.addIssue({ code: 'custom', path: ['to'], message: `Fill at most ${MAX_TARGETS} days at a time` });
        }),
    [plan],
  );

  // The page mounts the dialog when it opens, so each opening starts from the day on screen.
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      source: 'previous',
      sourceDate: enteredDays[enteredDays.length - 1]?.date ?? '',
      pattern: PATTERNS[0].key,
      from: defaultFrom,
      to: defaultTo,
      onlyEmpty: true,
    },
  });
  const watched = useWatch({ control: form.control }) as Values;
  const preview = plan({ ...form.getValues(), ...watched });

  const submit = form.handleSubmit((v) => {
    const p = plan(v as Values);
    if (!p.blocks) return;
    onFill(p.targets, p.blocks, p.sourceText);
    onOpenChange(false);
  });

  const openDays = days.filter((d) => d.editable);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fill days</DialogTitle>
          <DialogDescription>Copy one day’s work and rest onto other days. The filled days are saved when you save the month.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4" noValidate aria-label="Fill days">
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Copy from</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                      {(
                        [
                          ['previous', 'The day before the first day filled'],
                          ['day', 'A day of this month'],
                          ['pattern', 'A watch pattern'],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 type-body">
                          <RadioGroupItem value={value} aria-label={label} />
                          {label}
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {watched.source === 'day' ? (
              <FormField
                control={form.control}
                name="sourceDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Day to copy</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger aria-label="Day to copy">
                          <SelectValue placeholder="Choose a day with an entry" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-72">
                        {enteredDays.map((d) => (
                          <SelectItem key={d.date} value={d.date}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {watched.source === 'pattern' ? (
              <FormField
                control={form.control}
                name="pattern"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pattern</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger aria-label="Pattern">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PATTERNS.map((p) => (
                          <SelectItem key={p.key} value={p.key}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['from', 'to'] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{name === 'from' ? 'First day' : 'Last day'}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger aria-label={name === 'from' ? 'First day' : 'Last day'}>
                            <SelectValue placeholder="Choose a day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72">
                          {openDays.map((d) => (
                            <SelectItem key={d.date} value={d.date}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <FormField
              control={form.control}
              name="onlyEmpty"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  </FormControl>
                  <div className="space-y-0.5">
                    <FormLabel>Only days with no entry</FormLabel>
                    <FormDescription>Leave this on to keep what is already entered.</FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <p className="rounded-md border border-border bg-muted/40 p-3 type-body-sm text-muted-foreground" data-fill-preview="" aria-live="polite">
              {preview.blocks
                ? `Fills ${preview.targets.length} ${preview.targets.length === 1 ? 'day' : 'days'} with ${blocksText(preview.blocks)}${preview.sourceText ? ` (${preview.sourceText})` : ''}.`
                : watched.source === 'previous'
                  ? `${preview.sourceText || 'The day before'} has no entry to copy.`
                  : 'Choose a day that has an entry.'}
            </p>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <Copy aria-hidden="true" />
                Fill days
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default FillDaysDialog;
