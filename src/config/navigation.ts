import type { NavChild, NavItem, VesselModule, VesselModuleNav } from './navigation-types';

export type { NavChild, NavItem, VesselModule, VesselModuleNav };

// Full sitemap-derived sidebar tree lives in ./sitemap.
export {
  NAVIGATION_ITEMS,
  PLACEHOLDER_LEAVES,
  VESSEL_MODULES,
  buildVesselNav,
  vesselModuleForPath,
} from './sitemap';
export type { SitemapLeaf, VesselNavOptions } from './sitemap';
