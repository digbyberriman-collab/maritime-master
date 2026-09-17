import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, FileWarning, ShieldCheck, ShieldX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCompanyRtwMatrix, useRunHrAlerts } from '@/modules/hris/hooks/useRightToWork';
import { DEFAULT_MATRIX_FILTERS, computeRtwKpis, type MatrixFilters } from '@/modules/hris/lib/rightToWork';
import { ComplianceMatrix } from './ComplianceMatrix';

interface RtwOverviewProps {
  canEdit: boolean;
  onSelectCrew: (profileId: string) => void;
}

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  tone?: 'default' | 'warning' | 'critical' | 'success';
  active?: boolean;
  onClick: () => void;
}

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, label, value, tone = 'default', active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active && 'border-primary ring-1 ring-primary',
    )}
  >
    <div
      className={cn(
        'rounded-md p-2',
        tone === 'critical'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'warning'
            ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
            : tone === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-primary/10 text-primary',
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      {value === null ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>}
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
    </div>
  </button>
);

type Tile = 'compliant' | 'expired' | 'within30' | 'within90' | 'missing';

const TILE_FILTERS: Record<Tile, Partial<MatrixFilters>> = {
  compliant: { status: 'ok', withinDays: null },
  expired: { status: 'expired', withinDays: null },
  within30: { status: 'all', withinDays: 30 },
  within90: { status: 'all', withinDays: 90 },
  missing: { status: 'all', withinDays: null, columns: ['passport', 'medical'] },
};

/** Company view: KPI tiles over the compliance matrix. */
export const RtwOverview: React.FC<RtwOverviewProps> = ({ canEdit, onSelectCrew }) => {
  const [filters, setFilters] = useState<MatrixFilters>(DEFAULT_MATRIX_FILTERS);
  const [tile, setTile] = useState<Tile | null>(null);
  const matrix = useCompanyRtwMatrix(filters);
  const runAlerts = useRunHrAlerts();

  const kpis = useMemo(() => (matrix.isLoading ? null : computeRtwKpis(matrix.all)), [matrix.isLoading, matrix.all]);

  const pick = (next: Tile) => {
    if (tile === next) {
      setTile(null);
      setFilters(DEFAULT_MATRIX_FILTERS);
      return;
    }
    setTile(next);
    setFilters({ ...DEFAULT_MATRIX_FILTERS, ...TILE_FILTERS[next] });
  };
  const onFiltersChange = (next: MatrixFilters) => {
    setTile(null);
    setFilters(next);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile icon={ShieldCheck} label="Crew fully compliant" value={kpis?.fullyCompliant ?? null} tone="success" active={tile === 'compliant'} onClick={() => pick('compliant')} />
        <KpiTile icon={ShieldX} label="Expired items" value={kpis?.expired ?? null} tone={kpis && kpis.expired > 0 ? 'critical' : 'default'} active={tile === 'expired'} onClick={() => pick('expired')} />
        <KpiTile icon={AlertTriangle} label="Expiring within 30 days" value={kpis?.within30 ?? null} tone="critical" active={tile === 'within30'} onClick={() => pick('within30')} />
        <KpiTile icon={CalendarClock} label="Expiring within 90 days" value={kpis?.within90 ?? null} tone="warning" active={tile === 'within90'} onClick={() => pick('within90')} />
        <KpiTile icon={FileWarning} label="Missing passport or medical" value={kpis?.missingPassportOrMedical ?? null} tone={kpis && kpis.missingPassportOrMedical > 0 ? 'warning' : 'default'} active={tile === 'missing'} onClick={() => pick('missing')} />
      </div>

      {matrix.isError && (
        <Alert variant="destructive">
          <AlertTitle>Could not load compliance data</AlertTitle>
          <AlertDescription>{matrix.error instanceof Error ? matrix.error.message : 'Unknown error'}</AlertDescription>
        </Alert>
      )}

      <ComplianceMatrix
        rows={tile === 'missing' ? matrix.rows.filter((r) => r.cells.passport.status === 'missing' || r.cells.medical.status === 'missing') : matrix.rows}
        departments={matrix.departments}
        isLoading={matrix.isLoading}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onSelectCrew={onSelectCrew}
        canRefreshAlerts={canEdit}
        refreshingAlerts={runAlerts.isPending}
        onRefreshAlerts={() => runAlerts.mutate()}
      />
    </div>
  );
};

export default RtwOverview;
