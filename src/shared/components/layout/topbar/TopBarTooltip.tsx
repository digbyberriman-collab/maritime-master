/**
 * The tooltip of a top-bar icon control (gap/10 improvement 12): its name,
 * and its keyboard shortcut or a hint, on hover and on keyboard focus (never
 * on touch: Radix does not open tooltips from touch). The control's
 * `aria-label` stays its name; the tooltip only describes it.
 *
 * `suppressed` keeps the tooltip closed while the control's own menu or
 * popover is open, so it never sits over the menu.
 *
 * Nesting: a menu or popover trigger goes OUTSIDE this wrapper
 * (`<PopoverTrigger asChild><TopBarTooltip …><button/></TopBarTooltip></PopoverTrigger>`).
 * Both triggers write `data-state`; the outer one's props win, and the
 * control's styling (`data-[state=open]:…`) must follow the menu, not the
 * tooltip. The wrapper forwards every prop and the ref to the control.
 *
 * It carries its own provider, so it works under any tree (tests render the
 * top bar without the app's TooltipProvider), and portals its content to
 * the body: the top bar is its own stacking context (its backdrop blur), so
 * an inline tooltip would sit under the vessel tab row below it. Tokens
 * only; the enter animation is off under reduced motion.
 */
import React from 'react';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface TopBarTooltipProps extends React.ComponentPropsWithoutRef<typeof TooltipTrigger> {
  /** The control's name (as its aria-label says). */
  label: React.ReactNode;
  /** A key or chord, shown as a key cap (`G V`, `⌘K`). */
  shortcut?: string;
  /** A short muted line after the label (`? for keyboard shortcuts`). */
  hint?: React.ReactNode;
  /** The control's menu or popover is open: no tooltip. */
  suppressed?: boolean;
  /** Extra classes for the tooltip surface. */
  contentClassName?: string;
  children: React.ReactElement;
}

export const TOOLTIP_DELAY_MS = 300;

const TopBarTooltip = React.forwardRef<HTMLButtonElement, TopBarTooltipProps>(
  ({ label, shortcut, hint, suppressed = false, contentClassName, children, ...triggerProps }, ref) => {
    const [tipOpen, setTipOpen] = React.useState(false);
    // A menu that opens closes the tooltip for good: it may not come back when the menu closes.
    React.useEffect(() => {
      if (suppressed) setTipOpen(false);
    }, [suppressed]);

    return (
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        <Tooltip open={!suppressed && tipOpen} onOpenChange={setTipOpen}>
          <TooltipTrigger asChild ref={ref} {...triggerProps}>
            {children}
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              side="bottom"
              className={cn('type-caption flex items-center gap-2 motion-reduce:animate-none', contentClassName)}
            >
              <span>{label}</span>
              {hint && <span className="text-muted-foreground">{hint}</span>}
              {shortcut && (
                <kbd className="type-mono rounded-sm border border-border bg-muted px-1 text-[0.6875rem] leading-4 text-muted-foreground">
                  {shortcut}
                </kbd>
              )}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
TopBarTooltip.displayName = 'TopBarTooltip';

export default TopBarTooltip;
