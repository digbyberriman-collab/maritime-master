import React, { useMemo } from 'react';
import { Coins } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatMinor } from '@/modules/hris/lib/format';
import { finalAmountMinor } from '@/modules/hris/lib/gratuities';
import type { MyGratuity } from '@/modules/hris/hooks/useGratuities';
import { PayoutStatusBadge } from './GratuityBadges';

interface MyGratuitiesTableProps {
  gratuities: MyGratuity[];
  isLoading: boolean;
}

/** Self-service view: the crew member's own shares, newest period first. */
export const MyGratuitiesTable: React.FC<MyGratuitiesTableProps> = ({ gratuities, isLoading }) => {
  const totals = useMemo(() => {
    const byCurrency: Record<string, { paid: number; pending: number }> = {};
    for (const g of gratuities) {
      if (g.excluded) continue;
      const bucket = (byCurrency[g.currency] ??= { paid: 0, pending: 0 });
      const amount = finalAmountMinor(g);
      if (g.payout_status === 'paid') bucket.paid += amount;
      else if (g.payout_status !== 'cancelled') bucket.pending += amount;
    }
    return byCurrency;
  }, [gratuities]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">My gratuities</CardTitle>
        <CardDescription>Your share of tips and gratuities received on board. Pending shares are paid with the next payroll.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : gratuities.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
            <Coins className="h-8 w-8 opacity-40" />
            <p>No gratuities have been allocated to you yet.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pool</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Days onboard</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Payout</TableHead>
                    <TableHead>Paid on</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gratuities.map((g) => (
                    <TableRow key={g.id} className={g.excluded ? 'opacity-60' : undefined}>
                      <TableCell className="font-medium text-foreground">
                        {g.pool_name}
                        {g.excluded && <span className="ml-2 text-xs text-muted-foreground">Excluded{g.exclusion_reason ? `: ${g.exclusion_reason}` : ''}</span>}
                      </TableCell>
                      <TableCell>{g.vessel_name ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {g.period_start ? `${formatDate(g.period_start)} – ${formatDate(g.period_end)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{g.days_onboard}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-foreground">
                        {formatMinor(finalAmountMinor(g), g.currency)}
                        {g.adjustment_minor !== 0 && !g.excluded && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (incl. {g.adjustment_minor > 0 ? '+' : ''}
                            {formatMinor(g.adjustment_minor, g.currency)})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <PayoutStatusBadge status={g.excluded ? 'cancelled' : g.payout_status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(g.paid_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap gap-6 border-t px-6 py-4 text-sm">
              {Object.entries(totals).map(([ccy, t]) => (
                <div key={ccy} className="flex gap-6">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid ({ccy})</p>
                    <p className="font-medium tabular-nums text-foreground">{formatMinor(t.paid, ccy)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pending ({ccy})</p>
                    <p className="font-medium tabular-nums text-foreground">{formatMinor(t.pending, ccy)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MyGratuitiesTable;
