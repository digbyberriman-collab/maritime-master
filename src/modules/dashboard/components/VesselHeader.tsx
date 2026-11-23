import React from 'react';
import { Award, MapPin } from 'lucide-react';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { VesselDashboardData } from '@/modules/vessels/hooks/useVesselDashboard';

interface VesselHeaderProps {
  data: VesselDashboardData | null;
  isLoading: boolean;
  isAllVessels: boolean;
  /** The page's actions (freshness stamp, filter, Refresh, quick actions), in PageHeader's actions slot. */
  actions?: React.ReactNode;
  userName?: string;
}

/**
 * The vessel dashboard's page heading (Phase 1 S7; D-82): `PageHeader` with
 * the vessel name as the page's only h1, IMO as the reference chip and flag /
 * class society underneath, and the page's actions in its actions slot (they
 * wrap under the title on narrow screens). It replaces the gradient hero card.
 */
const VesselHeader: React.FC<VesselHeaderProps> = ({ data, isLoading, isAllVessels, actions }) => {
  if (isLoading) {
    return (
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        {/* The same 18rem title room as PageHeader, so the actions do not jump when the vessel loads. */}
        <div role="status" aria-busy="true" className="min-w-[min(18rem,100%)] flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-56 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <span className="sr-only">Loading vessel</span>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    );
  }

  if (isAllVessels) {
    return (
      <PageHeader
        eyebrow="All vessels"
        title="Fleet overview"
        description="Every vessel you can reach, at a glance."
        actions={actions}
      />
    );
  }

  const particulars = [
    data?.flag_state ? { icon: MapPin, text: data.flag_state, label: 'Flag state' } : null,
    data?.classification_society ? { icon: Award, text: data.classification_society, label: 'Class society' } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <PageHeader
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
      actions={actions}
    />
  );
};

export default VesselHeader;
