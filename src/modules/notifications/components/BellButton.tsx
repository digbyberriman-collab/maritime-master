/**
 * The top-bar bell button and its badge (gap/10 top bar element 8, IA15;
 * D-57, D-91), shared by the inbox bell and the alerts fallback so both look
 * and read the same. Sits inside `<PopoverTrigger asChild><TopBarTooltip>`:
 * it forwards the ref and every prop to the button.
 *
 * - No badge until a count is known (`badge` null).
 * - Critical tone when any counted item is critical (critical = destructive
 *   token, D-57), else Signal; only the critical badge pulses, and never
 *   under reduced motion (`motion-safe:`).
 * - The drawn label caps at `99+`; the accessible name (built by the caller
 *   with `bellLabel`, ../lib/bellBadge.ts) carries the full count.
 */
import React from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { topBarIconButton } from '@/shared/components/layout/topbar/styles';
import type { BellBadge } from '../lib/bellBadge';

export interface BellButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  badge: BellBadge | null;
}

export const BellButton = React.forwardRef<HTMLButtonElement, BellButtonProps>(({ badge, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    data-testid={SHELL_TEST_IDS.notificationsTrigger}
    className={cn(topBarIconButton, 'relative', className)}
    {...props}
  >
    <Bell strokeWidth={1.75} aria-hidden="true" />
    {badge && badge.count > 0 ? (
      <span
        aria-hidden="true"
        data-tone={badge.critical ? 'critical' : 'primary'}
        className={cn(
          'absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ring-2 ring-background',
          badge.critical ? 'bg-critical text-critical-foreground motion-safe:animate-pulse' : 'bg-primary text-primary-foreground',
        )}
      >
        {badge.label}
      </span>
    ) : null}
  </button>
));
BellButton.displayName = 'BellButton';
