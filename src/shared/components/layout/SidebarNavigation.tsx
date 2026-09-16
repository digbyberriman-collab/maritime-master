import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Calendar, FileBarChart, LayoutDashboard, Map, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAVIGATION_ITEMS, type NavChild } from '@/config/navigation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSidebarOrder, applySidebarOrder } from '@/shared/hooks/useSidebarOrder';

interface SidebarNavigationProps {
  moduleId: string | null;
  onNavigate?: () => void;
}

const DASHBOARD_LINKS = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Fleet Tracker', path: '/fleet-map', icon: Map },
  { label: 'Alerts', path: '/alerts', icon: Bell },
  { label: 'Fleet Calendar', path: '/calendar', icon: Calendar },
  { label: 'Fleet Reports', path: '/analytics', icon: FileBarChart },
];

const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ moduleId, onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { map } = useSidebarOrder();
  const selectedModule = NAVIGATION_ITEMS.find((item) => item.id === moduleId) ?? null;

  const children = useMemo(() => {
    if (!selectedModule?.children) return [];
    const orderDeep = (items: NavChild[], parentId: string): NavChild[] =>
      applySidebarOrder(items, map[parentId]).map((item) => ({
        ...item,
        children: item.children?.length ? orderDeep(item.children, item.id) : item.children,
      }));
    return orderDeep(selectedModule.children, selectedModule.id);
  }, [selectedModule, map]);

  const matchesPath = useCallback((path: string) => {
    const [pathname, queryString] = path.split('?');
    if (location.pathname !== pathname) return false;
    if (!queryString) return true;
    const wanted = new URLSearchParams(queryString);
    const current = new URLSearchParams(location.search);
    return Array.from(wanted.entries()).every(([key, value]) => current.get(key) === value);
  }, [location.pathname, location.search]);

  const containsCurrentPath = useCallback((item: NavChild): boolean => {
    if (matchesPath(item.path)) return true;
    return item.children?.some(containsCurrentPath) ?? false;
  }, [matchesPath]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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

  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const renderChild = (child: NavChild, depth = 0): React.ReactNode => {
    const hasChildren = Boolean(child.children?.length);
    const active = matchesPath(child.path);
    const descendantActive = containsCurrentPath(child);
    const Icon = child.icon;
    const depthClass = depth === 0 ? 'pl-3' : depth === 1 ? 'pl-8' : depth === 2 ? 'pl-12' : 'pl-16';

    if (!hasChildren) {
      return (
        <button
          key={child.id}
          type="button"
          onClick={() => go(child.path)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-md py-2 pr-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            depthClass,
            active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{child.label}</span>
        </button>
      );
    }

    const isOpen = Boolean(openGroups[child.id]);
    return (
      <Collapsible
        key={child.id}
        open={isOpen}
        onOpenChange={(open) => setOpenGroups((current) => ({ ...current, [child.id]: open }))}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-3 rounded-md py-2 pr-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              depthClass,
              descendantActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{child.label}</span>
            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1 space-y-1 motion-safe:animate-accordion-down">
          {child.children?.map((nested) => renderChild(nested, depth + 1))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <nav aria-label={selectedModule ? `${selectedModule.label} folders` : 'Dashboard shortcuts'} className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
      <div className="mb-3 flex items-center gap-2 px-3 text-xs font-semibold uppercase text-sidebar-foreground/60">
        {selectedModule ? (
          <>
            <selectedModule.icon className="h-4 w-4" />
            <span>{selectedModule.label}</span>
          </>
        ) : (
          <span>Dashboard shortcuts</span>
        )}
      </div>
      <div key={moduleId ?? 'dashboard'} className="space-y-1 motion-safe:animate-fade-in">
        {selectedModule
          ? children.map((child) => renderChild(child))
          : DASHBOARD_LINKS.map((link) => {
              const Icon = link.icon;
              const active = location.pathname === link.path || (link.path === '/dashboard' && location.pathname === '/');
              return (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => go(link.path)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </button>
              );
            })}
      </div>
    </nav>
  );
};

export default SidebarNavigation;