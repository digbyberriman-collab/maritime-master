/**
 * Shared class lists for top-bar controls (gap/10 A.5 focus, A.7 density,
 * DS26 icons): icon buttons take their size from `--control-h` (36 px by
 * default, 44 px on touch in every density, D-35), icons are 20 px at stroke
 * 1.75, and every control shows the one focus ring.
 */

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const topBarIconButton = [
  'inline-flex h-[var(--control-h)] w-[var(--control-h)] shrink-0 items-center justify-center rounded-md',
  'text-muted-foreground transition-colors duration-quick ease-tide hover:bg-accent hover:text-foreground',
  'data-[state=open]:bg-accent data-[state=open]:text-foreground disabled:pointer-events-none disabled:opacity-50',
  '[&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0',
  focusRing,
].join(' ');
