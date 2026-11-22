/**
 * Inkfish watermark (D-DS5: Inkfish branding stays only in the footer and
 * this watermark; gap/10 DS24).
 *
 * Stacking contract (Phase 1 spec §3, §11.3): the watermark is
 * `fixed inset-0 -z-10`, so it paints in the nearest stacking context's
 * negative layer: above that context's own background, below every in-flow
 * block. The shell's root (AppShell) is `relative isolate bg-background` and
 * renders this as its first child, so the order is page background →
 * watermark → content, and an opaque card (`Card` carries an opaque
 * `bg-card` underlay) always hides it. Outside such a root (no `isolate`),
 * it sits behind the page background and is simply not seen; it never paints
 * over content.
 *
 * Strength comes from the theme, not from this file: `--watermark-opacity`
 * (about 2 % on Abyss, 1.5 % in Daylight and on paper) and
 * `--watermark-invert` (a light silhouette on dark, a dark one on light),
 * both in `src/index.css`. It is decorative: `aria-hidden`, no pointer
 * events, not selectable, never lifts text contrast.
 */
import React, { useState } from 'react';

export const InkfishWatermark: React.FC = () => {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      data-watermark="inkfish"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 flex select-none items-center justify-center overflow-hidden opacity-[var(--watermark-opacity)]"
    >
      <div className="relative flex aspect-square w-[70%] max-w-[600px] translate-y-[5%] items-center justify-center sm:w-[60%] lg:w-[50%]">
        {!imageError ? (
          <img
            src="/assets/inkfish-logo.png"
            alt=""
            className="h-full w-full object-contain [filter:brightness(0)_invert(var(--watermark-invert))]"
            onError={() => setImageError(true)}
            draggable={false}
          />
        ) : (
          <div className="whitespace-nowrap text-[8rem] font-bold text-foreground sm:text-[10rem] lg:text-[12rem]">
            Powered by Inkfish
          </div>
        )}
      </div>
    </div>
  );
};

export default InkfishWatermark;
