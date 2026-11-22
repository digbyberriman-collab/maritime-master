/**
 * The STORM mark (original artwork, BUILD-PLAN S6): two arms of a cyclone
 * turning round an open eye, which also reads as the S of STORM.
 *
 * Geometry on a 48-unit grid centred on 24,24. The furthest point (an arm
 * tip plus half the stroke) is 18.3 units from the centre, inside the 19.2
 * unit maskable safe zone (40 % of the side), so the same drawing serves the
 * in-app mark and the PWA icons. public/icons/storm-mark.svg and
 * public/icons/favicon.svg draw these exact paths; src/test/app/manifest.test.ts
 * keeps them in step.
 */
export const STORM_MARK_GRID = 48;

export const STORM_MARK_ARMS = [
  'M24 18a6 6 0 0 1 6 6c0 8.5-6.5 13.5-15.5 13.5',
  'M24 30a6 6 0 0 1-6-6c0-8.5 6.5-13.5 15.5-13.5',
] as const;

export const STORM_MARK_EYE = { cx: 24, cy: 24, r: 2.2 } as const;

export const STORM_MARK_STROKE = 3.6;
