import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, GraduationCap, Loader2, Pencil, RotateCcw, Trash2, UserRound, Weight, XCircle, Ban, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { formatDate, formatDateTime } from '@/modules/hris/lib/format';
import { CATEGORY_CLASS, CATEGORY_LABEL, canDeleteObjective, daysToTarget, isObjectiveCategory, isOpenObjective, type ObjectiveStatus } from '@/modules/hris/lib/objectives';
import { useObjective, useObjectiveMutations, type Objective } from '@/modules/hris/hooks/useObjectives';
import { ObjectiveStatusBadge } from './ObjectiveStatusBadge';

interface ObjectiveDetailSheetProps {
  objectiveId: string | null;
  onOpenChange: (open: boolean) => void;
  /** HR editor: may edit and update any objective. The subject and the owner may always update their own. */
  hrEditor: boolean;
  canAdmin: boolean;
  onEdit: (objective: Objective) => void;
}

const Meta: React.FC<{ icon: React.ElementType; label: string; children: React.ReactNode }> = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-2 text-sm">
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-foreground">{children}</p>
    </div>
  </div>
);

/** Side sheet: objective details, progress slider + note, updates timeline and status actions. */
export const ObjectiveDetailSheet: React.FC<ObjectiveDetailSheetProps> = ({ objectiveId, onOpenChange, hrEditor, canAdmin, onEdit }) => {
  const { user, profile } = useAuth();
  const detail = useObjective(objectiveId);
  const mutations = useObjectiveMutations();
  const objective = detail.data?.objective ?? null;
  const currentProgress = objective?.progress_pct;
  const participant = Boolean(objective && profile?.id && (objective.profile_id === profile.id || objective.owner_profile_id === profile.id));
  const canUpdate = hrEditor || participant;
  const canEdit = hrEditor || participant;

  const [progress, setProgress] = useState<number>(0);
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (currentProgress !== undefined) setProgress(currentProgress);
  }, [objectiveId, currentProgress]);

  const busy = mutations.addUpdate.isPending || mutations.setStatus.isPending || mutations.remove.isPending;
  const progressChanged = objective ? progress !== objective.progress_pct : false;
  const canSubmitUpdate = Boolean(objective) && canUpdate && !busy && (note.trim().length > 0 || progressChanged);
  const open = isOpenObjective(objective ?? { status: 'cancelled' });
  const days = objective ? daysToTarget(objective) : null;
  const canDelete = objective ? canDeleteObjective(objective, { canAdmin, userId: user?.id }) : false;

  const submitUpdate = async () => {
    if (!objective || !canSubmitUpdate) return;
    await mutations.addUpdate.mutateAsync({
      objective,
      note: note.trim() || `Progress updated to ${progress}%`,
      progress_pct: progressChanged ? progress : null,
    });
    setNote('');
  };

  const setStatus = (status: ObjectiveStatus) => {
    if (!objective) return;
    mutations.setStatus.mutate({ objective, status });
  };

  const handleDelete = async () => {
    if (!objective) return;
    await mutations.remove.mutateAsync(objective);
    setConfirmDelete(false);
    onOpenChange(false);
  };

  return (
    <Sheet open={Boolean(objectiveId)} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {detail.isLoading || !objective ? (
          <div className="space-y-4 p-6">
            <SheetHeader>
              <SheetTitle className="sr-only">Objective</SheetTitle>
              <SheetDescription className="sr-only">Loading objective</SheetDescription>
            </SheetHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-4 border-b p-6">
              <SheetHeader className="space-y-2 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide', CATEGORY_CLASS[isObjectiveCategory(objective.category) ? objective.category : 'performance'])}>
                    {isObjectiveCategory(objective.category) ? CATEGORY_LABEL[objective.category] : objective.category}
                  </Badge>
                  <ObjectiveStatusBadge objective={objective} />
                  {objective.review_id && <Badge variant="secondary" className="text-[10px]">From review</Badge>}
                </div>
                <SheetTitle className="pr-6 text-lg leading-snug">{objective.title}</SheetTitle>
                <SheetDescription>{objective.crew_name}{objective.crew_rank ? ` · ${objective.crew_rank}` : ''}</SheetDescription>
              </SheetHeader>

              <div className="space-y-1">
                <Progress value={objective.progress_pct} className="h-2.5" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">{objective.progress_pct}% complete</span>
                  {objective.target_date && days !== null && open && (
                    <span className={cn(days < 0 && 'text-destructive', days >= 0 && days <= 14 && 'text-yellow-500')}>
                      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d remaining`}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Meta icon={CalendarDays} label="Target date">{objective.target_date ? formatDate(objective.target_date) : 'None'}</Meta>
                <Meta icon={Weight} label="Weight">{objective.weight} / 10</Meta>
                <Meta icon={UserRound} label="Owner">{objective.owner_name ?? 'Unassigned'}</Meta>
                {objective.completed_at && <Meta icon={CheckCircle2} label="Completed">{formatDate(objective.completed_at)}</Meta>}
                {objective.course_name && <Meta icon={GraduationCap} label="Linked course">{objective.course_name}</Meta>}
                {objective.application_label && <Meta icon={FileText} label="Training application">{objective.application_label}</Meta>}
              </div>

              {objective.measure && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Measure</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{objective.measure}</p>
                </div>
              )}
              {objective.description && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{objective.description}</p>
                </div>
              )}
              {objective.notes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{objective.notes}</p>
                </div>
              )}

              {(canEdit || canUpdate || canDelete) && (
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => onEdit(objective)} disabled={busy}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  {canUpdate && open && (
                    <>
                      <Button size="sm" variant="outline" className="text-green-500" onClick={() => setStatus('achieved')} disabled={busy}>
                        <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Achieved
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setStatus('missed')} disabled={busy}>
                        <XCircle className="mr-2 h-3.5 w-3.5" /> Missed
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus('cancelled')} disabled={busy}>
                        <Ban className="mr-2 h-3.5 w-3.5" /> Cancel
                      </Button>
                    </>
                  )}
                  {canUpdate && !open && (
                    <Button size="sm" variant="outline" onClick={() => setStatus('in_progress')} disabled={busy}>
                      <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reopen
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </Button>
                  )}
                </div>
              )}
            </div>

            {canUpdate && open && (
              <div className="space-y-3 border-b p-6">
                <div className="flex items-center justify-between">
                  <Label htmlFor="objective-progress">Progress</Label>
                  <span className="text-sm font-medium tabular-nums text-foreground">{progress}%</span>
                </div>
                <Slider id="objective-progress" min={0} max={100} step={5} value={[progress]} onValueChange={([v]) => setProgress(v)} disabled={busy} />
                <Textarea
                  placeholder="What has moved since the last update?"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => void submitUpdate()} disabled={!canSubmitUpdate}>
                    {mutations.addUpdate.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Add update
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-4 p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Updates</p>
              {detail.data?.updates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No updates yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-4">
                  {detail.data?.updates.map((u) => (
                    <li key={u.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDateTime(u.created_at)}</span>
                        {u.author_name && <span>· {u.author_name}</span>}
                        {u.progress_pct !== null && <Badge variant="secondary" className="text-[10px] tabular-nums">{u.progress_pct}%</Badge>}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{u.note}</p>
                    </li>
                  ))}
                </ol>
              )}
              <Separator />
              <p className="text-[11px] text-muted-foreground">
                Created {formatDateTime(objective.created_at)} · Last updated {formatDateTime(objective.updated_at)}
              </p>
            </div>
          </>
        )}
      </SheetContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this objective?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the objective and its updates. Prefer cancelling it so the PDP history stays complete.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.remove.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutations.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
};

export default ObjectiveDetailSheet;
