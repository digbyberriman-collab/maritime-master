import React from 'react';
import { CheckCircle2, ClipboardList, Percent, PlayCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPct, type PayReviewFilters, type PayReviewKpis } from '@/modules/hris/lib/payReviewHelpers';

interface ReviewCycleSummaryProps {
  kpis: PayReviewKpis | null;
  year: number;
  filters: PayReviewFilters;
  onFilter: (next: PayReviewFilters) => void;
}

interface TileProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'warning' | 'success';
  active?: boolean;
  onClick?: () => void;
}

const Tile: React.FC<TileProps> = ({ icon: Icon, label, value, hint, tone = 'default', active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active && 'border-primary ring-1 ring-primary',
    )}
  >
    <div className={cn('rounded-md p-2', tone === 'warning' ? 'bg-yellow-500/10 text-yellow-500' : tone === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-primary/10 text-primary')}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <p className="truncate text-2xl font-semibold leading-none text-foreground">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  </button>
);

/** KPI tiles for the review cycle; clicking a tile applies the matching filter. */
export const ReviewCycleSummary: React.FC<ReviewCycleSummaryProps> = ({ kpis, year, filters, onFilter }) => {
  const v = (n: number | null | undefined) => (kpis ? n ?? 0 : <Skeleton className="h-7 w-10" />);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={ClipboardList}
        label="Proposed, awaiting approval"
        value={v(kpis?.proposed)}
        tone="warning"
        active={filters.status === 'proposed'}
        onClick={() => onFilter({ status: 'proposed', reason: 'all', year: 'all' })}
      />
      <Tile
        icon={CheckCircle2}
        label="Approved, awaiting apply"
        value={v(kpis?.approvedAwaitingApply)}
        active={filters.status === 'approved'}
        onClick={() => onFilter({ status: 'approved', reason: 'all', year: 'all' })}
      />
      <Tile
        icon={PlayCircle}
        label={`Applied in ${year}`}
        value={v(kpis?.appliedThisYear)}
        tone="success"
        active={filters.status === 'applied' && filters.year === year}
        onClick={() => onFilter({ status: 'applied', reason: 'all', year })}
      />
      <Tile
        icon={Percent}
        label="Average increase"
        value={kpis ? formatPct(kpis.averageIncreasePct) : <Skeleton className="h-7 w-16" />}
        hint={`across reviews applied in ${year}`}
      />
    </div>
  );
};

export default ReviewCycleSummary;
