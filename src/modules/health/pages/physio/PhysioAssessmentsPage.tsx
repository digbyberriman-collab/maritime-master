import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  Flag,
  Plus,
  Search,
  Send,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import {
  FitForDutyBadge,
  PainBadge,
  RedFlagBadge,
} from '@/modules/health/components/physio/PhysioBadges';
import { PhysioAssessmentDialog } from '@/modules/health/components/physio/PhysioAssessmentDialog';
import { RaiseReferralDialog } from '@/modules/health/components/physio/ReferralDialogs';
import { ConfirmDeleteDialog } from '@/modules/health/components/physio/ConfirmDeleteDialog';
import {
  ASSESSMENT_TYPES,
  assessmentTypeLabel,
  usePhysioAccess,
  usePhysioAssessments,
  type PhysioAssessmentEntry,
} from '@/modules/health/hooks/usePhysio';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { formatDate } from '@/modules/health/lib/format';

const ALL = '__all__';

const referralReason = (assessment: PhysioAssessmentEntry): string =>
  [
    assessment.chief_complaint ? `Complaint: ${assessment.chief_complaint}` : null,
    assessment.diagnosis ? `Working diagnosis: ${assessment.diagnosis}` : null,
    assessment.red_flags ? `Red flags: ${assessment.red_flags}` : null,
    assessment.fit_for_duty === 'unfit' ? 'Assessed as not fit for duty.' : null,
  ]
    .filter(Boolean)
    .join('\n') || 'Physiotherapy assessment needs a medical opinion.';

/**
 * Physiotherapy assessments: the whole company, or one person's file. Red
 * flags and an unfit result are surfaced first, because those are the two
 * findings that have to reach the medic and the captain the same day.
 */
const PhysioAssessmentsPage: React.FC = () => {
  const access = usePhysioAccess();
  const { personId, setPersonId, myPerson, selfOnly } = useSelectedPerson('wellness');
  const { practitioners } = usePractitioners();

  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [practitionerFilter, setPractitionerFilter] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PhysioAssessmentEntry | null>(null);
  const [referralFor, setReferralFor] = useState<PhysioAssessmentEntry | null>(null);
  const [deleting, setDeleting] = useState<PhysioAssessmentEntry | null>(null);

  // Physio notes are clinical: a reader without physio view access can only
  // ever be looking at their own file, so pin them to it.
  const restrictedToSelf = !access.loading && (!access.canView || selfOnly);
  const effectivePersonId = restrictedToSelf ? myPerson?.id ?? null : personId;

  const query = usePhysioAssessments({
    personId: effectivePersonId,
    practitionerId: practitionerFilter === ALL ? null : practitionerFilter,
    assessmentType: typeFilter === ALL ? null : typeFilter,
    from: from || null,
    to: to || null,
    enabled: !access.loading && (!restrictedToSelf || Boolean(effectivePersonId)),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return query.assessments;
    return query.assessments.filter((a) =>
      [a.person_name, a.chief_complaint, a.diagnosis, a.pain_location, a.practitioner_name]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(term)),
    );
  }, [query.assessments, search]);

  const attention = useMemo(
    () => rows.filter((a) => a.hasRedFlags || a.isUnfit),
    [rows],
  );

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openExisting = (assessment: PhysioAssessmentEntry) => {
    setEditing(assessment);
    setDialogOpen(true);
  };

  if (restrictedToSelf && !access.loading && !myPerson) {
    return (
      <div className="space-y-6">
        <HealthPageHeader
          icon={ClipboardList}
          title="Physiotherapy assessments"
          description="Assessments, findings and fitness for duty."
        />
        <NoSubjectRecord />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={ClipboardList}
        title="Physiotherapy assessments"
        description={
          restrictedToSelf
            ? 'Your physiotherapy assessments, read-only.'
            : 'Subjective history, objective findings, fitness for duty and what happens next.'
        }
        actions={
          access.canEdit ? (
            <Button size="sm" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              New assessment
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="flex w-full flex-col gap-3">
            {!restrictedToSelf && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Person</Label>
                  <PersonPicker value={personId} onChange={(id) => setPersonId(id)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All types</SelectItem>
                      {ASSESSMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Practitioner</Label>
                  <Select value={practitionerFilter} onValueChange={setPractitionerFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Anyone</SelectItem>
                      {practitioners
                        .filter((p) => p.discipline === 'physio' || p.discipline === 'medical')
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      value={search}
                      placeholder="Name, complaint, diagnosis"
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
              <div className="space-y-1">
                <Label htmlFor="filter-from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="filter-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filter-to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input id="filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </div>
        }
      />

      <StatGrid>
        <StatTile
          icon={ClipboardList}
          label="Assessments"
          value={query.isLoading ? null : query.summary.total}
          hint={`${query.summary.last30} in the last 30 days`}
        />
        <StatTile
          icon={Flag}
          label="With red flags"
          value={query.isLoading ? null : query.summary.redFlags}
          hint="Need a medical opinion"
          tone={query.summary.redFlags > 0 ? 'critical' : 'good'}
        />
        <StatTile
          icon={AlertTriangle}
          label="Not fit for duty"
          value={query.isLoading ? null : query.summary.unfit}
          hint={`${query.summary.lightDuties} on light duties`}
          tone={query.summary.unfit > 0 ? 'critical' : 'good'}
        />
        <StatTile
          icon={Activity}
          label="Average pain score"
          value={query.isLoading ? null : query.summary.averagePain ?? '—'}
          hint="Out of 10 across these assessments"
          tone={
            query.summary.averagePain !== null && query.summary.averagePain > 6
              ? 'warning'
              : 'default'
          }
        />
      </StatGrid>

      {attention.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {attention.length} assessment{attention.length === 1 ? '' : 's'} need attention
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1">
              {attention.slice(0, 5).map((a) => (
                <li key={a.id} className="text-sm">
                  <button
                    type="button"
                    className="font-medium underline-offset-2 hover:underline"
                    onClick={() => openExisting(a)}
                  >
                    {a.person_name ?? 'Unknown person'}
                  </button>{' '}
                  · {formatDate(a.assessed_on)} ·{' '}
                  {a.isUnfit ? 'not fit for duty' : 'red flags recorded'}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {effectivePersonId ? 'Assessments for this person' : 'All assessments'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading || access.loading ? (
            <HealthLoading rows={4} />
          ) : query.isError ? (
            <HealthError title="Could not load assessments" error={query.error} />
          ) : rows.length === 0 ? (
            <HealthEmpty
              icon={ClipboardList}
              title="No assessments yet"
              description={
                access.canEdit
                  ? 'Record the first assessment for this person: history, findings and whether they are fit to work.'
                  : 'Nothing has been recorded against these filters. Widen the dates or clear the person filter.'
              }
              action={
                access.canEdit ? (
                  <Button size="sm" onClick={openNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    New assessment
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Person</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Complaint</TableHead>
                      <TableHead>Pain</TableHead>
                      <TableHead>Fitness</TableHead>
                      <TableHead>Practitioner</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((a) => (
                      <TableRow
                        key={a.id}
                        className={a.hasRedFlags || a.isUnfit ? 'bg-destructive/5' : undefined}
                      >
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(a.assessed_on)}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground">
                          {a.person_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {assessmentTypeLabel(a.assessment_type)}
                        </TableCell>
                        <TableCell className="max-w-[220px] text-sm">
                          <span className="line-clamp-2">{a.chief_complaint ?? '—'}</span>
                          {a.hasRedFlags && (
                            <div className="mt-1">
                              <RedFlagBadge />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <PainBadge score={a.pain_score} />
                        </TableCell>
                        <TableCell>
                          <FitForDutyBadge value={a.fit_for_duty} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {a.practitioner_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openExisting(a)}>
                              {access.canEdit ? 'Open' : 'View'}
                            </Button>
                            {access.canEdit && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Refer to medical"
                                  onClick={() => setReferralFor(a)}
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  aria-label="Delete assessment"
                                  onClick={() => setDeleting(a)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="space-y-3 md:hidden">
                {rows.map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-lg border bg-card p-3 ${
                      a.hasRedFlags || a.isUnfit ? 'border-destructive/40' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {a.person_name ?? '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(a.assessed_on)} · {assessmentTypeLabel(a.assessment_type)}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openExisting(a)}>
                        {access.canEdit ? 'Open' : 'View'}
                      </Button>
                    </div>
                    {a.chief_complaint && (
                      <p className="mt-2 line-clamp-2 text-sm text-foreground">{a.chief_complaint}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <PainBadge score={a.pain_score} />
                      <FitForDutyBadge value={a.fit_for_duty} />
                      {a.hasRedFlags && <RedFlagBadge />}
                    </div>
                    {access.canEdit && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setReferralFor(a)}
                        >
                          <Stethoscope className="mr-2 h-4 w-4" />
                          Refer to medical
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {!restrictedToSelf && !query.isLoading && rows.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          Showing {rows.length} of {query.assessments.length} assessments for the current filters.
        </p>
      )}

      <PhysioAssessmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        assessment={editing}
        defaultPersonId={effectivePersonId}
        canEdit={access.canEdit}
      />

      {referralFor && (
        <RaiseReferralDialog
          open={Boolean(referralFor)}
          onOpenChange={(next) => !next && setReferralFor(null)}
          defaultPersonId={referralFor.person_id}
          defaultToDiscipline="medical"
          defaultUrgency={referralFor.hasRedFlags || referralFor.isUnfit ? 'urgent' : 'routine'}
          defaultReason={referralReason(referralFor)}
          lockPerson
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete this assessment?"
        description="The assessment and its findings are removed for good. Treatment plans that referenced it keep their own record."
        onConfirm={() => {
          if (deleting) query.remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
};

export default PhysioAssessmentsPage;
