import React, { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import { useProgramTemplates } from '@/modules/health/hooks/usePtLibrary';
import { todayIsoDate, usePtPrograms } from '@/modules/health/hooks/usePtPrograms';

interface AssignProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed template when opened from the template library. */
  templateId?: string | null;
  /** Fixed athlete when opened from their workspace. */
  personId?: string | null;
  rehab?: boolean;
  onAssigned?: (programId: string) => void;
}

/**
 * Assigns a template to an athlete. The database copies the template into
 * sessions and items, so the athlete's plan is theirs from that moment on.
 */
export const AssignProgramDialog: React.FC<AssignProgramDialogProps> = ({
  open,
  onOpenChange,
  templateId = null,
  personId = null,
  rehab = false,
  onAssigned,
}) => {
  const { templates, isLoading: templatesLoading } = useProgramTemplates({
    rehabOnly: rehab,
    status: 'active',
  });
  const trainers = usePractitioners('pt');
  const { assignTemplate } = usePtPrograms();

  const [person, setPerson] = useState<string | null>(personId);
  const [template, setTemplate] = useState<string>(templateId ?? '');
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [trainerId, setTrainerId] = useState('none');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    setPerson(personId);
    setTemplate(templateId ?? '');
    setStartDate(todayIsoDate());
    setTrainerId('none');
    setName('');
  }, [open, personId, templateId]);

  const chosen = templates.find((t) => t.id === template) ?? null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!person || !template) return;
    assignTemplate.mutate(
      {
        personId: person,
        templateId: template,
        startDate,
        trainerId: trainerId === 'none' ? null : trainerId,
        name: name.trim() || null,
      },
      {
        onSuccess: (programId) => {
          onAssigned?.(programId);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign a {rehab ? 'rehabilitation protocol' : 'programme'}</DialogTitle>
          <DialogDescription>
            The template is copied into the athlete&rsquo;s plan. Changing the template afterwards will
            not change what they see.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Athlete</Label>
            {personId ? (
              <Input value="Fixed to this athlete" disabled />
            ) : (
              <PersonPicker value={person} onChange={(id) => setPerson(id)} placeholder="Choose an athlete" />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Template</Label>
            {templateId ? (
              <Input value={chosen?.name ?? 'Selected template'} disabled />
            ) : (
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder={templatesLoading ? 'Loading templates...' : 'Choose a template'} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.duration_weeks} weeks
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!templatesLoading && templates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No published templates yet. Publish one in the template library first.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-start">Start date</Label>
              <Input
                id="assign-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trainer</Label>
              <Select value={trainerId} onValueChange={setTrainerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {trainers.active.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-name">Programme name</Label>
            <Input
              id="assign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={chosen?.name ?? 'Leave blank to use the template name'}
            />
          </div>

          {chosen && (
            <Alert>
              <CalendarCheck className="h-4 w-4" />
              <AlertDescription>
                {chosen.duration_weeks} weeks, {chosen.dayCount} sessions, {chosen.exerciseCount}{' '}
                exercises will be copied across.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!person || !template || assignTemplate.isPending}>
              {assignTemplate.isPending ? 'Assigning...' : 'Assign programme'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AssignProgramDialog;
