import React from 'react';
import { CalendarPlus, Lock, LockOpen, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';
import type { PayPeriodFilters } from '@/modules/hris/hooks/useCompensationSettings';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import { asPeriodStatus, periodTransitions, PERIOD_STATUS_BADGE_CLASS, type PayPeriodRow } from '@/modules/hris/lib/compensation';

interface PayPeriodsTableProps {
  periods: PayPeriodRow[];
  isLoading?: boolean;
  canEdit: boolean;
  busy?: boolean;
  vessels: CompanyVessel[];
  vesselName: (id: string | null) => string | null;
  filters: PayPeriodFilters;
  onFiltersChange: (filters: PayPeriodFilters) => void;
  onGenerate: () => void;
  onLock: (period: PayPeriodRow) => void;
  onUnlock: (period: PayPeriodRow) => void;
  onClose: (period: PayPeriodRow) => void;
}

const YEARS = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + 1 - i);

export const PayPeriodsTable: React.FC<PayPeriodsTableProps> = ({
  periods,
  isLoading,
  canEdit,
  busy,
  vessels,
  vesselName,
  filters,
  onFiltersChange,
  onGenerate,
  onLock,
  onUnlock,
  onClose,
}) => (
  <Card className="bg-card">
    <CardHeader className="pb-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Pay periods</CardTitle>
          <CardDescription>Lock a period once timesheets are final; close it after payroll is paid. Closed periods cannot be reopened here.</CardDescription>
        </div>
        {canEdit && (
          <Button onClick={onGenerate} disabled={busy}>
            <CalendarPlus className="mr-2 h-4 w-4" /> Generate periods
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center">
        <Select value={filters.vesselId} onValueChange={(v) => onFiltersChange({ ...filters, vesselId: v })}>
          <SelectTrigger className="md:w-48"><SelectValue placeholder="Scope" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="company">Company-wide</SelectItem>
            {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.year === null ? 'any' : String(filters.year)} onValueChange={(v) => onFiltersChange({ ...filters, year: v === 'any' ? null : Number(v) })}>
          <SelectTrigger className="md:w-36"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any year</SelectItem>
            {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      {isLoading ? (
        <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
      ) : periods.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">No pay periods for this scope and year{canEdit ? ' — generate them to start running payroll.' : '.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Locked</TableHead>
                <TableHead>Closed</TableHead>
                {canEdit && <TableHead className="w-[1%]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => {
                const status = asPeriodStatus(p.status);
                const t = periodTransitions(status);
                return (
                  <TableRow key={p.id} className={cn(status === 'closed' && 'text-muted-foreground')}>
                    <TableCell className="whitespace-nowrap font-medium">{p.label}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.vessel_id ? vesselName(p.vessel_id) ?? 'Vessel' : 'Company-wide'}</TableCell>
                    <TableCell className="whitespace-nowrap">{humanise(p.period_type)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(p.start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(p.end_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('font-medium', PERIOD_STATUS_BADGE_CLASS[status])}>{humanise(status)}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{p.locked_at ? formatDate(p.locked_at) : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{p.closed_at ? formatDate(p.closed_at) : '—'}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {t.canLock && (
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onLock(p)} disabled={busy}>
                              <Lock className="mr-1 h-3.5 w-3.5" /> Lock
                            </Button>
                          )}
                          {t.canUnlock && (
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onUnlock(p)} disabled={busy}>
                              <LockOpen className="mr-1 h-3.5 w-3.5" /> Unlock
                            </Button>
                          )}
                          {t.canClose && (
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onClose(p)} disabled={busy}>
                              <CheckSquare className="mr-1 h-3.5 w-3.5" /> Close
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
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

export default PayPeriodsTable;
