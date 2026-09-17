import React from 'react';
import { Anchor, CalendarClock, FileSignature, Ship } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import type { ServiceSummary as ServiceSummaryData } from '@/modules/hris/lib/employmentHistory';

interface ServiceSummaryProps {
  summary: ServiceSummaryData | null;
  isLoading?: boolean;
}

const daysLabel = (days: number): string => {
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30.4375);
  if (months < 24) return `${months} mo`;
  const years = Math.floor(days / 365.25);
  const rem = Math.round((days - years * 365.25) / 30.4375);
  return rem > 0 ? `${years} yr ${rem} mo` : `${years} yr`;
};

interface TileProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

const Tile: React.FC<TileProps> = ({ icon: Icon, label, value, hint }) => (
  <Card className="border-border/60 bg-card">
    <CardContent className="flex items-start gap-3 p-4">
      <div className="rounded-md bg-primary/10 p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </CardContent>
  </Card>
);

/** The four headline tiles at the top of a crew member's history. */
export const ServiceSummary: React.FC<ServiceSummaryProps> = ({ summary, isLoading }) => {
  if (isLoading || !summary) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-lg" />
        ))}
      </div>
    );
  }

  const contract = summary.currentContract;
  let contractValue: React.ReactNode = '—';
  let contractHint: React.ReactNode = 'No active contract';
  if (contract) {
    contractValue = contract.lengthDays !== null ? daysLabel(contract.lengthDays) : 'Open-ended';
    contractHint =
      contract.daysRemaining !== null
        ? contract.daysRemaining < 0
          ? `${humanise(contract.contractType)} · ended ${formatDate(contract.endDate)}`
          : `${humanise(contract.contractType)} · ${contract.daysRemaining}d remaining`
        : `${humanise(contract.contractType)} · since ${formatDate(contract.startDate)}`;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        icon={Anchor}
        label="Total sea service"
        value={summary.totalSeaDays > 0 ? daysLabel(summary.totalSeaDays) : '—'}
        hint={summary.firstJoinDate ? `${summary.totalSeaDays} days since ${formatDate(summary.firstJoinDate)}` : 'No assignments recorded'}
      />
      <Tile
        icon={Ship}
        label="Vessels served"
        value={summary.vesselsServed}
        hint={summary.currentVesselName ? `Currently on ${summary.currentVesselName}` : 'Not currently on board'}
      />
      <Tile
        icon={CalendarClock}
        label="Current vessel tenure"
        value={summary.currentVesselDays !== null ? daysLabel(summary.currentVesselDays) : '—'}
        hint={summary.currentVesselDays !== null ? `${summary.currentVesselDays} days on ${summary.currentVesselName ?? 'vessel'}` : 'Between assignments'}
      />
      <Tile icon={FileSignature} label="Current contract" value={contractValue} hint={contractHint} />
    </div>
  );
};

export default ServiceSummary;
