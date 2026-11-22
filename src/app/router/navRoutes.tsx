/**
 * Routes generated from the nav tree (src/config/sitemap.ts) for the Fleet
 * and vessel scopes, plus the retired Coming Soon URLs (BUILD-PLAN B7;
 * gap/00 "placeholders": Coming Soon only for planned leaves; D-06).
 *
 * The scoped ones are children of their scope route in src/routes/index.tsx,
 * with paths relative to `/fleet` or `/v/:vesselCode`, so the scope's reach
 * check and shell apply to them like to any page there. Every redirect here
 * keeps the query string and hash (KeepSearchNavigate).
 */
import React from 'react';
import { Route } from 'react-router-dom';
import { FLEET_PLACEHOLDER_LEAVES, VESSEL_PLACEHOLDER_LEAVES, VESSEL_ROOT_REDIRECTS } from '@/config/sitemap';
import KeepSearchNavigate from './KeepSearchNavigate';
import PlaceholderWrapper from './PlaceholderWrapper';
import { RETIRED_NAV_REDIRECTS } from './retiredNavPaths';

/** Inside `/fleet`: a Coming Soon page per planned Fleet leaf. */
export const fleetNavRoutes = (
  <>
    {FLEET_PLACEHOLDER_LEAVES.map((leaf) => (
      <Route key={leaf.path} path={leaf.path} element={<PlaceholderWrapper title={leaf.label} />} />
    ))}
  </>
);

/**
 * Inside `/v/:vesselCode`: module roots and groups with no page of their own
 * open their first leaf (preferring a real page), and each planned vessel leaf
 * gets a Coming Soon page.
 */
export const vesselNavRoutes = (
  <>
    {VESSEL_ROOT_REDIRECTS.map((redirect) => (
      <Route key={`root:${redirect.from}`} path={redirect.from} element={<KeepSearchNavigate to={redirect.to} />} />
    ))}
    {VESSEL_PLACEHOLDER_LEAVES.map((leaf) => (
      <Route key={leaf.path} path={leaf.path} element={<PlaceholderWrapper title={leaf.label} />} />
    ))}
  </>
);

/** Top level: the Coming Soon URLs the old Fleet and Vessel trees made up, to their replacements. */
export const retiredNavRoutes = (
  <>
    {RETIRED_NAV_REDIRECTS.map((redirect) => (
      <Route key={redirect.from} path={redirect.from} element={<KeepSearchNavigate to={redirect.to} />} />
    ))}
  </>
);
