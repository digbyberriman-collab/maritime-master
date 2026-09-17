import React, { useMemo } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, FileText, Gavel, Link2, Lock, Ship, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import {
  STAGE_LABEL,
  TONE_CLASS,
  countLiveWarnings,
  escalationLadder,
  isLiveWarning,
  lifecycleState,
  sortRecordsNewestFirst,
  stageTone,
} from '@/modules/hris/lib/disciplinary';
import type { DisciplinaryRecord } from '@/modules/hris/hooks/useDisciplinary';
import { AppealBadge, LifecycleBadge, SeverityBadge, StageBadge } from './DisciplinaryBadges';

interface CaseTimelineProps {
  records: DisciplinaryRecord[];
  isLoading?: boolean;
  crewName?: string;
  onOpen: (record: DisciplinaryRecord) => void;
  onCreate?: () => void;
}

const Ladder: React.FC<{ records: DisciplinaryRecord[] }> = ({ records }) => {
  const rungs = useMemo(() => escalationLadder(records), [records]);
  return (
    <TooltipProvider delayDuration={200}>
      <ol className="grid grid-cols-4 gap-2">
        {rungs.map((rung, i) => {
          const tone = rung.live ? stageTone(rung.stage) : 'muted';
          return (
            <li key={rung.stage} className="min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn('flex flex-col gap-1 rounded-md border px-2.5 py-2 text-xs', TONE_CLASS[tone], !rung.live && 'opacity-70')}>
                    <span className="text-[10px] uppercase tracking-wide">Step {i + 1}</span>
                    <span className="truncate font-medium">{STAGE_LABEL[rung.stage]}</span>
                    <span className="truncate text-[11px]">
                      {rung.live ? `Live · ${formatDate(rung.live.incident_date)}` : rung.latest ? `Last ${formatDate(rung.latest.incident_date)}` : 'Not reached'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {rung.live
                    ? `A ${STAGE_LABEL[rung.stage].toLowerCase()} is currently live${rung.live.expiry_date ? ` until ${formatDate(rung.live.expiry_date)}` : ''}.`
                    : rung.latest
                      ? `Previously issued ${formatDate(rung.latest.incident_date)}; no longer counts.`
                      : 'No record at this step.'}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </TooltipProvider>
  );
};

/** A crew member's disciplinary history: escalation ladder plus one card per matter, newest first. */
export const CaseTimeline: React.FC<CaseTimelineProps> = ({ records, isLoading, crewName, onOpen, onCreate }) => {
  const sorted = useMemo(() => sortRecordsNewestFirst(records), [records]);
  const live = useMemo(() => countLiveWarnings(records), [records]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Progressive discipline</CardTitle>
          <CardDescription>
            {live === 0 ? 'No live warnings on file.' : `${live} live warning${live === 1 ? '' : 's'} on file.`} {records.length} record{records.length === 1 ? '' : 's'} in total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Ladder records={records} />
        </CardContent>
      </Card>

      {sorted.length === 0 ? (
        <Card className="border-dashed bg-card">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Gavel className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">No disciplinary matters{crewName ? ` for ${crewName}` : ''}</p>
              <p className="text-sm text-muted-foreground">Nothing on file. Open a case to record an investigation or warning.</p>
            </div>
            {onCreate && <Button onClick={onCreate}>New case</Button>}
          </CardContent>
        </Card>
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-6">
          {sorted.map((r) => {
            const state = lifecycleState(r);
            const liveNow = isLiveWarning(r);
            return (
              <li key={r.id} className="relative">
                <span
                  className={cn(
                    'absolute -left-[31px] top-5 h-2.5 w-2.5 rounded-full border-2 border-background',
                    liveNow ? 'bg-destructive' : state === 'investigating' ? 'bg-primary' : 'bg-muted-foreground/50',
                  )}
                />
                <button
                  type="button"
                  onClick={() => onOpen(r)}
                  className={cn(
                    'flex w-full flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    (state === 'expired' || state === 'overturned') && 'opacity-70',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> {formatDate(r.incident_date)}
                      </span>
                      <span className="text-sm text-muted-foreground">· {humanise(r.category)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <SeverityBadge severity={r.severity} />
                      <StageBadge stage={r.stage} />
                      <LifecycleBadge record={r} />
                      <AppealBadge appeal={r.appeal_status} />
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm text-foreground">{r.description}</p>
                  {r.outcome && <p className="line-clamp-1 text-xs text-muted-foreground"><span className="font-medium">Outcome:</span> {r.outcome}</p>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    {r.vessel_name && <span className="inline-flex items-center gap-1"><Ship className="h-3 w-3" /> {r.vessel_name}</span>}
                    {r.issued_by_name && <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" /> {r.issued_by_name}</span>}
                    {r.incident_number && <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> {r.incident_number}</span>}
                    {r.expiry_date && (
                      <span className={cn('inline-flex items-center gap-1', liveNow && 'text-foreground')}>
                        {liveNow ? 'Live until' : 'Expiry'} {formatDate(r.expiry_date)}
                      </span>
                    )}
                    {r.document_name && <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Document</span>}
                    {(r.investigation_notes || r.witness_statements) && (
                      <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Investigation file</span>
                    )}
                    {r.acknowledged_by_crew_at && (
                      <span className="inline-flex items-center gap-1 text-green-500"><CheckCircle2 className="h-3 w-3" /> Acknowledged</span>
                    )}
                    <ChevronRight className="ml-auto h-4 w-4" />
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default CaseTimeline;
