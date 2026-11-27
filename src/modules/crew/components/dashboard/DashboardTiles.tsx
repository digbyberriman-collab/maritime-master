import React from 'react';
import { ClipboardCheck, Clock, FileWarning, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { KpiTile } from '@/shared/components/data';
import { useScopedPath } from '@/app/router/scopes';
import type { DashboardTileKey, TileModel } from '@/modules/crew/lib/dashboardModel';

const ICON: Readonly<Record<DashboardTileKey, LucideIcon>> = {
  crewing: Users,
  compliance: ShieldCheck,
  onboarding: ClipboardCheck,
  documents: FileWarning,
  hours_of_rest: Clock,
};

/**
 * The crew dashboard's five KPI tiles (gap/04 C2; DS13): Crewing,
 * Compliance, Onboarding, Documents, Hours of rest. Each renders its own
 * state from lib/dashboardModel.ts (loading, a number, zero, not enabled,
 * error with Try again, hidden without access); a number links to the list
 * it summarises. Five across from 1280 px, three at 1024, two below (the
 * last odd tile spans the row).
 */
export const DashboardTiles: React.FC<{ tiles: readonly TileModel[]; onRetry: () => void }> = ({ tiles, onRetry }) => {
  const scopedPath = useScopedPath();
  const shown = tiles.filter((t) => t.state !== 'no-access');
  if (shown.length === 0) return null;
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1"
      data-crew-dashboard-tiles=""
    >
      {shown.map((t) => (
        <KpiTile
          key={t.key}
          label={t.label}
          icon={ICON[t.key]}
          state={t.state}
          value={t.value}
          unit={t.unit}
          sub={t.sub}
          tone={t.tone}
          href={t.href ? scopedPath(t.href) : undefined}
          zeroLabel={t.zeroLabel}
          notEnabledReason={t.notEnabledReason}
          errorMessage={t.errorMessage}
          onRetry={t.state === 'error' ? onRetry : undefined}
          className="min-w-0"
        />
      ))}
    </div>
  );
};
