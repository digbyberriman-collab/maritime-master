/**
 * The current page as a favourite (gap/10 top bar element 6; spec §6.4): the
 * scope-qualified URL (`/v/dra/crew/list?tab=active`), the page's nav title
 * and an icon key for the page's scope.
 *
 * Null on a vessel page whose vessel has not resolved (an unknown,
 * unreachable or sold vessel, and while it resolves): that page has no title
 * of its own yet and must not be pinned under another vessel's nav (D-04).
 * Null too on a shell-owned state other than ModuleOff (the in-scope 404,
 * "Vessel not found", access denied, archived, no vessel, the module-settings
 * error): it names itself through the page location override with
 * `scope-root` or `none` crumbs, and is not a page to pin (D-93, D-96).
 * ModuleOff keeps its page's crumbs (`page`): that page exists, so it can be
 * pinned under its nav title. Outside a provider the override is null.
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useScope } from '@/app/router/scopeContext';
import type { AvailableShortcut } from '@/shared/hooks/usePinnedShortcuts';
import { useCurrentPageNavigation } from '../useActiveNavModule';
import { useActivePageLocationOverride } from '../pageLocationOverride';

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
  const override = useActivePageLocationOverride();
  const notAPage = override !== null && override.crumbs !== 'page';
  return useMemo(
    () =>
      unresolved || notAPage ? null : { target: `${pathname}${search}`, label: page.title, icon: SCOPE_ICON[scope] ?? 'file-text' },
    [unresolved, notAPage, pathname, search, page.title, scope],
  );
}
