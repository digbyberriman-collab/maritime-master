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

const pathnameOf = (path: string): string => path.split('?')[0] || '/';

function titleCase(value: string): string {
  return decodeURIComponent(value)
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

  const visit = (node: NavigationNode, ancestors: NavigationNode[], depth: number) => {
    const nodePath = pathnameOf(node.path);
    const exact = pathname === nodePath;
    const descendant = nodePath !== '/' && pathname.startsWith(`${nodePath}/`);
    if (exact || descendant) {
      const queryBonus = exact && routeQueryMatches(node.path, search) ? 500 : 0;
      const leafBonus = node.children?.length ? 0 : 100;
      const score = (exact ? 10_000 : 1_000) + nodePath.length + depth * 10 + queryBonus + leafBonus;
      if (!best || score > best.score) best = { node, trail: [...ancestors, node], score };
    }
    node.children?.forEach((child) => visit(child, [...ancestors, node], depth + 1));
  };

  modules.forEach((module) => visit(module, [], 0));
  return best;
}

function detailCrumb(pathname: string, matchedPath: string, parentLabel: string): PageCrumb | null {
  const suffix = pathname.slice(matchedPath.length).split('/').filter(Boolean);
  if (!suffix.length) return null;
  const finalSegment = suffix[suffix.length - 1];
  if (!finalSegment) return null;
  const action = ACTION_LABELS[finalSegment.toLowerCase()];
  if (action) return { label: action };
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
    const crumbs = match.trail.map((item, index) => ({
      label: item.label,
      path: index < match.trail.length - 1 ? item.path : undefined,
    }));
    const matchedPath = pathnameOf(match.node.path);
    const detail = detailCrumb(pathname, matchedPath, match.node.label);
    if (detail) {
      crumbs[crumbs.length - 1] = { label: match.node.label, path: match.node.path };
      crumbs.push(detail);
    }
    const title = crumbs[crumbs.length - 1]?.label ?? match.node.label;
    return { crumbs, title };
  }

  const segments = pathname.split('/').filter(Boolean);
  const title = titleCase(segments[segments.length - 1] ?? 'Dashboard');
  return { crumbs: [{ label: title }], title };
}