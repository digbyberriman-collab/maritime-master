import React, { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, RotateCcw, UserMinus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, formatMinor, humanise } from '@/modules/hris/lib/format';
import { parseBreakdown } from '@/modules/hris/lib/payroll/runHelpers';
import type { PayrollLine, PayrollRunDetail } from '@/modules/hris/hooks/usePayroll';
import { LineStatusBadge } from './PayrollStatusBadge';
import { PayslipButton } from './PayslipButton';

interface LinesTableProps {
  run: PayrollRunDetail;
  /** Lines can be adjusted/excluded while the run is draft or calculated. */
  canAdjust: boolean;
  canGeneratePayslip: boolean;
  busy: boolean;
  onAdjust: (line: PayrollLine) => void;
  onToggleExcluded: (line: PayrollLine, excluded: boolean) => void;
  onGeneratePayslip: (line: PayrollLine) => void;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

const Breakdown: React.FC<{ line: PayrollLine; runCurrency: string }> = ({ line, runCurrency }) => {
  const b = parseBreakdown(line.breakdown);
  const ccy = line.currency;
  const Row: React.FC<{ label: string; value: React.ReactNode; muted?: boolean; strong?: boolean }> = ({ label, value, muted, strong }) => (
    <div className={cn('flex items-center justify-between gap-4 text-sm', muted && 'text-muted-foreground', strong && 'font-semibold text-foreground')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="grid gap-6 rounded-md border bg-muted/30 p-4 md:grid-cols-3">
      <div className="space-y-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Days</p>
        <Row label="In period" value={line.days_in_period} />
        <Row label="Onboard" value={line.days_onboard} />
        <Row label="Paid leave" value={line.days_leave_paid} />
        <Row label={`Travel${b.travel_days_paid ? '' : ' (unpaid)'}`} value={line.days_travel} />
        <Row label="Unpaid" value={line.days_unpaid} />
        {b.days.unknown > 0 && <Row label="Unclassified" value={b.days.unknown} muted />}
        <Row label="Paid days" value={`${line.days_paid} (${(Number(line.proration_ratio) * 100).toFixed(1)}%)`} strong />
      </div>
      <div className="space-y-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings ({ccy})</p>
        <Row label={`Base (${humanise(line.pay_frequency)})`} value={formatMinor(line.base_period_minor, ccy)} muted />
        <Row label="Prorated base" value={formatMinor(line.prorated_base_minor, ccy)} />
        {b.allowances.map((a, i) => (
          <Row key={`${a.name}-${i}`} label={a.name} value={formatMinor(a.amount_minor, ccy)} />
        ))}
        {b.allowances.length === 0 && line.allowances_minor > 0 && <Row label="Allowances" value={formatMinor(line.allowances_minor, ccy)} />}
        <Row label="Gratuity" value={formatMinor(line.gratuity_minor, ccy)} />
        <Row label="Other earnings" value={formatMinor(line.other_earnings_minor, ccy)} />
        <Row label="Gross" value={formatMinor(line.gross_minor, ccy)} strong />
      </div>
      <div className="space-y-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net</p>
        <Row label="Deductions" value={formatMinor(line.deductions_minor, ccy)} />
        <Row label={`Net (${ccy})`} value={formatMinor(line.net_minor, ccy)} strong />
        {runCurrency !== ccy && (
          <>
            <Row label={`FX ${ccy}→${runCurrency}`} value={line.fx_rate_to_run === null ? 'missing' : Number(line.fx_rate_to_run).toFixed(4)} muted />
            <Row label={`Net (${runCurrency})`} value={formatMinor(line.net_run_currency_minor, runCurrency)} strong />
          </>
        )}
        {line.payslip_generated_at && <Row label="Payslip generated" value={formatDateTime(line.payslip_generated_at)} muted />}
        {line.notes && <p className="pt-2 text-xs text-muted-foreground">Note: {line.notes}</p>}
      </div>
    </div>
  );
};

/** All lines of a run with an expandable breakdown row and per-line actions. */
export const LinesTable: React.FC<LinesTableProps> = ({ run, canAdjust, canGeneratePayslip, busy, onAdjust, onToggleExcluded, onGeneratePayslip }) => {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const showRunCcy = run.lines.some((l) => l.currency !== run.currency);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" /> Lines
          <span className="text-sm font-normal text-muted-foreground">({run.lines.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {run.lines.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {run.status === 'draft' ? 'Calculate the run to build a line for every crew member with active compensation.' : 'No lines on this run.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[1%]" />
                  <TableHead>Crew</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Days paid</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Allowances</TableHead>
                  <TableHead className="text-right">Gratuity</TableHead>
                  <TableHead className="text-right">Other</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  {showRunCcy && <TableHead className="text-right">Net ({run.currency})</TableHead>}
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.lines.map((l) => {
                  const expanded = open.has(l.id);
                  const excluded = l.status === 'excluded';
                  return (
                    <Fragment key={l.id}>
                      <TableRow className={cn('cursor-pointer', excluded && 'opacity-60')} onClick={() => toggle(l.id)}>
                        <TableCell className="pr-0">
                          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={l.avatar_url ?? undefined} alt="" />
                              <AvatarFallback className="text-[10px]">{initials(l.crew_name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className={cn('truncate text-sm font-medium text-foreground', excluded && 'line-through')}>{l.crew_name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {[l.rank, l.department, l.vessel_name].filter(Boolean).join(' · ') || l.currency}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><LineStatusBadge status={l.status} /></TableCell>
                        <TableCell className="text-right tabular-nums">{l.days_paid}/{l.days_in_period}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMinor(l.prorated_base_minor, l.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMinor(l.allowances_minor, l.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMinor(l.gratuity_minor, l.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMinor(l.other_earnings_minor, l.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMinor(l.deductions_minor, l.currency)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-foreground">{formatMinor(l.net_minor, l.currency)}</TableCell>
                        {showRunCcy && <TableCell className="text-right tabular-nums">{formatMinor(l.net_run_currency_minor, run.currency)}</TableCell>}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {canAdjust && !excluded && (
                              <Button variant="ghost" size="sm" onClick={() => onAdjust(l)} disabled={busy}>
                                <Pencil className="mr-1 h-3.5 w-3.5" /> Adjust
                              </Button>
                            )}
                            {canAdjust && (
                              <Button variant="ghost" size="sm" onClick={() => onToggleExcluded(l, !excluded)} disabled={busy}>
                                {excluded ? <RotateCcw className="mr-1 h-3.5 w-3.5" /> : <UserMinus className="mr-1 h-3.5 w-3.5" />}
                                {excluded ? 'Include' : 'Exclude'}
                              </Button>
                            )}
                            {!excluded && (
                              <PayslipButton
                                payslipPath={l.payslip_path}
                                runNumber={run.run_number}
                                crewName={l.crew_name}
                                canGenerate={canGeneratePayslip}
                                onGenerate={() => onGeneratePayslip(l)}
                                busy={busy}
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={showRunCcy ? 12 : 11} className="bg-muted/10 p-3">
                            <Breakdown line={l} runCurrency={run.currency} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LinesTable;
