import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Loader2,
  Plus,
  Send,
  Settings2,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatTile, StatGrid } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { useHealthPeople } from '@/modules/health/hooks/useHealthPeople';
import {
  ANSWER_TYPES,
  RECORD_STATUSES,
  RISK_BANDS,
  SCREENING_CATEGORIES,
  recordStatusLabel,
  riskBandFor,
  scoreScreening,
  screeningCategoryLabel,
  useScreeningAnswers,
  useScreeningQuestions,
  useScreeningRecords,
  useScreeningTemplates,
  type ScreeningQuestion,
  type ScreeningRecordEntry,
  type ScreeningTemplate,
} from '@/modules/health/hooks/useScreening';
import { addDaysIso, formatDate, todayIso, toneClass } from '@/modules/health/lib/format';

const RISK_TONE: Record<string, keyof typeof toneClass> = {
  low: 'ok',
  moderate: 'warning',
  high: 'critical',
  very_high: 'expired',
};

/**
 * C.H.E.K. — the crew health screening and appraisal programme.
 *
 * The questionnaire is configurable rather than fixed: a template holds
 * scored sections, a campaign invites people to complete it, and a medic
 * reviews the result. That holds a holistic health appraisal or any other
 * screening programme without a schema change.
 */
const HealthScreeningPage: React.FC = () => {
  const access = useMedicalAccess();
  const templates = useScreeningTemplates();
  const records = useScreeningRecords();
  const { personId, person, setPersonId, selfOnly, myPerson } = useSelectedPerson('medical');

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [openRecord, setOpenRecord] = useState<ScreeningRecordEntry | null>(null);

  useEffect(() => {
    if (!templateId && templates.active.length > 0) setTemplateId(templates.active[0].id);
  }, [templates.active, templateId]);

  const template = useMemo(
    () => templates.templates.find((t) => t.id === templateId) ?? null,
    [templates.templates, templateId],
  );

  const myRecords = useMemo(
    () => records.records.filter((r) => r.person_id === (myPerson?.id ?? '')),
    [records.records, myPerson?.id],
  );

  const visibleRecords = useMemo(() => {
    if (selfOnly) return myRecords;
    if (personId) return records.records.filter((r) => r.person_id === personId);
    return records.records;
  }, [selfOnly, myRecords, personId, records.records]);

  if (templates.isError) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={GraduationCap} scope="medical" title="C.H.E.K." />
        <HealthError error={templates.error} title="Could not load the screening programme" />
      </div>
    );
  }

  const noTemplates = !templates.isLoading && templates.templates.length === 0;

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={GraduationCap}
        scope="medical"
        title="C.H.E.K."
        description="Crew health screening and appraisal: questionnaires, campaigns, scores and follow-up."
        actions={
          access.canEdit && (
            <>
              {templates.templates.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setBuilderOpen(true)}>
                  <Settings2 className="h-4 w-4" /> Questions
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1"
                onClick={() => setInviteOpen(true)}
                disabled={!templateId}
              >
                <Send className="h-4 w-4" /> Invite crew
              </Button>
            </>
          )
        }
        toolbar={
          templates.templates.length > 0 ? (
            <Select value={templateId ?? ''} onValueChange={setTemplateId}>
              <SelectTrigger className="md:w-80">
                <SelectValue placeholder="Choose a questionnaire" />
              </SelectTrigger>
              <SelectContent>
                {templates.templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.status !== 'active' ? `(${t.status})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {noTemplates ? (
        <HealthEmpty
          icon={ClipboardList}
          title="No screening questionnaire yet"
          description="Start from the default crew health appraisal and edit the questions to match your programme, or build one from scratch."
          action={
            access.canEdit && (
              <Button
                onClick={() => templates.seedDefault.mutate()}
                disabled={templates.isMutating}
                className="gap-1"
              >
                {templates.seedDefault.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create the default appraisal
              </Button>
            )
          }
        />
      ) : (
        <>
          <Alert className="border-dashed">
            <ClipboardCheck className="h-4 w-4" />
            <AlertTitle>This programme is configurable</AlertTitle>
            <AlertDescription>
              The questions, sections, weights and risk bands are yours to set. Change them to match
              whatever appraisal your programme uses.
            </AlertDescription>
          </Alert>

          <StatGrid>
            <StatTile
              icon={ClipboardList}
              label="Screenings recorded"
              value={records.isLoading ? null : records.summary.total}
            />
            <StatTile
              icon={Send}
              label="Outstanding"
              value={records.isLoading ? null : records.summary.outstanding}
              tone={records.summary.outstanding > 0 ? 'warning' : 'good'}
            />
            <StatTile
              icon={UserCheck}
              label="Awaiting review"
              value={records.isLoading ? null : records.summary.awaitingReview}
              tone={records.summary.awaitingReview > 0 ? 'warning' : 'good'}
            />
            <StatTile
              icon={ClipboardCheck}
              label="High risk"
              value={records.isLoading ? null : records.summary.highRisk}
              tone={records.summary.highRisk > 0 ? 'critical' : 'good'}
            />
          </StatGrid>

          <Tabs defaultValue={selfOnly ? 'mine' : 'all'}>
            <TabsList>
              {!selfOnly && <TabsTrigger value="all">All screenings</TabsTrigger>}
              <TabsTrigger value="mine">Mine</TabsTrigger>
            </TabsList>

            {!selfOnly && (
              <TabsContent value="all" className="mt-4">
                <RecordsTable
                  rows={visibleRecords}
                  loading={records.isLoading}
                  onOpen={setOpenRecord}
                  onDelete={access.canEdit ? (id) => records.remove.mutate(id) : undefined}
                  showPerson
                />
              </TabsContent>
            )}

            <TabsContent value="mine" className="mt-4">
              <RecordsTable
                rows={myRecords}
                loading={records.isLoading}
                onOpen={setOpenRecord}
                emptyTitle="You have no screenings"
                emptyDescription="When the medic invites you to a health appraisal it will appear here."
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      {template && (
        <QuestionBuilderDialog
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          template={template}
          canEdit={access.canEdit}
        />
      )}

      {template && (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          template={template}
          onInvite={(personIds, dueOn) =>
            records.invite.mutateAsync({ templateId: template.id, personIds, dueOn })
          }
          busy={records.isMutating}
        />
      )}

      <ScreeningRunner
        record={openRecord}
        onOpenChange={(open) => !open && setOpenRecord(null)}
        canReview={access.canEdit}
        onSave={(values) => records.save.mutateAsync(values)}
      />

      {!selfOnly && person && (
        <p className="text-xs text-muted-foreground">
          Showing {person.displayName}.{' '}
          <button type="button" className="underline" onClick={() => setPersonId(null)}>
            Show everyone
          </button>
        </p>
      )}
    </div>
  );
};

const RecordsTable: React.FC<{
  rows: ScreeningRecordEntry[];
  loading: boolean;
  onOpen: (r: ScreeningRecordEntry) => void;
  onDelete?: (id: string) => void;
  showPerson?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}> = ({
  rows,
  loading,
  onOpen,
  onDelete,
  showPerson,
  emptyTitle = 'No screenings yet',
  emptyDescription = 'Invite crew to a questionnaire to start the programme.',
}) => {
  if (loading) return <HealthLoading rows={4} />;
  if (rows.length === 0) {
    return <HealthEmpty icon={ClipboardList} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {showPerson && <th className="px-4 py-2.5 font-medium">Person</th>}
                <th className="px-4 py-2.5 font-medium">Questionnaire</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Due</th>
                <th className="px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5 font-medium">Risk</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  {showPerson && (
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.person_name ?? '—'}</td>
                  )}
                  <td className="px-4 py-2.5 text-muted-foreground">{r.template_name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="text-[10px]">
                      {recordStatusLabel(r.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(r.due_on)}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.total_score ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {r.risk_band ? (
                      <Badge
                        variant="outline"
                        className={cn('text-[10px]', toneClass[RISK_TONE[r.risk_band] ?? 'none'])}
                      >
                        {RISK_BANDS.find((b) => b.value === r.risk_band)?.label ?? r.risk_band}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => onOpen(r)}>
                        Open
                      </Button>
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete screening"
                          onClick={() => onDelete(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

const InviteDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ScreeningTemplate;
  onInvite: (personIds: string[], dueOn: string | null) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, template, onInvite, busy }) => {
  const people = useHealthPeople();
  const [selected, setSelected] = useState<string[]>([]);
  const [dueOn, setDueOn] = useState(addDaysIso(todayIso(), 30));

  useEffect(() => {
    if (open) {
      setSelected([]);
      setDueOn(addDaysIso(todayIso(), 30));
    }
  }, [open]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const crew = people.entries.filter((p) => p.isCrew);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invite crew to {template.name}</DialogTitle>
          <DialogDescription>
            Everyone chosen gets a screening record they can complete themselves.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-due">Due by</Label>
            <Input
              id="invite-due"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(selected.length === crew.length ? [] : crew.map((c) => c.id))}
            >
              {selected.length === crew.length ? 'Clear all' : 'Select all crew'}
            </Button>
          </div>
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
          {crew.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-accent"
            >
              <Checkbox checked={selected.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{p.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[p.rank, p.department, p.vessel_name].filter(Boolean).join(' · ')}
                </span>
              </span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await onInvite(selected, dueOn || null);
              onOpenChange(false);
            }}
            disabled={busy || selected.length === 0}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Invite {selected.length || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const QuestionBuilderDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ScreeningTemplate;
  canEdit: boolean;
}> = ({ open, onOpenChange, template, canEdit }) => {
  const questions = useScreeningQuestions(template.id);
  const [prompt, setPrompt] = useState('');
  const [section, setSection] = useState('General');
  const [answerType, setAnswerType] = useState('scale');
  const [weight, setWeight] = useState('1');

  const add = async () => {
    if (!prompt.trim()) return;
    await questions.save.mutateAsync({
      prompt: prompt.trim(),
      section,
      answer_type: answerType,
      weight: Number(weight) || 1,
      position: questions.questions.length + 1,
      min_value: answerType === 'scale' ? 1 : null,
      max_value: answerType === 'scale' ? 5 : null,
      is_required: answerType !== 'text',
    });
    setPrompt('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>
            {screeningCategoryLabel(template.category)} · version {template.version} ·{' '}
            {template.scoring_mode === 'none' ? 'not scored' : `scored by ${template.scoring_mode}`}
          </DialogDescription>
        </DialogHeader>

        {template.interpretation && (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            {template.interpretation}
          </p>
        )}

        {questions.isLoading ? (
          <HealthLoading rows={3} />
        ) : questions.sections.length === 0 ? (
          <HealthEmpty
            icon={ClipboardList}
            title="No questions yet"
            description="Add the first question below."
            className="border-0"
          />
        ) : (
          <div className="space-y-4">
            {questions.sections.map(([sectionName, items]) => (
              <div key={sectionName} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {sectionName}
                </h3>
                <ul className="divide-y rounded-lg border">
                  {items.map((q) => (
                    <li key={q.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{q.prompt}</p>
                        <p className="text-xs text-muted-foreground">
                          {ANSWER_TYPES.find((t) => t.value === q.answer_type)?.label} · weight{' '}
                          {q.weight}
                          {q.unit ? ` · ${q.unit}` : ''}
                          {q.is_required ? '' : ' · optional'}
                        </p>
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove question"
                          onClick={() => questions.remove.mutate(q.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium text-foreground">Add a question</p>
            <div className="space-y-1.5">
              <Label htmlFor="q-prompt">Question</Label>
              <Textarea
                id="q-prompt"
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="q-section">Section</Label>
                <Input id="q-section" value={section} onChange={(e) => setSection(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-type">Answer</Label>
                <Select value={answerType} onValueChange={setAnswerType}>
                  <SelectTrigger id="q-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANSWER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-weight">Weight</Label>
                <Input
                  id="q-weight"
                  type="number"
                  step="0.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={add} disabled={questions.isMutating || !prompt.trim()} className="gap-1">
              {questions.isMutating && <Loader2 className="h-4 w-4 animate-spin" />}
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ScreeningRunner: React.FC<{
  record: ScreeningRecordEntry | null;
  onOpenChange: (open: boolean) => void;
  canReview: boolean;
  onSave: (values: Record<string, unknown>) => Promise<unknown>;
}> = ({ record, onOpenChange, canReview, onSave }) => {
  const questions = useScreeningQuestions(record?.template_id ?? null);
  const answers = useScreeningAnswers(record?.id ?? null);
  const [summary, setSummary] = useState('');
  const [recommendations, setRecommendations] = useState('');

  useEffect(() => {
    if (!record) return;
    setSummary(record.summary ?? '');
    setRecommendations(record.recommendations ?? '');
  }, [record]);

  // The template decides how it is scored: summed, averaged or not at all.
  // Hard-coding 'sum' stored a 12x total on an averaged template and banded
  // the person high when they were low.
  const scoringMode = record?.scoring_mode ?? 'sum';
  const scored = useMemo(
    () => scoreScreening(questions.questions, answers.byQuestion, scoringMode),
    [questions.questions, answers.byQuestion, scoringMode],
  );

  const completion = questions.questions.length
    ? Math.round((scored.answered / questions.questions.length) * 100)
    : 0;

  const submitAnswers = async () => {
    if (!record) return;
    await onSave({
      id: record.id,
      status: 'submitted',
      completed_on: todayIso(),
      total_score: scoringMode === 'none' ? null : scored.total,
      risk_band: riskBandFor(scored.total, scoringMode),
    });
    onOpenChange(false);
  };

  const review = async () => {
    if (!record) return;
    await onSave({
      id: record.id,
      status: 'reviewed',
      reviewed_on: todayIso(),
      summary: summary || null,
      recommendations: recommendations || null,
      total_score: scoringMode === 'none' ? null : scored.total,
      risk_band: riskBandFor(scored.total, scoringMode),
    });
    onOpenChange(false);
  };

  const locked = record?.status === 'reviewed' || record?.status === 'actioned';

  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{record?.template_name}</DialogTitle>
          <DialogDescription>
            {[record?.person_name, recordStatusLabel(record?.status), record?.due_on ? `Due ${formatDate(record.due_on)}` : null]
              .filter(Boolean)
              .join(' · ')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {scored.answered} of {questions.questions.length} answered
            </span>
            <span>
              Score {scored.total}
              {scored.flagged > 0 ? ` · ${scored.flagged} flagged` : ''}
            </span>
          </div>
          <Progress value={completion} />
        </div>

        {questions.isLoading ? (
          <HealthLoading rows={4} />
        ) : (
          <div className="space-y-5">
            {questions.sections.map(([sectionName, items]) => (
              <div key={sectionName} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {sectionName}
                </h3>
                {items.map((q) => (
                  <AnswerField
                    key={q.id}
                    question={q}
                    value={answers.byQuestion.get(q.id) ?? null}
                    disabled={locked}
                    onChange={(values) => answers.saveAnswer.mutate({ question_id: q.id, ...values })}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {canReview && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium text-foreground">Medic review</p>
            <div className="space-y-1.5">
              <Label htmlFor="sc-summary">Summary</Label>
              <Textarea
                id="sc-summary"
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-recommendations">Recommendations</Label>
              <Textarea
                id="sc-recommendations"
                rows={2}
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!locked && (
            <Button onClick={submitAnswers} disabled={answers.isMutating}>
              {answers.isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          )}
          {canReview && record?.status === 'submitted' && (
            <Button onClick={review}>Mark reviewed</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AnswerField: React.FC<{
  question: ScreeningQuestion;
  value: {
    value_numeric: number | null;
    value_text: string | null;
    value_options: string[];
    is_flagged: boolean;
  } | null;
  disabled: boolean;
  onChange: (values: Record<string, unknown>) => void;
}> = ({ question, value, disabled, onChange }) => {
  const numeric = value?.value_numeric ?? null;
  const chosen = value?.value_options ?? [];
  const options = question.options ?? [];

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <Label className="text-sm font-normal text-foreground">{question.prompt}</Label>
        {question.is_required && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Required
          </Badge>
        )}
      </div>
      {question.help_text && <p className="text-xs text-muted-foreground">{question.help_text}</p>}

      {question.answer_type === 'scale' && (
        <div className="space-y-1.5">
          <Slider
            value={[numeric ?? 3]}
            min={question.min_value ?? 1}
            max={question.max_value ?? 5}
            step={1}
            disabled={disabled}
            onValueChange={([v]) => onChange({ value_numeric: v })}
          />
          <p className="text-xs text-muted-foreground">
            {numeric === null ? 'Not answered' : `Answer: ${numeric}`}
          </p>
        </div>
      )}

      {question.answer_type === 'yes_no' && (
        <div className="flex items-center gap-3">
          <Switch
            checked={numeric === 1}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ value_numeric: checked ? 1 : 0 })}
          />
          <span className="text-sm text-muted-foreground">{numeric === 1 ? 'Yes' : 'No'}</span>
        </div>
      )}

      {question.answer_type === 'number' && (
        <Input
          type="number"
          disabled={disabled}
          value={numeric ?? ''}
          onChange={(e) => onChange({ value_numeric: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder={question.unit ?? ''}
        />
      )}

      {question.answer_type === 'text' && (
        <Textarea
          rows={2}
          disabled={disabled}
          value={value?.value_text ?? ''}
          onChange={(e) => onChange({ value_text: e.target.value || null })}
        />
      )}

      {question.answer_type === 'single_choice' && (
        <RadioGroup
          value={chosen[0] ?? ''}
          disabled={disabled}
          onValueChange={(v) => onChange({ value_options: v ? [v] : [], value_text: v || null })}
          className="space-y-1.5"
        >
          {options.length === 0 && (
            <p className="text-xs text-muted-foreground">This question has no options set.</p>
          )}
          {options.map((option) => (
            <div key={option} className="flex items-center gap-2">
              <RadioGroupItem value={option} id={`${question.id}-${option}`} />
              <Label htmlFor={`${question.id}-${option}`} className="text-sm font-normal">
                {option}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {question.answer_type === 'multi_choice' && (
        <div className="space-y-1.5">
          {options.length === 0 && (
            <p className="text-xs text-muted-foreground">This question has no options set.</p>
          )}
          {options.map((option) => {
            const checked = chosen.includes(option);
            return (
              <div key={option} className="flex items-center gap-2">
                <Checkbox
                  id={`${question.id}-${option}`}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(next) => {
                    const values = next === true
                      ? [...chosen, option]
                      : chosen.filter((o) => o !== option);
                    onChange({ value_options: values, value_text: values.join(', ') || null });
                  }}
                />
                <Label htmlFor={`${question.id}-${option}`} className="text-sm font-normal">
                  {option}
                </Label>
              </div>
            );
          })}
        </div>
      )}

      {question.answer_type === 'date' && (
        <Input
          type="date"
          disabled={disabled}
          value={value?.value_text ?? ''}
          onChange={(e) => onChange({ value_date: e.target.value || null, value_text: e.target.value || null })}
        />
      )}
    </div>
  );
};

export default HealthScreeningPage;
