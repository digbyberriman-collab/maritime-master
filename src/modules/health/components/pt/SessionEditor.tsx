import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExercisePickerDialog } from '@/modules/health/components/pt/ExercisePickerDialog';
import {
  PrescriptionDialog,
  type PrescriptionValues,
} from '@/modules/health/components/pt/PrescriptionDialog';
import {
  BlockBadge,
  formatPrescription,
  SessionStatusBadge,
} from '@/modules/health/components/pt/PtCommon';
import {
  SESSION_STATUSES,
  type AddSessionItemInput,
  type PtProgramSession,
  type PtSessionItem,
  type SessionEntry,
} from '@/modules/health/hooks/usePtPrograms';

interface SessionEditorProps {
  session: SessionEntry;
  canEdit: boolean;
  busy?: boolean;
  onUpdateSession: (values: Partial<PtProgramSession>) => void;
  onAddItem: (input: AddSessionItemInput) => void;
  onUpdateItem: (id: string, values: Partial<PtSessionItem>) => void;
  onRemoveItem: (id: string) => void;
  onMoveItem: (id: string, direction: 'up' | 'down') => void;
}

interface EditTarget {
  item: PtSessionItem | null;
  initial: PrescriptionValues;
}

const itemToValues = (item: PtSessionItem): PrescriptionValues => ({
  exercise_name: item.exercise_name,
  block: item.block,
  sets: item.prescribed_sets,
  reps: item.prescribed_reps,
  tempo: item.tempo,
  rest_seconds: item.rest_seconds,
  load: item.prescribed_load,
  rpe: item.rpe,
  duration_seconds: item.duration_seconds,
  distance_m: item.distance_m,
  notes: item.notes,
});

/**
 * Edits one session of an assigned programme. These rows are the athlete's
 * own snapshot of the template, so changes here never touch the template.
 */
export const SessionEditor: React.FC<SessionEditorProps> = ({
  session,
  canEdit,
  busy,
  onUpdateSession,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
}) => {
  const [title, setTitle] = useState(session.title);
  const [scheduledOn, setScheduledOn] = useState(session.scheduled_on ?? '');
  const [trainerNotes, setTrainerNotes] = useState(session.trainer_notes ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingExerciseId, setPendingExerciseId] = useState<string | null>(null);
  const [target, setTarget] = useState<EditTarget | null>(null);

  const savePrescription = (values: PrescriptionValues) => {
    if (!target) return;
    if (target.item) {
      onUpdateItem(target.item.id, {
        exercise_name: values.exercise_name,
        block: values.block,
        prescribed_sets: values.sets,
        prescribed_reps: values.reps,
        prescribed_load: values.load,
        tempo: values.tempo,
        rest_seconds: values.rest_seconds,
        rpe: values.rpe,
        duration_seconds: values.duration_seconds,
        distance_m: values.distance_m,
        notes: values.notes,
      });
    } else {
      onAddItem({
        session_id: session.id,
        exercise_id: pendingExerciseId,
        exercise_name: values.exercise_name,
        block: values.block,
        prescribed_sets: values.sets,
        prescribed_reps: values.reps,
        prescribed_load: values.load,
        tempo: values.tempo,
        rest_seconds: values.rest_seconds,
        rpe: values.rpe,
        duration_seconds: values.duration_seconds,
        distance_m: values.distance_m,
        notes: values.notes,
      });
    }
    setTarget(null);
    setPendingExerciseId(null);
  };

  return (
    <Card>
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            Week {session.week_number} · Day {session.day_number}
          </span>
          <SessionStatusBadge status={session.status} />
          {session.session_rpe !== null && (
            <span className="text-xs text-muted-foreground">Session RPE {session.session_rpe}</span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`session-title-${session.id}`} className="text-xs text-muted-foreground">
              Title
            </Label>
            <Input
              id={`session-title-${session.id}`}
              value={title}
              disabled={!canEdit}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== session.title && onUpdateSession({ title: title.trim() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`session-date-${session.id}`} className="text-xs text-muted-foreground">
              Scheduled
            </Label>
            <Input
              id={`session-date-${session.id}`}
              type="date"
              value={scheduledOn}
              disabled={!canEdit}
              onChange={(e) => setScheduledOn(e.target.value)}
              onBlur={() =>
                scheduledOn !== (session.scheduled_on ?? '') &&
                onUpdateSession({ scheduled_on: scheduledOn || null })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={session.status}
              disabled={!canEdit}
              onValueChange={(value) => onUpdateSession({ status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSION_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {session.items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Nothing programmed for this session yet.
            {canEdit ? ' Add the first movement below.' : ''}
          </p>
        ) : (
          <ul className="divide-y rounded-md border border-border">
            {session.items.map((item, index) => (
              <li key={item.id} className="flex items-start gap-3 p-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {item.exercise_name}
                    </span>
                    <BlockBadge block={item.block} />
                  </div>
                  <p className="text-xs text-muted-foreground">{formatPrescription(item)}</p>
                  {item.notes && <p className="mt-1 text-xs text-muted-foreground/80">{item.notes}</p>}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Move up"
                      disabled={index === 0 || busy}
                      onClick={() => onMoveItem(item.id, 'up')}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Move down"
                      disabled={index === session.items.length - 1 || busy}
                      onClick={() => onMoveItem(item.id, 'down')}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Edit prescription"
                      onClick={() => setTarget({ item, initial: itemToValues(item) })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label="Remove exercise"
                      onClick={() => onRemoveItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="space-y-3">
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Dumbbell className="mr-2 h-4 w-4" />
              Add an exercise to this session
            </Button>
            <div className="space-y-1.5">
              <Label htmlFor={`session-notes-${session.id}`} className="text-xs text-muted-foreground">
                Trainer notes
              </Label>
              <Textarea
                id={`session-notes-${session.id}`}
                rows={2}
                value={trainerNotes}
                onChange={(e) => setTrainerNotes(e.target.value)}
                onBlur={() =>
                  trainerNotes !== (session.trainer_notes ?? '') &&
                  onUpdateSession({ trainer_notes: trainerNotes.trim() || null })
                }
              />
            </div>
          </div>
        )}

        {session.athlete_notes && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">From the athlete</p>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground">{session.athlete_notes}</p>
          </div>
        )}
      </CardContent>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(exercise, name) => {
          setPendingExerciseId(exercise?.id ?? null);
          setTarget({
            item: null,
            initial: {
              exercise_name: name,
              block: null,
              sets: 3,
              reps: '10',
              tempo: null,
              rest_seconds: 60,
              load: null,
              rpe: null,
              duration_seconds: null,
              distance_m: null,
              notes: null,
            },
          });
        }}
      />

      <PrescriptionDialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            setPendingExerciseId(null);
          }
        }}
        title={target?.item ? 'Edit prescription' : 'Add to this session'}
        description="This changes this athlete's session only. The template it came from is untouched."
        initial={target?.initial ?? null}
        onSave={savePrescription}
        saving={busy}
      />
    </Card>
  );
};

export default SessionEditor;
