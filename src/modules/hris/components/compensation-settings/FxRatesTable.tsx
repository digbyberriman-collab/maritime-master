import React, { useMemo } from 'react';
import { ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/modules/hris/lib/format';
import { currentFxRates, fxPairKey, type FxRateRow } from '@/modules/hris/lib/compensation';

interface FxRatesTableProps {
  rates: FxRateRow[];
  isLoading?: boolean;
  canEdit: boolean;
  busy?: boolean;
  defaultCurrency: string;
  onAdd: (defaults?: { base_currency: string; quote_currency: string }) => void;
  onDelete: (rate: FxRateRow) => void;
}

const formatRate = (rate: number): string => rate.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 8 });

/** Rate history newest first, with the rate currently in force per pair on top. */
export const FxRatesTable: React.FC<FxRatesTableProps> = ({ rates, isLoading, canEdit, busy, defaultCurrency, onAdd, onDelete }) => {
  const current = useMemo(() => currentFxRates(rates), [rates]);
  const currentIds = useMemo(() => new Set(Array.from(current.values()).map((r) => r.id)), [current]);
  const pairs = useMemo(() => Array.from(current.values()).sort((a, b) => fxPairKey(a.base_currency, a.quote_currency).localeCompare(fxPairKey(b.base_currency, b.quote_currency))), [current]);

  return (
    <div className="space-y-6">
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Rates in force today</CardTitle>
              <CardDescription>Used to convert packages into {defaultCurrency} for payroll cost and multi-currency runs.</CardDescription>
            </div>
            {canEdit && (
              <Button onClick={() => onAdd({ base_currency: 'USD', quote_currency: defaultCurrency })} disabled={busy}>
                <Plus className="mr-2 h-4 w-4" /> Add rate
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : pairs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rates yet. Packages in other currencies are counted 1:1 until a rate is added.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pairs.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {r.base_currency} <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" /> {r.quote_currency}
                  </span>
                  <span className="text-right">
                    <span className="block tabular-nums">{formatRate(r.rate)}</span>
                    <span className="block text-xs text-muted-foreground">since {formatDate(r.valid_from)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rate history</CardTitle>
          <CardDescription>Newest first. The rate with the latest valid-from date on or before payday is used.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : rates.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No FX rates recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pair</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Valid from</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Recorded</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead className="w-[1%]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((r) => {
                    const inForce = currentIds.has(r.id);
                    const future = r.valid_from > new Date().toISOString().slice(0, 10);
                    return (
                      <TableRow key={r.id} className={cn(!inForce && !future && 'text-muted-foreground')}>
                        <TableCell className="whitespace-nowrap font-medium">{r.base_currency} / {r.quote_currency}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatRate(r.rate)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(r.valid_from)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.source ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(r.created_at)}</TableCell>
                        <TableCell>
                          {inForce ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Current</Badge>
                          ) : future ? (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Upcoming</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Superseded</Badge>
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Delete rate" onClick={() => onDelete(r)} disabled={busy}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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
    </div>
  );
};

export default FxRatesTable;
