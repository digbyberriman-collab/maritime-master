/**
 * The non-blocking "permissions could not load" strip (D-56, deferred item 3;
 * spec §6.7). Rendered by ShellNotices under the top bar, and by
 * FullPageLoading for the routes that wait without a shell (`/`, legacy
 * redirects), so a failed first load never leaves a bare spinner.
 */
import React from 'react';
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useRbacRetryState } from './useRbacRetryState';

export const RBAC_RETRY_MESSAGE = 'Some of your permissions could not be loaded, so parts of STORM are hidden.';

const RbacRetryNotice: React.FC<{ className?: string }> = ({ className }) => {
  const { visible, retrying, retry } = useRbacRetryState();
  if (!visible) return null;
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
      <p className="type-body-sm min-w-0 flex-1 text-warning">{RBAC_RETRY_MESSAGE}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid={SHELL_TEST_IDS.rbacRetry}
        onClick={retry}
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

export default RbacRetryNotice;
