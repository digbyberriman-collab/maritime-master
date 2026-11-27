import React from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_BAR } from '@/components/ui/tones';
import { useScopedPath } from '@/app/router/scopes';
import type { ActionItem } from '@/modules/crew/lib/dashboardModel';

/**
 * Action required (gap/04 C2): what needs someone on the vessel's crew
 * today, most urgent first, each line a link to the list behind it. When
 * every source answered and nothing needs action it says so in one line;
 * when a source is hidden, unreadable or not in yet it says nothing (it
 * never claims all clear on part of the picture).
 */
export const ActionRequired: React.FC<{ actions: readonly ActionItem[]; allClear: boolean; vesselName: string }> = ({ actions, allClear, vesselName }) => {
  const scopedPath = useScopedPath();
  if (actions.length === 0) {
    if (!allClear) return null;
    return (
      <p className="flex items-center gap-2 type-body text-muted-foreground" data-action-required="clear">
        <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
        Nothing needs action on {vesselName}&rsquo;s crew today.
      </p>
    );
  }
  const urgent = actions.some((a) => a.tone === 'danger');
  return (
    <section
      aria-labelledby="crew-dashboard-actions-title"
      className={cn('min-w-0 rounded-lg border border-l-[3px] bg-card p-[var(--card-pad)] shadow-sm', TONE_BAR[urgent ? 'danger' : 'warn'])}
      data-action-required={urgent ? 'danger' : 'warn'}
    >
      <h2 id="crew-dashboard-actions-title" className="type-subtitle font-semibold text-foreground">
        Action required
      </h2>
      <ul className="mt-2 grid gap-x-6 gap-y-0.5 md:grid-cols-2">
        {actions.map((a) => (
          <li key={a.key} className="min-w-0">
            <Link
              to={scopedPath(a.href)}
              className="group flex min-h-10 items-center gap-3 rounded-md px-2 -mx-2 type-body text-foreground transition-colors duration-quick ease-tide hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
              data-action={a.key}
            >
              {a.tone === 'danger' ? (
                <AlertOctagon aria-hidden="true" className="size-4 shrink-0 text-critical" />
              ) : (
                <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-warning" />
              )}
              <span className="min-w-0 flex-1">{a.text}</span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-quick ease-tide group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
