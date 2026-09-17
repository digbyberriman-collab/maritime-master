import React from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { expiryLabel, formatDate, humanise, toneClass } from '@/modules/hris/lib/format';
import type { PerformanceDueItem } from '@/modules/hris/hooks/useObjectives';

interface ObjectivesDueTableProps {
  items: PerformanceDueItem[];
  isLoading?: boolean;
  onSelectCrew: (profileId: string) => void;
}

const dueTone = (days: number | null) => (days === null ? 'none' : days < 0 ? 'expired' : days <= 7 ? 'critical' : 'warning');

/** Objectives due within 14 days or overdue, from `hr_performance_due_items`. A row click opens that crew member's PDP. */
export const ObjectivesDueTable: React.FC<ObjectivesDueTableProps> = ({ items, isLoading, onSelectCrew }) => (
  <Card className="bg-card">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <CalendarClock className="h-4 w-4 text-muted-foreground" /> Due soon
      </CardTitle>
      <CardDescription>Open objectives with a target date within 14 days, overdue first.</CardDescription>
    </CardHeader>
    <CardContent className="p-0">
      {isLoading ? (
        <div className="space-y-2 px-6 pb-6">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing is due in the next two weeks.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Crew</TableHead>
                <TableHead>Objective</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={`${item.item_type}-${item.record_id}`}
                  className={cn('cursor-pointer', !item.profile_id && 'cursor-default')}
                  onClick={() => item.profile_id && onSelectCrew(item.profile_id)}
                  tabIndex={item.profile_id ? 0 : -1}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && item.profile_id) {
                      e.preventDefault();
                      onSelectCrew(item.profile_id);
                    }
                  }}
                >
                  <TableCell className="font-medium">{item.crew_name ?? '—'}</TableCell>
                  <TableCell className="max-w-[320px] truncate">{item.label ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{humanise(item.status)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(item.due_date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('whitespace-nowrap', toneClass[dueTone(item.days_remaining)])}>
                      {item.days_remaining !== null && item.days_remaining < 0 ? `${Math.abs(item.days_remaining)}d overdue` : expiryLabel(item.due_date).replace('Expires', 'Due')}
                    </Badge>
                  </TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>
);

export default ObjectivesDueTable;
