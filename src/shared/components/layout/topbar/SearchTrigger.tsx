/**
 * The top bar's search trigger (gap/10 top bar element 5; spec §6.8): an icon
 * button below 1280 px, an input-looking 280 px button with the ⌘K / Ctrl K
 * hint from 1280 px. It opens the command palette, and warms the palette's
 * lazy dialog on hover and focus so the first open is instant. Without a
 * palette (no provider) it is disabled rather than dead.
 */
import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { preloadCommandPalette, useCommandPalette } from '@/shared/components/command-palette';
import { isApplePlatform } from '@/app/shell/keyboard';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';

const SearchTrigger: React.FC<{ className?: string }> = ({ className }) => {
  const palette = useCommandPalette();
  const apple = isApplePlatform();
  const hint = apple ? '⌘K' : 'Ctrl K';
  return (
    <button
      type="button"
      data-testid={SHELL_TEST_IDS.searchTrigger}
      onClick={() => palette.open()}
      onPointerEnter={preloadCommandPalette}
      onFocus={preloadCommandPalette}
      disabled={!palette.available}
      aria-label="Search STORM"
      aria-haspopup="dialog"
      aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'}
      title={`Search STORM (${hint})`}
      className={cn(
        'group inline-flex h-[var(--control-h)] min-w-[var(--control-h)] shrink-0 items-center justify-center gap-2 rounded-md text-muted-foreground transition-colors duration-quick ease-tide',
        'hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'xl:h-9 xl:w-[280px] xl:justify-start xl:border xl:border-input xl:bg-field xl:px-3 xl:hover:border-primary/40 xl:hover:bg-field',
        className,
      )}
    >
      <Search className="h-5 w-5 shrink-0 xl:h-4 xl:w-4" strokeWidth={1.75} aria-hidden="true" />
      <span className="type-body hidden flex-1 truncate text-left xl:inline">Search STORM…</span>
      <kbd
        aria-hidden="true"
        className="type-mono hidden shrink-0 rounded-sm border border-border bg-muted px-1.5 text-[0.6875rem] leading-5 text-muted-foreground xl:inline"
      >
        {hint}
      </kbd>
    </button>
  );
};

export default SearchTrigger;
