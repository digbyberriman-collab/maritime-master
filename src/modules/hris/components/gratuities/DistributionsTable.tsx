import React, { useMemo } from 'react';
import { MoreHorizontal, SlidersHorizontal, UserMinus, UserPlus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMinor } from '@/modules/hris/lib/format';
import { finalAmountMinor, isDistributionLocked, reconcile } from '@/modules/hris/lib/gratuities';
import type { GratuityDistributionWithProfile, GratuityPoolDetail } from '@/modules/hris/hooks/useGratuities';
import { PayoutStatusBadge } from './GratuityBadges';

export type DistributionAction = 'exclude' | 'include' | 'adjust';

interface DistributionsTableProps {
  pool: GratuityPoolDetail;
  canEdit: boolean;
  busy?: boolean;
  onAction: (distribution: GratuityDistributionWithProfile, action: DistributionAction) => void;
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || '?';

const pct = (ratio: number): string => `${(Number(ratio) * 100).toFixed(1)}%`;

/** Per-crew shares with exclusion / adjustment actions and a reconciliation footer. */
export const DistributionsTable: React.FC<DistributionsTableProps> = ({ pool, canEdit, busy, onAction }) => {
  const rec = useMemo(() => reconcile(pool, pool.distributions), [pool]);
  const rowsEditable = canEdit && (pool.status === 'draft' || pool.status === 'calculated' || pool.status === 'approved');
  const diffTone = rec.differenceMinor === 0 ? 'text-green-500' : 'text-orange-500';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Distributions
        </CardTitle>
        <CardDescription>
          {pool.distributions.length === 0
            ? 'No shares yet. Calculate the pool to add the crew who were onboard during the period.'
            : `${rec.participants} crew share the pool${rec.excluded ? `, ${rec.excluded} excluded` : ''}. Adjustments sit on top of the calculated share.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {pool.distributions.length > 0 && (
          <div className="overflow-x-auto">
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crew</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Adjustment</TableHead>
                    <TableHead className="text-right">Final</TableHead>
                    <TableHead>Payout</TableHead>
                    {rowsEditable && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pool.distributions.map((d) => {
                    const locked = isDistributionLocked(d, pool.status);
                    const final = finalAmountMinor(d);
                    return (
                      <TableRow key={d.id} className={cn(d.excluded && 'opacity-60')}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              {d.profile?.avatar_url && <AvatarImage src={d.profile.avatar_url} alt="" />}
                              <AvatarFallback className="text-[10px]">{initials(d.crew_name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className={cn('truncate font-medium text-foreground', d.excluded && 'line-through')}>{d.crew_name}</div>
                              {d.excluded && d.exclusion_reason && <div className="truncate text-xs text-muted-foreground">Excluded: {d.exclusion_reason}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{d.profile?.rank ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{d.profile?.department ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.days_onboard}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(d.points)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{d.excluded ? '—' : Number(d.weight)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{d.excluded ? '—' : pct(d.share_ratio)}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.excluded ? '—' : formatMinor(d.amount_minor, pool.currency)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', d.adjustment_minor ? 'text-foreground' : 'text-muted-foreground')}>
                          {d.adjustment_minor ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted underline-offset-2">
                                  {d.adjustment_minor > 0 ? '+' : ''}
                                  {formatMinor(d.adjustment_minor, pool.currency)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">{d.adjustment_reason ?? 'No reason recorded'}</TooltipContent>
                            </Tooltip>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-foreground">{formatMinor(final, pool.currency)}</TableCell>
                        <TableCell>
                          <PayoutStatusBadge status={d.payout_status} />
                        </TableCell>
                        {rowsEditable && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy || locked} aria-label={`Actions for ${d.crew_name}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {d.excluded ? (
                                  <DropdownMenuItem onClick={() => onAction(d, 'include')}>
                                    <UserPlus className="mr-2 h-4 w-4" /> Include again
                                  </DropdownMenuItem>
                                ) : (
                                  <>
                                    <DropdownMenuItem onClick={() => onAction(d, 'adjust')}>
                                      <SlidersHorizontal className="mr-2 h-4 w-4" /> Adjust amount
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAction(d, 'exclude')} className="text-destructive focus:text-destructive">
                                      <UserMinus className="mr-2 h-4 w-4" /> Exclude
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 border-t px-6 py-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net pool</p>
            <p className="font-medium tabular-nums text-foreground">{formatMinor(rec.netMinor, pool.currency)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Calculated shares</p>
            <p className="font-medium tabular-nums text-foreground">{formatMinor(rec.allocatedMinor, pool.currency)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Adjustments</p>
            <p className={cn('font-medium tabular-nums', rec.adjustmentsMinor ? 'text-foreground' : 'text-muted-foreground')}>
              {rec.adjustmentsMinor > 0 ? '+' : ''}
              {formatMinor(rec.adjustmentsMinor, pool.currency)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sum of finals vs net</p>
            <p className="font-medium tabular-nums text-foreground">
              {formatMinor(rec.finalMinor, pool.currency)}{' '}
              <span className={cn('text-xs', diffTone)}>
                ({rec.differenceMinor === 0 ? 'balanced' : `${rec.differenceMinor > 0 ? '+' : ''}${formatMinor(rec.differenceMinor, pool.currency)}`})
              </span>
            </p>
          </div>
        </div>
        {rec.differenceMinor !== 0 && pool.distributions.length > 0 && (
          <p className="border-t border-orange-500/20 bg-orange-500/5 px-6 py-2 text-xs text-orange-500">
            {rec.differenceMinor > 0
              ? 'Payouts exceed the net pool by the adjustments above. Confirm the extra is funded before approving.'
              : 'Payouts fall short of the net pool. Recalculate after exclusions, or check the negative adjustments.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default DistributionsTable;
