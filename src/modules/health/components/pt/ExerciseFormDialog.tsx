import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DIFFICULTIES,
  EXERCISE_CATEGORIES,
  exerciseSourceLabel,
  type PtExercise,
} from '@/modules/health/hooks/usePtLibrary';

interface ExerciseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: PtExercise | null;
  onSave: (values: Partial<PtExercise> & { name: string }) => void;
  saving?: boolean;
  /** Pre-sets the rehab flag when opened from the rehab library. */
  defaultRehab?: boolean;
}

interface FormState {
  name: string;
  category: string;
  body_part: string;
  target_muscle: string;
  equipment: string;
  difficulty: string;
  instructions: string;
  coaching_cues: string;
  contraindications: string;
  video_url: string;
  image_url: string;
  notes: string;
  is_rehab: boolean;
  is_active: boolean;
}

const empty = (defaultRehab: boolean): FormState => ({
  name: '',
  category: defaultRehab ? 'rehab' : 'strength',
  body_part: '',
  target_muscle: '',
  equipment: '',
  difficulty: 'none',
  instructions: '',
  coaching_cues: '',
  contraindications: '',
  video_url: '',
  image_url: '',
  notes: '',
  is_rehab: defaultRehab,
  is_active: true,
});

const fromRow = (row: PtExercise): FormState => ({
  name: row.name,
  category: row.category,
  body_part: row.body_part ?? '',
  target_muscle: row.target_muscle ?? '',
  equipment: row.equipment ?? '',
  difficulty: row.difficulty ?? 'none',
  instructions: row.instructions ?? '',
  coaching_cues: row.coaching_cues ?? '',
  contraindications: row.contraindications ?? '',
  video_url: row.video_url ?? '',
  image_url: row.image_url ?? '',
  notes: row.notes ?? '',
  is_rehab: row.is_rehab,
  is_active: row.is_active,
});

const nullable = (value: string): string | null => (value.trim() ? value.trim() : null);

/** Create or edit one exercise. Imported rows keep their source and licence. */
export const ExerciseFormDialog: React.FC<ExerciseFormDialogProps> = ({
  open,
  onOpenChange,
  exercise,
  onSave,
  saving,
  defaultRehab = false,
}) => {
  const [form, setForm] = useState<FormState>(empty(defaultRehab));

  useEffect(() => {
    if (open) setForm(exercise ? fromRow(exercise) : empty(defaultRehab));
  }, [open, exercise, defaultRehab]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      ...(exercise ? { id: exercise.id } : {}),
      name: form.name.trim(),
      category: form.category,
      body_part: nullable(form.body_part),
      target_muscle: nullable(form.target_muscle),
      equipment: nullable(form.equipment),
      difficulty: form.difficulty === 'none' ? null : form.difficulty,
      instructions: nullable(form.instructions),
      coaching_cues: nullable(form.coaching_cues),
      contraindications: nullable(form.contraindications),
      video_url: nullable(form.video_url),
      image_url: nullable(form.image_url),
      notes: nullable(form.notes),
      is_rehab: form.is_rehab,
      is_active: form.is_active,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{exercise ? 'Edit exercise' : 'New exercise'}</DialogTitle>
          <DialogDescription>
            Cues and contraindications are what the athlete reads in the gym, so keep them short.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              {exercise && exercise.source !== 'custom' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Imported from {exerciseSourceLabel(exercise.source)}</AlertTitle>
                  <AlertDescription>
                    {exercise.source_licence
                      ? `This row carries the ${exercise.source_licence} licence of its source. Keep the attribution with it wherever it is shown.`
                      : 'This row came from an import and carries the licence of its source.'}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="exercise-name">Name</Label>
                <Input
                  id="exercise-name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Barbell back squat"
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => set('category', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXERCISE_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <Select value={form.difficulty} onValueChange={(v) => set('difficulty', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {DIFFICULTIES.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exercise-body-part">Body part</Label>
                  <Input
                    id="exercise-body-part"
                    value={form.body_part}
                    onChange={(e) => set('body_part', e.target.value)}
                    placeholder="Legs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exercise-target">Target muscle</Label>
                  <Input
                    id="exercise-target"
                    value={form.target_muscle}
                    onChange={(e) => set('target_muscle', e.target.value)}
                    placeholder="Quadriceps"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="exercise-equipment">Equipment</Label>
                  <Input
                    id="exercise-equipment"
                    value={form.equipment}
                    onChange={(e) => set('equipment', e.target.value)}
                    placeholder="Barbell, rack"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exercise-instructions">Instructions</Label>
                <Textarea
                  id="exercise-instructions"
                  rows={3}
                  value={form.instructions}
                  onChange={(e) => set('instructions', e.target.value)}
                  placeholder="Set the bar on the upper back, brace, sit between the hips..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exercise-cues">Coaching cues</Label>
                <Textarea
                  id="exercise-cues"
                  rows={2}
                  value={form.coaching_cues}
                  onChange={(e) => set('coaching_cues', e.target.value)}
                  placeholder="Chest up, knees out, drive through mid foot"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exercise-contra">Contraindications</Label>
                <Textarea
                  id="exercise-contra"
                  rows={2}
                  value={form.contraindications}
                  onChange={(e) => set('contraindications', e.target.value)}
                  placeholder="Avoid with acute lower back pain"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="exercise-video">Video link</Label>
                  <Input
                    id="exercise-video"
                    value={form.video_url}
                    onChange={(e) => set('video_url', e.target.value)}
                    placeholder="https://"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exercise-image">Image link</Label>
                  <Input
                    id="exercise-image"
                    value={form.image_url}
                    onChange={(e) => set('image_url', e.target.value)}
                    placeholder="https://"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    id="exercise-rehab"
                    checked={form.is_rehab}
                    onCheckedChange={(v) => set('is_rehab', v)}
                  />
                  <Label htmlFor="exercise-rehab" className="cursor-pointer">
                    Rehabilitation exercise
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="exercise-active"
                    checked={form.is_active}
                    onCheckedChange={(v) => set('is_active', v)}
                  />
                  <Label htmlFor="exercise-active" className="cursor-pointer">
                    In use
                  </Label>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : 'Save exercise'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ExerciseFormDialog;
