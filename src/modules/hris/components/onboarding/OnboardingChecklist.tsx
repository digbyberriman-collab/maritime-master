import React, { useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardList, Loader2, MoreHorizontal, Paperclip, Plus, StickyNote, Trash2, Upload, UserRoundCheck, XCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/shared/hooks/use-toast';
import { getCrewDocumentSignedUrl } from '@/lib/storage/crewDocuments';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import type { AddAdHocItemArgs, OnboardingRecordDetail } from '@/modules/hris/hooks/useOnboarding';
import { formatDate } from '@/modules/hris/lib/format';
import {
  ONBOARDING_OWNERS,
  OWNER_LABELS,
  canCompleteItem,
  itemDaysUntilDue,
  itemTone,
  type ItemPermissionContext,
  type ItemTone,
  type OnboardingItemRow,
  type OnboardingOwner,
  type OnboardingRecordRow,
} from '@/modules/hris/lib/onboarding';
import { OnboardingStatusBadge, OwnerBadge } from './badges';

export interface ChecklistActions {
  toggleItem: (item: OnboardingItemRow, completed: boolean) => void;
  updateNotes: (item: OnboardingItemRow, notes: string | null) => void;
  uploadEvidence: (item: OnboardingItemRow, file: File) => void;
  removeItem: (item: OnboardingItemRow) => void;
  addAdHocItem: (args: Omit<AddAdHocItemArgs, 'record' | 'existing'>) => Promise<unknown>;
  setBuddy: (record: OnboardingRecordRow, buddyProfileId: string | null) => void;
  cancel: (record: OnboardingRecordRow) => void;
  reopen: (record: OnboardingRecordRow) => void;
}

interface OnboardingChecklistProps {
  detail: OnboardingRecordDetail;
  permissions: ItemPermissionContext;
  /** HR editors only: buddy, cancel, ad-hoc items. */
  canManage: boolean;
  busy?: boolean;
  actions: ChecklistActions;
}

const TONE_CLASS: Record<ItemTone, string> = {
  done: 'text-muted-foreground line-through',
  overdue: 'text-destructive',
  due_soon: 'text-orange-600 dark:text-orange-400',
  upcoming: 'text-muted-foreground',
  undated: 'text-muted-foreground',
};

const dueLabel = (item: OnboardingItemRow): string => {
  const days = itemDaysUntilDue(item);
  if (days === null) return 'No due date';
  if (item.completed) return `Due ${formatDate(item.due_date)}`;
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  return `Due in ${days}d`;
};

const ItemRow: React.FC<{ item: OnboardingItemRow; permissions: ItemPermissionContext; canManage: boolean; busy?: boolean; actions: ChecklistActions }> = ({ item, permissions, canManage, busy, actions }) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(item.notes ?? '');
  const tone = itemTone(item);
  const allowed = canCompleteItem(item, permissions);

  const openEvidence = async () => {
    try {
      const url = await getCrewDocumentSignedUrl(item.evidence_path);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast({ title: 'Could not open evidence', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <li className={cn('flex items-start gap-3 py-2.5', item.completed && 'opacity-80')}>
      <Checkbox
        checked={item.completed}
        disabled={!allowed || busy}
        onCheckedChange={(v) => actions.toggleItem(item, Boolean(v))}
        className="mt-0.5"
        aria-label={`${item.completed ? 'Reopen' : 'Complete'} ${item.title}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm', item.completed ? 'text-muted-foreground line-through' : 'text-foreground')}>{item.title}</span>
          <OwnerBadge owner={item.owner} />
          {!item.required && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
          {item.evidence_path && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={openEvidence} className="text-muted-foreground hover:text-foreground" aria-label="Open evidence"><Paperclip className="h-3.5 w-3.5" /></button>
              </TooltipTrigger>
              <TooltipContent>Open attached evidence</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className={cn('flex items-center gap-1', TONE_CLASS[tone])}><CalendarDays className="h-3 w-3" /> {dueLabel(item)}</span>
          {item.completed && item.completed_at && <span className="text-muted-foreground">Done {formatDate(item.completed_at)}</span>}
          {item.notes && !notesOpen && <span className="flex items-center gap-1 text-muted-foreground"><StickyNote className="h-3 w-3" /> {item.notes}</span>}
        </div>
        {notesOpen && (
          <div className="mt-2 space-y-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes for this item" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { actions.updateNotes(item, notes.trim() || null); setNotesOpen(false); }} disabled={busy}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setNotes(item.notes ?? ''); setNotesOpen(false); }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
      {(allowed || canManage) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Item actions"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setNotesOpen(true)}><StickyNote className="mr-2 h-4 w-4" /> {item.notes ? 'Edit notes' : 'Add notes'}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> {item.evidence_path ? 'Replace evidence' : 'Attach evidence'}</DropdownMenuItem>
            {canManage && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.removeItem(item)}><Trash2 className="mr-2 h-4 w-4" /> Remove item</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) actions.uploadEvidence(item, file);
          e.target.value = '';
        }}
      />
    </li>
  );
};

const AddItemDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; sections: string[]; onSubmit: ChecklistActions['addAdHocItem'] }> = ({ open, onOpenChange, sections, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [section, setSection] = useState(sections[0] ?? 'Ad hoc');
  const [owner, setOwner] = useState<OnboardingOwner>('hr');
  const [dueDate, setDueDate] = useState('');
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ title, section, owner, dueDate: dueDate || null, required });
      setTitle('');
      setDueDate('');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add checklist item</DialogTitle>
          <DialogDescription>An ad-hoc item for this joiner only; the template is not changed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="adhoc-title">Title</Label>
            <Input id="adhoc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tender licence copy received" autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...new Set([...sections, 'Ad hoc'])].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select value={owner} onValueChange={(v) => setOwner(v as OnboardingOwner)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ONBOARDING_OWNERS.map((o) => <SelectItem key={o} value={o}>{OWNER_LABELS[o]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-due">Due date</Label>
              <Input id="adhoc-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox checked={required} onCheckedChange={(v) => setRequired(Boolean(v))} /> Required for completion
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !title.trim()} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Add item</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** The joiner's induction checklist grouped by section with owner badges, due dates and evidence. */
export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({ detail, permissions, canManage, busy, actions }) => {
  const { record, sections } = detail;
  const directory = useHrCrewDirectory({ includeInactive: true });
  const { vesselName } = useCompanyVessels();
  const [addOpen, setAddOpen] = useState(false);
  const [buddyOpen, setBuddyOpen] = useState(false);
  const [buddyId, setBuddyId] = useState<string | null>(record?.buddy_profile_id ?? null);

  const buddy = useMemo(() => (record?.buddy_profile_id ? directory.all.find((e) => e.id === record.buddy_profile_id) ?? null : null), [directory.all, record?.buddy_profile_id]);
  const overdue = useMemo(() => sections.reduce((n, s) => n + s.overdue, 0), [sections]);

  if (!record) return null;
  const closed = record.status === 'cancelled' || record.status === 'completed';

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" /> Onboarding checklist <OnboardingStatusBadge status={record.status} />
            </CardTitle>
            <CardDescription>
              Starts {formatDate(record.start_date)}{record.vessel_id && ` · ${vesselName(record.vessel_id) ?? 'Vessel'}`}
              {' · '}Buddy: {buddy ? buddy.displayName : 'none'}
              {overdue > 0 && !closed && <span className="text-destructive"> · {overdue} overdue</span>}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && !closed && (
              <>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { setBuddyId(record.buddy_profile_id); setBuddyOpen(true); }}><UserRoundCheck className="h-4 w-4" /> Buddy</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Item</Button>
                <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive" onClick={() => actions.cancel(record)} disabled={busy}><XCircle className="h-4 w-4" /> Cancel</Button>
              </>
            )}
            {canManage && closed && (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => actions.reopen(record)} disabled={busy}><RotateCcw className="h-4 w-4" /> Reopen</Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={record.completion_pct} className="h-2" />
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{record.completion_pct}%</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {sections.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">This record has no items. Add one, or cancel and restart from a template.</p>
        ) : (
          sections.map((group) => (
            <section key={group.section} className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.section}</h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {group.done}/{group.total}
                  {group.overdue > 0 && <span className="ml-2 text-destructive">{group.overdue} overdue</span>}
                </span>
              </div>
              <ul className="divide-y rounded-lg border px-3">
                {group.items.map((item) => (
                  <ItemRow key={item.id} item={item} permissions={permissions} canManage={canManage} busy={busy} actions={actions} />
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>

      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} sections={sections.map((s) => s.section)} onSubmit={actions.addAdHocItem} />

      <Dialog open={buddyOpen} onOpenChange={setBuddyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign a buddy</DialogTitle>
            <DialogDescription>The buddy can see this checklist and tick off the items they own.</DialogDescription>
          </DialogHeader>
          <CrewPicker value={buddyId} onChange={(id) => setBuddyId(id)} placeholder="Pick a crew member" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { actions.setBuddy(record, null); setBuddyOpen(false); }} disabled={!record.buddy_profile_id || busy}>Remove buddy</Button>
            <Button onClick={() => { actions.setBuddy(record, buddyId); setBuddyOpen(false); }} disabled={busy}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default OnboardingChecklist;
