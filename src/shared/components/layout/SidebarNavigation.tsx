/**
 * The shell's sidebar tree (gap/10 IA6, IA7, IA20, IA21; spec §4.5). It draws
 * the nodes it is given; which tree, and what the viewer may see in it, is
 * decided upstream (`useShellSidebar`: `useNavNodeFilter().decide` +
 * `filterNavTree`, one copy of the gates for every surface).
 *
 * - Sections are non-interactive eyebrow headings that label their leaves;
 *   collapsed to icons they become separators.
 * - Collapsed to icons, each row (leaf, group, locked add-on) names itself
 *   in a tooltip to its right, with its status, on hover and keyboard focus
 *   (never on touch): the top bar's icon tooltip (IconTooltip, D-92),
 *   portalled so the scroll container cannot clip it. The rows keep their
 *   aria-labels; the tooltip only describes them.
 * - The current page's leaf is lit (`bg-sidebar-accent`, Signal text and a
 *   2 px glowing bar). Exact match wins; otherwise the longest leaf the URL
 *   sits under. A leaf on the tree's own root counts only on an exact match.
 * - Locked add-ons show a lock and open the add-on explanation.
 * - Planned leaves (shown with Show roadmap on) carry a small dashed-circle
 *   mark rather than a text chip, so the label keeps its width; the row's
 *   accessible name says ", planned". A label that still truncates has its
 *   full text as a tooltip.
 * - Badges come from the registry (./../../../app/nav/badges.ts); none for an
 *   unknown key or a count of 0.
 * - Links follow the `?module=` rule (src/app/nav/sidebarLinks.ts).
 * - The sidebar is Abyss in both themes, so only `sidebar-*` tokens are used.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, CircleDashed, Lock, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FilteredNavNode } from '@/app/nav/navTree';
import { descendantBadgeKey } from '@/app/nav/navTree';
import { navKindOf } from '@/app/nav/visibility';
import { useNavBadges, type NavBadge } from '@/app/nav/badges';
import { sidebarHref } from '@/app/nav/sidebarLinks';
import { toNavPathname } from '@/app/router/legacyResolve';
import AddOnLock from './AddOnLock';
import IconTooltip from './IconTooltip';

export interface SidebarNavigationProps {
  nodes: readonly FilteredNavNode[];
  /** The tree's name and icon, shown above it ("Fleet", "Crew"). */
  heading: { label: string; icon: LucideIcon } | null;
  /** The tree's own root path: a leaf on it is current only on an exact match (the vessel home). */
  rootPath?: string | null;
  /** Workspace and legacy trees: the id `?module=` carries (D-45). */
  moduleParam?: string | null;
  /** Still deciding what to show: skeleton rows, never unfiltered nodes. */
  loading?: boolean;
  onNavigate?: () => void;
  /**
   * Icon-only rendering: each row's label and status become a tooltip to its
   * right (hover and keyboard focus); accessible names are unchanged.
   */
  collapsed?: boolean;
  /** Called when a collapsed group icon is clicked so the layout can expand. */
  onExpand?: () => void;
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar';

const rowBase = cn(
  'relative flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 pr-2 text-left transition-colors duration-quick ease-tide [@media(pointer:coarse)]:min-h-11',
  focusRing,
);

const DEPTH_PADDING = ['pl-3', 'pl-2.5', 'pl-2.5', 'pl-2.5'];

const badgeTone = (badge: NavBadge) =>
  badge.tone === 'critical' ? 'bg-critical text-critical-foreground' : 'bg-sidebar-primary text-sidebar-primary-foreground';

const pathnameOf = (path: string) => toNavPathname(path.split(/[?#]/)[0]);

/** The glowing bar on the current page's row. */
const ActiveBar: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => (
  <span
    aria-hidden="true"
    className={cn(
      'absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full bg-sidebar-primary shadow-[0_0_10px_hsl(var(--sidebar-primary)/0.7)]',
      collapsed ? 'h-8 w-1' : 'h-5 w-0.5',
    )}
  />
);

const StatusChip: React.FC<{ status: FilteredNavNode['status'] }> = ({ status }) => {
  if (status === 'planned') {
    // Visual only: the row's aria-label ends in ", planned" (statusSuffix).
    return (
      <span aria-hidden="true" data-nav-status="planned" title="Planned" className="inline-flex shrink-0 items-center text-sidebar-muted-foreground">
        <CircleDashed className="h-3 w-3" strokeWidth={2} />
      </span>
    );
  }
  if (status === 'beta') {
    return (
      <span className="type-eyebrow shrink-0 rounded-sm px-1.5 py-0.5 text-[0.625rem] leading-none text-sidebar-primary ring-1 ring-inset ring-sidebar-primary/40">
        Beta
      </span>
    );
  }
  return null;
};

const statusSuffix = (node: FilteredNavNode) => (node.status === 'planned' ? ', planned' : node.status === 'beta' ? ', beta' : '');

/** A row's status as the collapsed tooltip shows it, after the label. */
const statusText = (node: FilteredNavNode): string | null =>
  node.status === 'planned' ? 'Planned' : node.status === 'beta' ? 'Beta' : null;

/** Clears the 64 px rail: the 44 px row sits 10 px in from its edge. */
const RAIL_TOOLTIP_OFFSET = 14;

/**
 * A locked add-on in the collapsed rail: the add-on explanation outside the
 * tooltip (AddOnLock > IconTooltip > button), and no tooltip while the
 * explanation is open.
 */
const CollapsedLockedRow: React.FC<{ node: FilteredNavNode; ariaLabel: string }> = ({ node, ariaLabel }) => {
  const [explaining, setExplaining] = useState(false);
  const Icon = node.icon;
  const hint = [statusText(node), 'Add-on'].filter(Boolean).join(' · ');
  return (
    <AddOnLock label={node.label} open={explaining} onOpenChange={setExplaining}>
      <IconTooltip side="right" sideOffset={RAIL_TOOLTIP_OFFSET} label={node.label} hint={hint} suppressed={explaining}>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn('relative flex h-11 w-11 items-center justify-center rounded-lg text-sidebar-muted-foreground hover:bg-sidebar-accent', focusRing)}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
          <Lock className="absolute bottom-1.5 right-1.5 h-3 w-3" strokeWidth={2} aria-hidden="true" />
        </button>
      </IconTooltip>
    </AddOnLock>
  );
};

const SkeletonRows: React.FC<{ rows?: number; label: string }> = ({ rows = 5, label }) => (
  <div role="status" aria-busy="true" className="space-y-1 px-1">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex h-9 items-center gap-2.5 px-2">
        <span className="h-4 w-4 shrink-0 rounded bg-sidebar-accent motion-safe:animate-pulse" />
        <span className="h-3 rounded bg-sidebar-accent motion-safe:animate-pulse" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
      </div>
    ))}
    <span className="sr-only">{label}</span>
  </div>
);

const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  nodes,
  heading,
  rootPath = null,
  moduleParam = null,
  loading = false,
  onNavigate,
  collapsed = false,
  onExpand,
}) => {
  const location = useLocation();
  const badgeFor = useNavBadges();
  // Vessel URLs are compared on the `/v/:vesselCode` pattern, so a tree built
  // for one vessel and the legacy pattern tree both light up the same leaf.
  const pathname = toNavPathname(location.pathname);
  const rootPathname = rootPath ? pathnameOf(rootPath) : null;

  const queryMatches = useCallback(
    (queryString: string | undefined) => {
      if (!queryString) return true;
      const wanted = new URLSearchParams(queryString);
      const current = new URLSearchParams(location.search);
      return Array.from(wanted.entries()).every(([key, value]) => current.get(key) === value);
    },
    [location.search],
  );

  const matchesPath = useCallback(
    (path: string) => pathname === pathnameOf(path) && queryMatches(path.split('?')[1]),
    [pathname, queryMatches],
  );

  // Exact path or any page nested under it: a group "contains" the current
  // page, so detail pages still light up their group.
  const matchesSection = useCallback(
    (path: string) => {
      const section = pathnameOf(path);
      if (pathname !== section && !pathname.startsWith(`${section}/`)) return false;
      return queryMatches(path.split('?')[1]);
    },
    [pathname, queryMatches],
  );

  const containsCurrentPath = useCallback(
    (node: FilteredNavNode): boolean => {
      if (navKindOf(node) !== 'section' && matchesSection(node.path)) return true;
      return node.children?.some(containsCurrentPath) ?? false;
    },
    [matchesSection],
  );

  // The single leaf that best represents the current page.
  const activeLeafPath = useMemo(() => {
    const leaves: string[] = [];
    const walk = (items: readonly FilteredNavNode[]) =>
      items.forEach((item) => {
        if (item.children?.length) walk(item.children);
        else if (!item.locked && navKindOf(item) === 'leaf') leaves.push(item.path);
      });
    walk(nodes);
    let best: string | null = null;
    for (const leaf of leaves) {
      if (matchesPath(leaf)) return leaf;
      const leafPathname = pathnameOf(leaf);
      if (leafPathname !== rootPathname && pathname.startsWith(`${leafPathname}/`)) {
        if (!best || leafPathname.length > pathnameOf(best).length) best = leaf;
      }
    }
    return best;
  }, [nodes, matchesPath, pathname, rootPathname]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = useState('');

  const activeLabel = useMemo(() => {
    let label: string | null = null;
    const visit = (items: readonly FilteredNavNode[]) =>
      items.forEach((item) => {
        if (label) return;
        if (!item.children?.length && item.path === activeLeafPath) label = item.label;
        else if (item.children?.length) visit(item.children);
      });
    visit(nodes);
    return label;
  }, [activeLeafPath, nodes]);

  // Groups open on the branch that holds the current page.
  useEffect(() => {
    const next: Record<string, boolean> = {};
    const visit = (items: readonly FilteredNavNode[]) =>
      items.forEach((item) => {
        if (item.children?.length) {
          next[item.id] = containsCurrentPath(item);
          visit(item.children);
        }
      });
    visit(nodes);
    setOpenGroups(next);
  }, [nodes, containsCurrentPath]);

  useEffect(() => {
    if (activeLabel) setAnnouncement(`Current page: ${activeLabel}`);
  }, [activeLabel]);

  const setGroupOpen = (node: FilteredNavNode, open: boolean) => {
    setOpenGroups((current) => ({ ...current, [node.id]: open }));
    setAnnouncement(`${node.label} section ${open ? 'expanded' : 'collapsed'}`);
  };

  const hrefFor = (path: string) => sidebarHref(path, { moduleParam, rootPath });

  /** A node's badge; collapsed to icons, a group also shows the first badge among its hidden children. */
  const nodeBadge = (node: FilteredNavNode): NavBadge | null => badgeFor(node.badgeKey ?? (collapsed ? descendantBadgeKey(node) : undefined));

  const renderBadge = (badge: NavBadge, floating = false) => (
    <Link
      to={hrefFor(badge.destination)}
      onClick={onNavigate}
      aria-label={`Open ${badge.label}`}
      title={`Open ${badge.label}`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold leading-none tabular-nums',
        badgeTone(badge),
        focusRing,
        floating ? 'absolute -right-1 -top-1 z-10 h-5 min-w-5 ring-2 ring-sidebar' : 'h-5 min-w-5 [@media(pointer:coarse)]:h-7 [@media(pointer:coarse)]:min-w-7',
      )}
    >
      {badge.text}
    </Link>
  );

  const renderNode = (node: FilteredNavNode, depth = 0): React.ReactNode => {
    const kind = navKindOf(node);

    // Section: an eyebrow heading over its children, at the heading's depth (IA6).
    if (kind === 'section') {
      const headingId = `nav-section-${node.id}`;
      if (collapsed) {
        return (
          <div key={node.id} className="space-y-1">
            <div role="separator" aria-label={node.label} className="mx-3 my-2 border-t border-sidebar-border" />
            {node.children?.map((nested) => renderNode(nested, depth))}
          </div>
        );
      }
      return (
        <div key={node.id} role="group" aria-labelledby={headingId} className="pt-4 first:pt-0">
          <p id={headingId} className="type-eyebrow truncate px-3 pb-1 text-sidebar-muted-foreground">
            {node.label}
          </p>
          <div className="space-y-0.5">
            {node.childrenPending ? <SkeletonRows rows={3} label={`Loading ${node.label}`} /> : node.children?.map((nested) => renderNode(nested, depth))}
          </div>
        </div>
      );
    }

    const Icon = node.icon;
    const hasChildren = Boolean(node.children?.length) || Boolean(node.childrenPending);
    const active = !hasChildren && !node.locked && node.path === activeLeafPath;
    const descendantActive = hasChildren && containsCurrentPath(node);
    const badge = nodeBadge(node);
    const badgeSuffix = badge ? `, ${badge.label}` : '';

    // Locked add-on: the lock and the explanation, never the page (G4).
    if (node.locked) {
      const label = `${node.label}${statusSuffix(node)}, add-on, locked`;
      if (collapsed) {
        if (depth > 0) return null;
        return (
          <div key={node.id} className="relative flex w-full justify-center">
            <CollapsedLockedRow node={node} ariaLabel={label} />
          </div>
        );
      }
      return (
        <div key={node.id} className="flex w-full items-center">
          <AddOnLock label={node.label}>
            <button
              type="button"
              aria-label={label}
              className={cn(rowBase, 'type-body font-medium text-sidebar-muted-foreground hover:bg-sidebar-accent', DEPTH_PADDING[Math.min(depth, 3)])}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate" title={node.label}>
                {node.label}
              </span>
              <StatusChip status={node.status} />
              <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </AddOnLock>
        </div>
      );
    }

    // Collapsed: icons only. Leaves navigate; groups expand the panel.
    if (collapsed) {
      if (depth > 0) return null;
      const iconClass = cn(
        'relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-quick ease-tide',
        focusRing,
        active ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      );
      return (
        <div key={node.id} className="relative flex w-full justify-center">
          {active && <ActiveBar collapsed />}
          <IconTooltip side="right" sideOffset={RAIL_TOOLTIP_OFFSET} label={node.label} hint={statusText(node)}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onExpand?.()}
                aria-label={`${node.label} section${descendantActive ? ', contains current page' : ''}${badgeSuffix}. Expand sidebar to view`}
                className={iconClass}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {descendantActive && (
                  <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full border border-sidebar bg-sidebar-primary" />
                )}
              </button>
            ) : (
              <Link
                to={hrefFor(node.path)}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                aria-label={`${node.label}${statusSuffix(node)}${active ? ', current page' : ''}${badgeSuffix}`}
                className={iconClass}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
          </IconTooltip>
          {badge && renderBadge(badge, true)}
        </div>
      );
    }

    if (!hasChildren) {
      return (
        <div key={node.id} className="flex w-full items-center gap-1">
          <Link
            to={hrefFor(node.path)}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            aria-label={`${node.label}${statusSuffix(node)}${active ? ', current page' : ''}${badgeSuffix}`}
            className={cn(
              rowBase,
              'type-body font-medium',
              DEPTH_PADDING[Math.min(depth, 3)],
              active
                ? 'bg-sidebar-accent text-sidebar-primary'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            {active && <ActiveBar />}
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate" title={node.label}>
              {node.label}
            </span>
            <StatusChip status={node.status} />
          </Link>
          {badge && renderBadge(badge)}
        </div>
      );
    }

    const isOpen = Boolean(openGroups[node.id]);
    return (
      <Collapsible key={node.id} open={isOpen} onOpenChange={(open) => setGroupOpen(node, open)}>
        <div className="flex w-full items-center gap-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={`${node.label} section, ${isOpen ? 'expanded' : 'collapsed'}${descendantActive ? ', contains current page' : ''}${badgeSuffix}`}
              className={cn(
                rowBase,
                'type-body font-medium',
                DEPTH_PADDING[Math.min(depth, 3)],
                descendantActive
                  ? 'text-sidebar-accent-foreground hover:bg-sidebar-accent'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate" title={node.label}>
                {node.label}
              </span>
              <StatusChip status={node.status} />
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-sidebar-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-sidebar-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
          </CollapsibleTrigger>
          {badge && renderBadge(badge)}
        </div>
        <CollapsibleContent className="ml-[1.1875rem] mt-0.5 space-y-0.5 border-l border-sidebar-border pl-1.5 motion-safe:animate-accordion-down">
          {node.childrenPending ? (
            <SkeletonRows rows={3} label={`Loading ${node.label}`} />
          ) : (
            node.children?.map((nested) => renderNode(nested, depth + 1))
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const HeadingIcon = heading?.icon;
  return (
    <nav
      aria-label={heading ? `${heading.label} folders` : 'Navigation'}
      aria-busy={loading || undefined}
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain py-3', collapsed ? 'px-0' : 'px-2')}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {heading && (
        <div className={cn('mb-2 flex h-8 items-center gap-2 text-sidebar-foreground', collapsed ? 'justify-center px-0' : 'px-3')}>
          {HeadingIcon && <HeadingIcon className="h-4 w-4 shrink-0 text-sidebar-muted-foreground" strokeWidth={1.75} aria-hidden="true" />}
          {!collapsed && <span className="truncate font-display text-[0.9375rem] font-semibold tracking-wide">{heading.label}</span>}
          {collapsed && <span className="sr-only">{heading.label}</span>}
        </div>
      )}
      {loading ? (
        <SkeletonRows label={heading ? `Loading ${heading.label}` : 'Loading navigation'} />
      ) : (
        <div key={heading?.label ?? 'tree'} className="space-y-0.5 motion-safe:animate-fade-in">
          {nodes.map((node) => renderNode(node))}
        </div>
      )}
    </nav>
  );
};

export default SidebarNavigation;
