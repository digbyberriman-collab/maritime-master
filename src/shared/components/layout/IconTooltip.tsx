/**
 * The tooltip of an icon-only shell control (gap/10 improvement 12; D-92):
 * its name, and its keyboard shortcut or a hint, on hover and on keyboard
 * focus (never on touch: Radix does not open tooltips from touch). The
 * control's `aria-label` stays its name; the tooltip only describes it. The
 * top bar's icon controls use it below the control (`TopBarTooltip`); the
 * collapsed sidebar's rows use it to the right (`side="right"`).
 *
 * `suppressed` keeps the tooltip closed while the control's own menu or
 * popover is open, so it never sits over the menu. It stays closed after
 * the menu closes too: Radix gives focus back to the trigger (kept, for
 * keyboard and screen-reader users), and that focus would otherwise open the
 * tooltip under a mouse or touch choice. A latch set while `suppressed`
 * blocks the next open until the user moves on: a hover (a non-touch
 * pointer move on the control), a blur (tabbing away and back) or a key
 * pressed on the control. Blur and pointer moves while the menu is still
 * open do not count: opening it blurs the trigger, and a resting mouse
 * still reports moves over it. After a keyboard choice the tooltip waits
 * for the next keyboard focus, which D-92 allows.
 *
 * Nesting: a menu or popover trigger goes OUTSIDE this wrapper
 * (`<PopoverTrigger asChild><IconTooltip …><button/></IconTooltip></PopoverTrigger>`).
 * Both triggers write `data-state`; the outer one's props win, and the
 * control's styling (`data-[state=open]:…`) must follow the menu, not the
 * tooltip. The wrapper forwards every prop and the ref to the control; its
 * own focus, pointer-move, blur and key handlers also call the outer
 * trigger's, so a DropdownMenuTrigger's or PopoverTrigger's handlers still
 * run.
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

/**
 * The gap to a tooltip on the right of the collapsed sidebar (its rows and
 * its expand toggle): it clears the 64 px rail, where a 44 px control sits
 * 10 px in from the edge.
 */
export const RAIL_TOOLTIP_OFFSET = 14;

const IconTooltip = React.forwardRef<HTMLButtonElement, IconTooltipProps>(
  (
    {
      label,
      shortcut,
      hint,
      suppressed = false,
      side = 'bottom',
      sideOffset,
      contentClassName,
      children,
      onFocus,
      onPointerMove,
      onBlur,
      onKeyDown,
      ...triggerProps
    },
    ref,
  ) => {
    const [tipOpen, setTipOpen] = React.useState(false);
    // Set while the menu is open; blocks the open that the focus return asks for (see the header).
    const reopenBlocked = React.useRef(false);
    const suppressedRef = React.useRef(suppressed);
    suppressedRef.current = suppressed;
    React.useEffect(() => {
      if (suppressed) {
        reopenBlocked.current = true;
        setTipOpen(false);
      }
    }, [suppressed]);

    const onOpenChange = React.useCallback((next: boolean) => {
      if (next && reopenBlocked.current) return;
      setTipOpen(next);
    }, []);

    // The focus Radix gives back when the menu closes: skip the tooltip's own
    // focus handler (preventDefault, which Radix's composed handlers honour),
    // so it never asks to open. Asking would also mark the tooltip as shown
    // to its provider, and the next hover would skip the delay.
    const handleFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
      onFocus?.(event);
      if (reopenBlocked.current) event.preventDefault();
    };
    // The user moved on: hover, tab away, or a key on the control. Each calls the outer trigger's handler too.
    const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== 'touch' && !suppressedRef.current) reopenBlocked.current = false;
      onPointerMove?.(event);
    };
    const handleBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
      if (!suppressedRef.current) reopenBlocked.current = false;
      onBlur?.(event);
    };
    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      reopenBlocked.current = false;
      onKeyDown?.(event);
    };

    return (
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        <Tooltip open={!suppressed && tipOpen} onOpenChange={onOpenChange}>
          <TooltipTrigger
            asChild
            ref={ref}
            {...triggerProps}
            onFocus={handleFocus}
            onPointerMove={handlePointerMove}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          >
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
