import React from 'react';
import { cn } from '@/lib/utils';
import { StormMark } from './StormMark';

interface StormWordmarkProps {
  className?: string;
  /** `lg` on the sign-in screens, `md` on standalone pages (404). */
  size?: 'md' | 'lg';
}

const SIZES = {
  md: { tile: 'size-9 rounded-[10px]', glyph: 'size-7', name: 'text-xl tracking-[0.16em]', product: 'mt-1' },
  lg: { tile: 'size-12 rounded-[13px]', glyph: 'size-10', name: 'text-[1.75rem] tracking-[0.18em]', product: 'mt-1.5' },
} as const;

/**
 * STORM / Maritime Master wordmark (BUILD-PLAN S6, gap/10 DS22).
 *
 * Tenant-neutral product branding: the tenant's own logo belongs to the shell
 * (TenantLogo), and Inkfish stays in the footer and watermark only (D-DS5).
 * The tile is "Signal on Abyss" in both themes, like the app icon and the
 * sidebar (anchored chrome), so it uses the raw scales on purpose.
 */
export function StormWordmark({ className, size = 'lg' }: StormWordmarkProps) {
  const s = SIZES[size];
  return (
    <div className={cn('inline-flex items-center gap-3', className)} data-storm-wordmark="">
      <span
        aria-hidden="true"
        className={cn(
          'grid shrink-0 place-items-center bg-abyss-900 text-signal-500 shadow-glow-signal ring-1 ring-inset ring-signal-500/25',
          s.tile,
        )}
      >
        <StormMark className={s.glyph} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn('font-display font-semibold uppercase leading-none text-foreground', s.name)}>STORM</span>
        <span className={cn('type-eyebrow text-muted-foreground', s.product)}>Maritime Master</span>
      </span>
    </div>
  );
}

export default StormWordmark;
