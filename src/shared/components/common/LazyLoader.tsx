import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Suspense fallback for lazily loaded module pages.
 *
 * Contract (BUILD-PLAN S6, page-heading rule): keep `data-route-loading`,
 * `role="status"` and `aria-busy`. The shell waits for this marker to leave
 * the main region before it decides whether the page brought its own h1.
 *
 * The spinner fades in after a short delay (`appear-delayed`), so a chunk
 * that arrives quickly shows nothing at all instead of a flash.
 */
export const LazyLoader: React.FC = () => (
  <div data-route-loading="" role="status" aria-busy="true" className="flex min-h-[40vh] items-center justify-center p-6">
    <div className="appear-delayed flex flex-col items-center gap-3">
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
      <span className="type-caption text-muted-foreground">Loading…</span>
    </div>
  </div>
);

export default LazyLoader;
