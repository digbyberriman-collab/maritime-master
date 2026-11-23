import { NAVIGATION_ITEMS, type NavChild, type NavItem } from '@/config/navigation';

export type ModuleNavigationItem = NavItem;

const pathnameOf = (path: string) => path.split('?')[0] || '/';

/** `pathname` is lower case: paths compare case-insensitively, like the router (D-111). */
function pathScore(item: NavItem | NavChild, pathname: string): number {
  // Cross-links point at pages owned by another module and must not claim them.
  if ('crossLink' in item && item.crossLink) return -1;
  const itemPath = pathnameOf(item.path).toLowerCase();
  let score = pathname === itemPath ? itemPath.length + 1000 : pathname.startsWith(`${itemPath}/`) ? itemPath.length : -1;

  item.children?.forEach((child) => {
    score = Math.max(score, pathScore(child, pathname));
  });

  return score;
}

export function resolveModuleForPath(pathname: string): NavItem | null {
  const key = pathname.toLowerCase();
  if (key === '/' || key === '/dashboard' || key === '/index') return null;

  let best: NavItem | null = null;
  let bestScore = -1;
  NAVIGATION_ITEMS.forEach((item) => {
    const score = pathScore(item, key);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  });

  return best;
}
