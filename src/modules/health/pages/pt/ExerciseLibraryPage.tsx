import React, { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Dumbbell, Pencil, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { ExerciseFormDialog } from '@/modules/health/components/pt/ExerciseFormDialog';
import { StaffOnlyNotice } from '@/modules/health/components/pt/PtCommon';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import {
  DIFFICULTIES,
  EXERCISE_CATEGORIES,
  EXERCISE_SOURCES,
  difficultyLabel,
  exerciseCategoryLabel,
  exerciseSourceLabel,
  useExerciseFacets,
  useExercises,
  type PtExercise,
} from '@/modules/health/hooks/usePtLibrary';

/** The exercise library: what the whole section programmes from. */
const ExerciseLibraryPage: React.FC = () => {
  const access = useWellnessAccess();
  const canEdit = access.canEdit;
  const { facets } = useExerciseFacets();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [bodyPart, setBodyPart] = useState('all');
  const [targetMuscle, setTargetMuscle] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [source, setSource] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PtExercise | null>(null);

  const library = useExercises({
    search,
    category: category === 'all' ? null : category,
    bodyPart: bodyPart === 'all' ? null : bodyPart,
    targetMuscle: targetMuscle === 'all' ? null : targetMuscle,
    equipment: equipment === 'all' ? null : equipment,
    difficulty: difficulty === 'all' ? null : difficulty,
    source: source === 'all' ? null : source,
    includeInactive: includeArchived,
  });

  const visibleIds = useMemo(() => library.exercises.map((e) => e.id), [library.exercises]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={Dumbbell} title="Exercise library" description="Every movement on board." />
        <StaffOnlyNotice what="library" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Dumbbell}
        title="Exercise library"
        description="Movements written on board and rows imported from open sources, each keeping the licence it came with."
        actions={
          canEdit ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New exercise
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, muscle, body part or kit"
              className="pl-9"
            />
          </div>
        }
      />

      <StatGrid>
        <StatTile icon={Dumbbell} label="Shown" value={library.isLoading ? null : library.summary.total} />
        <StatTile
          icon={Dumbbell}
          label="Written on board"
          value={library.isLoading ? null : library.summary.custom}
        />
        <StatTile
          icon={Dumbbell}
          label="Imported"
          value={library.isLoading ? null : library.summary.imported}
          hint="Carry their source licence"
        />
        <StatTile
          icon={Dumbbell}
          label="Rehabilitation"
          value={library.isLoading ? null : library.summary.rehab}
        />
      </StatGrid>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any category</SelectItem>
              {EXERCISE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bodyPart} onValueChange={setBodyPart}>
            <SelectTrigger>
              <SelectValue placeholder="Body part" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any body part</SelectItem>
              {facets.bodyParts.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetMuscle} onValueChange={setTargetMuscle}>
            <SelectTrigger>
              <SelectValue placeholder="Target muscle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any muscle</SelectItem>
              {facets.targetMuscles.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={equipment} onValueChange={setEquipment}>
            <SelectTrigger>
              <SelectValue placeholder="Equipment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any equipment</SelectItem>
              {facets.equipment.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger>
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any difficulty</SelectItem>
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any source</SelectItem>
              {EXERCISE_SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {canEdit && (
            <>
              <Checkbox
                id="select-all"
                checked={allSelected}
                onCheckedChange={(value) => setSelected(value === true ? visibleIds : [])}
              />
              <Label htmlFor="select-all" className="text-sm font-normal">
                Select all shown
              </Label>
            </>
          )}
          <div className="flex items-center gap-2">
            <Switch id="show-archived" checked={includeArchived} onCheckedChange={setIncludeArchived} />
            <Label htmlFor="show-archived" className="text-sm font-normal">
              Show archived
            </Label>
          </div>
        </div>
        {canEdit && selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.length} selected</span>
            <Button
              variant="outline"
              size="sm"
              disabled={library.isMutating}
              onClick={() =>
                library.setActive.mutate({ ids: selected, isActive: false }, { onSuccess: () => setSelected([]) })
              }
            >
              <Archive className="mr-1.5 h-4 w-4" />
              Archive
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={library.isMutating}
              onClick={() =>
                library.setActive.mutate({ ids: selected, isActive: true }, { onSuccess: () => setSelected([]) })
              }
            >
              <ArchiveRestore className="mr-1.5 h-4 w-4" />
              Restore
            </Button>
          </div>
        )}
      </div>

      {library.isLoading ? (
        <HealthLoading rows={5} />
      ) : library.isError ? (
        <HealthError error={library.error} title="Could not load the exercise library" />
      ) : library.exercises.length === 0 ? (
        <HealthEmpty
          icon={Dumbbell}
          title="No exercises match"
          description={
            canEdit
              ? 'Clear the filters, write one from scratch, or import a set from an exercise source.'
              : 'Clear the filters, or ask a trainer to add the movements you use.'
          }
          action={
            canEdit ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                New exercise
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {library.exercises.map((exercise) => (
            <Card key={exercise.id} className={cn(!exercise.is_active && 'opacity-60')}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start gap-3">
                  {canEdit && (
                    <Checkbox
                      className="mt-1"
                      checked={selected.includes(exercise.id)}
                      onCheckedChange={() => toggle(exercise.id)}
                      aria-label={`Select ${exercise.name}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{exercise.name}</p>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          aria-label={`Edit ${exercise.name}`}
                          onClick={() => {
                            setEditing(exercise);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        exerciseCategoryLabel(exercise.category),
                        exercise.body_part,
                        exercise.target_muscle,
                        exercise.equipment,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {exercise.difficulty && (
                    <Badge variant="secondary" className="text-[10px]">
                      {difficultyLabel(exercise.difficulty)}
                    </Badge>
                  )}
                  {exercise.is_rehab && (
                    <Badge variant="outline" className="border-warning/20 bg-warning/10 text-[10px] text-warning">
                      Rehabilitation
                    </Badge>
                  )}
                  {!exercise.is_active && (
                    <Badge variant="outline" className="text-[10px]">
                      Archived
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {exerciseSourceLabel(exercise.source)}
                  </Badge>
                </div>

                {exercise.coaching_cues && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{exercise.coaching_cues}</p>
                )}
                {exercise.contraindications && (
                  <p className="line-clamp-2 text-xs text-destructive">
                    Avoid: {exercise.contraindications}
                  </p>
                )}
                {exercise.source !== 'custom' && (
                  <p className="text-[11px] text-muted-foreground/80">
                    {exercise.attribution ?? exerciseSourceLabel(exercise.source)}
                    {exercise.source_licence ? ` · ${exercise.source_licence}` : ''}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ExerciseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        exercise={editing}
        saving={library.isMutating}
        onSave={(values) => library.save.mutate(values, { onSuccess: () => setFormOpen(false) })}
      />
    </div>
  );
};

export default ExerciseLibraryPage;
