/**
 * The non-blocking "your vessels could not load" strip (DECISIONS D-04,
 * D-76; gap/10 A.12). While the vessel-list read has failed, the vessel
 * switcher, the scope control and the command palette may be missing
 * vessels, and a vessel page shows the load error instead of "not found";
 * this strip says why and offers Retry, in every scope. It stays up while
 * the retry runs (the button waits) and goes only once a load succeeds:
 * VesselContext latches `loadError` until then. Never another user's error
 * (VesselContext serves it behind the same guard as the lists).
 */
import React from 'react';
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

export const VESSEL_LIST_ERROR_MESSAGE = 'Your vessels could not load. The vessel switcher and search may be missing vessels.';

const VesselListNotice: React.FC<{ className?: string }> = ({ className }) => {
  // No provider (the strips rendered on their own): no list, nothing to say.
  const vessel = useVessel({ optional: true });
  if (!vessel?.loadError) return null;
  const { loading, retryVessels } = vessel;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-warning/25 bg-warning-muted px-3 py-1.5 text-warning lg:px-4',
        className,
      )}
    >
      <AlertTriangle className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <p className="type-body-sm min-w-0 flex-1 text-warning">{VESSEL_LIST_ERROR_MESSAGE}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid={SHELL_TEST_IDS.vesselListRetry}
        onClick={() => void retryVessels()}
        disabled={loading}
        aria-busy={loading || undefined}
        className="shrink-0 gap-1.5 border border-warning/40 px-3 text-warning hover:bg-warning/10 hover:text-warning focus-visible:ring-warning [@media(pointer:coarse)]:h-11"
      >
        {loading ? (
          <Loader2 className="motion-safe:animate-spin" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <RotateCw strokeWidth={1.75} aria-hidden="true" />
        )}
        {loading ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
};

export default VesselListNotice;
