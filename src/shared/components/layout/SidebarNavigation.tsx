import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAVIGATION_ITEMS, type NavItem, type NavChild } from '@/config/navigation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useSidebarOrder, applySidebarOrder } from '@/shared/hooks/useSidebarOrder';

interface SidebarNavigationProps {
  onNavigate?: () => void;
}

const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { canAccessModule } = useAuth();
  const { order, getGroupOrder } = useSidebarOrder();

  // Recursively apply each branch's saved order. Works for arbitrary depth so
  // any future inner sub-items inherit the same reordering behavior.
  const orderChildrenDeep = (children: NavChild[], parentId: string): NavChild[] => {
    const ordered = applySidebarOrder(children, getGroupOrder(parentId));
    return ordered.map((c) =>
      c.children?.length
        ? { ...c, children: orderChildrenDeep(c.children, c.id) }
        : c
    );
  };

  // Filter navigation items based on user permissions, then apply custom user order
  const visibleNavItems = useMemo(() => {
    const allowed = NAVIGATION_ITEMS.filter(item => canAccessModule(item.id));
    const rootOrdered = applySidebarOrder(allowed, order);
    // Apply saved order to every level beneath each root item.
    return rootOrdered.map((item) => {
      if (!item.children?.length) return item;
      return { ...item, children: orderChildrenDeep(item.children, item.id) };
    });
  }, [canAccessModule, order, getGroupOrder]);

  // Helper to check if a path (possibly with query params) matches the current location
  const matchesPath = (path: string): boolean => {
    const [pathname, queryString] = path.split('?');
    if (location.pathname !== pathname) return false;
    if (!queryString) return true;
    const params = new URLSearchParams(queryString);
    const currentParams = new URLSearchParams(location.search);
    for (const [key, value] of params.entries()) {
      if (currentParams.get(key) !== value) return false;
    }
    return true;
  };

  // Helper to check if path matches any child
  const hasActiveDescendant = (item: NavItem): boolean => {
    if (item.children) {
      return item.children.some(child => {
        const [pathname] = child.path.split('?');
        return matchesPath(child.path) || location.pathname.startsWith(pathname + '/');
      });
    }
    return false;
  };
  
  // Track which groups are open
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    visibleNavItems.forEach((item) => {
      if (item.children) {
        const hasActiveChild = hasActiveDescendant(item);
        initial[item.id] = hasActiveChild || item.defaultOpen || false;
      }
    });
    return initial;
  });

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => {
      const wasOpen = prev[groupId];
      // Accordion behavior: close all groups, then open the clicked one if it wasn't already open
      const next: Record<string, boolean> = {};
      visibleNavItems.forEach(item => {
        if (item.children) {
          next[item.id] = item.id === groupId ? !wasOpen : false;
        }
      });
      return next;
    });
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const isActive = (path: string) => {
    return matchesPath(path);
  };

  // Render a child at any depth. Recurses when the child has its own children
  // so deeper inner sub-items are expandable and visually nested.
  const renderNavChild = (child: NavChild, depth: number = 1): React.ReactNode => {
    const hasChildren = !!child.children?.length;
    const active = isActive(child.path);
    // Tailwind-safe padding ladder so JIT keeps the classes.
    const padMap: Record<number, string> = {
      1: 'pl-10',
      2: 'pl-14',
      3: 'pl-[4.5rem]',
      4: 'pl-24',
    };
    const pad = padMap[depth] ?? 'pl-24';

    if (!hasChildren) {
      return (
        <button
          key={child.id}
          onClick={() => handleNavigate(child.path)}
          className={cn(
            'w-full flex items-center gap-3 pr-3 py-2 rounded-lg text-sm font-medium transition-colors',
            pad,
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
          )}
        >
          <child.icon className="w-4 h-4" />
          <span className="truncate">{child.label}</span>
        </button>
      );
    }

    const isOpen = !!openGroups[child.id];
    return (
      <Collapsible key={child.id} open={isOpen} onOpenChange={() => toggleGroup(child.id)}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center justify-between gap-3 pr-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pad,
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
            )}
          >
            <div className="flex items-center gap-3">
              <child.icon className="w-4 h-4" />
              <span className="truncate">{child.label}</span>
            </div>
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1 space-y-1">
          {child.children!.map((gc) => renderNavChild(gc, depth + 1))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderNavItem = (item: NavItem) => {
    const hasChildren = item.children && item.children.length > 0;
    const active = isActive(item.path);
    const groupActive = hasActiveDescendant(item) || active;

    if (!hasChildren) {
      return (
        <button
          key={item.id}
          onClick={() => handleNavigate(item.path)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
          )}
        >
          <item.icon className="w-5 h-5" />
          <span className="truncate">{item.label}</span>
        </button>
      );
    }

    const isOpen = openGroups[item.id];

    return (
      <Collapsible
        key={item.id}
        open={isOpen}
        onOpenChange={() => toggleGroup(item.id)}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              groupActive
                ? 'bg-sidebar-accent/50 text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </div>
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1 space-y-1">
          {item.children!.map((child) => renderNavChild(child, 1))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <nav className="flex-1 min-h-0 px-3 py-4 space-y-1 overflow-y-auto">
      {visibleNavItems.map((item) => renderNavItem(item))}
    </nav>
  );
};

export default SidebarNavigation;
