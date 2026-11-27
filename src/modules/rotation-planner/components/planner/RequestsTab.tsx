import React, { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Check, Info, Loader2, MoreHorizontal, Plus, Undo2, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/shared/components/data';
import { PageError, PageLoading } from '@/shared/components/states';
import { StatusPill, statusLabel } from '@/shared/components/status';
import { notify, errorMessage } from '@/shared/lib/notify';
import { supabase } from '@/integrations/supabase/client';
import { periodDurationLabel } from '../../lib/duration';
import { leaveTypeByKey, type LeaveType } from '../../lib/leaveTypes';
import {
  PLANNER_NOT_SET_UP_NOTICE,
  PLANNER_REFUSAL_TEXT,
  PlannerRefusalError,
  leaveRequestActions,
  type LeaveDecision,
  type LeaveHodStep,
  type LeaveRequest,
} from '../../lib/periods';
import { plannerKeys } from '../../hooks/plannerKeys';
import { useLeaveRequestMutations, useLeaveRequests, useLeaveSettings } from '../../hooks/useLeaveRequests';
import { LeaveSwatch } from './LeaveLegend';
import { LegacyLeaveRequests } from './legacyBodies';
import { dayLabel } from './plannerModel';
import { NOTE_MAX } from './plannerSchemas';
import type { PlannerAccess, PlannerCrewRow, PlannerCrewState, PlannerVessel } from './usePlannerContext';

const AddLeaveDialog = React.lazy(() => import('./AddLeaveDialog'));

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const NOUN = { one: 'request', other: 'requests' };
const SHOWN_STATUSES = ['pending', 'approved', 'declined', 'cancelled'] as const;

const FILTERS: DataTableFilter<LeaveRequest>[] = SHOWN_STATUSES.map((status) => ({
  id: status,
  label: statusLabel('leave_request', status),
  predicate: (r: LeaveRequest) => r.status === status,
}));

const DECISION_LABEL: Readonly<Record<LeaveDecision, string>> = {
  hod_review: 'Mark reviewed',
  approve: 'Approve',
  decline: 'Decline',
  cancel: 'Cancel',
};

/** The names of requesters who are not on today's list (former crew), read once for the page. */
function useRequesterNames(vessel: PlannerVessel, userIds: readonly string[]) {
  const ids = [...new Set(userIds)].sort();
  return useQuery({
    queryKey: [...plannerKeys.vessel(vessel.companyId, vessel.id), 'requester-names', ids.join(',')] as const,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from('profiles').select('user_id, first_name, last_name, preferred_name').in('user_id', ids);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const p of data ?? []) {
        if (!p.user_id) continue;
        const first = (p.preferred_name ?? '').trim() || (p.first_name ?? '').trim();
        map.set(p.user_id, [first, (p.last_name ?? '').trim()].filter(Boolean).join(' ') || 'Unnamed crew');
      }
      return map;
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
}

export interface RequestsTabProps {
  vessel: PlannerVessel;
  access: PlannerAccess;
  crew: PlannerCrewState;
  types: readonly LeaveType[];
  today: string;
  viewerProfileId: string | null;
  viewerUserId: string | null;
  /** The viewer reaches the whole fleet (decides before a required HoD review, as the Master does). */
  fleetReach: boolean;
}

type Decide = { request: LeaveRequest; decision: LeaveDecision; needsReason: boolean; name: string } | null;

/**
 * Leave requests (gap/04 C52, C50, W7; X1-09B): Awaiting decision,
 * Approved, Declined and Cancelled, each request with its periods. The
 * decisions a viewer may take come from the same rule the server applies
 * (lib/periods leaveRequestActions, the mirror of
 * planner_leave_decide_check): the head of the requester's department
 * reviews first when the vessel asks for it, a leave approver approves or
 * declines (a reason), the requester cancels while pending, an approver
 * cancels approved leave (its periods are removed and their day codes
 * reversed). Nobody decides their own request. Request leave (the
 * viewer's own) and Add leave sit in the header.
 *
 * D-01: while the request tables or RPCs are missing the legacy requests
 * page shows under a notice. Any other error: PageError with Retry.
 */
export const RequestsTab: React.FC<RequestsTabProps> = ({ vessel, access, crew, types, today, viewerProfileId, viewerUserId, fleetReach }) => {
  const requests = useLeaveRequests(vessel);
  const settings = useLeaveSettings(vessel);
  const [status, setStatus] = React.useState<string | null>('pending');
  const [search, setSearch] = React.useState('');
  const [decide, setDecide] = React.useState<Decide>(null);
  const [addLeave, setAddLeave] = React.useState<'add' | 'own' | null>(null);

  const members: readonly PlannerCrewRow[] = crew.status === 'ready' ? crew.members : [];
  const byUser = new Map(members.filter((m) => m.userId).map((m) => [m.userId as string, m]));
  const byProfile = new Map(members.map((m) => [m.profileId, m]));
  const list = requests.status === 'ready' ? requests.requests : [];
  const unknownUsers = list.filter((r) => !byUser.has(r.crewUserId)).map((r) => r.crewUserId);
  const names = useRequesterNames(vessel, unknownUsers);

  if (requests.status === 'not_set_up') {
    return (
      <div className="space-y-3" data-planner-fallback="requests">
        <Alert variant="info">
          <Info aria-hidden="true" className="size-4" />
          <AlertDescription>{PLANNER_NOT_SET_UP_NOTICE}</AlertDescription>
        </Alert>
        <Suspense fallback={<PageLoading variant="list" rows={5} label="Loading the leave requests" />}>
          <LegacyLeaveRequests embedded />
        </Suspense>
      </div>
    );
  }
  if (requests.status === 'error') {
    return <PageError error={requests.error} onRetry={requests.retry} title="The leave requests could not load" treatMissingAsOff={false} headingLevel={2} />;
  }

  const hodStep: LeaveHodStep = settings.status === 'ready' ? settings.hodStep : 'nudge';
  const viewer = viewerUserId ? byUser.get(viewerUserId) ?? null : null;
  const nameOf = (r: LeaveRequest): string =>
    byUser.get(r.crewUserId)?.name ?? (r.profileId ? byProfile.get(r.profileId)?.name : undefined) ?? names.data?.get(r.crewUserId) ?? 'Former crew member';
  const subjectOf = (r: LeaveRequest): PlannerCrewRow | null => byUser.get(r.crewUserId) ?? (r.profileId ? byProfile.get(r.profileId) ?? null : null);
  const actionsFor = (r: LeaveRequest) => {
    const subject = subjectOf(r);
    const isHod = Boolean(viewer && subject && viewer.rankTier === 'hod' && viewer.departmentKey && viewer.departmentKey === subject.departmentKey && viewer.profileId !== subject.profileId);
    return leaveRequestActions({
      status: r.status,
      isOwner: r.crewUserId === viewerUserId,
      isApprover: access.canApproveLeave,
      isHod,
      isMasterOrFleet: Boolean(viewer?.isMasterOffice) || fleetReach,
      hodStep,
      hodReviewed: r.hodReviewedAt !== null,
    });
  };

  const columns: DataTableColumn<LeaveRequest>[] = [
    {
      id: 'crew',
      header: 'Crew member',
      sticky: true,
      minWidth: 170,
      value: (r) => nameOf(r),
      cell: (r) => {
        const s = subjectOf(r);
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{nameOf(r)}</span>
            {s?.positionLabel ? <span className="truncate type-caption text-muted-foreground">{s.positionLabel}</span> : null}
          </div>
        );
      },
    },
    {
      id: 'periods',
      header: 'Periods',
      minWidth: 240,
      sortable: false,
      cell: (r) => (
        <ul className="space-y-1">
          {r.periods.map((p) => {
            const t = leaveTypeByKey(p.leaveTypeKey, types);
            return (
              <li key={p.id} className="flex min-w-0 items-start gap-1.5">
                {t ? <LeaveSwatch type={t} className="mt-1" /> : null}
                <span className="min-w-0">
                  {t?.label ?? p.leaveTypeKey} · {dayLabel(p.start)}
                  {p.endUnknown || p.end === null ? ', end unknown' : ` to ${dayLabel(p.end)}`}
                  <span className="text-muted-foreground"> · {periodDurationLabel({ start: p.start, end: p.end, endUnknown: p.endUnknown })}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      id: 'submitted',
      header: 'Submitted',
      kind: 'date',
      sortDescFirst: true,
      value: (r) => r.submittedAt.slice(0, 10),
      cell: (r) => dayLabel(r.submittedAt.slice(0, 10)),
    },
    {
      id: 'status',
      header: 'Status',
      minWidth: 170,
      sortable: false,
      cell: (r) => (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <StatusPill domain="leave_request" status={r.status} />
          {r.status === 'pending' && hodStep !== 'off' ? (
            <span className="type-caption text-muted-foreground">
              {r.hodReviewedAt ? `Reviewed by the head of department ${dayLabel(r.hodReviewedAt.slice(0, 10))}` : hodStep === 'required' ? 'Waiting for the head of department' : 'Head of department may review'}
            </span>
          ) : null}
          {r.reviewedAt && r.status !== 'pending' ? <span className="type-caption text-muted-foreground">Decided {dayLabel(r.reviewedAt.slice(0, 10))}</span> : null}
        </div>
      ),
    },
    {
      id: 'note',
      header: 'Note or reason',
      minWidth: 180,
      sortable: false,
      emptyReason: 'No note',
      cell: (r) => {
        const text = r.cancellationReason ?? r.notes;
        return text ? <span className="line-clamp-2 break-words">{text}</span> : null;
      },
    },
  ];

  const own = viewer && viewer.userId && viewer.placementKind === 'assignment';
  return (
    <div className="min-w-0 space-y-3" data-planner-tab="requests" data-hod-step={hodStep}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="type-body-sm text-muted-foreground">
          {hodStep === 'required'
            ? 'On this vessel the head of department reviews a request before it is approved.'
            : hodStep === 'nudge'
              ? 'The head of department may review a request before it is decided.'
              : 'Leave approvers decide requests directly.'}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {own ? (
            <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => setAddLeave('own')}>
              <CalendarCheck aria-hidden="true" />
              Request leave
            </Button>
          ) : null}
          {access.canEdit || access.canApproveLeave ? (
            <Button type="button" size="sm" className={COARSE} onClick={() => setAddLeave('add')}>
              <Plus aria-hidden="true" />
              Add leave
            </Button>
          ) : null}
        </div>
      </div>

      <DataTable<LeaveRequest>
        label="Leave requests"
        noun={NOUN}
        data={list}
        columns={columns}
        getRowId={(r) => r.id}
        rowLabel={(r) => `${nameOf(r)}, ${dayLabel(r.start)}`}
        isLoading={requests.status !== 'ready'}
        empty={{ title: 'No leave requests', body: status === 'pending' ? 'Nothing is waiting for a decision.' : 'No requests with this status.', icon: CalendarCheck }}
        searchPlaceholder="Search crew"
        searchText={(r) => nameOf(r)}
        search={search}
        onSearchChange={setSearch}
        filters={FILTERS}
        allLabel="All"
        activeFilter={status}
        onActiveFilterChange={setStatus}
        defaultSort={{ columnId: 'submitted', direction: 'desc' }}
        rowActions={(r) => {
          const actions = actionsFor(r);
          if (actions.length === 0) return null;
          // Approve and Decline stay in the row; with a third action, Cancel moves to the row's menu.
          const inline = actions.length > 2 ? actions.filter((a) => a.decision !== 'cancel') : actions;
          const more = actions.filter((a) => !inline.includes(a));
          const open = (a: (typeof actions)[number]) => setDecide({ request: r, decision: a.decision, needsReason: a.needsReason, name: nameOf(r) });
          return (
            <div className="flex items-center justify-end gap-1">
              {inline.map((a) => (
                <Button
                  key={a.decision}
                  type="button"
                  size="sm"
                  variant={a.decision === 'approve' ? 'default' : 'outline'}
                  className={COARSE}
                  aria-label={`${DECISION_LABEL[a.decision]}: ${nameOf(r)}`}
                  onClick={() => open(a)}
                >
                  {a.decision === 'approve' ? <Check aria-hidden="true" /> : a.decision === 'decline' ? <X aria-hidden="true" /> : a.decision === 'cancel' ? <Undo2 aria-hidden="true" /> : null}
                  {DECISION_LABEL[a.decision]}
                </Button>
              ))}
              {more.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="icon" variant="ghost" className={`size-9 ${COARSE} [@media(pointer:coarse)]:w-11`} aria-label={`More actions: ${nameOf(r)}`}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {more.map((a) => (
                      <DropdownMenuItem key={a.decision} onSelect={() => open(a)}>
                        <Undo2 aria-hidden="true" />
                        {DECISION_LABEL[a.decision]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        }}
      />

      {decide ? <DecideDialog key={`${decide.request.id}:${decide.decision}`} vessel={vessel} decide={decide} onClose={() => setDecide(null)} /> : null}

      {addLeave ? (
        <Suspense fallback={null}>
          <AddLeaveDialog
            open
            onOpenChange={(open) => !open && setAddLeave(null)}
            vessel={vessel}
            mode={addLeave}
            people={members.map((m) => ({ profileId: m.profileId, name: m.name, positionLabel: m.positionLabel, hasLogin: Boolean(m.userId) }))}
            viewerProfileId={viewerProfileId}
            canApproveLeave={access.canApproveLeave}
            types={types}
            today={today}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- the decision

const decideSchema = (needsReason: boolean) =>
  z.object({
    reason: needsReason
      ? z.string().trim().min(1, PLANNER_REFUSAL_TEXT.reason_required).max(NOTE_MAX, PLANNER_REFUSAL_TEXT.reason_too_long)
      : z.string().trim().max(NOTE_MAX, PLANNER_REFUSAL_TEXT.reason_too_long),
    replace: z.boolean(),
  });
type DecideValues = z.infer<ReturnType<typeof decideSchema>>;

const DECISION_TEXT: Readonly<Record<LeaveDecision, { title: string; body: string; done: string }>> = {
  hod_review: { title: 'Mark as reviewed', body: 'You have reviewed this request as head of department. A leave approver decides it.', done: 'Marked as reviewed' },
  approve: { title: 'Approve leave', body: 'Each period goes on the planner as an approved bar.', done: 'Leave approved' },
  decline: { title: 'Decline leave', body: 'The crew member sees the reason.', done: 'Leave declined' },
  cancel: { title: 'Cancel leave', body: 'Approved periods are removed from the planner and their days restored.', done: 'Leave cancelled' },
};

const DecideDialog: React.FC<{ vessel: PlannerVessel; decide: NonNullable<Decide>; onClose: () => void }> = ({ vessel, decide, onClose }) => {
  const mutations = useLeaveRequestMutations(vessel);
  const form = useForm<DecideValues>({ resolver: zodResolver(decideSchema(decide.needsReason)), defaultValues: { reason: '', replace: false } });
  const [refusal, setRefusal] = React.useState<{ text: string; overlap: boolean } | null>(null);
  const text = DECISION_TEXT[decide.decision];
  const submit = form.handleSubmit(async (v) => {
    setRefusal(null);
    try {
      await mutations.decide.mutateAsync({ requestId: decide.request.id, decision: decide.decision, reason: v.reason || null, replace: v.replace });
      notify.success(`${text.done}: ${decide.name}`);
      onClose();
    } catch (error) {
      if (error instanceof PlannerRefusalError) {
        if (error.refusal === 'reason_required') form.setError('reason', { type: 'server', message: error.message });
        else setRefusal({ text: error.message, overlap: error.refusal === 'period_overlap' });
        return;
      }
      setRefusal({ text: errorMessage(error, 'The decision was not saved.'), overlap: false });
    }
  });
  const busy = form.formState.isSubmitting;
  const replace = form.watch('replace');
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-leave-decide={decide.decision}>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>
            {decide.name} · {dayLabel(decide.request.start)} to {dayLabel(decide.request.end)}. {text.body}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {decide.decision !== 'hod_review' ? (
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{decide.needsReason ? 'Reason' : 'Reason (optional)'}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {decide.decision === 'approve' && (refusal?.overlap || replace) ? (
              <FormField
                control={form.control}
                name="replace"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="font-normal">Replace rotation leave</FormLabel>
                      <FormDescription>Overlapping rotation leave is shortened, split or removed. Other leave is never changed.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            ) : null}
            {refusal ? (
              <Alert variant="destructive">
                <AlertDescription>{refusal.text}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className={COARSE} disabled={busy} onClick={onClose}>
                Back
              </Button>
              <Button type="submit" variant={decide.decision === 'decline' || decide.decision === 'cancel' ? 'destructive' : 'default'} className={COARSE} disabled={busy}>
                {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {DECISION_LABEL[decide.decision]}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default RequestsTab;
