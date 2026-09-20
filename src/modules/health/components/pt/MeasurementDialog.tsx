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
import {
  MEASUREMENT_SOURCES,
  todayIsoDate,
  type HwMeasurement,
} from '@/modules/health/hooks/usePtPrograms';

interface MeasurementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  measurement: HwMeasurement | null;
  onSave: (values: Partial<HwMeasurement>) => void;
  saving?: boolean;
  /** `pt` when a trainer records it, `self` when the athlete does. */
  defaultSource?: string;
}

const FIELDS: { key: keyof HwMeasurement; label: string; step?: string }[] = [
  { key: 'weight_kg', label: 'Weight (kg)', step: '0.1' },
  { key: 'height_cm', label: 'Height (cm)', step: '0.1' },
  { key: 'body_fat_pct', label: 'Body fat (%)', step: '0.1' },
  { key: 'muscle_mass_kg', label: 'Muscle mass (kg)', step: '0.1' },
  { key: 'waist_cm', label: 'Waist (cm)', step: '0.1' },
  { key: 'chest_cm', label: 'Chest (cm)', step: '0.1' },
  { key: 'hip_cm', label: 'Hip (cm)', step: '0.1' },
  { key: 'arm_cm', label: 'Arm (cm)', step: '0.1' },
  { key: 'thigh_cm', label: 'Thigh (cm)', step: '0.1' },
  { key: 'calf_cm', label: 'Calf (cm)', step: '0.1' },
  { key: 'neck_cm', label: 'Neck (cm)', step: '0.1' },
  { key: 'resting_hr', label: 'Resting heart rate', step: '1' },
  { key: 'blood_pressure_systolic', label: 'Blood pressure, systolic', step: '1' },
  { key: 'blood_pressure_diastolic', label: 'Blood pressure, diastolic', step: '1' },
];

type NumericState = Record<string, string>;

const toState = (measurement: HwMeasurement | null): NumericState => {
  const state: NumericState = {};
  for (const field of FIELDS) {
    const value = measurement ? measurement[field.key] : null;
    state[field.key as string] = value === null || value === undefined ? '' : String(value);
  }
  return state;
};

/** Record body metrics. Everything is optional: record what was actually taken. */
export const MeasurementDialog: React.FC<MeasurementDialogProps> = ({
  open,
  onOpenChange,
  measurement,
  onSave,
  saving,
  defaultSource = 'pt',
}) => {
  const [values, setValues] = useState<NumericState>(toState(null));
  const [measuredOn, setMeasuredOn] = useState(todayIsoDate());
  const [source, setSource] = useState(defaultSource);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setValues(toState(measurement));
    setMeasuredOn(measurement?.measured_on ?? todayIsoDate());
    setSource(measurement?.source ?? defaultSource);
    setNotes(measurement?.notes ?? '');
  }, [open, measurement, defaultSource]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload: Partial<HwMeasurement> = {
      ...(measurement ? { id: measurement.id } : {}),
      measured_on: measuredOn,
      source,
      notes: notes.trim() || null,
    };
    for (const field of FIELDS) {
      const raw = values[field.key as string];
      const parsed = raw.trim() ? Number(raw) : null;
      (payload as Record<string, unknown>)[field.key as string] =
        parsed !== null && Number.isFinite(parsed) ? parsed : null;
    }
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{measurement ? 'Edit measurements' : 'Record measurements'}</DialogTitle>
          <DialogDescription>
            Fill in only what was measured. Blank fields are left out of the record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="measurement-date">Date</Label>
                  <Input
                    id="measurement-date"
                    type="date"
                    value={measuredOn}
                    onChange={(e) => setMeasuredOn(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Taken by</Label>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEASUREMENT_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map((field) => (
                  <div key={field.key as string} className="space-y-1.5">
                    <Label htmlFor={`measurement-${field.key as string}`}>{field.label}</Label>
                    <Input
                      id={`measurement-${field.key as string}`}
                      type="number"
                      inputMode="decimal"
                      step={field.step}
                      min={0}
                      value={values[field.key as string] ?? ''}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.key as string]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="measurement-notes">Notes</Label>
                <Textarea
                  id="measurement-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Measured first thing, before breakfast"
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save measurements'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MeasurementDialog;
