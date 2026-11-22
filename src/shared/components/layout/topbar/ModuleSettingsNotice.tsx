/**
 * The non-blocking "this vessel's modules could not load" strip (spec §5.6;
 * gap/10 W4; DECISIONS D-04). While a vessel's `vessel_module_settings` read
 * has failed, every tab and leaf that a setting governs is hidden (fail
 * closed) and pages under them show an error; this strip says why and
 * offers Retry. It stays up while the retry runs (the button waits) and goes
 * once the settings load. A missing table is not an error (D-01), so it
 * never shows for that.
 */
import React from 'react';
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useScope } from '@/app/router/scopeContext';
import { useVesselNav } from '@/app/nav/useVesselNav';

export const MODULE_SETTINGS_ERROR_MESSAGE = "This vessel's modules could not load. Some tabs are hidden.";

const VesselModuleSettingsNotice: React.FC<{ className?: string }> = ({ className }) => {
  const nav = useVesselNav();
  if (nav.status !== 'error') return null;
  const retrying = nav.retrying;
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
      <p className="type-body-sm min-w-0 flex-1 text-warning">{MODULE_SETTINGS_ERROR_MESSAGE}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid={SHELL_TEST_IDS.moduleSettingsRetry}
        onClick={nav.retry}
        disabled={retrying}
        aria-busy={retrying || undefined}
        className="shrink-0 gap-1.5 border border-warning/40 px-3 text-warning hover:bg-warning/10 hover:text-warning focus-visible:ring-warning [@media(pointer:coarse)]:h-11"
      >
        {retrying ? (
          <Loader2 className="motion-safe:animate-spin" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <RotateCw strokeWidth={1.75} aria-hidden="true" />
        )}
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
};

/** Only the vessel scope has module settings; elsewhere nothing is read. */
const ModuleSettingsNotice: React.FC<{ className?: string }> = ({ className }) => {
  const { scope } = useScope();
  return scope === 'vessel' ? <VesselModuleSettingsNotice className={className} /> : null;
};

export default ModuleSettingsNotice;
