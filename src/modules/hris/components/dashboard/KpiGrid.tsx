import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { AlertOctagon, CalendarClock, ClipboardCheck, FileSignature, FileWarning, Gavel, HeartHandshake, Ship, UserMinus, UserPlus, Users, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { hrisLink, type HrKpis } from '@/modules/hris/hooks/useHrDashboard';

type Tone = 'default' | 'warning' | 'critical' | 'good';

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  hint?: string;
  tone?: Tone;
  to?: string;
}

const toneClass: Record<Tone, string> = {
  default: 'bg-primary/10 text-primary',
  warning: 'bg-yellow-500/10 text-yellow-600',
  critical: 'bg-destructive/10 text-destructive',
  good: 'bg-green-500/10 text-green-600',
};

export const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, label, value, hint, tone = 'default', to }) => {
  const body = (
    <>
      <div className={cn('rounded-md p-2', toneClass[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        {value === null ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>}
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground/80">{hint}</p>}
      </div>
    </>
  );
  const className = 'flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
};

const pick = (n: number | null | undefined, over: number, warnOver = 0): Tone => {
  if (n === null || n === undefined) return 'default';
  if (n > over) return 'critical';
  if (n > warnOver) return 'warning';
  return 'good';
};

interface KpiGridProps {
  kpis: HrKpis | null;
  module: string | null;
  showDisciplinary: boolean;
  showPayroll: boolean;
}

/** Headline HR numbers. Tiles link to the page that owns the underlying records. */
export const KpiGrid: React.FC<KpiGridProps> = ({ kpis, module, showDisciplinary, showPayroll }) => {
  const link = (path: string, extra?: Record<string, string>) => hrisLink(path, { module, extra });
  const v = (f: (k: HrKpis) => number | null) => (kpis ? f(kpis) : null);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiTile icon={Users} label="Headcount" value={v((k) => k.headcount)} hint="Active crew profiles" to={link(HRIS_PATHS.personalDetails)} />
      <KpiTile icon={Ship} label="Onboard now" value={v((k) => k.onboardNow)} hint="Current vessel assignments" to={link(HRIS_PATHS.employmentHistory)} />
      <KpiTile icon={UserPlus} label="Joiners (30d)" value={v((k) => k.joiners30d)} tone="good" to={link(HRIS_PATHS.employmentHistory)} />
      <KpiTile icon={UserMinus} label="Leavers (30d)" value={v((k) => k.leavers30d)} tone={kpis && kpis.leavers30d > 0 ? 'warning' : 'default'} to={link(HRIS_PATHS.employmentHistory)} />
      <KpiTile
        icon={FileSignature}
        label="Contracts expiring ≤90d"
        value={v((k) => k.contractsExpiring90d)}
        tone={pick(kpis?.contractsExpiring90d, 5)}
        to={link(HRIS_PATHS.contracts)}
      />
      <KpiTile
        icon={FileWarning}
        label="Documents expiring ≤90d"
        value={v((k) => k.documentsExpiring90d)}
        hint="Passport, visa, medical, certificates"
        tone={pick(kpis?.documentsExpiring90d, 10)}
        to={link(HRIS_PATHS.documents)}
      />
      <KpiTile
        icon={ClipboardCheck}
        label="Reviews due ≤14d"
        value={v((k) => k.reviewsDue14d)}
        hint={kpis ? `${kpis.reviewsOverdue} overdue` : undefined}
        tone={kpis && kpis.reviewsOverdue > 0 ? 'critical' : pick(kpis?.reviewsDue14d, 5)}
        to={link(HRIS_PATHS.annualEvaluations)}
      />
      {showDisciplinary && (
        <KpiTile icon={Gavel} label="Open disciplinary cases" value={v((k) => k.openDisciplinary)} tone={pick(kpis?.openDisciplinary, 2)} to={link(HRIS_PATHS.disciplinary)} />
      )}
      <KpiTile icon={AlertOctagon} label="Crew missing contract" value={v((k) => k.missingContract)} tone={pick(kpis?.missingContract, 0)} to={link(HRIS_PATHS.contracts)} />
      <KpiTile icon={HeartHandshake} label="Crew missing next of kin" value={v((k) => k.missingNextOfKin)} tone={pick(kpis?.missingNextOfKin, 0)} to={link(HRIS_PATHS.nextOfKin)} />
      {showPayroll && (
        <KpiTile icon={Wallet} label="Payroll runs awaiting approval" value={v((k) => k.payrollAwaitingApproval)} tone={pick(kpis?.payrollAwaitingApproval, 0)} to={link(HRIS_PATHS.payroll)} />
      )}
      {!showDisciplinary && !showPayroll && <KpiTile icon={CalendarClock} label="Overdue reviews" value={v((k) => k.reviewsOverdue)} tone={pick(kpis?.reviewsOverdue, 0)} to={link(HRIS_PATHS.annualEvaluations)} />}
    </div>
  );
};

export default KpiGrid;
