import React from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMyPayslips } from '@/modules/hris/hooks/usePayroll';
import { formatDate, formatMinor } from '@/modules/hris/lib/format';
import { PayslipButton } from './PayslipButton';

/** Self-service view: the signed-in crew member's paid payslips, download only. */
export const MyPayslips: React.FC<{ crewName: string }> = ({ crewName }) => {
  const { payslips, isLoading } = useMyPayslips();
  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-muted-foreground" /> My payslips
        </CardTitle>
        <CardDescription>Payslips become available once a payroll run has been paid.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : payslips.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No paid payslips yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Run</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="text-right">Days paid</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="text-sm text-foreground">{p.period_label ?? formatDate(p.payslip_generated_at ?? p.created_at, 'MMM yyyy')}</div>
                      {p.period_start && <div className="text-xs text-muted-foreground">{formatDate(p.period_start)} – {formatDate(p.period_end)}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.run_number ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(p.paid_at ?? p.updated_at)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.days_paid}/{p.days_in_period}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMinor(p.gross_minor, p.currency)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">{formatMinor(p.net_minor, p.currency)}</TableCell>
                    <TableCell>
                      <PayslipButton payslipPath={p.payslip_path} runNumber={p.run_number ?? 'payslip'} crewName={crewName} mode="download" />
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
};

export default MyPayslips;
