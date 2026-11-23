/**
 * A shell-owned state's own title (spec §7): the in-scope 404, "Vessel not
 * found", the access-denied and archived states, a module switched off. The
 * URL's nav entry names the page the user asked for; these states show
 * something else, so they tell the page header what they are, and the
 * document title and the breadcrumb follow the state shown, never the URL.
 *
 *   usePageLocationOverride({ title: 'Page not found' });
 *
 * `crumbs`:
 * - `scope-root` (default): the scope's root crumb (the vessel's name in the
 *   vessel scope, Fleet as plain text without fleet reach), then the title;
 * - `page`: the page's own crumbs (the page exists; only the title changes);
 * - `none`: the title alone (no scope to name, e.g. "Vessel not found").
 *
 * AppShell provides the channel around `<main>` (PageLocationOverrideProvider.tsx;
 * a separate file, so this one exports no component). The override is set in a
 * layout effect, so the header never paints the URL's title first, and is
 * cleared on unmount only while it is still the caller's own. Without a
 * provider (a state rendered outside the shell) the hook does nothing.
 */
import React from 'react';

export type PageLocationCrumbs = 'scope-root' | 'page' | 'none';

export interface PageLocationOverride {
  title: string;
  crumbs?: PageLocationCrumbs;
}

export type ResolvedPageLocationOverride = Required<PageLocationOverride>;

export interface OverrideSetter {
  set: (token: symbol, value: ResolvedPageLocationOverride) => void;
  clear: (token: symbol) => void;
}

export const OverrideValueContext = React.createContext<ResolvedPageLocationOverride | null>(null);
export const OverrideSetterContext = React.createContext<OverrideSetter | null>(null);

/** Names the page header after the state that renders it, while it is mounted. */
export function usePageLocationOverride({ title, crumbs = 'scope-root' }: PageLocationOverride): void {
  const setter = React.useContext(OverrideSetterContext);
  const [token] = React.useState(() => Symbol('page-location-override'));
  React.useLayoutEffect(() => {
    if (!setter) return undefined;
    setter.set(token, { title, crumbs });
    return () => setter.clear(token);
  }, [setter, token, title, crumbs]);
}

/** The override in force, if any (the page header reads it). */
export function useActivePageLocationOverride(): ResolvedPageLocationOverride | null {
  return React.useContext(OverrideValueContext);
}
