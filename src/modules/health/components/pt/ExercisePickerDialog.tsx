import React, { useState } from 'react';
import { Dumbbell, Plus, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import {
  EXERCISE_CATEGORIES,
  exerciseCategoryLabel,
  useExerciseFacets,
  useExercises,
  type PtExercise,
} from '@/modules/health/hooks/usePtLibrary';

interface ExercisePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a library row, or with a free-text name when nothing fits. */
  onPick: (exercise: PtExercise | null, name: string) => void;
  rehabOnly?: boolean;
  title?: string;
}

/** Search the exercise library and drop a row into a day or a session. */
export const ExercisePickerDialog: React.FC<ExercisePickerDialogProps> = ({
  open,
  onOpenChange,
  onPick,
  rehabOnly = false,
  title = 'Add an exercise',
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [bodyPart, setBodyPart] = useState('all');
  const { facets } = useExerciseFacets();
  const { exercises, isLoading, isError, error } = useExercises({
    search,
    category: category === 'all' ? null : category,
    bodyPart: bodyPart === 'all' ? null : bodyPart,
    rehabOnly,
    limit: 120,
  });

  const pick = (exercise: PtExercise | null, name: string) => {
    onPick(exercise, name);
    setSearch('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Search the library, or type a name and add it as written if the movement is not listed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, muscle or kit"
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Any category" />
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
                <SelectValue placeholder="Any body part" />
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
          </div>

          {isLoading ? (
            <HealthLoading rows={3} />
          ) : isError ? (
            <HealthError error={error} title="Could not load the exercise library" />
          ) : exercises.length === 0 ? (
            <HealthEmpty
              icon={Dumbbell}
              title="Nothing matches"
              description="Widen the filters, or add this movement by the name you use on board."
              className="border-0 py-6"
              action={
                search.trim() ? (
                  <Button size="sm" onClick={() => pick(null, search.trim())}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add &ldquo;{search.trim()}&rdquo;
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ScrollArea className="h-[320px] rounded-md border">
              <ul className="divide-y">
                {exercises.map((exercise) => (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      onClick={() => pick(exercise, exercise.name)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-accent/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {exercise.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[exerciseCategoryLabel(exercise.category), exercise.target_muscle, exercise.equipment]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {exercise.source !== 'custom' && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          Imported
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}

          {search.trim() && exercises.length > 0 && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => pick(null, search.trim())}>
              <Plus className="mr-2 h-4 w-4" />
              Add &ldquo;{search.trim()}&rdquo; as written
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExercisePickerDialog;
