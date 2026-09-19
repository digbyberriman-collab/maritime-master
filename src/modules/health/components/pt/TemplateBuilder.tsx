import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarPlus, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { ExercisePickerDialog } from '@/modules/health/components/pt/ExercisePickerDialog';
import {
  PrescriptionDialog,
  type PrescriptionValues,
} from '@/modules/health/components/pt/PrescriptionDialog';
import { BlockBadge, formatPrescription } from '@/modules/health/components/pt/PtCommon';
import {
  useTemplateBuilder,
  type PtTemplateItem,
  type TemplateDayEntry,
} from '@/modules/health/hooks/usePtLibrary';

interface TemplateBuilderProps {
  templateId: string;
  durationWeeks: number;
  canEdit: boolean;
  rehab?: boolean;
}

interface PrescriptionTarget {
  dayId: string;
  item: PtTemplateItem | null;
  initial: PrescriptionValues;
}

const itemToValues = (item: PtTemplateItem): PrescriptionValues => ({
  exercise_name: item.exercise_name,
  block: item.block,
  sets: item.sets,
  reps: item.reps,
  tempo: item.tempo,
  rest_seconds: item.rest_seconds,
  load: item.load_prescription,
  rpe: item.rpe,
  duration_seconds: item.duration_seconds,
  distance_m: item.distance_m,
  notes: item.notes,
});

/** Week-by-week builder for a programme template or rehabilitation protocol. */
export const TemplateBuilder: React.FC<TemplateBuilderProps> = ({
  templateId,
  durationWeeks,
  canEdit,
  rehab = false,
}) => {
  const builder = useTemplateBuilder(templateId);
  const [week, setWeek] = useState(1);
  const [pickerDayId, setPickerDayId] = useState<string | null>(null);
  const [target, setTarget] = useState<PrescriptionTarget | null>(null);
  const [pendingExerciseId, setPendingExerciseId] = useState<string | null>(null);

  const weekNumbers = useMemo(() => {
    const present = new Set<number>(builder.days.map((d) => d.week_number));
    for (let i = 1; i <= Math.max(1, durationWeeks); i += 1) present.add(i);
    return Array.from(present).sort((a, b) => a - b);
  }, [builder.days, durationWeeks]);

  const daysThisWeek = builder.days.filter((d) => d.week_number === week);

  const savePrescription = (values: PrescriptionValues) => {
    if (!target) return;
    if (target.item) {
      builder.updateItem.mutate({
        id: target.item.id,
        values: {
          exercise_name: values.exercise_name,
          block: values.block,
          sets: values.sets,
          reps: values.reps,
          tempo: values.tempo,
          rest_seconds: values.rest_seconds,
          load_prescription: values.load,
          rpe: values.rpe,
          duration_seconds: values.duration_seconds,
          distance_m: values.distance_m,
          notes: values.notes,
        },
      });
    } else {
      builder.addItem.mutate({
        day_id: target.dayId,
        exercise_id: pendingExerciseId,
        exercise_name: values.exercise_name,
        block: values.block,
        sets: values.sets,
        reps: values.reps,
        tempo: values.tempo,
        rest_seconds: values.rest_seconds,
        load_prescription: values.load,
        rpe: values.rpe,
        duration_seconds: values.duration_seconds,
        distance_m: values.distance_m,
        notes: values.notes,
      });
    }
    setTarget(null);
    setPendingExerciseId(null);
  };

  if (builder.isLoading) return <HealthLoading rows={3} />;
  if (builder.isError) return <HealthError error={builder.error} title="Could not load this template" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {weekNumbers.map((n) => {
          const count = builder.days.filter((d) => d.week_number === n).length;
          return (
            <Button
              key={n}
              type="button"
              size="sm"
              variant={n === week ? 'default' : 'outline'}
              onClick={() => setWeek(n)}
              className={cn('min-w-[5.5rem]', n === week && 'shadow-sm')}
            >
              Week {n}
              <span className="ml-1.5 text-[11px] opacity-70">{count}</span>
            </Button>
          );
        })}
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setWeek(Math.max(...weekNumbers) + 1)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Week {Math.max(...weekNumbers) + 1}
          </Button>
        )}
      </div>

      {daysThisWeek.length === 0 ? (
        <HealthEmpty
          icon={CalendarPlus}
          title={`Week ${week} has no sessions yet`}
          description={
            canEdit
              ? 'Add a day, then add the movements the athlete works through in order.'
              : 'Ask a trainer to build this week before it is assigned.'
          }
          action={
            canEdit ? (
              <Button size="sm" onClick={() => builder.addDay.mutate({ week_number: week })}>
                <Plus className="mr-2 h-4 w-4" />
                Add a day
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {daysThisWeek.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              canEdit={canEdit}
              onRename={(title) => builder.updateDay.mutate({ id: day.id, values: { title } })}
              onRefocus={(focus) => builder.updateDay.mutate({ id: day.id, values: { focus } })}
              onRemove={() => builder.removeDay.mutate(day.id)}
              onAddExercise={() => setPickerDayId(day.id)}
              onEditItem={(item) =>
                setTarget({ dayId: day.id, item, initial: itemToValues(item) })
              }
              onRemoveItem={(item) => builder.removeItem.mutate(item.id)}
              onMoveItem={(item, direction) => builder.moveItem.mutate({ id: item.id, direction })}
            />
          ))}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => builder.addDay.mutate({ week_number: week })}
              disabled={builder.addDay.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add another day to week {week}
            </Button>
          )}
        </div>
      )}

      <ExercisePickerDialog
        open={Boolean(pickerDayId)}
        onOpenChange={(open) => {
          if (!open) setPickerDayId(null);
        }}
        rehabOnly={rehab}
        onPick={(exercise, name) => {
          if (!pickerDayId) return;
          setPendingExerciseId(exercise?.id ?? null);
          setTarget({
            dayId: pickerDayId,
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
          setPickerDayId(null);
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
        title={target?.item ? 'Edit prescription' : 'Set the prescription'}
        initial={target?.initial ?? null}
        onSave={savePrescription}
        saving={builder.isMutating}
      />
    </div>
  );
};

interface DayCardProps {
  day: TemplateDayEntry;
  canEdit: boolean;
  onRename: (title: string) => void;
  onRefocus: (focus: string | null) => void;
  onRemove: () => void;
  onAddExercise: () => void;
  onEditItem: (item: PtTemplateItem) => void;
  onRemoveItem: (item: PtTemplateItem) => void;
  onMoveItem: (item: PtTemplateItem, direction: 'up' | 'down') => void;
}

const DayCard: React.FC<DayCardProps> = ({
  day,
  canEdit,
  onRename,
  onRefocus,
  onRemove,
  onAddExercise,
  onEditItem,
  onRemoveItem,
  onMoveItem,
}) => {
  const [title, setTitle] = useState(day.title);
  const [focus, setFocus] = useState(day.focus ?? '');

  return (
    <Card>
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`day-title-${day.id}`} className="text-xs text-muted-foreground">
                Day {day.day_number} title
              </Label>
              {canEdit ? (
                <Input
                  id={`day-title-${day.id}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => title.trim() && title !== day.title && onRename(title.trim())}
                />
              ) : (
                <CardTitle className="text-base">{day.title}</CardTitle>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`day-focus-${day.id}`} className="text-xs text-muted-foreground">
                Focus
              </Label>
              {canEdit ? (
                <Input
                  id={`day-focus-${day.id}`}
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  onBlur={() => focus !== (day.focus ?? '') && onRefocus(focus.trim() || null)}
                  placeholder="Lower body strength"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{day.focus ?? 'No focus set'}</p>
              )}
            </div>
          </div>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive">
              <Trash2 className="mr-1.5 h-4 w-4" />
              Remove day
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {day.items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No movements yet. {canEdit ? 'Add the first one below.' : 'Nothing has been programmed.'}
          </p>
        ) : (
          <ul className="divide-y rounded-md border border-border">
            {day.items.map((item, index) => (
              <li key={item.id} className="flex items-start gap-3 p-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
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
                      disabled={index === 0}
                      onClick={() => onMoveItem(item, 'up')}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Move down"
                      disabled={index === day.items.length - 1}
                      onClick={() => onMoveItem(item, 'down')}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Edit prescription"
                      onClick={() => onEditItem(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label="Remove exercise"
                      onClick={() => onRemoveItem(item)}
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
          <Button variant="outline" size="sm" onClick={onAddExercise}>
            <Dumbbell className="mr-2 h-4 w-4" />
            Add an exercise
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default TemplateBuilder;
