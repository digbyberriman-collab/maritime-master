import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Calendar, FileBarChart, LayoutDashboard, Map, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAVIGATION_ITEMS, type NavChild } from '@/config/navigation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSidebarOrder, applySidebarOrder } from '@/shared/hooks/useSidebarOrder';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { hrAccessSatisfies } from '@/modules/auth/lib/hrAccess';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { payrollAccessSatisfies } from '@/modules/auth/lib/payrollAccess';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { medicalAccessSatisfies } from '@/modules/auth/lib/medicalAccess';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { wellnessAccessSatisfies } from '@/modules/auth/lib/wellnessAccess';
import { useSidebarBadgeCounts } from '@/shared/hooks/useSidebarBadgeCounts';
import { useNavAccess } from '@/app/nav/navAccess';
import { canUseRoadmap, useShowRoadmapPreference } from '@/app/nav/roadmap';
import { isNavNodeVisible, navKindOf } from '@/app/nav/visibility';
import { toNavPathname } from '@/app/router/legacyResolve';

interface SidebarNavigationProps {
  moduleId: string | null;
  onNavigate?: () => void;
  /** Icon-only (visuals only) rendering; labels become tooltips. */
  collapsed?: boolean;
  /** Called when a collapsed group icon is clicked so the layout can expand. */
  onExpand?: () => void;
}

const DASHBOARD_LINKS = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Fleet Tracker', path: '/fleet-map', icon: Map },
  { label: 'Notification Center', path: '/notifications/center', icon: Bell },
  { label: 'Fleet Calendar', path: '/crew/calendar', icon: Calendar },
  { label: 'Fleet Reports', path: '/reports', icon: FileBarChart },
];

const badgeLabel = (count: number, singular: string, plural = `${singular}s`) => (
  `${count} ${count === 1 ? singular : plural}`
);

type BadgeCounts = { pendingCompliance?: number; unreadMessages?: number; overdueTasks?: number } | undefined;

/** Badge registry: nav nodes name one of these keys in `badgeKey` (gap/10 IA21). */
const BADGES: Record<string, { count: (counts: BadgeCounts) => number; singular: string; destination: string }> = {
  pendingCompliance: {
    count: (c) => c?.pendingCompliance ?? 0,
    singular: 'pending compliance item',
    destination: '/notifications/center?tab=compliance',
  },
  unreadMessages: {
    count: (c) => c?.unreadMessages ?? 0,
    singular: 'unread message',
    destination: '/notifications/center?tab=messages',
  },
  overdueTasks: {
    count: (c) => c?.overdueTasks ?? 0,
    singular: 'overdue operational task',
    destination: '/notifications/center?tab=tasks',
  },
};

/** The first badge key anywhere under a node. */
const descendantBadgeKey = (item: NavChild): string | undefined => {
  for (const child of item.children ?? []) {
    const key = child.badgeKey ?? descendantBadgeKey(child);
    if (key) return key;
  }
  return undefined;
};

const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ moduleId, onNavigate, collapsed = false, onExpand }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { map } = useSidebarOrder();
  const hasPermission = usePermissionsStore((s) => s.hasPermission);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const hrAccess = useHrAccess();
  const payrollAccess = usePayrollAccess();
  const medicalAccess = useMedicalAccess();
  const wellnessAccess = useWellnessAccess();
  const { data: badgeCounts } = useSidebarBadgeCounts();
  const selectedModule = NAVIGATION_ITEMS.find((item) => item.id === moduleId) ?? null;
  // Vessel URLs (/v/dra/crew/list) are matched as the tree's pattern path
  // (/v/:vesselCode/crew/list), which is the same for every vessel.
  const pathname = toNavPathname(location.pathname);

  // "Show roadmap" (D-06): planned leaves stay hidden unless an owner or
  // admin has turned it on.
  const navAccess = useNavAccess();
  const storeRoles = usePermissionsStore((s) => s.userRoles);
  const roadmapAllowed = canUseRoadmap({
    ready: navAccess.ready,
    legacyRole: navAccess.legacyRole,
    rbacRoles: navAccess.rbacRoles.length ? navAccess.rbacRoles : (storeRoles ?? []).map((r) => r.role_name),
  });
  const [showRoadmapStored, setShowRoadmap] = useShowRoadmapPreference();
  const showPlanned = roadmapAllowed && showRoadmapStored;
  const { can, fleetReach, vesselReach } = navAccess;

  // Node gating, in the order of the nav visibility rule (gap/10): status,
  // scope reach, then capability, then the legacy moduleKey gates. Entries with a moduleKey
  // are hidden unless the user holds minPermission on that RBAC module. HR
  // uses the dedicated resolver so legacy-role users are handled the same way
  // the database handles them. Every branch fails closed while loading.
  const canShow = useCallback((item: NavChild): boolean => {
    if (!isNavNodeVisible(item, { showPlanned, can, fleetReach, vesselReach })) return false;
    if (!item.moduleKey) return true;
    const required = item.minPermission ?? 'view';
    if (item.moduleKey === 'hr') {
      if (hrAccess.loading) return false;
      return hrAccessSatisfies(hrAccess, required);
    }
    if (item.moduleKey === 'finance') {
      if (payrollAccess.loading) return false;
      return payrollAccessSatisfies(payrollAccess, required);
    }
    if (item.moduleKey === 'medical') {
      if (medicalAccess.loading) return false;
      // Crew keep the leaves that show their own record.
      if (medicalAccess.selfOnly) return Boolean(item.selfServe);
      return medicalAccessSatisfies(medicalAccess, required);
    }
    if (item.moduleKey === 'wellness') {
      if (wellnessAccess.loading) return false;
      if (wellnessAccess.selfOnly) return Boolean(item.selfServe);
      return wellnessAccessSatisfies(wellnessAccess, required);
    }
    // Fail closed while RBAC loads (gap/00 C2), as canAccessModule does.
    if (!rbacInitialized) return false;
    return hasPermission(item.moduleKey, required);
  }, [hrAccess, payrollAccess, medicalAccess, wellnessAccess, hasPermission, rbacInitialized, showPlanned, can, fleetReach, vesselReach]);

  const children = useMemo(() => {
    if (!selectedModule?.children) return [];
    const orderDeep = (items: NavChild[], parentId: string): NavChild[] =>
      applySidebarOrder(items, map[parentId])
        .filter(canShow)
        .map((item) => {
          if (!item.children?.length) return item;
          const visible = orderDeep(item.children, item.id);
          // A section heading shows no badge, so it takes none: a badge from
          // under it moves on up to the nearest group.
          if (navKindOf(item) === 'section') return { ...item, children: visible };
          // A badge on a leaf that is hidden (e.g. planned) moves up to its
          // group, so the count stays reachable.
          const hoisted = item.badgeKey ?? (descendantBadgeKey({ ...item, children: visible }) ? undefined : descendantBadgeKey(item));
          return { ...item, children: visible, ...(hoisted ? { badgeKey: hoisted } : {}) };
        })
        .filter((item) => !item.children || item.children.length > 0);
    return orderDeep(selectedModule.children, selectedModule.id);
  }, [selectedModule, map, canShow]);

  const matchesPath = useCallback((path: string) => {
    const [leafPathname, queryString] = path.split('?');
    if (pathname !== leafPathname) return false;
    if (!queryString) return true;
    const wanted = new URLSearchParams(queryString);
    const current = new URLSearchParams(location.search);
    return Array.from(wanted.entries()).every(([key, value]) => current.get(key) === value);
  }, [pathname, location.search]);

  // Section-level match: exact path or any page nested under it. Used for
  // group "contains active" state so detail pages (e.g. a logbook entry
  // under /vessel/logbooks/...) still light up their section icon.
  const matchesSection = useCallback((path: string) => {
    const [sectionPathname, queryString] = path.split('?');
    if (pathname !== sectionPathname && !pathname.startsWith(`${sectionPathname}/`)) return false;
    if (!queryString) return true;
    const wanted = new URLSearchParams(queryString);
    const current = new URLSearchParams(location.search);
    return Array.from(wanted.entries()).every(([key, value]) => current.get(key) === value);
  }, [pathname, location.search]);

  const containsCurrentPath = useCallback((item: NavChild): boolean => {
    if (matchesSection(item.path)) return true;
    return item.children?.some(containsCurrentPath) ?? false;
  }, [matchesSection]);

  // The single leaf that best represents the current page: exact match
  // wins; otherwise the longest leaf path the current URL sits under.
  const activeLeafPath = useMemo(() => {
    const leaves: string[] = [];
    const walk = (items: NavChild[]) => items.forEach((item) => {
      if (item.children?.length) walk(item.children);
      else leaves.push(item.path);
    });
    walk(children);
    let best: string | null = null;
    // A leaf on the module's own root (the vessel Home, /v/:vesselCode) sits
    // above every page of the module, so it only counts on an exact match.
    const moduleRoot = selectedModule?.path.split('?')[0];
    for (const leaf of leaves) {
      if (matchesPath(leaf)) return leaf;
      const [leafPathname] = leaf.split('?');
      if (leafPathname !== moduleRoot && pathname.startsWith(`${leafPathname}/`)) {
        if (!best || leafPathname.length > best.split('?')[0].length) best = leaf;
      }
    }
    return best;
  }, [children, matchesPath, pathname, selectedModule]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = useState('');

  // A node shows the badge it names. Collapsed to icons, a group also shows
  // the first badge among its (now hidden) children.
  const badgeFor = useCallback((child: NavChild): { count: number; label: string; destination: string } | null => {
    const key = child.badgeKey ?? (collapsed ? descendantBadgeKey(child) : undefined);
    const badge = key ? BADGES[key] : undefined;
    if (!badge) return null;
    const count = badge.count(badgeCounts);
    return count > 0 ? { count, label: badgeLabel(count, badge.singular), destination: badge.destination } : null;
  }, [badgeCounts, collapsed]);

  const activeLabel = useMemo(() => {
    if (!selectedModule) {
      return DASHBOARD_LINKS.find((link) => (
        pathname === link.path || (link.path === '/dashboard' && pathname === '/')
      ))?.label ?? null;
    }
    let label: string | null = null;
    const visit = (items: NavChild[]) => items.forEach((item) => {
      if (label) return;
      if (!item.children?.length && item.path === activeLeafPath) label = item.label;
      else if (item.children?.length) visit(item.children);
    });
    visit(children);
    return label;
  }, [activeLeafPath, children, pathname, selectedModule]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    const visit = (items: NavChild[]) => items.forEach((item) => {
      if (item.children?.length) {
        next[item.id] = containsCurrentPath(item);
        visit(item.children);
      }
    });
    visit(children);
    setOpenGroups(next);
  }, [children, containsCurrentPath, moduleId]);

  useEffect(() => {
    if (activeLabel) setAnnouncement(`Current page: ${activeLabel}`);
  }, [activeLabel]);

  const setGroupOpen = (child: NavChild, open: boolean) => {
    setOpenGroups((current) => ({ ...current, [child.id]: open }));
    setAnnouncement(`${child.label} section ${open ? 'expanded' : 'collapsed'}`);
  };

  const go = (path: string) => {
    if (moduleId) {
      const [pathname, query = ''] = path.split('?');
      const params = new URLSearchParams(query);
      params.set('module', moduleId);
      navigate(`${pathname}?${params.toString()}`);
    } else {
      navigate(path);
    }
    onNavigate?.();
  };

  const statusChip = (child: NavChild) => {
    if (child.status === 'planned') {
      return (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-sidebar-muted-foreground ring-1 ring-inset ring-sidebar-border">
          Planned
        </span>
      );
    }
    if (child.status === 'beta') {
      return (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-sidebar-primary ring-1 ring-inset ring-sidebar-primary/40">
          Beta
        </span>
      );
    }
    return null;
  };
  const statusSuffix = (child: NavChild) => (child.status === 'planned' ? ', planned' : child.status === 'beta' ? ', beta' : '');

  const renderChild = (child: NavChild, depth = 0): React.ReactNode => {
    // Section: a non-interactive eyebrow heading (gap/10 IA6). Its children
    // render at the heading's own depth, so they keep their place when the
    // panel collapses to icons.
    if (navKindOf(child) === 'section') {
      const headingId = `nav-section-${child.id}`;
      if (collapsed) {
        return (
          <div key={child.id} className="space-y-1">
            <div role="separator" aria-label={child.label} className="mx-3 my-2 border-t border-sidebar-border" />
            {child.children?.map((nested) => renderChild(nested, depth))}
          </div>
        );
      }
      return (
        <div key={child.id} role="group" aria-labelledby={headingId} className="space-y-1 pt-3 first:pt-0">
          <p
            id={headingId}
            className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted-foreground"
          >
            {child.label}
          </p>
          {child.children?.map((nested) => renderChild(nested, depth))}
        </div>
      );
    }

    const hasChildren = Boolean(child.children?.length);
    const active = hasChildren ? matchesPath(child.path) : child.path === activeLeafPath;
    const descendantActive = containsCurrentPath(child);
    const badge = badgeFor(child);
    const Icon = child.icon;
    const depthClass = depth === 0 ? 'pl-3' : depth === 1 ? 'pl-8' : depth === 2 ? 'pl-12' : 'pl-16';

    // Collapsed: icons only. Leaves navigate; groups expand the panel.
    // Active leaf: glowing left-edge bar + lit pill. Group containing the
    // active page: small pip on the icon so its state is still visible.
    if (collapsed) {
      if (depth > 0) return null;
      return (
        <div key={child.id} className="relative flex w-full justify-center">
          {active && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary shadow-[0_0_12px_hsl(var(--sidebar-primary)/0.8)]"
            />
          )}
          <button
            type="button"
            onClick={() => (hasChildren ? onExpand?.() : go(child.path))}
            aria-current={active ? 'page' : undefined}
            aria-label={hasChildren
              ? `${child.label} section${descendantActive ? ', contains current page' : ''}${badge ? `, ${badge.label}` : ''}. Expand sidebar to view`
              : `${child.label}${statusSuffix(child)}${active ? ', current page' : ''}${badge ? `, ${badge.label}` : ''}`}
            title={child.label}
            className={cn(
              'relative flex h-11 w-11 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
              active
                ? 'border border-sidebar-primary/30 bg-sidebar-primary/20 text-sidebar-primary shadow-inner'
                : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {hasChildren && descendantActive && !active && (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-sidebar-primary shadow-[0_0_6px_hsl(var(--sidebar-primary)/0.6)]"
              />
            )}
          </button>
          {badge && (
            <button
              type="button"
              onClick={() => go(badge.destination)}
              aria-label={`Open ${badge.label}`}
              title={`Open ${badge.label}`}
              className="absolute -right-1 -top-1 z-10 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            >
              {badge.count > 99 ? '99+' : badge.count}
            </button>
          )}
        </div>
      );
    }

    if (!hasChildren) {
      return (
        <div key={child.id} className="flex min-h-11 w-full items-center gap-1">
          <button
            type="button"
            onClick={() => go(child.path)}
            aria-current={active ? 'page' : undefined}
            aria-label={`${child.label}${statusSuffix(child)}${active ? ', current page' : ''}${badge ? `, ${badge.label}` : ''}`}
            className={cn(
              'flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md py-2 pr-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
              depthClass,
              active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{child.label}</span>
            {statusChip(child)}
          </button>
          {badge && (
            <button
              type="button"
              onClick={() => go(badge.destination)}
              className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
              aria-label={`Open ${badge.label}`}
              title={`Open ${badge.label}`}
            >
              {badge.count > 99 ? '99+' : badge.count}
            </button>
          )}
        </div>
      );
    }

    const isOpen = Boolean(openGroups[child.id]);
    return (
      <Collapsible key={child.id} open={isOpen} onOpenChange={(open) => setGroupOpen(child, open)}>
        <div className="flex min-h-11 w-full items-center gap-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={`${child.label} section, ${isOpen ? 'expanded' : 'collapsed'}${descendantActive ? ', contains current page' : ''}${badge ? `, ${badge.label}` : ''}`}
              className={cn(
                'flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md py-2 pr-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                depthClass,
                descendantActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{child.label}</span>
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </button>
          </CollapsibleTrigger>
            {badge && (
              <button
                type="button"
                onClick={() => go(badge.destination)}
                className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                aria-label={`Open ${badge.label}`}
                title={`Open ${badge.label}`}
              >
                {badge.count > 99 ? '99+' : badge.count}
              </button>
            )}
        </div>
        <CollapsibleContent className="mt-1 space-y-1 motion-safe:animate-accordion-down">
          {child.children?.map((nested) => renderChild(nested, depth + 1))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <nav
      aria-label={selectedModule ? `${selectedModule.label} folders` : 'Dashboard shortcuts'}
      className={cn('flex-1 min-h-0 overflow-y-auto py-4', collapsed ? 'px-0' : 'px-3')}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      <div
        className={cn(
          'mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-sidebar-foreground/60',
          collapsed ? 'justify-center px-0' : 'px-3'
        )}
      >
        {selectedModule ? (
          <>
            <selectedModule.icon className="h-4 w-4" aria-hidden="true" />
            {!collapsed && <span>{selectedModule.label}</span>}
          </>
        ) : (
          !collapsed && <span>Dashboard shortcuts</span>
        )}
      </div>
      <div key={moduleId ?? 'dashboard'} className="space-y-1 motion-safe:animate-fade-in">
        {selectedModule
          ? children.map((child) => renderChild(child))
          : DASHBOARD_LINKS.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.path || (link.path === '/dashboard' && pathname === '/');
              if (collapsed) {
                return (
                  <div key={link.path} className="relative flex w-full justify-center">
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary shadow-[0_0_12px_hsl(var(--sidebar-primary)/0.8)]"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => go(link.path)}
                      aria-current={active ? 'page' : undefined}
                      aria-label={`${link.label}${active ? ', current page' : ''}`}
                      title={link.label}
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                        active
                          ? 'border border-sidebar-primary/30 bg-sidebar-primary/20 text-sidebar-primary shadow-inner'
                          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </button>
                  </div>
                );
              }
              return (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => go(link.path)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={`${link.label}${active ? ', current page' : ''}`}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                    active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{link.label}</span>
                </button>
              );
            })}
      </div>
      {roadmapAllowed && selectedModule && !collapsed && (
        <div className="mt-4 border-t border-sidebar-border pt-3">
          <button
            type="button"
            aria-pressed={showRoadmapStored}
            onClick={() => setShowRoadmap(!showRoadmapStored)}
            title="Show pages that are planned but not built yet"
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
          >
            <span>Show roadmap</span>
            <span aria-hidden="true" className={cn('font-semibold uppercase tracking-wide', showRoadmapStored ? 'text-sidebar-primary' : 'text-sidebar-muted-foreground')}>
              {showRoadmapStored ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      )}
    </nav>
  );
};

export default SidebarNavigation;