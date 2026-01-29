import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAVIGATION_ITEMS, type NavItem, type NavChild, type NavGrandChild } from '@/config/navigation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarNavigationProps {
  onNavigate?: () => void;
}

const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { canAccessModule } = useAuth();
  
  // Filter navigation items based on user permissions
  const visibleNavItems = useMemo(() => {
    return NAVIGATION_ITEMS.filter(item => canAccessModule(item.id));
  }, [canAccessModule]);

  // Helper to check if path matches any child or grandchild
  const hasActiveDescendant = (item: NavItem | NavChild): boolean => {
    if ('children' in item && item.children) {
      return item.children.some(child => {
        if (location.pathname === child.path || location.pathname.startsWith(child.path + '/')) {
          return true;
        }
        if ('children' in child && child.children) {
          return child.children.some(grandchild => 
            location.pathname === grandchild.path || location.pathname.startsWith(grandchild.path + '/')
          );
        }
        return false;
      });
    }
    return false;
  };
  
  // Track which groups are open (includes nested groups)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    visibleNavItems.forEach((item) => {
      if (item.children) {
        const hasActiveChild = hasActiveDescendant(item);
        initial[item.id] = hasActiveChild || item.defaultOpen || false;
        
        // Check nested children
        item.children.forEach(child => {
          if ('children' in child && child.children) {
            const hasActiveGrandchild = child.children.some(gc => 
              location.pathname === gc.path || location.pathname.startsWith(gc.path + '/')
            );
            initial[child.id] = hasActiveGrandchild;
          }
        });
      }
    });
    return initial;
  });

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const isActiveOrDescendant = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Render grandchild (3rd level)
  const renderGrandChild = (grandchild: NavGrandChild) => {
    const active = isActive(grandchild.path);
    
    return (
      <button
        key={grandchild.id}
        onClick={() => handleNavigate(grandchild.path)}
        className={cn(
          'w-full flex items-center gap-3 pl-14 pr-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
        )}
      >
        <grandchild.icon className="w-3.5 h-3.5" />
        <span className="truncate">{grandchild.label}</span>
      </button>
    );
  };

  // Render child (2nd level) - may have its own children
  const renderNavChild = (child: NavChild) => {
    const active = isActive(child.path);
    const hasChildren = 'children' in child && child.children && child.children.length > 0;
    const isOpen = openGroups[child.id];
    const hasActiveGrandchild = hasChildren && child.children!.some(gc => 
      location.pathname === gc.path || location.pathname.startsWith(gc.path + '/')
    );
    
    if (!hasChildren) {
      return (
        <button
          key={child.id}
          onClick={() => handleNavigate(child.path)}
          className={cn(
            'w-full flex items-center gap-3 pl-10 pr-3 py-2 rounded-lg text-sm font-medium transition-colors',
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

    // Child with grandchildren
    return (
      <Collapsible
        key={child.id}
        open={isOpen}
        onOpenChange={() => toggleGroup(child.id)}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center justify-between gap-2 pl-10 pr-3 py-2 rounded-lg text-sm font-medium transition-colors',
              (active || hasActiveGrandchild)
                ? 'bg-sidebar-accent/50 text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
            )}
          >
            <div className="flex items-center gap-3">
              <child.icon className="w-4 h-4" />
              <span className="truncate">{child.label}</span>
            </div>
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-0.5 space-y-0.5">
          {child.children!.map((grandchild) => renderGrandChild(grandchild))}
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
          {item.children!.map((child) => renderNavChild(child))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {visibleNavItems.map((item) => renderNavItem(item))}
    </nav>
  );
};

export default SidebarNavigation;
