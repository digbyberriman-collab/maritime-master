import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { formatDateTime, humanise } from '@/modules/hris/lib/format';
import {
  INTERVIEW_FORMATS,
  INTERVIEW_OUTCOMES,
  emptyScorecard,
  interviewFormSchema,
  parseScorecard,
  scorecardAverage,
  type InterviewFormValues,
  type InterviewOutcome,
  type InterviewRow,
  type ScorecardRow,
} from '@/modules/hris/lib/recruitment';
import type { CompleteInterviewArgs } from '@/modules/hris/hooks/useRecruitment';

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

interface ScheduleInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  /** Pre-selected interviewers, e.g. the hiring manager. */
  defaultInterviewerIds?: string[];
  nameOf: (profileId: string) => string;
  onSubmit: (values: InterviewFormValues) => Promise<void>;
  isPending?: boolean;
}

const tomorrow = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const defaultValues = (interviewers: string[]): InterviewFormValues => ({
  scheduled_date: tomorrow(),
  scheduled_time: '10:00',
  duration_minutes: 45,
  format: 'video',
  location: '',
  interviewer_profile_ids: interviewers,
});

export const ScheduleInterviewDialog: React.FC<ScheduleInterviewDialogProps> = ({
  open,
  onOpenChange,
  candidateName,
  defaultInterviewerIds = [],
  nameOf,
  onSubmit,
  isPending,
}) => {
  const form = useForm<InterviewFormValues>({ resolver: zodResolver(interviewFormSchema), defaultValues: defaultValues(defaultInterviewerIds) });

  useEffect(() => {
    if (open) form.reset(defaultValues(defaultInterviewerIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const format = form.watch('format');
  const interviewers = form.watch('interviewer_profile_ids');

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule interview</DialogTitle>
          <DialogDescription>Interview with {candidateName}. Interviewers can see and complete their own interviews.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="scheduled_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduled_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time (local)</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="format"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Format</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {INTERVIEW_FORMATS.map((f) => <SelectItem key={f} value={f}>{humanise(f)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="duration_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (min)</FormLabel>
                    <FormControl><Input type="number" min={10} max={480} step={5} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{format === 'video' ? 'Meeting link' : format === 'phone' ? 'Phone number' : 'Location'}</FormLabel>
                  <FormControl><Input placeholder={format === 'video' ? 'https://…' : format === 'onboard_trial' ? 'Vessel / port' : ''} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="interviewer_profile_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interviewers</FormLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {interviewers.map((id) => (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1 font-normal">
                        {nameOf(id)}
                        <button
                          type="button"
                          className="rounded-sm hover:bg-background/60"
                          onClick={() => field.onChange(interviewers.filter((x) => x !== id))}
                          aria-label={`Remove ${nameOf(id)}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <CrewPicker
                    value={null}
                    placeholder="Add interviewer"
                    onChange={(id) => {
                      if (id && !interviewers.includes(id)) field.onChange([...interviewers, id]);
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Schedule
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

interface CompleteInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interview: InterviewRow | null;
  candidateName: string;
  onSubmit: (values: Omit<CompleteInterviewArgs, 'interview'>) => Promise<void>;
  isPending?: boolean;
}

const OUTCOME_LABEL: Record<InterviewOutcome, string> = {
  strong_yes: 'Strong yes',
  yes: 'Yes',
  maybe: 'Maybe',
  no: 'No',
};

/** Records the outcome, a 1–5 competency scorecard and feedback for an interview. */
export const CompleteInterviewDialog: React.FC<CompleteInterviewDialogProps> = ({ open, onOpenChange, interview, candidateName, onSubmit, isPending }) => {
  const [status, setStatus] = useState<'completed' | 'no_show'>('completed');
  const [outcome, setOutcome] = useState<InterviewOutcome | ''>('');
  const [rows, setRows] = useState<ScorecardRow[]>(emptyScorecard());
  const [feedback, setFeedback] = useState('');
  const [newCompetency, setNewCompetency] = useState('');

  useEffect(() => {
    if (open && interview) {
      const stored = parseScorecard(interview.scorecard);
      setRows(stored.length ? stored : emptyScorecard());
      setOutcome((interview.outcome as InterviewOutcome | null) ?? '');
      setFeedback(interview.feedback ?? '');
      setStatus(interview.status === 'no_show' ? 'no_show' : 'completed');
      setNewCompetency('');
    }
  }, [open, interview]);

  const average = scorecardAverage(rows);
  const setScore = (index: number, score: number | null) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, score } : r)));
  const setComment = (index: number, comment: string) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, comment } : r)));
  const addRow = () => {
    const name = newCompetency.trim();
    if (!name) return;
    setRows((prev) => [...prev, { competency: name, score: null, comment: '' }]);
    setNewCompetency('');
  };

  const canSubmit = status === 'no_show' || Boolean(outcome);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Interview feedback</DialogTitle>
          <DialogDescription>
            {candidateName}{interview ? ` · ${formatDateTime(interview.scheduled_at)} · ${humanise(interview.format)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Attendance</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as 'completed' | 'no_show')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Interview took place</SelectItem>
                  <SelectItem value="no_show">Candidate did not show</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status === 'completed' && (
              <div className="space-y-2">
                <Label>Overall outcome</Label>
                <div className="grid grid-cols-4 gap-1">
                  {INTERVIEW_OUTCOMES.map((o) => (
                    <Button
                      key={o}
                      type="button"
                      size="sm"
                      variant={outcome === o ? 'default' : 'outline'}
                      className="px-1 text-xs"
                      onClick={() => setOutcome(o)}
                    >
                      {OUTCOME_LABEL[o]}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {status === 'completed' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Scorecard</Label>
                <span className="text-xs text-muted-foreground">{average === null ? 'Not rated' : `Average ${average} / 5`}</span>
              </div>
              <div className="space-y-2 rounded-md border p-3">
                {rows.map((row, i) => (
                  <div key={`${row.competency}-${i}`} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{row.competency}</p>
                      <Input
                        className="mt-1 h-8 text-xs"
                        placeholder="Comment (optional)"
                        value={row.comment}
                        onChange={(e) => setComment(i, e.target.value)}
                      />
                    </div>
                    <div className="flex items-start gap-1" role="radiogroup" aria-label={`${row.competency} score`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={row.score === n}
                          onClick={() => setScore(i, row.score === n ? null : n)}
                          className={cn(
                            'h-8 w-8 rounded-md border text-sm tabular-nums transition-colors',
                            row.score === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Add a competency…"
                    value={newCompetency}
                    onChange={(e) => setNewCompetency(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRow();
                      }
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" className="h-8" onClick={addRow} disabled={!newCompetency.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Feedback</Label>
            <Textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Strengths, concerns, follow-ups…" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button
            type="button"
            disabled={!canSubmit || isPending}
            onClick={() => void onSubmit({ status, outcome: status === 'completed' && outcome ? outcome : null, scorecard: status === 'completed' ? rows : [], feedback })}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
