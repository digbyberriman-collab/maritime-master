import { NAVIGATION_ITEMS, type NavChild, type NavItem } from '@/config/navigation';

export interface PageCrumb {
  label: string;
  path?: string;
}

export interface PageNavigation {
  crumbs: PageCrumb[];
  title: string;
}

type NavigationNode = NavItem | NavChild;

const SPECIAL_PAGES: Record<string, PageNavigation> = {
  '/': { crumbs: [{ label: 'Fleet', path: '/dashboard' }, { label: 'Fleet Dashboard' }], title: 'Fleet Dashboard' },
  '/index': { crumbs: [{ label: 'Fleet', path: '/dashboard' }, { label: 'Fleet Dashboard' }], title: 'Fleet Dashboard' },
  '/help/how-to-guides': { crumbs: [{ label: 'Help' }, { label: 'How-to Guides' }], title: 'How-to Guides' },
  '/help/support': { crumbs: [{ label: 'Help' }, { label: 'Support' }], title: 'Support' },
  '/notifications/center': { crumbs: [{ label: 'Fleet', path: '/dashboard' }, { label: 'Notification Center' }], title: 'Notification Center' },
  '/legal/privacy-policy': { crumbs: [{ label: 'Legal' }, { label: 'Privacy Policy' }], title: 'Privacy Policy' },
  '/legal/terms-of-service': { crumbs: [{ label: 'Legal' }, { label: 'Terms of Service' }], title: 'Terms of Service' },
};

const ACTION_LABELS: Record<string, string> = {
  new: 'New',
  create: 'Create',
  edit: 'Edit',
  review: 'Review',
  details: 'Details',
};

const DETAIL_LABELS: Record<string, string> = {
  official: 'Official Logbook',
  deck: 'Deck & Bridge Logbook',
  engine: 'Engine Room Logbook',
  'engine-log': 'Engine Room Logbook',
  garbage: 'Garbage Record Book',
  gmdss: 'GMDSS Radio Logbook',
  oil: 'Oil Record Book',
  ihm: 'IHM Maintenance Logbook',
  orders: 'Standing & Night Orders',
  bell: 'Bell Book',
  visitor: 'Visitor & Guest Log',
};

/**
 * Pages the nav tree does not name a leaf for, by route pattern (the
 * pathname as the shell passes it: vessel URLs already on the
 * `/v/:vesselCode` pattern). `label` replaces the last crumb and is the page
 * title; `parent` is a crumb inserted before it. Without these the last
 * crumb would be the URL segment (`Crew`, `Sets`, `Capa Tracker`).
 */
interface ScopedTitle {
  label: string;
  parent?: PageCrumb;
}

const SCOPED_TITLES: ReadonlyArray<readonly [pattern: string, title: ScopedTitle]> = [
  // Fleet › Administration › Users & Access tabs (gap/03).
  ['/fleet/admin/users/crew', { label: 'Vessel Crew' }],
  ['/fleet/admin/users/sets', { label: 'Access Sets' }],
  // Fleet › Reports (gap/02).
  ['/fleet/reports', { label: 'Fleet Reports' }],
  ['/fleet/reports/capa-tracker', { label: 'CAPA Tracker' }],
  // Vessel › Crew (gap/04): one crew member's month, under Hours of Rest.
  [
    '/v/:vesselCode/crew/people/:crewId/hours-of-rest',
    { label: 'Crew member hours', parent: { label: 'Hours of Rest', path: '/v/:vesselCode/crew/hours-of-rest' } },
  ],
  // Crew Compliance and Planner tabs (gap/04 /crew/compliance/:tab, /crew/planner/:tab).
  ['/v/:vesselCode/crew/compliance/status', { label: 'Compliance Status' }],
  ['/v/:vesselCode/crew/compliance/configuration', { label: 'Compliance Configuration' }],
  ['/v/:vesselCode/crew/planner/timeline', { label: 'Rotation Timeline' }],
  ['/v/:vesselCode/crew/planner/manning', { label: 'Manning' }],
  ['/v/:vesselCode/crew/planner/requests', { label: 'Leave Requests' }],
  ['/v/:vesselCode/crew/planner/configuration', { label: 'Planner Configuration' }],
];

/** Segment-wise match; a `:param` segment of the pattern takes any one segment. */
function matchesPattern(pattern: string, pathname: string): boolean {
  const want = pattern.split('/');
  const got = pathname.replace(/\/+$/, '').split('/');
  return want.length === got.length && want.every((segment, i) => segment === got[i] || (segment.startsWith(':') && got[i] !== ''));
}

const scopedTitleFor = (pathname: string): ScopedTitle | null =>
  SCOPED_TITLES.find(([pattern]) => matchesPattern(pattern, pathname))?.[1] ?? null;

const pathnameOf = (path: string): string => path.split('?')[0] || '/';

/** Decoded, or as written when the escape is malformed (never throws during render). */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function titleCase(value: string): string {
  return safeDecode(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecordIdentifier(value: string): boolean {
  return /^\d+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
}

function routeQueryMatches(routePath: string, currentSearch: string): boolean {
  const routeQuery = routePath.split('?')[1];
  if (!routeQuery) return true;
  const expected = new URLSearchParams(routeQuery);
  const current = new URLSearchParams(currentSearch);
  return Array.from(expected.entries()).every(([key, value]) => current.get(key) === value);
}

interface Match {
  node: NavigationNode;
  trail: NavigationNode[];
  score: number;
}

function findBestMatch(pathname: string, search: string, activeModuleId?: string | null): Match | null {
  let best: Match | null = null;
  const modules = activeModuleId
    ? NAVIGATION_ITEMS.filter((item) => item.id === activeModuleId)
    : NAVIGATION_ITEMS;

  // The module node itself (Fleet at /fleet, Vessel at /v/:vesselCode) may
  // still be an ancestor of any page in it: it has children, so it scores
  // lowest of all descendant matches and only wins when nothing deeper does,
  // which keeps the scope root crumb on an unmatched in-scope URL (the
  // in-scope 404). Nodes below it that sit on the root path (the vessel Home
  // leaf, Fleet's section headings at /fleet) match exactly only, as in the
  // sidebar (SidebarNavigation activeLeafPath); otherwise a page with no
  // leaf of its own would land under Home or Overview.
  const visit = (node: NavigationNode, ancestors: NavigationNode[], depth: number, moduleRoot: string) => {
    const nodePath = pathnameOf(node.path);
    const exact = pathname === nodePath;
    const descendant = nodePath !== '/' && (depth === 0 || nodePath !== moduleRoot) && pathname.startsWith(`${nodePath}/`);
    if (exact || descendant) {
      const queryBonus = exact && routeQueryMatches(node.path, search) ? 500 : 0;
      const leafBonus = node.children?.length ? 0 : 100;
      const score = (exact ? 10_000 : 1_000) + nodePath.length + depth * 10 + queryBonus + leafBonus;
      if (!best || score > best.score) best = { node, trail: [...ancestors, node], score };
    }
    node.children?.forEach((child) => visit(child, [...ancestors, node], depth + 1, moduleRoot));
  };

  modules.forEach((module) => visit(module, [], 0, pathnameOf(module.path)));
  return best;
}

function detailCrumb(pathname: string, matchedPath: string, parentLabel: string): PageCrumb | null {
  const suffix = pathname.slice(matchedPath.length).split('/').filter(Boolean);
  if (!suffix.length) return null;
  const finalSegment = suffix[suffix.length - 1];
  if (!finalSegment) return null;
  const action = ACTION_LABELS[finalSegment.toLowerCase()];
  if (action) return { label: action };
  const knownDetail = DETAIL_LABELS[finalSegment.toLowerCase()];
  if (knownDetail) return { label: knownDetail };
  if (isRecordIdentifier(finalSegment)) return { label: `${parentLabel} Details` };
  return { label: titleCase(finalSegment) };
}

export function resolvePageNavigation(
  pathname: string,
  search = '',
  activeModuleId?: string | null,
): PageNavigation {
  const special = SPECIAL_PAGES[pathname];
  if (special) return special;

  const match = findBestMatch(pathname, search, activeModuleId);
  if (match) {
    const crumbs: PageCrumb[] = match.trail.map((item, index) => ({
      label: item.label,
      path: index < match.trail.length - 1 ? item.path : undefined,
    }));
    const matchedPath = pathnameOf(match.node.path);
    const detail = detailCrumb(pathname, matchedPath, match.node.label);
    if (detail) {
      crumbs[crumbs.length - 1] = { label: match.node.label, path: match.node.path };
      crumbs.push(detail);
    }
    const scoped = scopedTitleFor(pathname);
    if (scoped) {
      const last = crumbs.length - 1;
      crumbs[last] = { label: scoped.label };
      if (scoped.parent && crumbs[last - 1]?.label !== scoped.parent.label) crumbs.splice(last, 0, scoped.parent);
    }
    const title = crumbs[crumbs.length - 1]?.label ?? match.node.label;
    return { crumbs, title };
  }

  const segments = pathname.split('/').filter(Boolean);
  const title = titleCase(segments[segments.length - 1] ?? 'Dashboard');
  return { crumbs: [{ label: title }], title };
}