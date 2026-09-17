import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type NarrativeField = 'strengths' | 'development_areas' | 'training_needs' | 'career_aspirations' | 'summary' | 'reviewer_comments';

export type NarrativeValues = Record<NarrativeField, string>;

const FIELDS: { key: NarrativeField; label: string; hint: string }[] = [
  { key: 'strengths', label: 'Strengths', hint: 'What this person does well — with examples from the period.' },
  { key: 'development_areas', label: 'Development areas', hint: 'Where performance or behaviour should improve, and what good looks like.' },
  { key: 'training_needs', label: 'Training needs', hint: 'Courses, certificates or on-board coaching that would help.' },
  { key: 'career_aspirations', label: 'Career aspirations', hint: 'Where they want to go next and what the company can do.' },
  { key: 'summary', label: 'Summary', hint: 'Short overall statement for the record.' },
  { key: 'reviewer_comments', label: 'Reviewer comments', hint: 'Anything else the reviewer wants on record.' },
];

interface ReviewNarrativeTabProps {
  values: NarrativeValues;
  onChange: (field: NarrativeField, value: string) => void;
  editable: boolean;
  /** Read-only here; the crew member writes it through self-assessment / acknowledgement. */
  employeeComments: string | null;
}

const ReadOnly: React.FC<{ value: string | null | undefined }> = ({ value }) =>
  value?.trim() ? <p className="whitespace-pre-wrap text-sm text-foreground">{value}</p> : <p className="text-sm text-muted-foreground">—</p>;

/** Free-text sections of the review. */
export const ReviewNarrativeTab: React.FC<ReviewNarrativeTabProps> = ({ values, onChange, editable, employeeComments }) => (
  <div className="grid gap-5 lg:grid-cols-2">
    {FIELDS.map((f) => (
      <div key={f.key} className="space-y-1.5">
        <Label htmlFor={`narrative-${f.key}`}>{f.label}</Label>
        {editable ? (
          <Textarea id={`narrative-${f.key}`} rows={4} value={values[f.key]} placeholder={f.hint} onChange={(e) => onChange(f.key, e.target.value)} />
        ) : (
          <ReadOnly value={values[f.key]} />
        )}
      </div>
    ))}
    <div className="space-y-1.5 lg:col-span-2">
      <Label>Crew member comments</Label>
      <div className="rounded-md border bg-muted/30 p-3">
        <ReadOnly value={employeeComments} />
      </div>
      <p className="text-xs text-muted-foreground">Written by the crew member during self-assessment or acknowledgement.</p>
    </div>
  </div>
);

export default ReviewNarrativeTab;
