/**
 * The current page as a favourite (gap/10 top bar element 6; spec §6.4): the
 * scope-qualified URL (`/v/dra/crew/list?tab=active`), the page's nav title
 * and an icon key for the page's scope.
 *
 * Null on a vessel page whose vessel has not resolved (an unknown,
 * unreachable or sold vessel, and while it resolves): that page has no title
 * of its own yet and must not be pinned under another vessel's nav (D-04).
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useScope } from '@/app/router/scopeContext';
import type { AvailableShortcut } from '@/shared/hooks/usePinnedShortcuts';
import { useCurrentPageNavigation } from '../useActiveNavModule';

const SCOPE_ICON: Readonly<Record<string, string>> = {
  vessel: 'ship',
  fleet: 'layout-dashboard',
  workspace: 'briefcase',
  personal: 'user',
};

export function useCurrentFavourite(): AvailableShortcut | null {
  const { pathname, search } = useLocation();
  const { scope, vessel } = useScope();
  const page = useCurrentPageNavigation();
  const unresolved = scope === 'vessel' && !vessel;
  return useMemo(
    () => (unresolved ? null : { target: `${pathname}${search}`, label: page.title, icon: SCOPE_ICON[scope] ?? 'file-text' }),
    [unresolved, pathname, search, page.title, scope],
  );
}
