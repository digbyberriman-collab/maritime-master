import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRightLeft,
  Award,
  CheckCircle2,
  FileSignature,
  FileX2,
  History,
  LogIn,
  LogOut,
  Shuffle,
  UserX,
  XOctagon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/modules/hris/lib/format';
import type { EmploymentEvent, EmploymentEventType } from '@/modules/hris/lib/employmentHistory';

interface TimelineProps {
  events: EmploymentEvent[];
  isLoading?: boolean;
  /** yyyy-MM-dd used to flag planned (future) events. */
  todayIso: string;
}

const META: Record<EmploymentEventType, { icon: LucideIcon; tone: string; label: string }> = {
  joined_vessel: { icon: LogIn, tone: 'bg-green-500/15 text-green-500 ring-green-500/30', label: 'Joined' },
  left_vessel: { icon: LogOut, tone: 'bg-orange-500/15 text-orange-500 ring-orange-500/30', label: 'Signed off' },
  transferred: { icon: ArrowRightLeft, tone: 'bg-sky-500/15 text-sky-500 ring-sky-500/30', label: 'Transfer' },
  contract_started: { icon: FileSignature, tone: 'bg-primary/15 text-primary ring-primary/30', label: 'Contract' },
  contract_ended: { icon: FileX2, tone: 'bg-muted text-muted-foreground ring-border', label: 'Contract end' },
  terminated: { icon: XOctagon, tone: 'bg-destructive/15 text-destructive ring-destructive/30', label: 'Terminated' },
  promoted: { icon: Award, tone: 'bg-amber-500/15 text-amber-500 ring-amber-500/30', label: 'Promotion' },
  rank_changed: { icon: Shuffle, tone: 'bg-violet-500/15 text-violet-500 ring-violet-500/30', label: 'Rank change' },
  probation_ended: { icon: CheckCircle2, tone: 'bg-teal-500/15 text-teal-500 ring-teal-500/30', label: 'Probation' },
  account_deactivated: { icon: UserX, tone: 'bg-destructive/15 text-destructive ring-destructive/30', label: 'Deactivated' },
};

/** Vertical, newest-first timeline of one crew member's employment events. */
export const Timeline: React.FC<TimelineProps> = ({ events, isLoading, todayIso }) => {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          Timeline
          {!isLoading && <span className="text-sm font-normal text-muted-foreground">· {events.length} event{events.length === 1 ? '' : 's'}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No employment events recorded yet.</p>
        ) : (
          <ol className="relative ml-4 border-l border-border pl-6">
            {events.map((event) => {
              const meta = META[event.type];
              const Icon = meta.icon;
              const planned = event.date > todayIso;
              const uniqueDetail = Array.from(new Set([event.rank, event.position].filter((x): x is string => Boolean(x))));
              return (
                <li key={event.id} className="relative pb-6 last:pb-0">
                  <span
                    className={cn(
                      'absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background',
                      meta.tone,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className={cn('text-sm font-medium text-foreground', planned && 'text-muted-foreground')}>{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[event.vesselName && event.type !== 'transferred' ? event.vesselName : null, ...uniqueDetail].filter(Boolean).join(' · ')}
                      </p>
                      {event.reason && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">Reason:</span> {event.reason}
                        </p>
                      )}
                      {event.notes && <p className="mt-1 whitespace-pre-line text-xs italic text-muted-foreground">{event.notes}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                      <time dateTime={event.date} className="text-xs tabular-nums text-muted-foreground">
                        {formatDate(event.date)}
                      </time>
                      <div className="flex gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {meta.label}
                        </Badge>
                        {planned && (
                          <Badge variant="secondary" className="text-[10px]">
                            Planned
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};

export default Timeline;
