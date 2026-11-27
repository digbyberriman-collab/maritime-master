/**
 * Fleet › Training › Overview (gap/02 TR1 in part; W3 "stale
 * applications"; X5-07B). The fleet's training at a glance:
 *
 * - KPI tiles (the old development admin's, honest): applications, waiting
 *   for approval, waiting more than 7 days, approved and not completed,
 *   completed, active clawbacks, the reimbursements paid (USD, the only
 *   currency claims are kept in) and the expense claims to review. Each
 *   count opens the applications register filtered to it.
 * - The approved and completed estimates per currency (never converted).
 * - "Awaiting approval for more than 7 days": longest first, with the
 *   approver level each one waits for and the days at its stage; each row
 *   opens the application.
 * - By category and by status, as counts with proportional bars.
 *
 * Before 040600 is applied the stage start is not recorded: the waiting
 * time then counts from submission (older rows: the last change) and the
 * list says so. Budget, group-training cohorts and the department
 * breakdown are TR1's later part (X5 wave 2).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, CheckCircle2, ClipboardList, Clock, GraduationCap, Hourglass, Receipt, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KpiGrid, KpiTile } from '@/shared/components/data';
import { EmptyState, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { cn } from '@/lib/utils';
import type { DevCategory } from '../../constants';
import type { FinalApprovalMode } from '../../lib/applicationMachine';
import { DEV_CATEGORIES } from '../../lib/settingsSchema';
import { fleetTrainingPath } from '../../paths';
import {
  APPROVER_PHRASES,
  STATUS_GROUPS,
  STATUS_GROUP_LABELS,
  crewName,
  formatCurrencyTotals,
  plural,
  staleApplications,
  trainingCounts,
  type FleetApplicationRow,
  type RegisterVessel,
  type StatusGroup,
} from './fleetTrainingModel';
import { COARSE, Notice } from './TrainingParts';
import type { ExpenseTotals, ReadState, RegisterData } from './useFleetTrainingData';

export interface TrainingOverviewTabProps {
  register: ReadState<RegisterData>;
  expenses: ReadState<{ totals: ExpenseTotals }>;
  mode: FinalApprovalMode;
  vessels: readonly RegisterVessel[];
  categoryLabels: Readonly<Record<DevCategory, string>>;
  today: string;
  now?: Date;
  onOpen: (row: FleetApplicationRow) => void;
}

const query = (entries: Record<string, string>) => new URLSearchParams(entries);

export function TrainingOverviewTab({ register, expenses, mode, vessels, categoryLabels, today, now, onOpen }: TrainingOverviewTabProps) {
  if (register.status === 'loading') return <PageLoading variant="cards" rows={6} label="Loading the fleet's training" />;
  if (register.status === 'error') {
    return <PageError error={register.error} title="The training applications could not be loaded" onRetry={register.retry} treatMissingAsOff={false} />;
  }

  const counts = trainingCounts(register.rows, today);
  const stale = staleApplications(register.rows, mode, now);
  const committed = formatCurrencyTotals(counts.committed);
  const vesselName = new Map(vessels.map((v) => [v.id, v.name] as const));
  const toRegister = (entries: Record<string, string>) => fleetTrainingPath('applications', query(entries));

  const expenseTile = (label: string, icon: typeof Receipt, value: (t: ExpenseTotals) => number | string, extra?: Partial<React.ComponentProps<typeof KpiTile>>) =>
    expenses.status === 'ready' ? (
      <KpiTile label={label} icon={icon} value={value(expenses.totals)} {...extra} />
    ) : (
      <KpiTile
        label={label}
        icon={icon}
        state={expenses.status === 'error' ? 'error' : 'loading'}
        errorMessage="The expense claims could not be loaded"
        onRetry={expenses.status === 'error' ? expenses.retry : undefined}
      />
    );

  return (
    <div className="space-y-6">
      <section aria-labelledby="training-kpis-heading" className="space-y-3">
        <h2 id="training-kpis-heading" className="sr-only">
          Training at a glance
        </h2>
        <KpiGrid className="min-[1440px]:grid-cols-4">
          {/* Good and programme counts read neutral at zero: an empty programme is not "All clear". */}
          <KpiTile
            label="Applications"
            icon={ClipboardList}
            value={counts.total}
            sub="Submitted, not voided"
            zeroTone="neutral"
            zeroLabel="None submitted yet"
            href={toRegister({})}
          />
          <KpiTile
            label="Awaiting approval"
            icon={Clock}
            value={counts.awaiting}
            tone={counts.awaiting > 0 ? 'signal' : undefined}
            href={toRegister({ status: 'awaiting' })}
          />
          <KpiTile
            label="Waiting more than 7 days"
            icon={AlarmClock}
            value={stale.length}
            tone={stale.length > 0 ? 'danger' : undefined}
            sub="At one approval stage"
          />
          <KpiTile
            label="Approved, not completed"
            icon={GraduationCap}
            value={counts.approved}
            zeroTone="neutral"
            zeroLabel="None waiting to complete"
            href={toRegister({ status: 'approved' })}
          />
          <KpiTile
            label="Completed"
            icon={CheckCircle2}
            value={counts.completed}
            tone={counts.completed > 0 ? 'ok' : undefined}
            zeroTone="neutral"
            zeroLabel="None completed yet"
            href={toRegister({ status: 'completed' })}
          />
          <KpiTile
            label="Clawback active"
            icon={Undo2}
            value={counts.clawbackActive}
            sub="Reimbursed, inside the window"
            zeroTone="neutral"
            zeroLabel="None in a clawback window"
            href={toRegister({ clawback: 'active' })}
          />
          {expenseTile('Reimbursed', Receipt, (t) => `USD ${Math.round(t.reimbursedUsd).toLocaleString('en-GB')}`, { textValue: true, sub: 'Approved and paid expense claims' })}
          {expenseTile('Expense claims to review', Hourglass, (t) => t.pendingClaims)}
        </KpiGrid>
        <p className="type-caption text-muted-foreground" data-testid="training-committed">
          {committed
            ? `Estimated cost of approved and completed applications: ${committed}. Each amount is in the currency it was entered in; currencies are never converted.`
            : 'No approved or completed applications yet, so there is no estimated cost.'}
        </p>
      </section>

      <section aria-labelledby="training-stale-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="training-stale-heading" className="type-h3">
            Awaiting approval for more than 7 days
          </h2>
          {stale.length > 0 ? <span className="type-caption text-muted-foreground">{plural(stale.length, 'application')}, longest first</span> : null}
        </div>
        {!register.stagesSetUp ? (
          <Notice testId="training-stage-not-set-up">
            Stage tracking is not set up yet, so the waiting time counts from when the application was submitted.
          </Notice>
        ) : null}
        {stale.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing has waited more than 7 days"
            body="Every application waiting for approval entered its stage within the last week."
            headingLevel={3}
            bordered
          />
        ) : (
          <Card className="divide-y divide-border">
            <ul aria-labelledby="training-stale-heading">
              {stale.map(({ row, waitingDays, approver }) => (
                <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground" title={row.course_name}>
                      {row.course_name}
                    </p>
                    <p className="type-caption text-muted-foreground">
                      {[crewName(row.crew_member), vesselName.get(row.vessel_id), row.application_number].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusPill tone="signal" label={APPROVER_PHRASES[approver]} icon={null} />
                    <span className="type-caption tabular-nums text-destructive">{plural(waitingDays, 'day')} at this stage</span>
                    <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => onOpen(row)} aria-label={`Open ${row.course_name} for ${crewName(row.crew_member)}`}>
                      Open
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard
          title="By category"
          testId="training-by-category"
          total={counts.total}
          items={DEV_CATEGORIES.map((c) => ({ key: c, label: categoryLabels[c], count: counts.byCategory[c], href: toRegister({ category: c }) }))}
        />
        <BreakdownCard
          title="By status"
          testId="training-by-status"
          total={counts.total}
          items={STATUS_GROUPS.map((g: StatusGroup) => ({ key: g, label: STATUS_GROUP_LABELS[g], count: counts[g], href: toRegister({ status: g }) }))}
        />
      </div>
    </div>
  );
}

interface BreakdownItem {
  key: string;
  label: string;
  count: number;
  href: string;
}

/** Counts with a proportional bar; a count above 0 links to the register filtered to it. */
function BreakdownCard({ title, items, total, testId }: { title: string; items: readonly BreakdownItem[]; total: number; testId: string }) {
  const headingId = `${testId}-heading`;
  return (
    <Card className="space-y-3 p-4" data-testid={testId}>
      <h2 id={headingId} className="type-h3">
        {title}
      </h2>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No applications yet.</p>
      ) : (
        <ul aria-labelledby={headingId} className="space-y-2">
          {items.map((item) => {
            const share = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <li key={item.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  {item.count > 0 ? (
                    <Link to={item.href} className={cn('focus-ring rounded-sm text-foreground underline-offset-4 hover:underline', COARSE, 'inline-flex items-center')}>
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{item.label}</span>
                  )}
                  <span className="tabular-nums text-muted-foreground">{item.count.toLocaleString('en-GB')}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted" aria-hidden="true">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${share}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
