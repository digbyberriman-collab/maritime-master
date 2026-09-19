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
import { useSidebarBadgeCounts } from '@/shared/hooks/useSidebarBadgeCounts';

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
  { label: 'Alerts', path: '/alerts', icon: Bell },
  { label: 'Fleet Calendar', path: '/crew/calendar', icon: Calendar },
  { label: 'Fleet Reports', path: '/reports', icon: FileBarChart },
];

const badgeLabel = (count: number, singular: string, plural = `${singular}s`) => (
  `${count} ${count === 1 ? singular : plural}`
);

const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ moduleId, onNavigate, collapsed = false, onExpand }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { map } = useSidebarOrder();
  const hasPermission = usePermissionsStore((s) => s.hasPermission);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const hrAccess = useHrAccess();
  const payrollAccess = usePayrollAccess();
  const { data: badgeCounts } = useSidebarBadgeCounts();
  const selectedModule = NAVIGATION_ITEMS.find((item) => item.id === moduleId) ?? null;

  // Leaf-level gating: entries with a moduleKey are hidden unless the user
  // holds minPermission on that RBAC module. HR uses the dedicated resolver so
  // legacy-role users are handled the same way the database handles them.
  const canShow = useCallback((item: NavChild): boolean => {
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
    if (!rbacInitialized) return true;
    return hasPermission(item.moduleKey, required);
  }, [hrAccess, payrollAccess, hasPermission, rbacInitialized]);

  const children = useMemo(() => {
    if (!selectedModule?.children) return [];
    const orderDeep = (items: NavChild[], parentId: string): NavChild[] =>
      applySidebarOrder(items, map[parentId])
        .filter(canShow)
        .map((item) => ({
          ...item,
          children: item.children?.length ? orderDeep(item.children, item.id) : item.children,
        }))
        .filter((item) => !item.children || item.children.length > 0);
    return orderDeep(selectedModule.children, selectedModule.id);
  }, [selectedModule, map, canShow]);

  const matchesPath = useCallback((path: string) => {
    const [pathname, queryString] = path.split('?');
    if (location.pathname !== pathname) return false;
    if (!queryString) return true;
    const wanted = new URLSearchParams(queryString);
    const current = new URLSearchParams(location.search);
    return Array.from(wanted.entries()).every(([key, value]) => current.get(key) === value);
  }, [location.pathname, location.search]);

  // Section-level match: exact path or any page nested under it. Used for
  // group "contains active" state so detail pages (e.g. a logbook entry
  // under /vessel/logbooks/...) still light up their section icon.
  const matchesSection = useCallback((path: string) => {
    const [pathname, queryString] = path.split('?');
    if (location.pathname !== pathname && !location.pathname.startsWith(`${pathname}/`)) return false;
    if (!queryString) return true;
    const wanted = new URLSearchParams(queryString);
    const current = new URLSearchParams(location.search);
    return Array.from(wanted.entries()).every(([key, value]) => current.get(key) === value);
  }, [location.pathname, location.search]);

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
    for (const leaf of leaves) {
      if (matchesPath(leaf)) return leaf;
      const [pathname] = leaf.split('?');
      if (location.pathname.startsWith(`${pathname}/`)) {
        if (!best || pathname.length > best.split('?')[0].length) best = leaf;
      }
    }
    return best;
  }, [children, matchesPath, location.pathname]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = useState('');

  const badgeFor = useCallback((child: NavChild): { count: number; label: string } | null => {
    const pathname = child.path.split('?')[0];
    if (pathname === '/vessel/safety') {
      const count = badgeCounts?.pendingCompliance ?? 0;
      return count > 0 ? { count, label: badgeLabel(count, 'pending compliance item') } : null;
    }
    if (pathname === '/vessel/general/communications') {
      const count = badgeCounts?.unreadMessages ?? 0;
      return count > 0 ? { count, label: badgeLabel(count, 'unread message') } : null;
    }
    if (pathname === '/vessel/technical') {
      const count = badgeCounts?.overdueTasks ?? 0;
      return count > 0 ? { count, label: badgeLabel(count, 'overdue operational task') } : null;
    }
    return null;
  }, [badgeCounts]);

  const activeLabel = useMemo(() => {
    if (!selectedModule) {
      return DASHBOARD_LINKS.find((link) => (
        location.pathname === link.path || (link.path === '/dashboard' && location.pathname === '/')
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
  }, [activeLeafPath, children, location.pathname, selectedModule]);

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

  const renderChild = (child: NavChild, depth = 0): React.ReactNode => {
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
              : `${child.label}${active ? ', current page' : ''}${badge ? `, ${badge.label}` : ''}`}
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
            {badge && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-sidebar"
              >
                {badge.count > 99 ? '99+' : badge.count}
              </span>
            )}
          </button>
        </div>
      );
    }

    if (!hasChildren) {
      return (
        <button
          key={child.id}
          type="button"
          onClick={() => go(child.path)}
          aria-current={active ? 'page' : undefined}
          aria-label={`${child.label}${active ? ', current page' : ''}`}
          className={cn(
            'flex min-h-11 w-full items-center gap-3 rounded-md py-2 pr-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
            depthClass,
            active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{child.label}</span>
          {badge && (
            <span
              className="ml-auto inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-destructive-foreground"
              aria-label={badge.label}
            >
              {badge.count > 99 ? '99+' : badge.count}
            </span>
          )}
        </button>
      );
    }

    const isOpen = Boolean(openGroups[child.id]);
    return (
      <Collapsible
        key={child.id}
        open={isOpen}
        onOpenChange={(open) => setGroupOpen(child, open)}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={`${child.label} section, ${isOpen ? 'expanded' : 'collapsed'}${descendantActive ? ', contains current page' : ''}${badge ? `, ${badge.label}` : ''}`}
            className={cn(
              'flex min-h-11 w-full items-center gap-3 rounded-md py-2 pr-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
              depthClass,
              descendantActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{child.label}</span>
            {badge && (
              <span
                className="inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-destructive-foreground"
                aria-hidden="true"
              >
                {badge.count > 99 ? '99+' : badge.count}
              </span>
            )}
            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </button>
        </CollapsibleTrigger>
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
              const active = location.pathname === link.path || (link.path === '/dashboard' && location.pathname === '/');
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
    </nav>
  );
};

export default SidebarNavigation;