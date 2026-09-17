import React from 'react';
import { CheckCircle2, History, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatMinor, humanise } from '@/modules/hris/lib/format';
import { compensationCost, parseAllowances } from '@/modules/hris/lib/compensation';
import type { CrewCompensation } from '@/modules/hris/hooks/useCompensation';
import { CompensationStatusBadge } from './CompensationStatusBadge';

interface CompensationHistoryTableProps {
  rows: CrewCompensation[];
  canEdit: boolean;
  canAdmin: boolean;
  busy?: boolean;
  onEdit: (row: CrewCompensation) => void;
  onActivate: (row: CrewCompensation) => void;
  onDelete: (row: CrewCompensation) => void;
}

/** Superseded and draft packages for the selected crew member. */
export const CompensationHistoryTable: React.FC<CompensationHistoryTableProps> = ({ rows, canEdit, canAdmin, busy, onEdit, onActivate, onDelete }) => (
  <Card className="bg-card">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <History className="h-4 w-4 text-muted-foreground" /> Compensation history
      </CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      {rows.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">No previous or draft packages on record.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">Annualised</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Reason</TableHead>
                {(canEdit || canAdmin) && <TableHead className="w-[1%]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const cost = compensationCost(r);
                const allowances = parseAllowances(r.allowances);
                return (
                  <TableRow key={r.id}>
                    <TableCell><CompensationStatusBadge status={r.status} /></TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(r.effective_from)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.effective_to ? formatDate(r.effective_to) : 'Open'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatMinor(r.base_salary_minor, r.currency)}</TableCell>
                    <TableCell className="whitespace-nowrap">{humanise(r.pay_frequency)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {allowances.length ? `${formatMinor(cost.monthlyAllowancesMinor, r.currency)} (${allowances.length})` : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatMinor(cost.annualTotalMinor, r.currency)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.pay_grade?.code ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground" title={r.reason ?? undefined}>{r.reason ?? '—'}</TableCell>
                    {(canEdit || canAdmin) && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && r.status === 'draft' && (
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onActivate(r)} disabled={busy}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Activate
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit" onClick={() => onEdit(r)} disabled={busy}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canAdmin && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Delete" onClick={() => onDelete(r)} disabled={busy}>
                              <Trash2 className="h-3.5 w-3.5" />
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

export default CompensationHistoryTable;
