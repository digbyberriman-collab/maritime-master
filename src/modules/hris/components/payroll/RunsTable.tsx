import React from 'react';
import { ChevronRight, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatMinor } from '@/modules/hris/lib/format';
import type { PayrollRunListItem } from '@/modules/hris/lib/payroll/runHelpers';
import { RunStatusBadge } from './PayrollStatusBadge';

interface RunsTableProps {
  runs: PayrollRunListItem[];
  isLoading: boolean;
  onOpen: (runId: string) => void;
  emptyHint?: string;
}

/** Company-wide list of payroll runs; a row opens the run. */
export const RunsTable: React.FC<RunsTableProps> = ({ runs, isLoading, onOpen, emptyHint }) => (
  <Card className="bg-card">
    <CardContent className="p-0">
      {isLoading ? (
        <div className="space-y-2 p-6">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Receipt className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">No payroll runs</p>
          <p className="text-sm text-muted-foreground">{emptyHint ?? 'Runs matching the current filters will appear here.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Headcount</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)}>
                  <TableCell className="font-mono text-xs font-medium text-foreground">{r.run_number}</TableCell>
                  <TableCell>
                    <div className="text-sm text-foreground">{r.period_label ?? '—'}</div>
                    {r.period_start && (
                      <div className="text-xs text-muted-foreground">
                        {formatDate(r.period_start)} – {formatDate(r.period_end)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.vessel_name ?? <span className="text-muted-foreground">Company-wide</span>}</TableCell>
                  <TableCell><RunStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{r.headcount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMinor(r.total_gross_minor, r.currency)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-foreground">{formatMinor(r.total_net_minor, r.currency)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(r.updated_at)}</TableCell>
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

export default RunsTable;
