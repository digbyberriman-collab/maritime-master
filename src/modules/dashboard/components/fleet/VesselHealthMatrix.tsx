import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { TONE_FILL, type Tone } from '@/components/ui/tones';
import type { VesselDashboardData } from '@/modules/vessels/hooks/useVesselDashboard';

type Row = { vessel: { id: string; name: string }; data: VesselDashboardData | null };

const COLUMNS: { key: string; label: string; get: (d: VesselDashboardData | null) => number | null }[] = [
  { key: 'crewing', label: 'Crewing', get: (d) => (d ? d.crew_certs_expiring_90d : null) },
  { key: 'documents', label: 'Documents', get: (d) => (d ? d.certs_expiring_90d : null) },
  { key: 'safety', label: 'Safety', get: (d) => (d ? d.red_alerts_count + d.open_capas_count : null) },
  { key: 'technical', label: 'Technical', get: (d) => (d ? d.overdue_maintenance_count + d.critical_defects_count : null) },
  // Not in the summary RPC yet: shown as "—" (not tracked), never as a 0.
  { key: 'hor', label: 'HOR', get: () => null },
  { key: 'accounting', label: 'Accounting', get: () => null },
  { key: 'insurance', label: 'Insurance', get: () => null },
  { key: 'onboarding', label: 'Onboarding', get: (d) => (d ? d.training_gaps_count : null) },
];

/** Health tone per count: none open → ok, a few → warn, more → danger; unknown → no tone. */
function toneFor(v: number | null): Tone | null {
  if (v === null) return null;
  if (v === 0) return 'ok';
  if (v <= 3) return 'warn';
  return 'danger';
}

export const VesselHealthMatrix: React.FC<{ rows: Row[] }> = ({ rows }) => {
  const navigate = useNavigate();

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="px-4 pt-4">
        <h3 className="type-subtitle text-foreground">Vessel health matrix</h3>
        <p className="text-xs text-muted-foreground">Operational status per vessel across every module</p>
      </div>
      <div className="px-2 pb-2 mt-3 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vessel</TableHead>
              {COLUMNS.map((c) => (
                <TableHead key={c.key}>
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
                className="cursor-pointer hover:bg-accent"
                onClick={() => navigate(`/vessels/${vessel.id}`)}
              >
                <TableCell className="whitespace-nowrap font-medium">{vessel.name}</TableCell>
                {COLUMNS.map((c) => {
                  const v = c.get(data);
                  const tone = toneFor(v);
                  return (
                    <TableCell key={c.key}>
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            tone ? TONE_FILL[tone] : 'border border-muted-foreground/60',
                          )}
                        />
                        <span
                          className={cn(
                            'text-xs tabular-nums',
                            tone === 'danger' ? 'font-semibold text-critical' : 'text-muted-foreground',
                          )}
                          title={v === null ? 'Not tracked in the fleet summary yet' : undefined}
                        >
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