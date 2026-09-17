import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, GraduationCap, LayoutGrid, List, Target, UserRound, Weight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDate } from '@/modules/hris/lib/format';
import { CATEGORY_CLASS, CATEGORY_LABEL, groupByCategory, isObjectiveCategory, sortObjectives } from '@/modules/hris/lib/objectives';
import type { Objective } from '@/modules/hris/hooks/useObjectives';
import { ObjectiveStatusBadge } from './ObjectiveStatusBadge';

interface ObjectivesBoardProps {
  objectives: Objective[];
  isLoading?: boolean;
  /** Show the subject's name on each card (for "My objectives" mentoring lists). */
  showCrew?: boolean;
  onOpen: (objective: Objective) => void;
  onCreate?: () => void;
  emptyMessage?: string;
}

type View = 'board' | 'table';

const ObjectiveCard: React.FC<{ objective: Objective; showCrew?: boolean; onOpen: () => void }> = ({ objective: o, showCrew, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className={cn(
      'flex w-full flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      o.status === 'cancelled' && 'opacity-60',
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        {showCrew && <p className="truncate text-xs text-muted-foreground">{o.crew_name}</p>}
        <p className="line-clamp-2 font-medium leading-snug text-foreground">{o.title}</p>
      </div>
      <ObjectiveStatusBadge objective={o} />
    </div>
    {o.measure && <p className="line-clamp-2 text-xs text-muted-foreground">{o.measure}</p>}
    <div className="space-y-1">
      <Progress value={o.progress_pct} className="h-2" />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="tabular-nums">{o.progress_pct}%</span>
        <span className="inline-flex items-center gap-1"><Weight className="h-3 w-3" /> weight {o.weight}</span>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {o.target_date ? formatDate(o.target_date) : 'No target date'}</span>
      {o.owner_name && <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" /> {o.owner_name}</span>}
      {o.course_name && <span className="inline-flex items-center gap-1 truncate"><GraduationCap className="h-3 w-3" /> {o.course_name}</span>}
    </div>
  </button>
);

/** A crew member's objectives, either as cards grouped by category or as a flat table. */
export const ObjectivesBoard: React.FC<ObjectivesBoardProps> = ({ objectives, isLoading, showCrew, onOpen, onCreate, emptyMessage }) => {
  const [view, setView] = useState<View>('board');
  const sorted = useMemo(() => sortObjectives(objectives), [objectives]);
  const groups = useMemo(() => groupByCategory(sorted), [sorted]);

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" />
      </div>
    );
  }

  if (objectives.length === 0) {
    return (
      <Card className="border-dashed bg-card">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Target className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">No objectives yet</p>
            <p className="text-sm text-muted-foreground">{emptyMessage ?? 'Add the first objective to start a development plan.'}</p>
          </div>
          {onCreate && <Button onClick={onCreate}>New objective</Button>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {objectives.length} objective{objectives.length === 1 ? '' : 's'}
        </p>
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as View)} size="sm" aria-label="View">
          <ToggleGroupItem value="board" aria-label="Board view"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table view"><List className="h-4 w-4" /></ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === 'board' ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.category} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide', CATEGORY_CLASS[g.category])}>{CATEGORY_LABEL[g.category]}</Badge>
                <span className="text-xs text-muted-foreground">{g.objectives.length}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {g.objectives.map((o) => <ObjectiveCard key={o.id} objective={o} showCrew={showCrew} onOpen={() => onOpen(o)} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card className="bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {showCrew && <TableHead>Crew</TableHead>}
                    <TableHead>Objective</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead className="min-w-[140px]">Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => onOpen(o)}>
                      {showCrew && <TableCell className="font-medium">{o.crew_name}</TableCell>}
                      <TableCell className="max-w-[320px]">
                        <span className="block truncate font-medium">{o.title}</span>
                        {o.measure && <span className="block truncate text-xs text-muted-foreground">{o.measure}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px]', CATEGORY_CLASS[isObjectiveCategory(o.category) ? o.category : 'performance'])}>
                          {isObjectiveCategory(o.category) ? CATEGORY_LABEL[o.category] : o.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{o.owner_name ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(o.target_date)}</TableCell>
                      <TableCell className="tabular-nums">{o.weight}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <Progress value={o.progress_pct} className="h-2 w-20" />
                          <span className="text-xs tabular-nums text-muted-foreground">{o.progress_pct}%</span>
                        </span>
                      </TableCell>
                      <TableCell><ObjectiveStatusBadge objective={o} /></TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ObjectivesBoard;
