import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SESSION_BLOCKS } from '@/modules/health/hooks/usePtLibrary';

export interface PrescriptionValues {
  exercise_name: string;
  block: string | null;
  sets: number | null;
  reps: string | null;
  tempo: string | null;
  rest_seconds: number | null;
  load: string | null;
  rpe: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  notes: string | null;
}

interface PrescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  initial: PrescriptionValues | null;
  onSave: (values: PrescriptionValues) => void;
  saving?: boolean;
}

interface FormState {
  exercise_name: string;
  block: string;
  sets: string;
  reps: string;
  tempo: string;
  rest_seconds: string;
  load: string;
  rpe: string;
  duration_seconds: string;
  distance_m: string;
  notes: string;
}

const toForm = (values: PrescriptionValues | null): FormState => ({
  exercise_name: values?.exercise_name ?? '',
  block: values?.block ?? 'none',
  sets: values?.sets?.toString() ?? '',
  reps: values?.reps ?? '',
  tempo: values?.tempo ?? '',
  rest_seconds: values?.rest_seconds?.toString() ?? '',
  load: values?.load ?? '',
  rpe: values?.rpe?.toString() ?? '',
  duration_seconds: values?.duration_seconds?.toString() ?? '',
  distance_m: values?.distance_m?.toString() ?? '',
  notes: values?.notes ?? '',
});

const num = (value: string): number | null => {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
};

const text = (value: string): string | null => (value.trim() ? value.trim() : null);

/** Sets, reps, tempo, rest, load, RPE. Shared by the template builder and the session editor. */
export const PrescriptionDialog: React.FC<PrescriptionDialogProps> = ({
  open,
  onOpenChange,
  title = 'Prescription',
  description = 'Leave a field blank when it does not apply to this movement.',
  initial,
  onSave,
  saving,
}) => {
  const [form, setForm] = useState<FormState>(toForm(initial));

  useEffect(() => {
    if (open) setForm(toForm(initial));
  }, [open, initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.exercise_name.trim()) return;
    onSave({
      exercise_name: form.exercise_name.trim(),
      block: form.block === 'none' ? null : form.block,
      sets: num(form.sets),
      reps: text(form.reps),
      tempo: text(form.tempo),
      rest_seconds: num(form.rest_seconds),
      load: text(form.load),
      rpe: num(form.rpe),
      duration_seconds: num(form.duration_seconds),
      distance_m: num(form.distance_m),
      notes: text(form.notes),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="prescription-name">Exercise</Label>
                <Input
                  id="prescription-name"
                  value={form.exercise_name}
                  onChange={(e) => set('exercise_name', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Block</Label>
                <Select value={form.block} onValueChange={(v) => set('block', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No block</SelectItem>
                    {SESSION_BLOCKS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prescription-sets">Sets</Label>
                  <Input
                    id="prescription-sets"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={form.sets}
                    onChange={(e) => set('sets', e.target.value)}
                    placeholder="4"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prescription-reps">Reps</Label>
                  <Input
                    id="prescription-reps"
                    value={form.reps}
                    onChange={(e) => set('reps', e.target.value)}
                    placeholder="8-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prescription-load">Load</Label>
                  <Input
                    id="prescription-load"
                    value={form.load}
                    onChange={(e) => set('load', e.target.value)}
                    placeholder="70% 1RM or 40kg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prescription-tempo">Tempo</Label>
                  <Input
                    id="prescription-tempo"
                    value={form.tempo}
                    onChange={(e) => set('tempo', e.target.value)}
                    placeholder="3010"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prescription-rest">Rest (seconds)</Label>
                  <Input
                    id="prescription-rest"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.rest_seconds}
                    onChange={(e) => set('rest_seconds', e.target.value)}
                    placeholder="90"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prescription-rpe">RPE</Label>
                  <Input
                    id="prescription-rpe"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={10}
                    step={0.5}
                    value={form.rpe}
                    onChange={(e) => set('rpe', e.target.value)}
                    placeholder="8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prescription-duration">Duration (seconds)</Label>
                  <Input
                    id="prescription-duration"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.duration_seconds}
                    onChange={(e) => set('duration_seconds', e.target.value)}
                    placeholder="60"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prescription-distance">Distance (metres)</Label>
                  <Input
                    id="prescription-distance"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.distance_m}
                    onChange={(e) => set('distance_m', e.target.value)}
                    placeholder="500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prescription-notes">Notes</Label>
                <Textarea
                  id="prescription-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Drop the load if the knee complains"
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.exercise_name.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PrescriptionDialog;
