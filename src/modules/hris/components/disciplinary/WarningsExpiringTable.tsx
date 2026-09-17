import React from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { expiryLabel, expiryTone, formatDate, humanise, toneClass } from '@/modules/hris/lib/format';
import type { PerformanceDueItem } from '@/modules/hris/hooks/useObjectives';
import { StageBadge } from './DisciplinaryBadges';

interface WarningsExpiringTableProps {
  items: PerformanceDueItem[];
  isLoading?: boolean;
  vesselName: (id: string | null | undefined) => string | null;
  onSelectCrew: (profileId: string) => void;
}

/** Warnings lapsing within 30 days (from `hr_performance_due_items`); a row click opens that crew member's file. */
export const WarningsExpiringTable: React.FC<WarningsExpiringTableProps> = ({ items, isLoading, vesselName, onSelectCrew }) => (
  <Card className="bg-card">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <CalendarClock className="h-4 w-4 text-muted-foreground" /> Warnings lapsing soon
      </CardTitle>
      <CardDescription>Live warnings whose expiry date falls within 30 days. Lapsed warnings no longer count towards escalation.</CardDescription>
    </CardHeader>
    <CardContent className="p-0">
      {isLoading ? (
        <div className="space-y-2 px-6 pb-6">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">No warnings lapse in the next 30 days.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Crew</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Warning</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
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
                  <TableCell className="whitespace-nowrap text-muted-foreground">{vesselName(item.vessel_id) ?? '—'}</TableCell>
                  <TableCell><StageBadge stage={item.label} /></TableCell>
                  <TableCell className="text-muted-foreground">{humanise(item.status)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(item.due_date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('whitespace-nowrap', toneClass[expiryTone(item.due_date)])}>{expiryLabel(item.due_date)}</Badge>
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

export default WarningsExpiringTable;
