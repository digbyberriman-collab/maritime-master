import React from 'react';
import { ArrowRightLeft, LogIn, LogOut, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/modules/hris/lib/format';
import type { MovementRow } from '@/modules/hris/lib/employmentHistory';

interface RecentMovementsTableProps {
  movements: MovementRow[];
  isLoading?: boolean;
  windowDays: number;
  onSelectCrew?: (profileId: string) => void;
}

const KIND: Record<MovementRow['kind'], { icon: LucideIcon; label: string; tone: string }> = {
  join: { icon: LogIn, label: 'Joined', tone: 'text-green-500' },
  leave: { icon: LogOut, label: 'Signed off', tone: 'text-orange-500' },
  transfer: { icon: ArrowRightLeft, label: 'Transferred', tone: 'text-sky-500' },
};

/** Company-wide joins, sign-offs and transfers for the HR landing state. */
export const RecentMovementsTable: React.FC<RecentMovementsTableProps> = ({ movements, isLoading, windowDays, onSelectCrew }) => (
  <Card className="border-border/60">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Users className="h-4 w-4 text-muted-foreground" />
        Recent crew movements
      </CardTitle>
      <CardDescription>Joins, sign-offs and transfers across the company in the last {windowDays} days. Pick a crew member above for their full history.</CardDescription>
    </CardHeader>
    <CardContent className="px-0 pb-0">
      {isLoading ? (
        <div className="space-y-2 px-6 pb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : movements.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">No crew movements in the last {windowDays} days.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>Crew member</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => {
                const meta = KIND[m.kind];
                const Icon = meta.icon;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="tabular-nums">{formatDate(m.date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Icon className={cn('h-3 w-3', meta.tone)} />
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {m.profileId && onSelectCrew ? (
                        <Button variant="link" className="h-auto p-0 font-medium text-foreground" onClick={() => onSelectCrew(m.profileId as string)}>
                          {m.crewName}
                        </Button>
                      ) : (
                        m.crewName
                      )}
                    </TableCell>
                    <TableCell>{m.vesselName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{[m.rank, m.position].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{m.reason ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>
);

export default RecentMovementsTable;
