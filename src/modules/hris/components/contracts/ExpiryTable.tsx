import React from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { expiryLabel, expiryTone, formatDate, humanise, toneClass } from '@/modules/hris/lib/format';
import type { HrExpiryItem } from '@/modules/hris/hooks/useCrewContracts';

interface ExpiryTableProps {
  items: HrExpiryItem[];
  isLoading?: boolean;
  vesselName: (id: string | null | undefined) => string | null;
  onSelectCrew: (profileId: string) => void;
  title?: string;
  description?: string;
}

const TYPE_CLASS: Record<string, string> = {
  contract: 'bg-primary/10 text-primary border-primary/20',
  probation: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  passport: 'bg-muted text-muted-foreground border-border',
  medical: 'bg-muted text-muted-foreground border-border',
  certificate: 'bg-muted text-muted-foreground border-border',
};

/** Upcoming contract / probation dates from `hr_expiry_items`; a row click selects that crew member. */
export const ExpiryTable: React.FC<ExpiryTableProps> = ({
  items,
  isLoading,
  vesselName,
  onSelectCrew,
  title = 'Expiring soon',
  description = 'Contracts and probation periods ending within 90 days, soonest first.',
}) => (
  <Card className="bg-card">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <CalendarClock className="h-4 w-4 text-muted-foreground" /> {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="p-0">
      {isLoading ? (
        <div className="space-y-2 px-6 pb-6">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing is due in this window.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Crew</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const tone = expiryTone(item.due_date);
                const key = `${item.item_type}-${item.record_id}`;
                return (
                  <TableRow
                    key={key}
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
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[10px]', TYPE_CLASS[item.item_type ?? ''] ?? TYPE_CLASS.certificate)}>
                          {humanise(item.item_type)}
                        </Badge>
                        <span className="truncate text-sm">{item.label ? humanise(item.label) : '—'}</span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(item.due_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('whitespace-nowrap', toneClass[tone])}>{expiryLabel(item.due_date)}</Badge>
                    </TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
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

export default ExpiryTable;
