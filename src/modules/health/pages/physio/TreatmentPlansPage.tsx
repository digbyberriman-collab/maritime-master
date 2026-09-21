import React, { useMemo, useState } from 'react';
import {
  Activity,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Dumbbell,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { PlanStatusBadge, ToneBadge } from '@/modules/health/components/physio/PhysioBadges';
import { PlanSessionsPanel } from '@/modules/health/components/physio/PlanSessionsPanel';
import { TreatmentPlanDialog } from '@/modules/health/components/physio/TreatmentPlanDialog';
import { DischargePlanDialog } from '@/modules/health/components/physio/DischargePlanDialog';
import { SessionDialog } from '@/modules/health/components/physio/SessionDialog';
import { ConfirmDeleteDialog } from '@/modules/health/components/physio/ConfirmDeleteDialog';
import {
  PLAN_STATUSES,
  usePhysioAccess,
  usePhysioSessions,
  usePhysioTreatmentPlans,
  useRehabProtocolTemplates,
  type PhysioSessionEntry,
  type PhysioTreatmentPlanEntry,
} from '@/modules/health/hooks/usePhysio';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { formatDate } from '@/modules/health/lib/format';

const ALL = '__all__';

/**
 * Treatment plans: what each person is working through, the sessions behind
 * it, how the pain has moved and whether the review has come round.
 */
const TreatmentPlansPage: React.FC = () => {
  const access = usePhysioAccess();
  const { personId, setPersonId, myPerson, selfOnly } = useSelectedPerson('wellness');
  const { byId: protocolsById } = useRehabProtocolTemplates();

  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PhysioTreatmentPlanEntry | null>(null);
  const [dischargePlan, setDischargePlan] = useState<PhysioTreatmentPlanEntry | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<PhysioTreatmentPlanEntry | null>(null);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [sessionForPlan, setSessionForPlan] = useState<PhysioTreatmentPlanEntry | null>(null);
  const [openSession, setOpenSession] = useState<PhysioSessionEntry | null>(null);

  // A crew member without physio access can only ever read their own plans.
  const restrictedToSelf = !access.loading && (!access.canView || selfOnly);
  const effectivePersonId = restrictedToSelf ? myPerson?.id ?? null : personId;
  const enabled = !access.loading && (!restrictedToSelf || Boolean(effectivePersonId));

  const plansQuery = usePhysioTreatmentPlans({
    personId: effectivePersonId,
    status: statusFilter === ALL ? null : statusFilter,
    enabled,
  });

  const sessionsQuery = usePhysioSessions({ personId: effectivePersonId, enabled });

  const sessionsByPlan = useMemo(() => {
    const map = new Map<string, PhysioSessionEntry[]>();
    for (const session of sessionsQuery.sessions) {
      if (!session.plan_id) continue;
      map.set(session.plan_id, [...(map.get(session.plan_id) ?? []), session]);
    }
    return map;
  }, [sessionsQuery.sessions]);

  const startNewPlan = () => {
    setEditingPlan(null);
    setPlanDialogOpen(true);
  };

  if (restrictedToSelf && !access.loading && !myPerson) {
    return (
      <div className="space-y-6">
        <HealthPageHeader
          icon={ClipboardCheck}
          title="Treatment plans"
          description="Goals, frequency, linked protocols and progress."
        />
        <NoSubjectRecord />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={ClipboardCheck}
        title="Treatment plans"
        description={
          restrictedToSelf
            ? 'Your physiotherapy plans and the sessions behind them, read-only.'
            : 'What each person is being treated for, how often, and when it is reviewed.'
        }
        actions={
          access.canEdit ? (
            <Button size="sm" onClick={startNewPlan}>
              <Plus className="mr-2 h-4 w-4" />
              New plan
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-2xl">
            {!restrictedToSelf && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Person</Label>
                <PersonPicker value={personId} onChange={(id) => setPersonId(id)} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {PLAN_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />

      <StatGrid>
        <StatTile
          icon={ClipboardCheck}
          label="Plans"
          value={plansQuery.isLoading ? null : plansQuery.summary.total}
        />
        <StatTile
          icon={Activity}
          label="Active"
          value={plansQuery.isLoading ? null : plansQuery.summary.active}
          hint={`${plansQuery.summary.onHold} on hold`}
          tone="good"
        />
        <StatTile
          icon={CalendarClock}
          label="Review overdue"
          value={plansQuery.isLoading ? null : plansQuery.summary.reviewOverdue}
          hint="Past the review date and still active"
          tone={plansQuery.summary.reviewOverdue > 0 ? 'warning' : 'good'}
        />
        <StatTile
          icon={Target}
          label="Completed or discharged"
          value={plansQuery.isLoading ? null : plansQuery.summary.discharged}
        />
      </StatGrid>

      {plansQuery.isLoading || access.loading ? (
        <HealthLoading rows={3} />
      ) : plansQuery.isError ? (
        <HealthError title="Could not load treatment plans" error={plansQuery.error} />
      ) : plansQuery.plans.length === 0 ? (
        <HealthEmpty
          icon={ClipboardCheck}
          title="No treatment plans"
          description={
            access.canEdit
              ? 'Create a plan from an assessment so sessions, goals and the review date all hang together.'
              : 'Nothing matches these filters. Try another status, or clear the person filter.'
          }
          action={
            access.canEdit ? (
              <Button size="sm" onClick={startNewPlan}>
                <Plus className="mr-2 h-4 w-4" />
                New plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {plansQuery.plans.map((plan) => {
            const isOpen = expanded === plan.id;
            const planSessions = sessionsByPlan.get(plan.id) ?? [];
            const protocol = plan.protocol_template_id
              ? protocolsById.get(plan.protocol_template_id)
              : null;
            return (
              <Card key={plan.id} className={plan.isOverdueForReview ? 'border-warning/40' : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{plan.title}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[plan.person_name, plan.diagnosis].filter(Boolean).join(' · ') || 'No diagnosis recorded'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <PlanStatusBadge value={plan.status} />
                        {plan.isOverdueForReview && (
                          <ToneBadge tone="warning">Review overdue</ToneBadge>
                        )}
                        {plan.frequency && <ToneBadge tone="default">{plan.frequency}</ToneBadge>}
                        {protocol && (
                          <ToneBadge tone="default">
                            <Dumbbell className="mr-1 h-3 w-3" />
                            {protocol.name}
                          </ToneBadge>
                        )}
                        {plan.protocol_template_id && !protocol && (
                          <ToneBadge tone="default">Protocol linked</ToneBadge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpanded(isOpen ? null : plan.id)}
                      >
                        {isOpen ? (
                          <ChevronUp className="mr-2 h-4 w-4" />
                        ) : (
                          <ChevronDown className="mr-2 h-4 w-4" />
                        )}
                        {planSessions.length} session{planSessions.length === 1 ? '' : 's'}
                      </Button>
                      {access.canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            aria-label="Edit plan"
                            onClick={() => {
                              setEditingPlan(plan);
                              setPlanDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {plan.status !== 'discharged' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDischargePlan(plan)}
                            >
                              Discharge
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive"
                            aria-label="Delete plan"
                            onClick={() => setDeletingPlan(plan)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Started</p>
                      <p className="text-foreground">{formatDate(plan.start_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Review</p>
                      <p className="text-foreground">{formatDate(plan.review_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Ends</p>
                      <p className="text-foreground">{formatDate(plan.end_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Practitioner</p>
                      <p className="text-foreground">{plan.practitioner_name ?? '—'}</p>
                    </div>
                  </div>

                  {plan.goals && (
                    <div>
                      <p className="text-xs text-muted-foreground">Goals</p>
                      <p className="whitespace-pre-line text-sm text-foreground">{plan.goals}</p>
                    </div>
                  )}

                  {plan.discharge_summary && (
                    <div className="rounded-md border border-border bg-muted/40 p-3">
                      <p className="text-xs font-medium text-muted-foreground">Discharge summary</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                        {plan.discharge_summary}
                      </p>
                    </div>
                  )}

                  {isOpen && (
                    <>
                      <Separator />
                      <PlanSessionsPanel
                        plan={plan}
                        sessions={planSessions}
                        isLoading={sessionsQuery.isLoading}
                        canEdit={access.canEdit}
                        onRecordSession={() => {
                          setOpenSession(null);
                          setSessionForPlan(plan);
                          setSessionDialogOpen(true);
                        }}
                        onOpenSession={(session) => {
                          setSessionForPlan(plan);
                          setOpenSession(session);
                          setSessionDialogOpen(true);
                        }}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TreatmentPlanDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        plan={editingPlan}
        defaultPersonId={effectivePersonId}
        canEdit={access.canEdit}
      />

      <DischargePlanDialog
        open={Boolean(dischargePlan)}
        onOpenChange={(next) => !next && setDischargePlan(null)}
        plan={dischargePlan}
        isPending={plansQuery.discharge.isPending}
        onDischarge={async (input) => {
          await plansQuery.discharge.mutateAsync(input);
          setDischargePlan(null);
        }}
      />

      <SessionDialog
        open={sessionDialogOpen}
        onOpenChange={(next) => {
          setSessionDialogOpen(next);
          if (!next) {
            setOpenSession(null);
            setSessionForPlan(null);
          }
        }}
        session={openSession}
        defaultPersonId={sessionForPlan?.person_id ?? effectivePersonId}
        defaultPlanId={sessionForPlan?.id ?? null}
        canEdit={access.canEdit}
      />

      <ConfirmDeleteDialog
        open={Boolean(deletingPlan)}
        onOpenChange={(next) => !next && setDeletingPlan(null)}
        title="Delete this treatment plan?"
        description="The plan is removed. Sessions recorded against it stay in the session log but lose their link to the plan."
        onConfirm={() => {
          if (deletingPlan) plansQuery.remove.mutate(deletingPlan.id);
          setDeletingPlan(null);
        }}
      />
    </div>
  );
};

export default TreatmentPlansPage;
