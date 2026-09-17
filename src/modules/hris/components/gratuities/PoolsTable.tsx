import React from 'react';
import { ChevronRight, Coins } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatMinor, humanise } from '@/modules/hris/lib/format';
import { netAmountMinor, SPLIT_METHOD_LABEL, asSplitMethod } from '@/modules/hris/lib/gratuities';
import type { GratuityPoolListItem } from '@/modules/hris/hooks/useGratuities';
import { PoolStatusBadge } from './GratuityBadges';

interface PoolsTableProps {
  pools: GratuityPoolListItem[];
  isLoading: boolean;
  onSelect: (poolId: string) => void;
  emptyHint?: string;
}

/** Company-wide pool list; a row opens the pool detail (`?pool=<id>`). */
export const PoolsTable: React.FC<PoolsTableProps> = ({ pools, isLoading, onSelect, emptyHint }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base">Gratuity pools</CardTitle>
      <CardDescription>Tips and gratuities received per vessel and period, and how each was split.</CardDescription>
    </CardHeader>
    <CardContent className="p-0">
      {isLoading ? (
        <div className="space-y-2 p-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : pools.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
          <Coins className="h-8 w-8 opacity-40" />
          <p>{emptyHint ?? 'No gratuity pools match these filters.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pool</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Split</TableHead>
                <TableHead className="text-right">Crew</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pools.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => onSelect(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(p.id);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <TableCell className="font-medium text-foreground">
                    <div>{p.name}</div>
                    <div className="text-xs text-muted-foreground">Received {formatDate(p.received_date)}</div>
                  </TableCell>
                  <TableCell>{p.vessel_name ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(p.period_start)} – {formatDate(p.period_end)}
                  </TableCell>
                  <TableCell>{humanise(p.source)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMinor(p.gross_amount_minor, p.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p.deductions_minor ? `− ${formatMinor(p.deductions_minor, p.currency)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-foreground">{formatMinor(netAmountMinor(p), p.currency)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{SPLIT_METHOD_LABEL[asSplitMethod(p.split_method)]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.status === 'draft' && p.participant_count === 0 ? <span className="text-muted-foreground">—</span> : p.participant_count}
                    {p.excluded_count > 0 && <span className="ml-1 text-xs text-muted-foreground">(+{p.excluded_count} excl.)</span>}
                  </TableCell>
                  <TableCell>
                    <PoolStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>
);

export default PoolsTable;
