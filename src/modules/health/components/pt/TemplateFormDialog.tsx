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
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BODY_REGIONS,
  DIFFICULTIES,
  REHAB_STAGES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATUSES,
  type PtProgramTemplate,
} from '@/modules/health/hooks/usePtLibrary';

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: PtProgramTemplate | null;
  onSave: (values: Partial<PtProgramTemplate> & { name: string }) => void;
  saving?: boolean;
  /** Opened from the rehab library: the rehab fields are shown and pinned on. */
  rehab?: boolean;
}

interface FormState {
  name: string;
  category: string;
  description: string;
  goals: string;
  duration_weeks: string;
  sessions_per_week: string;
  difficulty: string;
  equipment_needed: string;
  status: string;
  is_rehab: boolean;
  body_region: string;
  stage: string;
  clinical_notes: string;
  notes: string;
}

const empty = (rehab: boolean): FormState => ({
  name: '',
  category: rehab ? 'rehab' : 'general',
  description: '',
  goals: '',
  duration_weeks: '4',
  sessions_per_week: '3',
  difficulty: 'none',
  equipment_needed: '',
  status: 'draft',
  is_rehab: rehab,
  body_region: 'none',
  stage: 'none',
  clinical_notes: '',
  notes: '',
});

const fromRow = (row: PtProgramTemplate): FormState => ({
  name: row.name,
  category: row.category,
  description: row.description ?? '',
  goals: row.goals ?? '',
  duration_weeks: String(row.duration_weeks),
  sessions_per_week: String(row.sessions_per_week),
  difficulty: row.difficulty ?? 'none',
  equipment_needed: row.equipment_needed ?? '',
  status: row.status,
  is_rehab: row.is_rehab,
  body_region: row.body_region ?? 'none',
  stage: row.stage ?? 'none',
  clinical_notes: row.clinical_notes ?? '',
  notes: row.notes ?? '',
});

const nullable = (value: string): string | null => (value.trim() ? value.trim() : null);

/** Create or edit the programme template itself. The days are built separately. */
export const TemplateFormDialog: React.FC<TemplateFormDialogProps> = ({
  open,
  onOpenChange,
  template,
  onSave,
  saving,
  rehab = false,
}) => {
  const [form, setForm] = useState<FormState>(empty(rehab));

  useEffect(() => {
    if (open) setForm(template ? fromRow(template) : empty(rehab));
  }, [open, template, rehab]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const showRehabFields = rehab || form.is_rehab;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      ...(template ? { id: template.id } : {}),
      name: form.name.trim(),
      category: form.category,
      description: nullable(form.description),
      goals: nullable(form.goals),
      duration_weeks: Math.max(1, Number(form.duration_weeks) || 1),
      sessions_per_week: Math.max(1, Number(form.sessions_per_week) || 1),
      difficulty: form.difficulty === 'none' ? null : form.difficulty,
      equipment_needed: nullable(form.equipment_needed),
      status: form.status,
      is_active: form.status !== 'archived',
      is_rehab: form.is_rehab,
      body_region: showRehabFields && form.body_region !== 'none' ? form.body_region : null,
      stage: showRehabFields && form.stage !== 'none' ? form.stage : null,
      clinical_notes: showRehabFields ? nullable(form.clinical_notes) : null,
      notes: nullable(form.notes),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Edit' : 'New'} {rehab ? 'rehabilitation protocol' : 'programme template'}
          </DialogTitle>
          <DialogDescription>
            A template is the pattern. Assigning it copies it into the athlete&rsquo;s plan, so editing
            it later never changes work already assigned.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder={rehab ? 'Lateral ankle sprain, weeks 1 to 6' : 'Off-season strength block'}
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
                      {TEMPLATE_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => set('status', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="template-weeks">Weeks</Label>
                  <Input
                    id="template-weeks"
                    type="number"
                    min={1}
                    value={form.duration_weeks}
                    onChange={(e) => set('duration_weeks', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="template-sessions">Sessions each week</Label>
                  <Input
                    id="template-sessions"
                    type="number"
                    min={1}
                    value={form.sessions_per_week}
                    onChange={(e) => set('sessions_per_week', e.target.value)}
                  />
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
                  <Label htmlFor="template-equipment">Equipment needed</Label>
                  <Input
                    id="template-equipment"
                    value={form.equipment_needed}
                    onChange={(e) => set('equipment_needed', e.target.value)}
                    placeholder="Dumbbells, bands, bench"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="template-goals">Goals</Label>
                <Textarea
                  id="template-goals"
                  rows={2}
                  value={form.goals}
                  onChange={(e) => set('goals', e.target.value)}
                  placeholder="Rebuild base strength after a long yard period"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  rows={2}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>

              {!rehab && (
                <div className="flex items-center gap-3 rounded-md border border-border p-3">
                  <Switch
                    id="template-rehab"
                    checked={form.is_rehab}
                    onCheckedChange={(v) => set('is_rehab', v)}
                  />
                  <Label htmlFor="template-rehab" className="cursor-pointer">
                    This is a rehabilitation protocol, shared with Physiotherapy
                  </Label>
                </div>
              )}

              {showRehabFields && (
                <div className="space-y-4 rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Rehabilitation protocols appear in both Physiotherapy and Personal training.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Body region</Label>
                      <Select value={form.body_region} onValueChange={(v) => set('body_region', v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {BODY_REGIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Stage</Label>
                      <Select value={form.stage} onValueChange={(v) => set('stage', v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {REHAB_STAGES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="template-clinical">Clinical notes</Label>
                    <Textarea
                      id="template-clinical"
                      rows={3}
                      value={form.clinical_notes}
                      onChange={(e) => set('clinical_notes', e.target.value)}
                      placeholder="Progression criteria, red flags, when to refer back"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="template-notes">Internal notes</Label>
                <Textarea
                  id="template-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateFormDialog;
