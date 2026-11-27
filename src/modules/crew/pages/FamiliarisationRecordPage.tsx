import React, { Suspense } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { notify } from '@/shared/lib/notify';
import { useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_CAPS, CREW_PATHS } from '@/modules/crew/paths';
import {
  familiarisationRefusalMessage,
  personName,
  useDeleteFamiliarisation,
  useFamiliarisationRecord,
  useTickFamiliarisationItem,
  type FamiliarisationItem,
  type FamiliarisationRecordDetail,
} from '@/modules/crew/hooks/useFamiliarisation';
import { actionHint, progressPercent } from '@/modules/crew/lib/familiarisation';
import { SignatureStrip } from '@/modules/crew/components/familiarisation/SignatureStrip';
import { dueText, formatDateOnly, formatStamp, localToday } from '@/modules/crew/components/familiarisation/format';

const ReopenFamiliarisationDialog = React.lazy(() => import('@/modules/crew/components/familiarisation/ReopenFamiliarisationDialog'));

interface PageVessel {
  id: string;
  companyId: string;
  name: string;
}

/**
 * One familiarisation record (gap/04 C63, W11; X1-10) at
 * crew/familiarisation/:recordId: the person's checklist by section, ticked
 * item by item, its due date (overdue when past it), the sign-off by the
 * crew member and the supervisor, and reopen with a reason.
 *
 * Gate: the route guard checks only the vessel scope; this page asks
 * vessel.crew.familiarisation.view on the route vessel, or, for a crew
 * member's own record, familiarisation.view_own (the server answers
 * "not found" for anyone else's). Each action shows only what the server
 * says the caller may do (the record's `rights`), with the reason when a
 * control is closed.
 */
const FamiliarisationRecordPage: React.FC = () => {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const { recordId = null } = useParams();
  const view = useCapability(CREW_CAPS.famView, { vesselId: vessel?.id ?? null });
  const viewOwn = useCapability(CREW_CAPS.famViewOwn, { vesselId: vessel?.id ?? null });

  if (!vessel) {
    return <PageEmpty title="Choose a vessel" body="A familiarisation belongs to a vessel. Open it from the vessel's Familiarisation page." />;
  }
  if (view.status === 'loading' || viewOwn.status === 'loading') return <PageLoading variant="detail" label="Checking your access" />;
  if (!view.allowed && !viewOwn.allowed) {
    return (
      <AccessDenied
        title="You can't see this familiarisation"
        detail="A familiarisation is seen by the person it is for and by those with familiarisation access on the vessel."
      />
    );
  }
  return (
    <RecordBody
      key={`${vessel.id}:${recordId ?? ''}`}
      vessel={{ id: vessel.id, companyId: vessel.company_id, name: vessel.name }}
      recordId={recordId}
      canSeeList={view.allowed}
    />
  );
};

const RecordBody: React.FC<{ vessel: PageVessel; recordId: string | null; canSeeList: boolean }> = ({ vessel, recordId, canSeeList }) => {
  const scopedPath = useScopedPath();
  const state = useFamiliarisationRecord(vessel, recordId);
  const listHref = scopedPath(CREW_PATHS.familiarisation);
  const back = canSeeList ? (
    <Link to={listHref} className="inline-flex items-center gap-1.5 rounded-sm type-body text-muted-foreground hover:text-foreground focus-ring [@media(pointer:coarse)]:min-h-11">
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Familiarisation
    </Link>
  ) : null;

  if (state.status === 'idle' || state.status === 'loading') return <PageLoading variant="detail" label="Loading the familiarisation" />;
  if (state.status === 'not_set_up') {
    return (
      <div className="min-w-0 space-y-4">
        {back}
        <PageEmpty title="Familiarisation records open here soon" body={state.notice} />
      </div>
    );
  }
  if (state.status === 'not_found') {
    return (
      <div className="min-w-0 space-y-4">
        {back}
        <PageEmpty title="This familiarisation could not be found" body="It may have been deleted, or it is not one you can see." />
      </div>
    );
  }
  if (state.status === 'denied') {
    return <AccessDenied title="You can't see this familiarisation" detail={state.notice ?? undefined} />;
  }
  if (state.status === 'error') {
    return (
      <div className="min-w-0 space-y-4">
        {back}
        <PageError error={state.error} title="The familiarisation could not be loaded" onRetry={state.retry} treatMissingAsOff={false} />
      </div>
    );
  }
  return <RecordView vessel={vessel} record={state.data} back={back} listHref={listHref} />;
};

const RecordView: React.FC<{ vessel: PageVessel; record: FamiliarisationRecordDetail; back: React.ReactNode; listHref: string }> = ({
  vessel,
  record,
  back,
  listHref,
}) => {
  const navigate = useNavigate();
  const [reopening, setReopening] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const remove = useDeleteFamiliarisation(vessel);
  const name = personName(record.person);
  const status = record.overdue ? 'overdue' : record.status;
  const due = dueText(record.dueDate, localToday(), record.status);
  const percent = progressPercent(record.itemsDone, record.itemsTotal);

  const onDelete = async () => {
    try {
      await remove.mutateAsync({ recordId: record.id });
      notify.success(`${name}'s ${record.templateName} is deleted.`);
      navigate(listHref, { replace: true });
    } catch (error) {
      notify.error(error, { title: 'The familiarisation was not deleted', fallback: familiarisationRefusalMessage(error) });
    }
  };

  const actions =
    record.rights.reopen === 'ok' || record.rights.delete === 'ok' ? (
      <div className="flex flex-wrap gap-2">
        {record.rights.reopen === 'ok' ? (
          <Button variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={() => setReopening(true)}>
            <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />
            Reopen
          </Button>
        ) : null}
        {record.rights.delete === 'ok' ? (
          <Button variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
            Delete
          </Button>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="min-w-0 space-y-6" data-familiarisation-record={record.id} data-status={status}>
      {back}
      <PageHeader
        eyebrow={record.templateCode ? `${vessel.name} · ${record.templateCode}` : vessel.name}
        title={`${name} · ${record.templateName}`}
        description={record.templateDescription ?? (record.rights.isOwn ? 'Your familiarisation on this vessel.' : undefined)}
        actions={actions}
      />

      <section aria-label="Progress" className="grid min-w-0 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusPill domain="familiarization" status={status} />
          {due ? <span className={cn('type-body', record.overdue ? 'text-critical' : 'text-muted-foreground')}>{due}</span> : null}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="type-body text-foreground">
              {record.itemsDone} of {record.itemsTotal} {record.itemsTotal === 1 ? 'item' : 'items'} ticked
            </span>
            <span className="type-caption tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <Progress value={percent} className="h-2" aria-label={`${percent}% of the checklist ticked`} />
          <p className="type-caption text-muted-foreground">
            {record.joinDate ? `Joined ${formatDateOnly(record.joinDate)}` : 'Join date not recorded'}
            {record.completedOn ? ` · completed ${formatDateOnly(record.completedOn)}` : ''}
          </p>
        </div>
      </section>

      {record.reopenedAt ? (
        <Alert variant="info" data-reopened="">
          <RotateCcw aria-hidden="true" className="size-4" />
          <AlertDescription>
            Reopened {formatStamp(record.reopenedAt)}
            {record.reopenedByName ? ` by ${record.reopenedByName}` : ''}
            {record.reopenedReason ? `: ${record.reopenedReason}` : '.'}
          </AlertDescription>
        </Alert>
      ) : null}

      <Checklist vessel={vessel} record={record} />

      <section aria-labelledby="fam-signoff-heading" className="min-w-0 space-y-3">
        <h2 id="fam-signoff-heading" className="type-title text-foreground">
          Sign-off
        </h2>
        <SignatureStrip vessel={vessel} record={record} personName={name} />
      </section>

      {reopening ? (
        <Suspense fallback={null}>
          <ReopenFamiliarisationDialog vessel={vessel} recordId={record.id} personName={name} onOpenChange={(open) => !open && setReopening(false)} />
        </Suspense>
      ) : null}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this familiarisation?</AlertDialogTitle>
            <AlertDialogDescription>
              {name}'s {record.templateName} was started but nothing is ticked yet. Deleting it removes the record; it can be started again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="[@media(pointer:coarse)]:h-11">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="[@media(pointer:coarse)]:h-11"
              onClick={(e) => {
                e.preventDefault();
                void onDelete().finally(() => setConfirmDelete(false));
              }}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** The checklist, section by section; each item a checkbox while the caller may tick (rights.tick). */
const Checklist: React.FC<{ vessel: PageVessel; record: FamiliarisationRecordDetail }> = ({ vessel, record }) => {
  const tick = useTickFamiliarisationItem(vessel);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const canTick = record.rights.tick === 'ok';
  const hint = canTick || record.rights.tick === 'not_permitted' ? null : actionHint(record.rights.tick);
  const sections = React.useMemo(() => {
    const groups: { name: string; items: FamiliarisationItem[] }[] = [];
    const byName = new Map<string, { name: string; items: FamiliarisationItem[] }>();
    for (const item of [...record.items].sort((a, b) => a.itemOrder - b.itemOrder)) {
      let g = byName.get(item.sectionName);
      if (!g) {
        g = { name: item.sectionName, items: [] };
        byName.set(item.sectionName, g);
        groups.push(g);
      }
      g.items.push(item);
    }
    return groups;
  }, [record.items]);

  const toggle = async (item: FamiliarisationItem) => {
    setPendingId(item.id);
    try {
      await tick.mutateAsync({ recordId: record.id, itemId: item.id, done: !item.completed });
    } catch (error) {
      notify.error(error, { title: 'The item was not changed', fallback: familiarisationRefusalMessage(error) });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section aria-labelledby="fam-checklist-heading" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fam-checklist-heading" className="type-title text-foreground">
          Checklist
        </h2>
        {hint ? (
          <p className="type-caption text-muted-foreground" data-tick-hint={record.rights.tick}>
            {hint}
          </p>
        ) : null}
      </div>
      {sections.length === 0 ? (
        <PageEmpty title="This checklist has no items" body="The template had no items when it was started." compact />
      ) : (
        sections.map((section, si) => {
          const done = section.items.filter((i) => i.completed).length;
          const headingId = `fam-section-${si}`;
          return (
            <div key={section.name} className="min-w-0 rounded-md border border-border bg-card" data-section={section.name}>
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <h3 id={headingId} className="flex min-w-0 items-center gap-2 type-subtitle text-foreground">
                  {done === section.items.length ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-success" /> : null}
                  <span className="min-w-0 break-words">{section.name}</span>
                </h3>
                <span className="type-caption shrink-0 tabular-nums text-muted-foreground">
                  {done} of {section.items.length}
                </span>
              </div>
              <ul aria-labelledby={headingId} className="divide-y divide-border">
                {section.items.map((item) => {
                  const inputId = `fam-item-${item.id}`;
                  const busy = pendingId === item.id;
                  return (
                    <li key={item.id} className="flex min-w-0 items-start gap-3 px-4 py-2.5 [@media(pointer:coarse)]:min-h-11" data-item={item.id} data-done={item.completed ? 'yes' : 'no'}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                        {busy ? (
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Checkbox
                            id={inputId}
                            checked={item.completed}
                            disabled={!canTick || pendingId !== null}
                            onCheckedChange={() => void toggle(item)}
                          />
                        )}
                      </span>
                      <label htmlFor={inputId} className={cn('min-w-0 flex-1 py-0.5', canTick && 'cursor-pointer')}>
                        <span className={cn('block break-words type-body', item.completed ? 'text-muted-foreground' : 'text-foreground')}>{item.itemText}</span>
                        {item.completed ? (
                          <span className="block type-caption text-muted-foreground">
                            Ticked{item.completedDate ? ` ${formatDateOnly(item.completedDate)}` : ''}
                            {item.completedByName ? ` by ${item.completedByName}` : ''}
                          </span>
                        ) : null}
                        {item.notes ? <span className="block type-caption text-muted-foreground">{item.notes}</span> : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
};

export default FamiliarisationRecordPage;
