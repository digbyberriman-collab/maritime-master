import { NAVIGATION_ITEMS, type NavChild, type NavItem } from '@/config/navigation';

export type ModuleNavigationItem = NavItem;

const pathnameOf = (path: string) => path.split('?')[0] || '/';

function pathScore(item: NavItem | NavChild, pathname: string): number {
  const itemPath = pathnameOf(item.path);
  let score = pathname === itemPath ? itemPath.length + 1000 : pathname.startsWith(`${itemPath}/`) ? itemPath.length : -1;

  item.children?.forEach((child) => {
    score = Math.max(score, pathScore(child, pathname));
  });

  return score;
}

export function resolveModuleForPath(pathname: string): NavItem | null {
  if (pathname === '/' || pathname === '/dashboard' || pathname === '/index') return null;

  let best: NavItem | null = null;
  let bestScore = -1;
  NAVIGATION_ITEMS.forEach((item) => {
    const score = pathScore(item, pathname);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  });

  return best;
}
