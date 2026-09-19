import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, Dumbbell, History, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HealthEmpty } from '@/modules/health/components/HealthStates';
import { BlockBadge, formatPrescription, SessionStatusBadge } from '@/modules/health/components/pt/PtCommon';
import type { PtSessionItem, PtSetLog, SessionEntry, SetLogEntry } from '@/modules/health/hooks/usePtPrograms';

interface WorkoutLoggerProps {
  session: SessionEntry;
  personId: string;
  canLog: boolean;
  logsByItem: Map<string, PtSetLog[]>;
  totalVolume: number;
  /** Sets from the last time this exercise was trained. */
  previousFor: (exerciseName: string, excludeSessionId?: string | null) => SetLogEntry[];
  onLogSet: (input: {
    session_item_id: string;
    person_id: string;
    set_number: number;
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
    distance_m: number | null;
    rpe: number | null;
  }) => void;
  onRemoveSet: (id: string) => void;
  onComplete: (input: {
    session_rpe: number | null;
    duration_minutes: number | null;
    athlete_notes: string | null;
  }) => void;
  busy?: boolean;
}

interface Draft {
  primary: string;
  secondary: string;
  rpe: string;
}

const numberOrNull = (value: string): number | null => {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
};

const describeSet = (log: PtSetLog): string => {
  const parts: string[] = [];
  if (log.reps !== null) parts.push(`${log.reps} reps`);
  if (log.weight_kg !== null) parts.push(`${log.weight_kg} kg`);
  if (log.duration_seconds !== null) parts.push(`${log.duration_seconds}s`);
  if (log.distance_m !== null) parts.push(`${log.distance_m}m`);
  if (log.rpe !== null) parts.push(`RPE ${log.rpe}`);
  return parts.join(' · ') || 'Logged';
};

/**
 * The gym-floor logger. Built for one thumb on a phone: large targets, the
 * numbers carried forward from the last set, and the previous session in view
 * so the athlete knows what to beat.
 */
export const WorkoutLogger: React.FC<WorkoutLoggerProps> = ({
  session,
  personId,
  canLog,
  logsByItem,
  totalVolume,
  previousFor,
  onLogSet,
  onRemoveSet,
  onComplete,
  busy,
}) => {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [extraSets, setExtraSets] = useState<Record<string, number>>({});
  const [finishOpen, setFinishOpen] = useState(false);

  const setDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({
      ...prev,
      [key]: { primary: '', secondary: '', rpe: '', ...(prev[key] ?? {}), ...patch },
    }));

  const loggedCount = useMemo(
    () => session.items.reduce((sum, item) => sum + (logsByItem.get(item.id)?.length ?? 0), 0),
    [session.items, logsByItem],
  );

  if (session.items.length === 0) {
    return (
      <HealthEmpty
        icon={Dumbbell}
        title="This session has no exercises"
        description="Ask your trainer to add the movements, or pick another session from this week."
      />
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <SessionStatusBadge status={session.status} />
        <Badge variant="secondary" className="text-[10px]">
          Week {session.week_number} · Day {session.day_number}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {loggedCount} sets logged · {Math.round(totalVolume).toLocaleString('en-GB')} kg lifted
        </span>
      </div>

      {session.items.map((item) => (
        <ExerciseCard
          key={item.id}
          item={item}
          personId={personId}
          canLog={canLog}
          logs={logsByItem.get(item.id) ?? []}
          previous={previousFor(item.exercise_name, session.id)}
          drafts={drafts}
          setDraft={setDraft}
          extraSets={extraSets[item.id] ?? 0}
          onAddSet={() => setExtraSets((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }))}
          onLogSet={onLogSet}
          onRemoveSet={onRemoveSet}
          busy={busy}
        />
      ))}

      {canLog && session.status !== 'completed' && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button size="lg" className="h-14 w-full text-base" onClick={() => setFinishOpen(true)}>
            <CheckCircle2 className="mr-2 h-5 w-5" />
            Finish session
          </Button>
        </div>
      )}

      <CompleteSessionDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        busy={busy}
        onComplete={(values) => {
          onComplete(values);
          setFinishOpen(false);
        }}
      />
    </div>
  );
};

interface ExerciseCardProps {
  item: PtSessionItem;
  personId: string;
  canLog: boolean;
  logs: PtSetLog[];
  previous: SetLogEntry[];
  drafts: Record<string, Draft>;
  setDraft: (key: string, patch: Partial<Draft>) => void;
  extraSets: number;
  onAddSet: () => void;
  onLogSet: WorkoutLoggerProps['onLogSet'];
  onRemoveSet: (id: string) => void;
  busy?: boolean;
}

const ExerciseCard: React.FC<ExerciseCardProps> = ({
  item,
  personId,
  canLog,
  logs,
  previous,
  drafts,
  setDraft,
  extraSets,
  onAddSet,
  onLogSet,
  onRemoveSet,
  busy,
}) => {
  const timed = !item.prescribed_reps && Boolean(item.duration_seconds);
  const distance = !item.prescribed_reps && Boolean(item.distance_m) && !item.duration_seconds;
  const plannedSets = Math.max(item.prescribed_sets ?? 1, logs.length);
  const setNumbers = Array.from({ length: plannedSets + extraSets }, (_, i) => i + 1);

  const primaryLabel = timed ? 'Seconds' : distance ? 'Metres' : 'Reps';
  const secondaryLabel = timed || distance ? 'Load kg' : 'Kg';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{item.exercise_name}</CardTitle>
          <BlockBadge block={item.block} />
        </div>
        <p className="text-sm text-muted-foreground">{formatPrescription(item)}</p>
        {item.notes && <p className="text-xs text-muted-foreground/80">{item.notes}</p>}
        {previous.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Last time: {previous.map((p) => describeSet(p)).join(' | ')}
            </span>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {setNumbers.map((setNumber) => {
          const log = logs.find((l) => l.set_number === setNumber) ?? null;
          const key = `${item.id}:${setNumber}`;
          const previousSet = previous.find((p) => p.set_number === setNumber) ?? null;
          const fallback: Draft = {
            primary:
              log?.reps?.toString() ??
              log?.duration_seconds?.toString() ??
              log?.distance_m?.toString() ??
              '',
            secondary: log?.weight_kg?.toString() ?? '',
            rpe: log?.rpe?.toString() ?? '',
          };
          const draft = drafts[key] ?? fallback;
          const placeholderPrimary = timed
            ? (item.duration_seconds ?? previousSet?.duration_seconds ?? '')
            : distance
              ? (item.distance_m ?? previousSet?.distance_m ?? '')
              : (previousSet?.reps ?? item.prescribed_reps ?? '');
          const placeholderSecondary = previousSet?.weight_kg ?? '';

          return (
            <div
              key={setNumber}
              className={cn(
                'flex items-center gap-2 rounded-md border p-2',
                log?.completed ? 'border-success/30 bg-success/5' : 'border-border',
              )}
            >
              <span className="w-7 shrink-0 text-center text-sm font-semibold text-muted-foreground">
                {setNumber}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  aria-label={`${primaryLabel} for set ${setNumber}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="h-12 min-w-0 flex-1 text-center text-base"
                  placeholder={String(placeholderPrimary || primaryLabel)}
                  value={draft.primary}
                  disabled={!canLog}
                  onChange={(e) => setDraft(key, { primary: e.target.value })}
                />
                <Input
                  aria-label={`${secondaryLabel} for set ${setNumber}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  className="h-12 min-w-0 flex-1 text-center text-base"
                  placeholder={String(placeholderSecondary || secondaryLabel)}
                  value={draft.secondary}
                  disabled={!canLog}
                  onChange={(e) => setDraft(key, { secondary: e.target.value })}
                />
                <Input
                  aria-label={`RPE for set ${setNumber}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={10}
                  step="0.5"
                  className="h-12 w-14 shrink-0 text-center text-base"
                  placeholder="RPE"
                  value={draft.rpe}
                  disabled={!canLog}
                  onChange={(e) => setDraft(key, { rpe: e.target.value })}
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant={log?.completed ? 'default' : 'outline'}
                className="h-12 w-12 shrink-0"
                aria-label={log ? `Update set ${setNumber}` : `Log set ${setNumber}`}
                disabled={!canLog || busy}
                onClick={() => {
                  const primary = numberOrNull(draft.primary);
                  onLogSet({
                    session_item_id: item.id,
                    person_id: personId,
                    set_number: setNumber,
                    reps: timed || distance ? null : primary,
                    weight_kg: numberOrNull(draft.secondary),
                    duration_seconds: timed ? primary : null,
                    distance_m: distance ? primary : null,
                    rpe: numberOrNull(draft.rpe),
                  });
                }}
              >
                <Check className="h-5 w-5" />
              </Button>
              {log && canLog && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-12 w-9 shrink-0 text-destructive"
                  aria-label={`Remove set ${setNumber}`}
                  onClick={() => onRemoveSet(log.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}

        {canLog && (
          <Button type="button" variant="ghost" size="sm" className="h-10 w-full" onClick={onAddSet}>
            <Plus className="mr-2 h-4 w-4" />
            Add a set
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

interface CompleteSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (values: {
    session_rpe: number | null;
    duration_minutes: number | null;
    athlete_notes: string | null;
  }) => void;
  busy?: boolean;
}

const CompleteSessionDialog: React.FC<CompleteSessionDialogProps> = ({
  open,
  onOpenChange,
  onComplete,
  busy,
}) => {
  const [rpe, setRpe] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Finish the session</DialogTitle>
          <DialogDescription>
            How hard was it overall, and how long did it take? Both help your trainer set the next week.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="session-rpe">Session RPE (0 to 10)</Label>
            <Input
              id="session-rpe"
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step="0.5"
              className="h-12 text-base"
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
              placeholder="7"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="session-duration">Duration (minutes)</Label>
            <Input
              id="session-duration"
              type="number"
              inputMode="numeric"
              min={1}
              className="h-12 text-base"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="45"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="session-notes">Notes</Label>
            <Textarea
              id="session-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Shoulder felt tight on the last set"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not yet
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              onComplete({
                session_rpe: numberOrNull(rpe),
                duration_minutes: numberOrNull(duration),
                athlete_notes: notes.trim() || null,
              })
            }
          >
            {busy ? 'Saving...' : 'Mark complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutLogger;
