import React from 'react';
import { format } from 'date-fns';
import { Award, MapPin, RefreshCw } from 'lucide-react';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VesselDashboardData } from '@/modules/vessels/hooks/useVesselDashboard';

interface VesselHeaderProps {
  data: VesselDashboardData | null;
  isLoading: boolean;
  isAllVessels: boolean;
  onRefresh?: () => void;
  userName?: string;
}

function RefreshAction({ refreshedAt, onRefresh }: { refreshedAt?: string | null; onRefresh?: () => void }) {
  if (!refreshedAt && !onRefresh) return null;
  return (
    <div className="flex items-center gap-2">
      {refreshedAt ? (
        <span className="text-xs tabular-nums text-muted-foreground">Updated {format(new Date(refreshedAt), 'HH:mm')}</span>
      ) : null}
      {onRefresh ? (
        <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Refresh dashboard" title="Refresh dashboard">
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The vessel dashboard's page heading (Phase 1 S7): `PageHeader` with the
 * vessel name as the page's only h1, IMO as the reference chip and flag /
 * class society underneath. It replaces the gradient hero card.
 */
const VesselHeader: React.FC<VesselHeaderProps> = ({ data, isLoading, isAllVessels, onRefresh }) => {
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="mb-4 min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <span className="sr-only">Loading vessel</span>
      </div>
    );
  }

  if (isAllVessels) {
    return (
      <PageHeader
        className="min-w-0 flex-1"
        eyebrow="All vessels"
        title="Fleet overview"
        description="Every vessel you can reach, at a glance."
        actions={<RefreshAction refreshedAt={data?.data_refreshed_at} onRefresh={onRefresh} />}
      />
    );
  }

  const particulars = [
    data?.flag_state ? { icon: MapPin, text: data.flag_state, label: 'Flag state' } : null,
    data?.classification_society ? { icon: Award, text: data.classification_society, label: 'Class society' } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <PageHeader
      className="min-w-0 flex-1"
      eyebrow="Vessel"
      title={data?.vessel_name || 'Unknown vessel'}
      reference={data?.imo_number ? `IMO ${data.imo_number}` : undefined}
      description={
        particulars.length > 0 ? (
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {particulars.map(({ icon: Icon, text, label }) => (
              <span key={label} className="inline-flex items-center gap-1">
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="sr-only">{label}: </span>
                {text}
              </span>
            ))}
          </span>
        ) : undefined
      }
      actions={<RefreshAction refreshedAt={data?.data_refreshed_at} onRefresh={onRefresh} />}
    />
  );
};

export default VesselHeader;
