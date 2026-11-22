import * as React from 'react';
import { observeElementRect, useVirtualizer } from '@tanstack/react-virtual';
import { useDensity } from '@/components/ui/use-density';
import type { Density } from '@/components/ui/theme-config';
import { ROW_HEIGHT, VIRTUALIZE_THRESHOLD } from './tableModel';

export interface TableVirtualizerOptions {
  /** Rows after search, chips and sort. */
  count: number;
  scrollRef: React.RefObject<HTMLElement>;
  /** The table's own density, or undefined to follow the global setting. */
  density?: Density;
  threshold?: number;
  overscan?: number;
}

export interface TableVirtualWindow {
  virtualised: boolean;
  /** Indexes to render (every row when not virtualised). */
  indexes: number[];
  /** Spacer heights above and below the rendered window, in px. */
  paddingTop: number;
  paddingBottom: number;
  /** Pass to each rendered row as `ref`, with `data-index`, so real heights are measured. */
  measureRow: (node: Element | null) => void;
  effectiveDensity: Density;
}

const noop = () => undefined;

/** Viewport height assumed while the scroll area has no layout yet (hidden tab, jsdom). */
const FALLBACK_VIEWPORT = 600;

/**
 * Row windowing for `DataTable` and `MatrixGrid` (gap/10 §A.10): above the
 * threshold (200 rows by default) only the rows in view plus an overscan are
 * in the DOM, with spacer rows keeping the scroll height honest. Row height
 * starts from the density (44 / 40 / 32 px) and is then measured.
 */
export function useTableVirtualizer({
  count,
  scrollRef,
  density,
  threshold = VIRTUALIZE_THRESHOLD,
  overscan = 12,
}: TableVirtualizerOptions): TableVirtualWindow {
  const [globalDensity] = useDensity();
  const effectiveDensity = density ?? globalDensity;
  const estimate = ROW_HEIGHT[effectiveDensity] ?? ROW_HEIGHT.default;
  const virtualised = count > threshold;

  const virtualizer = useVirtualizer({
    count: virtualised ? count : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimate,
    overscan,
    // Measured height, falling back to the density estimate where layout is
    // unavailable (jsdom, a hidden tab).
    measureElement: (element) => element.getBoundingClientRect().height || estimate,
    initialRect: { width: 0, height: FALLBACK_VIEWPORT },
    // A scroll area without layout reports 0 px, which would render no rows
    // at all; assume a screenful until it has a real size.
    observeElementRect: (instance, cb) =>
      observeElementRect(instance, (rect) => cb(rect.height > 0 ? rect : { width: rect.width, height: FALLBACK_VIEWPORT })),
  });

  // A density switch changes every row height.
  React.useEffect(() => {
    if (virtualised) virtualizer.measure();
  }, [estimate, virtualised, virtualizer]);

  if (!virtualised) {
    return {
      virtualised: false,
      indexes: Array.from({ length: count }, (_, i) => i),
      paddingTop: 0,
      paddingBottom: 0,
      measureRow: noop,
      effectiveDensity,
    };
  }

  const items = virtualizer.getVirtualItems();
  const total = virtualizer.getTotalSize();
  const first = items[0];
  const last = items[items.length - 1];
  return {
    virtualised: true,
    indexes: items.map((item) => item.index),
    paddingTop: first ? first.start : 0,
    paddingBottom: last ? Math.max(0, total - last.end) : 0,
    measureRow: virtualizer.measureElement,
    effectiveDensity,
  };
}
