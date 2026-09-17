import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarRange, Loader2, Lock, Plus, Unlock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useCompanyReviews, useReviewCycleMutations, useReviewCycles, useReviewMutations, type ReviewCycleRow } from '@/modules/hris/hooks/usePerformanceReviews';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import { REVIEW_TYPES, REVIEW_TYPE_VALUES, reviewTypeLabel, type ReviewType } from '@/modules/hris/lib/reviews';

const NO_VESSEL = '__none__';

const cycleSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the cycle a name'),
    review_type: z.enum(REVIEW_TYPE_VALUES as [ReviewType, ...ReviewType[]]),
    period_start: z.string().min(1, 'Required'),
    period_end: z.string().min(1, 'Required'),
    due_date: z.string().min(1, 'Required'),
    vessel_id: z.string(),
    notes: z.string(),
  })
  .refine((v) => v.period_end >= v.period_start, { message: 'Period end must be on or after the start', path: ['period_end'] });

type CycleFormValues = z.infer<typeof cycleSchema>;

const emptyCycle = (defaultType: ReviewType): CycleFormValues => {
  const year = new Date().getFullYear();
  return { name: '', review_type: defaultType, period_start: `${year}-01-01`, period_end: `${year}-12-31`, due_date: `${year}-12-31`, vessel_id: '', notes: '' };
};

interface ReviewCyclesPanelProps {
  defaultType: ReviewType | 'all';
  canEdit: boolean;
}

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-green-500/10 text-green-600 border-green-500/20',
  draft: 'bg-muted text-muted-foreground border-border',
  closed: 'bg-muted text-muted-foreground border-border',
};

/** Review cycles: list, create, close, and bulk-create draft reviews for crew. */
export const ReviewCyclesPanel: React.FC<ReviewCyclesPanelProps> = ({ defaultType, canEdit }) => {
  const { cycles, isLoading } = useReviewCycles();
  const cycleMutations = useReviewCycleMutations();
  const { all: reviews } = useCompanyReviews();
  const { vessels, vesselName } = useCompanyVessels();
  const [newOpen, setNewOpen] = useState(false);
  const [bulkFor, setBulkFor] = useState<ReviewCycleRow | null>(null);

  const countsByCycle = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const r of reviews) {
      if (!r.cycle_id) continue;
      const entry = map.get(r.cycle_id) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (r.status === 'completed') entry.completed += 1;
      map.set(r.cycle_id, entry);
    }
    return map;
  }, [reviews]);

  const visible = useMemo(() => (defaultType === 'all' ? cycles : cycles.filter((c) => c.review_type === defaultType)), [cycles, defaultType]);

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-muted-foreground" /> Review cycles
          </CardTitle>
          <CardDescription>Group reviews by period so a whole crew can be evaluated together.</CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New cycle
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /></div>
        ) : visible.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No cycles yet{canEdit ? ' — create one to roll out reviews to the crew.' : '.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="w-[1%]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => {
                  const counts = countsByCycle.get(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.name}
                        {c.notes && <span className="block max-w-[260px] truncate text-xs font-normal text-muted-foreground">{c.notes}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{reviewTypeLabel(c.review_type)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{vesselName(c.vessel_id) ?? 'All vessels'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(c.period_start)} – {formatDate(c.period_end)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(c.due_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {counts ? `${counts.completed} / ${counts.total} completed` : <span className="text-muted-foreground">No reviews</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('font-medium', STATUS_CLASS[c.status] ?? STATUS_CLASS.draft)}>{humanise(c.status)}</Badge>
                      </TableCell>
                      {canEdit && (
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {c.status !== 'closed' && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setBulkFor(c)}>
                                <Users className="mr-1 h-3.5 w-3.5" /> Create reviews
                              </Button>
                            )}
                            {c.status === 'closed' ? (
                              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={cycleMutations.reopen.isPending} onClick={() => cycleMutations.reopen.mutate(c)}>
                                <Unlock className="mr-1 h-3.5 w-3.5" /> Reopen
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={cycleMutations.close.isPending} onClick={() => cycleMutations.close.mutate(c)}>
                                <Lock className="mr-1 h-3.5 w-3.5" /> Close
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <NewCycleDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultType={defaultType === 'all' ? 'annual_evaluation' : defaultType}
        vessels={vessels}
        isPending={cycleMutations.create.isPending}
        onSubmit={async (values) => {
          await cycleMutations.create.mutateAsync({
            name: values.name,
            review_type: values.review_type,
            period_start: values.period_start,
            period_end: values.period_end,
            due_date: values.due_date,
            vessel_id: values.vessel_id || null,
            notes: values.notes.trim() || null,
            status: 'open',
          });
          setNewOpen(false);
        }}
      />

      <CreateReviewsDialog cycle={bulkFor} onOpenChange={(open) => !open && setBulkFor(null)} />
    </Card>
  );
};

// ---------------------------------------------------------------------------

interface NewCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType: ReviewType;
  vessels: { id: string; name: string }[];
  isPending: boolean;
  onSubmit: (values: CycleFormValues) => Promise<void>;
}

const NewCycleDialog: React.FC<NewCycleDialogProps> = ({ open, onOpenChange, defaultType, vessels, isPending, onSubmit }) => {
  const form = useForm<CycleFormValues>({ resolver: zodResolver(cycleSchema), defaultValues: emptyCycle(defaultType) });

  useEffect(() => {
    if (open) form.reset(emptyCycle(defaultType));
    // Re-seed only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New review cycle</DialogTitle>
          <DialogDescription>Reviews created from this cycle inherit its type, period and due date.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl><Input placeholder="e.g. 2026 annual evaluations" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="review_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Review type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{REVIEW_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="vessel_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Vessel</FormLabel>
                  <Select value={field.value || NO_VESSEL} onValueChange={(v) => field.onChange(v === NO_VESSEL ? '' : v)}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NO_VESSEL}>All vessels</SelectItem>
                      {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="period_start" render={({ field }) => (
                <FormItem>
                  <FormLabel>Period start</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="period_end" render={({ field }) => (
                <FormItem>
                  <FormLabel>Period end</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="due_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reviews due</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea rows={2} placeholder="Optional guidance for reviewers" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create cycle
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------

interface CreateReviewsDialogProps {
  cycle: ReviewCycleRow | null;
  onOpenChange: (open: boolean) => void;
}

const ALL_VESSELS = 'all';

/** Multi-select crew (filtered by vessel) and create one draft review each. */
const CreateReviewsDialog: React.FC<CreateReviewsDialogProps> = ({ cycle, onOpenChange }) => {
  const { profile } = useAuth();
  const { entries, isLoading } = useHrCrewDirectory();
  const { vessels } = useCompanyVessels();
  const { all: reviews } = useCompanyReviews();
  const { createBulk } = useReviewMutations();

  const [vesselFilter, setVesselFilter] = useState<string>(ALL_VESSELS);
  const [reviewerId, setReviewerId] = useState<string | null>(profile?.id ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (cycle) {
      setVesselFilter(cycle.vessel_id ?? ALL_VESSELS);
      setReviewerId(profile?.id ?? null);
      setSelected(new Set());
      setSearch('');
    }
  }, [cycle, profile?.id]);

  const alreadyInCycle = useMemo(() => new Set(reviews.filter((r) => r.cycle_id === cycle?.id).map((r) => r.profile_id)), [reviews, cycle?.id]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (vesselFilter !== ALL_VESSELS && e.vessel_id !== vesselFilter) return false;
      if (q && !`${e.fullName} ${e.rank ?? ''} ${e.department ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, vesselFilter, search]);

  const selectable = candidates.filter((e) => !alreadyInCycle.has(e.id));
  const allSelected = selectable.length > 0 && selectable.every((e) => selected.has(e.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = async () => {
    if (!cycle) return;
    const crewIds = Array.from(selected);
    const vesselByProfile = Object.fromEntries(entries.filter((e) => selected.has(e.id)).map((e) => [e.id, e.vessel_id]));
    await createBulk.mutateAsync({ cycle, crewIds, reviewerProfileId: reviewerId, vesselByProfile });
    onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(cycle)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create reviews for crew</DialogTitle>
          <DialogDescription>
            {cycle ? `One draft ${reviewTypeLabel(cycle.review_type).toLowerCase()} per selected crew member for "${cycle.name}", due ${formatDate(cycle.due_date)}.` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Reviewer</Label>
            <CrewPicker value={reviewerId} onChange={(id) => setReviewerId(id)} placeholder="Assign a reviewer" includeInactive={false} />
            <p className="text-xs text-muted-foreground">Defaults to you. The reviewer can be changed per review later.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Vessel</Label>
            <Select value={vesselFilter} onValueChange={setVesselFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VESSELS}>All vessels</SelectItem>
                {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input placeholder="Filter crew…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-64" />
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Checkbox
              id="select-all-crew"
              checked={allSelected}
              onCheckedChange={(v) => setSelected(v ? new Set(selectable.map((e) => e.id)) : new Set())}
              disabled={selectable.length === 0}
            />
            <Label htmlFor="select-all-crew" className="cursor-pointer">Select all ({selectable.length})</Label>
          </div>
        </div>

        <ScrollArea className="h-72 rounded-md border">
          {isLoading ? (
            <div className="space-y-2 p-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : candidates.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No crew match this filter.</p>
          ) : (
            <ul className="divide-y">
              {candidates.map((e) => {
                const taken = alreadyInCycle.has(e.id);
                const id = `crew-${e.id}`;
                return (
                  <li key={e.id} className={cn('flex items-center gap-3 px-3 py-2', taken && 'opacity-60')}>
                    <Checkbox id={id} checked={selected.has(e.id)} disabled={taken} onCheckedChange={(v) => toggle(e.id, v === true)} />
                    <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col font-normal">
                      <span className="truncate">{e.displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">{[e.rank ?? e.position, e.department, e.vessel_name].filter(Boolean).join(' · ') || e.email}</span>
                    </Label>
                    {taken && <Badge variant="outline" className="text-[10px]">Already in cycle</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createBulk.isPending}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={createBulk.isPending || selected.size === 0}>
            {createBulk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create {selected.size || ''} draft{selected.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReviewCyclesPanel;
