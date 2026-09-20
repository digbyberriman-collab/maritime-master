import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Send, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useLegalIncidents, useLegalPeople, useLegalVessels } from '@/modules/legal/hooks/useLegalLookups';
import { CURRENCIES, JURISDICTIONS, PRIORITIES, REQUEST_TYPES, REQUESTER_DEPARTMENTS, requestTypeDef, TONE_CLASS, type LegalPriority, type LegalRequestType } from '@/modules/legal/lib/constants';
import { computeSlaDeadline } from '@/modules/legal/lib/sla';
import { emptyIntakeValues, INTAKE_STEPS, parseTags, validateIntake, validateIntakeStep, type IntakeErrors, type IntakeStep, type IntakeValues } from '@/modules/legal/lib/requests';
import { PeopleSelect } from './PeopleSelect';

interface IntakeWizardProps {
  defaults?: Partial<IntakeValues>;
  onSubmit: (values: IntakeValues) => Promise<void> | void;
  onCancel?: () => void;
  isPending?: boolean;
}

const STEP_TITLES: Record<IntakeStep, string> = { type: 'What do you need?', details: 'Tell us about it', priority: 'How urgent is it?' };

const NONE = '__none';

const FieldError: React.FC<{ message?: string }> = ({ message }) => (message ? <p className="text-xs text-destructive">{message}</p> : null);

export const IntakeWizard: React.FC<IntakeWizardProps> = ({ defaults, onSubmit, onCancel, isPending }) => {
  const [values, setValues] = useState<IntakeValues>(() => emptyIntakeValues(defaults));
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<IntakeErrors>({});
  const [tagInput, setTagInput] = useState('');
  const step = INTAKE_STEPS[stepIndex];

  const { vessels, vesselName } = useLegalVessels();
  const { incidents, incidentLabel } = useLegalIncidents(stepIndex === 1 || stepIndex === 2);
  const { people } = useLegalPeople();

  const typeDef = requestTypeDef(values.request_type);
  const set = <K extends keyof IntakeValues>(key: K, value: IntakeValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const crewOptions = useMemo(
    () => people.map((p) => ({ ...p, key: p.id, subtitle: [p.rank ?? p.position, p.department].filter(Boolean).join(' · ') || null })),
    [people],
  );

  const next = () => {
    const stepErrors = validateIntakeStep(values, step);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) return;
    setStepIndex((i) => Math.min(i + 1, INTAKE_STEPS.length - 1));
  };
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  const submit = async () => {
    const { ok, errors: all } = validateIntake(values);
    setErrors(all);
    if (!ok) {
      const firstStep = INTAKE_STEPS.findIndex((s) => Object.keys(validateIntakeStep(values, s)).length > 0);
      if (firstStep >= 0) setStepIndex(firstStep);
      return;
    }
    await onSubmit(values);
  };

  const addTags = () => {
    if (!tagInput.trim()) return;
    set('tags', parseTags(tagInput, values.tags));
    setTagInput('');
  };

  const slaPreview = computeSlaDeadline(values.priority);
  const priorityDef = PRIORITIES.find((p) => p.value === values.priority) ?? PRIORITIES[1];

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2 text-sm" aria-label="Steps">
        {INTAKE_STEPS.map((s, i) => {
          const state = i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo';
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium',
                  state === 'done' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' && 'border-primary text-primary',
                  state === 'todo' && 'border-border text-muted-foreground',
                )}
              >
                {state === 'done' ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn(state === 'current' ? 'font-medium text-foreground' : 'text-muted-foreground')}>{STEP_TITLES[s]}</span>
              {i < INTAKE_STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {step === 'type' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Request type">
            {REQUEST_TYPES.map((t) => {
              const Icon = t.icon;
              const selected = values.request_type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set('request_type', t.value as LegalRequestType)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                    selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50',
                  )}
                >
                  <span className={cn('rounded-md p-2', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-medium text-foreground">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <FieldError message={errors.request_type} />
        </div>
      )}

      {step === 'details' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="legal-title">Title *</Label>
            <Input id="legal-title" value={values.title} onChange={(e) => set('title', e.target.value)} placeholder={`e.g. ${typeDef?.label ?? 'Request'} for the Med season charter`} maxLength={200} />
            <FieldError message={errors.title} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="legal-description">Description</Label>
            <Textarea
              id="legal-description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What do you need, by when, and what is the background? Attach documents after submitting."
              rows={5}
            />
            <FieldError message={errors.description} />
          </div>
          {typeDef?.showsCounterparty && (
            <div className="space-y-1.5">
              <Label htmlFor="legal-counterparty">Counterparty</Label>
              <Input id="legal-counterparty" value={values.counterparty} onChange={(e) => set('counterparty', e.target.value)} placeholder="Other party to the agreement" maxLength={200} />
              <FieldError message={errors.counterparty} />
            </div>
          )}
          {typeDef?.showsValue && (
            <div className="space-y-1.5">
              <Label htmlFor="legal-value">Contract value</Label>
              <div className="flex gap-2">
                <Input id="legal-value" inputMode="decimal" value={values.contract_value} onChange={(e) => set('contract_value', e.target.value)} placeholder="0.00" className="flex-1" />
                <Select value={values.currency} onValueChange={(v) => set('currency', v)}>
                  <SelectTrigger className="w-28" aria-label="Currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FieldError message={errors.contract_value ?? errors.currency} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Jurisdiction</Label>
            <Select value={values.jurisdiction || NONE} onValueChange={(v) => set('jurisdiction', v === NONE ? '' : v)}>
              <SelectTrigger aria-label="Jurisdiction">
                <SelectValue placeholder="Select jurisdiction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not sure</SelectItem>
                {JURISDICTIONS.map((j) => (
                  <SelectItem key={j} value={j}>
                    {j}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Your department</Label>
            <Select value={values.requester_department || NONE} onValueChange={(v) => set('requester_department', v === NONE ? '' : v)}>
              <SelectTrigger aria-label="Department">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not specified</SelectItem>
                {REQUESTER_DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vessel</Label>
            <Select value={values.vessel_id || NONE} onValueChange={(v) => set('vessel_id', v === NONE ? '' : v)}>
              <SelectTrigger aria-label="Vessel">
                <SelectValue placeholder="Select vessel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Fleet-wide / not vessel specific</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legal-deadline">Requested deadline</Label>
            <Input id="legal-deadline" type="date" value={values.requested_deadline} onChange={(e) => set('requested_deadline', e.target.value)} />
            <FieldError message={errors.requested_deadline} />
          </div>
          <div className="space-y-1.5">
            <Label>Related incident</Label>
            <Select value={values.incident_id || NONE} onValueChange={(v) => set('incident_id', v === NONE ? '' : v)}>
              <SelectTrigger aria-label="Related incident">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {incidents.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.incident_number} · {i.incident_type} · {i.incident_date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Related crew member</Label>
            <PeopleSelect value={values.profile_id || null} options={crewOptions} onChange={(key) => set('profile_id', key ?? '')} placeholder="None" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="legal-tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="legal-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTags();
                  }
                }}
                placeholder="Type a tag and press Enter"
              />
              <Button type="button" variant="outline" onClick={addTags}>
                Add
              </Button>
            </div>
            {values.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {values.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button type="button" aria-label={`Remove tag ${t}`} onClick={() => set('tags', values.tags.filter((x) => x !== t))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <FieldError message={errors.tags} />
          </div>
        </div>
      )}

      {step === 'priority' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map((p) => {
              const selected = values.priority === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set('priority', p.value as LegalPriority)}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50',
                  )}
                >
                  <span className={cn('inline-block rounded-full border px-2 py-0.5 text-xs font-medium', TONE_CLASS[p.tone])}>{p.label}</span>
                  <span className="mt-2 block text-sm font-medium text-foreground">SLA {p.slaLabel}</span>
                  <span className="block text-xs text-muted-foreground">{p.description}</span>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            With <span className="font-medium text-foreground">{priorityDef.label}</span> priority the legal team commits to a response by{' '}
            <span className="font-medium text-foreground">{format(slaPreview, 'EEE d MMM yyyy, HH:mm')}</span> (business days, Monday to Friday).
          </p>

          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Review before you submit</h3>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Type" value={typeDef?.label} />
                <Row label="Title" value={values.title} />
                <Row label="Priority" value={`${priorityDef.label} · ${priorityDef.slaLabel}`} />
                {typeDef?.showsCounterparty && <Row label="Counterparty" value={values.counterparty} />}
                {typeDef?.showsValue && values.contract_value && <Row label="Value" value={`${values.contract_value} ${values.currency}`} />}
                <Row label="Jurisdiction" value={values.jurisdiction} />
                <Row label="Department" value={values.requester_department} />
                <Row label="Vessel" value={vesselName(values.vessel_id)} />
                <Row label="Incident" value={incidentLabel(values.incident_id)} />
                <Row label="Crew member" value={crewOptions.find((c) => c.key === values.profile_id)?.displayName} />
                <Row label="Requested deadline" value={values.requested_deadline} />
                <Row label="Tags" value={values.tags.join(', ')} />
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Description</dt>
                  <dd className="whitespace-pre-wrap text-foreground">{values.description || '—'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {stepIndex > 0 && (
            <Button type="button" variant="outline" onClick={back} disabled={isPending}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          )}
          {stepIndex < INTAKE_STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={isPending}>
              <Send className="mr-2 h-4 w-4" /> {isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-foreground">{value || '—'}</dd>
  </div>
);

export default IntakeWizard;
