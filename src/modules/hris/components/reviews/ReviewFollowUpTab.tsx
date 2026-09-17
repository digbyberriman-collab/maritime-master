import React from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/modules/hris/lib/format';
import { FOLLOW_UP_OWNERS, type FollowUpAction, type FollowUpOwner } from '@/modules/hris/lib/reviews';

export interface Recommendations {
  recommend_promotion: boolean | null;
  recommend_pay_review: boolean | null;
  retain: boolean | null;
}

interface ReviewFollowUpTabProps {
  actions: FollowUpAction[];
  onActionsChange: (next: FollowUpAction[]) => void;
  nextReviewDate: string;
  onNextReviewDateChange: (value: string) => void;
  recommendations: Recommendations;
  onRecommendationChange: (key: keyof Recommendations, value: boolean) => void;
  welfareNotes: string;
  onWelfareNotesChange: (value: string) => void;
  /** Reviewer-side editing (draft / self-assessment / in review). */
  editable: boolean;
  /** "Done" toggles stay available after signing for HR / reviewer. */
  canToggleDone: boolean;
  /** Welfare notes: HR editors and the reviewer only; never the subject. */
  showWelfare: boolean;
}

const RECOMMENDATION_ROWS: { key: keyof Recommendations; label: string; hint: string }[] = [
  { key: 'recommend_promotion', label: 'Recommend for promotion', hint: 'Ready for the next rank or a wider role.' },
  { key: 'recommend_pay_review', label: 'Recommend pay review', hint: 'Flags this person for the next compensation round.' },
  { key: 'retain', label: 'Retain', hint: 'Would you re-hire them for the next season?' },
];

/** Follow-up actions, next review date, recommendation switches and (restricted) welfare notes. */
export const ReviewFollowUpTab: React.FC<ReviewFollowUpTabProps> = ({
  actions,
  onActionsChange,
  nextReviewDate,
  onNextReviewDateChange,
  recommendations,
  onRecommendationChange,
  welfareNotes,
  onWelfareNotesChange,
  editable,
  canToggleDone,
  showWelfare,
}) => {
  const patch = (idx: number, next: Partial<FollowUpAction>) => onActionsChange(actions.map((a, i) => (i === idx ? { ...a, ...next } : a)));
  const remove = (idx: number) => onActionsChange(actions.filter((_, i) => i !== idx));
  const add = () => onActionsChange([...actions, { action: '', owner: 'employee', due_date: null, done: false }]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Follow-up actions</h3>
            <p className="text-xs text-muted-foreground">Concrete next steps with an owner and a date. Tick them off as they happen.</p>
          </div>
          {editable && (
            <Button variant="outline" size="sm" onClick={add}>
              <Plus className="mr-1 h-4 w-4" /> Add action
            </Button>
          )}
        </div>
        {actions.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No follow-up actions{editable ? ' yet — add one above.' : '.'}</p>
        ) : (
          <ul className="space-y-2">
            {actions.map((a, idx) => (
              <li key={idx} className={cn('grid items-start gap-2 rounded-md border p-3 md:grid-cols-[auto_minmax(0,1fr)_150px_150px_auto]', a.done && 'bg-muted/30')}>
                <div className="pt-2">
                  <Checkbox
                    checked={a.done}
                    disabled={!canToggleDone}
                    onCheckedChange={(v) => patch(idx, { done: v === true })}
                    aria-label={`Mark "${a.action || 'action'}" as done`}
                  />
                </div>
                {editable ? (
                  <Input value={a.action} placeholder="What needs to happen?" onChange={(e) => patch(idx, { action: e.target.value })} />
                ) : (
                  <p className={cn('pt-2 text-sm', a.done && 'text-muted-foreground line-through')}>{a.action || '—'}</p>
                )}
                {editable ? (
                  <Select value={a.owner} onValueChange={(v) => patch(idx, { owner: v as FollowUpOwner })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FOLLOW_UP_OWNERS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <p className="pt-2 text-sm text-muted-foreground">{FOLLOW_UP_OWNERS.find((o) => o.value === a.owner)?.label ?? a.owner}</p>
                )}
                {editable ? (
                  <Input type="date" value={a.due_date ?? ''} onChange={(e) => patch(idx, { due_date: e.target.value || null })} />
                ) : (
                  <p className="pt-2 text-sm text-muted-foreground">{formatDate(a.due_date)}</p>
                )}
                {editable ? (
                  <Button variant="ghost" size="icon" onClick={() => remove(idx)} aria-label="Remove action">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="next-review-date">Next review date</Label>
          {editable ? (
            <Input id="next-review-date" type="date" value={nextReviewDate} onChange={(e) => onNextReviewDateChange(e.target.value)} className="md:w-56" />
          ) : (
            <p className="text-sm">{formatDate(nextReviewDate || null)}</p>
          )}
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Recommendations</h3>
          {RECOMMENDATION_ROWS.map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div>
                <Label htmlFor={`rec-${row.key}`} className="font-medium">{row.label}</Label>
                <p className="text-xs text-muted-foreground">{row.hint}</p>
              </div>
              <Switch id={`rec-${row.key}`} checked={recommendations[row.key] === true} disabled={!editable} onCheckedChange={(v) => onRecommendationChange(row.key, v)} />
            </div>
          ))}
        </div>
      </section>

      {showWelfare && (
        <section className="space-y-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-yellow-600" />
            <h3 className="text-sm font-semibold text-foreground">Welfare notes</h3>
            <span className="text-xs text-muted-foreground">Confidential — visible to HR editors and the reviewer only, never to the crew member.</span>
          </div>
          {editable ? (
            <Textarea rows={4} value={welfareNotes} onChange={(e) => onWelfareNotesChange(e.target.value)} placeholder="Fatigue, personal circumstances, support offered…" />
          ) : (
            <p className="whitespace-pre-wrap text-sm">{welfareNotes.trim() || <span className="text-muted-foreground">—</span>}</p>
          )}
        </section>
      )}
    </div>
  );
};

export default ReviewFollowUpTab;
