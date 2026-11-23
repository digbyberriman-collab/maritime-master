/**
 * The tooltip of an icon-only shell control (gap/10 improvement 12; D-92):
 * its name, and its keyboard shortcut or a hint, on hover and on keyboard
 * focus (never on touch: Radix does not open tooltips from touch). The
 * control's `aria-label` stays its name; the tooltip only describes it. The
 * top bar's icon controls use it below the control (`TopBarTooltip`); the
 * collapsed sidebar's rows use it to the right (`side="right"`).
 *
 * `suppressed` keeps the tooltip closed while the control's own menu or
 * popover is open, so it never sits over the menu.
 *
 * Nesting: a menu or popover trigger goes OUTSIDE this wrapper
 * (`<PopoverTrigger asChild><IconTooltip …><button/></IconTooltip></PopoverTrigger>`).
 * Both triggers write `data-state`; the outer one's props win, and the
 * control's styling (`data-[state=open]:…`) must follow the menu, not the
 * tooltip. The wrapper forwards every prop and the ref to the control.
 *
 * It carries its own provider, so it works under any tree (tests render the
 * top bar without the app's TooltipProvider), and portals its content to
 * the body: the top bar is its own stacking context (its backdrop blur), so
 * an inline tooltip would sit under the vessel tab row below it, and the
 * sidebar's scroll container (overflow-y-auto) would clip one. Tokens only;
 * the enter animation is off under reduced motion.
 */
import React from 'react';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type IconTooltipSide = 'top' | 'right' | 'bottom' | 'left';

export interface IconTooltipProps extends React.ComponentPropsWithoutRef<typeof TooltipTrigger> {
  /** The control's name (as its aria-label says). */
  label: React.ReactNode;
  /** A key or chord, shown as a key cap (`G V`, `⌘K`). */
  shortcut?: string;
  /** A short muted line after the label (`? for keyboard shortcuts`, `Planned`). */
  hint?: React.ReactNode;
  /** The control's menu or popover is open: no tooltip. */
  suppressed?: boolean;
  /** Which side of the control the tooltip sits on (default below it). */
  side?: IconTooltipSide;
  /** Gap between the control and the tooltip, in px (default 4). */
  sideOffset?: number;
  /** Extra classes for the tooltip surface. */
  contentClassName?: string;
  children: React.ReactElement;
}

export const TOOLTIP_DELAY_MS = 300;

const IconTooltip = React.forwardRef<HTMLButtonElement, IconTooltipProps>(
  ({ label, shortcut, hint, suppressed = false, side = 'bottom', sideOffset, contentClassName, children, ...triggerProps }, ref) => {
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
              side={side}
              {...(sideOffset === undefined ? {} : { sideOffset })}
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
IconTooltip.displayName = 'IconTooltip';

export default IconTooltip;
