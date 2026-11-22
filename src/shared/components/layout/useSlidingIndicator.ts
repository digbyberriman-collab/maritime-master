/**
 * The sliding underline under the active tab (gap/10 IA5, A.6; spec §5.4),
 * extracted from the old module rail: it follows the active element through
 * resizes, font loads and tab changes. The caller draws it with
 * `transform: translateX(left)` and `width`, and a `motion-reduce:` fallback
 * so it jumps instead of sliding under reduced motion.
 */
import React from 'react';

export interface SlidingIndicator {
  left: number;
  width: number;
  visible: boolean;
}

const HIDDEN: SlidingIndicator = { left: 0, width: 0, visible: false };

export function useSlidingIndicator(
  railRef: React.RefObject<HTMLElement | null>,
  activeRef: React.RefObject<HTMLElement | null>,
  /** What moves the active element (its id, the tab list, the fit); compared by value. */
  deps: readonly (string | number | boolean | null | undefined)[],
): SlidingIndicator {
  const [indicator, setIndicator] = React.useState<SlidingIndicator>(HIDDEN);
  const key = deps.map((d) => String(d)).join('\u0000');

  React.useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    const update = () => {
      const active = activeRef.current;
      if (!active || !rail.contains(active)) {
        setIndicator((current) => (current.visible ? HIDDEN : current));
        return;
      }
      const next = { left: active.offsetLeft, width: active.offsetWidth, visible: active.offsetWidth > 0 };
      setIndicator((current) =>
        current.left === next.left && current.width === next.width && current.visible === next.visible ? current : next,
      );
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(rail);
    if (activeRef.current) observer.observe(activeRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [railRef, activeRef, key]);

  return indicator;
}
