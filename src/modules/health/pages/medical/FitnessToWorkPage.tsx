import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  HeartPulse,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  ClinicalNotice,
  HealthEmpty,
  HealthError,
  HealthLoading,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import {
  ASSESSMENT_TYPES,
  FITNESS_STATUSES,
  assessmentTypeLabel,
  fitnessStatusLabel,
  useFitnessAssessments,
  useFitnessStatus,
  type FitnessAssessment,
} from '@/modules/health/hooks/useFitnessAssessments';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';
import {
  FITNESS_LABELS,
  FITNESS_TONE,
  badgeToneClass,
  expiryLabel,
  expiryTone,
  formatDate,
  toneClass,
} from '@/modules/health/lib/format';

/**
 * Fitness to work. This is the one medical page the bridge and HR can open,
 * because a vessel cannot sail with an expired ENG1. It carries status,
 * restrictions and dates and no clinical detail at all.
 */
const FitnessToWorkPage: React.FC = () => {
  const medical = useMedicalAccess();
  const hr = useHrAccess();
  const status = useFitnessStatus();
  const { personId, person, setPersonId, selfOnly } = useSelectedPerson('medical');
  const assessments = useFitnessAssessments(personId);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FitnessAssessment | null>(null);

  // HR and captains may record an ENG1 renewal; only medical staff may
  // record a clinical outcome, which the form reflects.
  const canEdit = medical.canEdit || hr.canEdit;
  const clinicalReader = medical.canView;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return status.rows.filter((row) => {
      if (stateFilter !== 'all' && row.state !== stateFilter) return false;
      if (!term) return true;
      return [row.person_name, row.rank, row.department]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(term));
    });
  }, [status.rows, search, stateFilter]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={HeartPulse}
        scope="medical"
        title="Fitness to work"
        description="ENG1 and equivalent certificates, restrictions and expiry across the fleet."
        actions={
          canEdit && (
            <Button size="sm" className="gap-1" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Record a certificate
            </Button>
          )
        }
        toolbar={
          <>
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, rank or department"
                className="pl-8"
              />
            </div>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="md:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {Object.entries(FITNESS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      {!clinicalReader && <ClinicalNotice />}

      <StatGrid>
        <StatTile
          icon={CheckCircle2}
          label="Fit for duty"
          value={status.isLoading ? null : status.summary.valid}
          tone="good"
        />
        <StatTile
          icon={ShieldAlert}
          label="With restrictions"
          value={status.isLoading ? null : status.summary.restricted}
          tone="warning"
        />
        <StatTile
          icon={CalendarClock}
          label="Expiring within 30 days"
          value={status.isLoading ? null : status.summary.expiring}
          tone={status.summary.expiring > 0 ? 'warning' : 'good'}
        />
        <StatTile
          icon={AlertTriangle}
          label="Expired or unfit"
          value={status.isLoading ? null : status.summary.expired + status.summary.unfit}
          hint={`${status.summary.unknown} with no certificate`}
          tone={status.summary.expired + status.summary.unfit > 0 ? 'critical' : 'good'}
        />
      </StatGrid>

      <Tabs defaultValue={selfOnly ? 'person' : 'fleet'}>
        <TabsList>
          {!selfOnly && <TabsTrigger value="fleet">Across the fleet</TabsTrigger>}
          <TabsTrigger value="person">One person</TabsTrigger>
        </TabsList>

        {!selfOnly && (
          <TabsContent value="fleet" className="mt-4">
            {status.isError ? (
              <HealthError error={status.error} title="Could not load fitness status" />
            ) : status.isLoading ? (
              <HealthLoading rows={5} />
            ) : filtered.length === 0 ? (
              <HealthEmpty
                icon={HeartPulse}
                title={status.rows.length === 0 ? 'No certificates recorded' : 'Nobody matches those filters'}
                description={
                  status.rows.length === 0
                    ? 'Record each crew member’s ENG1 so expiry is tracked and the crew list stays right.'
                    : 'Clear the search or choose a different status.'
                }
                action={
                  canEdit && status.rows.length === 0 ? (
                    <Button onClick={openCreate} className="gap-1">
                      <Plus className="h-4 w-4" /> Record a certificate
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Person</th>
                          <th className="px-4 py-2.5 font-medium">Certificate</th>
                          <th className="px-4 py-2.5 font-medium">Status</th>
                          <th className="px-4 py-2.5 font-medium">Expires</th>
                          <th className="px-4 py-2.5 font-medium">Restrictions</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filtered.map((row) => (
                          <tr key={row.assessment_id ?? row.person_id} className="hover:bg-accent/40">
                            <td className="px-4 py-2.5">
                              <Link
                                to={healthLink(HEALTH_PATHS.fitnessToWork, row.person_id)}
                                className="font-medium text-foreground hover:underline"
                              >
                                {row.person_name}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {[row.rank, row.department].filter(Boolean).join(' · ')}
                              </p>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {assessmentTypeLabel(row.assessment_type)}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                variant="outline"
                                className={cn('text-[10px]', badgeToneClass[FITNESS_TONE[row.state]])}
                              >
                                {FITNESS_LABELS[row.state]}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5">
                              {row.expires_on ? (
                                <Badge
                                  variant="outline"
                                  className={cn('text-[10px]', toneClass[expiryTone(row.expires_on)])}
                                >
                                  {expiryLabel(row.expires_on)}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="max-w-[240px] truncate px-4 py-2.5 text-muted-foreground">
                              {row.restrictions ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPersonId(row.person_id)}
                              >
                                History
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="person" className="mt-4 space-y-4">
          {!selfOnly && (
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              includeInactive
              placeholder="Choose whose certificates to see"
              className="md:w-[420px]"
            />
          )}

          {!personId ? (
            <HealthEmpty
              icon={HeartPulse}
              title="Choose someone"
              description="Pick a person to see every certificate they have held."
            />
          ) : assessments.isLoading ? (
            <HealthLoading rows={3} />
          ) : assessments.assessments.length === 0 ? (
            <HealthEmpty
              icon={HeartPulse}
              title={`No certificates for ${person?.displayName ?? 'this person'}`}
              description="Record their ENG1 or equivalent to start tracking expiry."
              action={
                canEdit ? (
                  <Button onClick={openCreate} className="gap-1">
                    <Plus className="h-4 w-4" /> Record a certificate
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {assessments.assessments.map((a) => (
                <Card key={a.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {assessmentTypeLabel(a.assessment_type)}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {fitnessStatusLabel(a.status)}
                        </Badge>
                        {a.expires_on && (
                          <Badge
                            variant="outline"
                            className={cn('text-[10px]', toneClass[expiryTone(a.expires_on)])}
                          >
                            {expiryLabel(a.expires_on)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[
                          a.issued_on ? `Issued ${formatDate(a.issued_on)}` : null,
                          a.expires_on ? `Expires ${formatDate(a.expires_on)}` : null,
                          a.examiner_name,
                          a.examiner_reference,
                          a.issuing_country,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {a.restrictions && (
                        <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">
                          {a.restrictions}
                          {a.restriction_review_on
                            ? ` · review ${formatDate(a.restriction_review_on)}`
                            : ''}
                        </p>
                      )}
                      {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit certificate"
                          onClick={() => {
                            setEditing(a);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete certificate"
                          onClick={() => assessments.remove.mutate(a.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <FitnessFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        assessment={editing}
        personId={personId}
        onSubmit={(values) => assessments.save.mutateAsync(values)}
        busy={assessments.isMutating}
      />
    </div>
  );
};

const FitnessFormDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessment: FitnessAssessment | null;
  personId: string | null;
  onSubmit: (values: Partial<FitnessAssessment> & { person_id?: string }) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, assessment, personId, onSubmit, busy }) => {
  const [target, setTarget] = useState<string | null>(personId);
  const [form, setForm] = useState({
    assessment_type: 'eng1',
    status: 'fit',
    issued_on: '',
    expires_on: '',
    examiner_name: '',
    examiner_reference: '',
    issuing_country: '',
    restrictions: '',
    restriction_review_on: '',
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    setTarget(assessment ? assessment.person_id : personId);
    if (assessment) {
      setForm({
        assessment_type: assessment.assessment_type,
        status: assessment.status,
        issued_on: assessment.issued_on ?? '',
        expires_on: assessment.expires_on ?? '',
        examiner_name: assessment.examiner_name ?? '',
        examiner_reference: assessment.examiner_reference ?? '',
        issuing_country: assessment.issuing_country ?? '',
        restrictions: assessment.restrictions ?? '',
        restriction_review_on: assessment.restriction_review_on ?? '',
        notes: assessment.notes ?? '',
      });
    } else {
      setForm({
        assessment_type: 'eng1',
        status: 'fit',
        issued_on: '',
        expires_on: '',
        examiner_name: '',
        examiner_reference: '',
        issuing_country: '',
        restrictions: '',
        restriction_review_on: '',
        notes: '',
      });
    }
  }, [open, assessment, personId]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!target) return;
    await onSubmit({
      ...(assessment ? { id: assessment.id } : {}),
      person_id: target,
      assessment_type: form.assessment_type,
      status: form.status,
      issued_on: form.issued_on || null,
      expires_on: form.expires_on || null,
      examiner_name: form.examiner_name || null,
      examiner_reference: form.examiner_reference || null,
      issuing_country: form.issuing_country || null,
      restrictions: form.restrictions || null,
      restriction_review_on: form.restriction_review_on || null,
      notes: form.notes || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{assessment ? 'Edit certificate' : 'Record a fitness certificate'}</DialogTitle>
          <DialogDescription>
            Saving updates the crew list and the certificate alerts. Record clinical findings in a
            consultation, not here.
          </DialogDescription>
        </DialogHeader>

        {!assessment && (
          <div className="space-y-1.5">
            <Label>Person</Label>
            <PersonPicker value={target} onChange={(id) => setTarget(id)} includeInactive />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fit-type">Certificate</Label>
            <Select value={form.assessment_type} onValueChange={set('assessment_type')}>
              <SelectTrigger id="fit-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSESSMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fit-status">Outcome</Label>
            <Select value={form.status} onValueChange={set('status')}>
              <SelectTrigger id="fit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FITNESS_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fit-issued">Issued</Label>
            <Input
              id="fit-issued"
              type="date"
              value={form.issued_on}
              onChange={(e) => set('issued_on')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fit-expires">Expires</Label>
            <Input
              id="fit-expires"
              type="date"
              value={form.expires_on}
              onChange={(e) => set('expires_on')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fit-examiner">Examiner</Label>
            <Input
              id="fit-examiner"
              value={form.examiner_name}
              onChange={(e) => set('examiner_name')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fit-reference">Certificate number</Label>
            <Input
              id="fit-reference"
              value={form.examiner_reference}
              onChange={(e) => set('examiner_reference')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fit-country">Issuing country</Label>
            <Input
              id="fit-country"
              value={form.issuing_country}
              onChange={(e) => set('issuing_country')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fit-review">Restriction review</Label>
            <Input
              id="fit-review"
              type="date"
              value={form.restriction_review_on}
              onChange={(e) => set('restriction_review_on')(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fit-restrictions">Restrictions</Label>
          <Textarea
            id="fit-restrictions"
            rows={2}
            value={form.restrictions}
            onChange={(e) => set('restrictions')(e.target.value)}
            placeholder="Near coastal only, lenses to be worn, no lookout duties"
          />
          <p className="text-xs text-muted-foreground">
            Captains and HR can read this, so keep it to what limits the work.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fit-notes">Administrative notes</Label>
          <Textarea
            id="fit-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !target}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {assessment ? 'Save' : 'Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FitnessToWorkPage;
