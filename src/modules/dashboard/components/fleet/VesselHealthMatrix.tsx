import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { VesselDashboardData } from '@/modules/vessels/hooks/useVesselDashboard';

type Row = { vessel: { id: string; name: string }; data: VesselDashboardData | null };

const COLUMNS: { key: string; label: string; get: (d: VesselDashboardData | null) => number | null }[] = [
  { key: 'crewing', label: 'Crewing', get: (d) => (d ? d.crew_certs_expiring_90d : null) },
  { key: 'documents', label: 'Documents', get: (d) => (d ? d.certs_expiring_90d : null) },
  { key: 'safety', label: 'Safety', get: (d) => (d ? d.red_alerts_count + d.open_capas_count : null) },
  { key: 'technical', label: 'Technical', get: (d) => (d ? d.overdue_maintenance_count + d.critical_defects_count : null) },
  { key: 'hor', label: 'HOR', get: () => null },
  { key: 'accounting', label: 'Accounting', get: () => 0 },
  { key: 'insurance', label: 'Insurance', get: () => 0 },
  { key: 'onboarding', label: 'Onboarding', get: (d) => (d ? d.training_gaps_count : null) },
];

function dotClass(v: number | null) {
  if (v === null) return 'bg-muted-foreground/40';
  if (v === 0) return 'bg-emerald-500';
  if (v <= 3) return 'bg-amber-500';
  return 'bg-rose-500';
}

export const VesselHealthMatrix: React.FC<{ rows: Row[] }> = ({ rows }) => {
  const navigate = useNavigate();

  return (
    <div className="rounded-lg border bg-card shadow-card">
      <div className="px-4 pt-4">
        <h3 className="text-base font-semibold text-foreground">Vessel Health Matrix</h3>
        <p className="text-xs text-muted-foreground">Operational status per vessel across every module</p>
      </div>
      <div className="px-2 pb-2 mt-3 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase tracking-wider">Vessel</TableHead>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className="text-[10px] uppercase tracking-wider">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 1} className="text-center text-sm text-muted-foreground py-8">
                  No vessels available
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ vessel, data }) => (
              <TableRow
                key={vessel.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => navigate(`/vessels/${vessel.id}`)}
              >
                <TableCell className="font-medium">{vessel.name}</TableCell>
                {COLUMNS.map((c) => {
                  const v = c.get(data);
                  return (
                    <TableCell key={c.key}>
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2 h-2 rounded-full', dotClass(v))} />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {v === null ? '—' : v}
                        </span>
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default VesselHealthMatrix;