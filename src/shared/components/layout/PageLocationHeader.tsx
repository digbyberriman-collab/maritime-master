/**
 * The page's location (gap/10 IA17; heading contract, spec §7; deferred
 * item 4): one breadcrumb row above every page, and the shell's fallback h1
 * only when the page brings none.
 *
 * - The breadcrumb row always renders (`nav aria-label="Breadcrumb"`, caption
 *   size, the current crumb `aria-current="page"`). Below 640 px a trail of
 *   four or more crumbs folds its middle into a "…" menu, so the row never
 *   pushes the page sideways. Crumb links have a 44 px hit area on touch.
 * - The page owns its h1 (`PageHeader`, or a legacy page's own `<h1>`). The
 *   shell adds `<h1 data-testid="shell-page-title">` with the nav title only
 *   once the page has settled with no h1 of its own (usePageHeadingPresence),
 *   so a page never shows two headings and never flashes a second one.
 * - `document.title` is "<title> | STORM".
 * - Vessel scope: crumbs carry the vessel's label overrides (Planner →
 *   "Leave", through useCurrentPageNavigation), the root crumb is the vessel's
 *   name, and links open the same vessel (no literal `:vesselCode`).
 * - A crumb into a scope the user cannot reach (Fleet without fleet reach)
 *   is plain text, never a link they cannot open (deferred item 1). Section
 *   headings ("Overview") are labels in the trail, not links.
 * - A shell-owned state (the in-scope 404, "Vessel not found", no access,
 *   archived, a module switched off) names itself through
 *   `usePageLocationOverride` (./pageLocationOverride.ts): the document
 *   title and the current crumb are the state's, never the URL's nav title.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useNavAccess } from '@/app/nav/navAccess';
import { useScope } from '@/app/router/scopeContext';
import { VESSEL_SCOPE_PATTERN, vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { PageCrumb } from '@/shared/lib/pageNavigation';
import { useCurrentPageNavigation } from './useActiveNavModule';
import { usePageHeadingPresence } from './usePageHeadingPresence';
import { useActivePageLocationOverride, type ResolvedPageLocationOverride } from './pageLocationOverride';

/** A crumb as the row draws it: a link, or plain text. */
interface ShownCrumb {
  key: string;
  label: string;
  href: string | null;
}

/** Trails this long fold their middle crumbs into "…" below 640 px. */
const FOLD_FROM = 4;

const pathnameOf = (path: string): string => path.split(/[?#]/)[0] || '/';

/** Fleet pages (and the legacy "Fleet" crumb, which lands on the fleet dashboard). */
const isFleetTarget = (path: string): boolean => {
  const pathname = pathnameOf(path);
  return pathname === '/fleet' || pathname.startsWith('/fleet/') || pathname === '/dashboard';
};

/** The nav tree's `/v/:vesselCode/…` pattern, on the vessel in scope. */
function onVessel(path: string, code: string | null): string | null {
  if (!path.startsWith(VESSEL_SCOPE_PATTERN)) return path;
  if (!code) return null;
  const rest = path.slice(VESSEL_SCOPE_PATTERN.length).replace(/^\//, '');
  return vesselPath(code, rest);
}

const crumbText = 'min-w-0 max-w-[14rem] truncate';

const crumbLink = cn(
  'inline-flex min-w-0 items-center rounded-sm transition-colors duration-quick ease-tide hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  // 44 px both ways on touch (D-35); emitted after min-w-0, so fine pointers still truncate.
  '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:justify-center',
);

const Separator: React.FC = () => (
  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden="true" />
);

/**
 * The trail a shell-owned state shows (see ./pageLocationOverride.ts):
 * `page` keeps the page's crumbs, `none` is the title alone, `scope-root` the
 * scope's root crumb (when there is one to name: the vessel scope needs a
 * resolved vessel) and then the title.
 */
function overrideTrail(page: readonly PageCrumb[], override: ResolvedPageLocationOverride, vesselName: string | null): PageCrumb[] {
  if (override.crumbs === 'page') return [...page];
  const title: PageCrumb = { label: override.title };
  if (override.crumbs === 'none') return [title];
  const root = page.length > 1 ? page[0] : undefined;
  if (!root || root.section || (root.path === VESSEL_SCOPE_PATTERN && !vesselName)) return [title];
  return [root, title];
}

/** Rendered by AppShell as the first child of `<main>`, where it looks for the page's own h1. */
const PageLocationHeader: React.FC = () => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const page = useCurrentPageNavigation();
  const override = useActivePageLocationOverride();
  const scope = useScope();
  const { fleetReach } = useNavAccess();
  const { hasPageHeading, settled } = usePageHeadingPresence(rootRef);

  const vesselCode = scope.scope === 'vessel' ? scope.vesselCode ?? null : null;
  const vesselName = scope.scope === 'vessel' ? scope.vessel?.name ?? null : null;
  const title = override?.title ?? page.title;

  React.useEffect(() => {
    document.title = `${title} | STORM`;
  }, [title]);

  const trail = React.useMemo<PageCrumb[]>(
    () => (override ? overrideTrail(page.crumbs, override, vesselName) : page.crumbs),
    [page.crumbs, override, vesselName],
  );

  const crumbs = React.useMemo<ShownCrumb[]>(
    () =>
      trail.map((crumb: PageCrumb, index) => {
        const current = index === trail.length - 1;
        // The vessel scope's root crumb names the vessel.
        const label = index === 0 && vesselName && crumb.path === VESSEL_SCOPE_PATTERN ? vesselName : crumb.label;
        let href: string | null = !current && crumb.path && !crumb.section ? onVessel(crumb.path, vesselCode) : null;
        if (href && isFleetTarget(href) && !fleetReach) href = null;
        return { key: `${index}-${crumb.label}`, label, href };
      }),
    [trail, vesselCode, vesselName, fleetReach],
  );

  const fold = crumbs.length >= FOLD_FROM;
  const middle = fold ? crumbs.slice(1, -1) : [];
  const showFallback = settled && !hasPageHeading;

  return (
    <div ref={rootRef} data-testid={SHELL_TEST_IDS.pageHeader} className={cn('min-w-0', showFallback ? 'mb-3' : 'mb-2')}>
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="type-caption flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground">
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1;
            const hiddenOnNarrow = fold && index > 0 && !current;
            return (
              <React.Fragment key={crumb.key}>
                {fold && index === 1 && (
                  <li className="inline-flex items-center gap-1.5 sm:hidden">
                    <Separator />
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Show the full path"
                        className={cn(
                          'inline-flex h-5 w-6 items-center justify-center rounded-sm hover:bg-accent hover:text-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
                        )}
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-w-[calc(100vw-2rem)]">
                        {middle.map((hidden) =>
                          hidden.href ? (
                            <DropdownMenuItem key={hidden.key} asChild>
                              <Link to={hidden.href}>{hidden.label}</Link>
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem key={hidden.key} disabled>
                              {hidden.label}
                            </DropdownMenuItem>
                          ),
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )}
                <li className={cn('min-w-0 items-center gap-1.5', hiddenOnNarrow ? 'hidden sm:inline-flex' : 'inline-flex')}>
                  {index > 0 && <Separator />}
                  {current ? (
                    <span aria-current="page" className={cn(crumbText, 'text-foreground')}>
                      {crumb.label}
                    </span>
                  ) : crumb.href ? (
                    <Link to={crumb.href} className={crumbLink}>
                      <span className={crumbText}>{crumb.label}</span>
                    </Link>
                  ) : (
                    <span className={crumbText}>{crumb.label}</span>
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      </nav>
      {showFallback && (
        <h1
          data-testid={SHELL_TEST_IDS.fallbackHeading}
          data-shell-heading=""
          className="type-display mt-1 min-w-0 break-words text-foreground"
        >
          {title}
        </h1>
      )}
    </div>
  );
};

export default PageLocationHeader;
