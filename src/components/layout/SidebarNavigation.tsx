import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAVIGATION_ITEMS, type NavItem, type NavChild } from '@/config/navigation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface SidebarNavigationProps {
  onNavigate?: () => void;
}

const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Track which groups are open
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAVIGATION_ITEMS.forEach((item) => {
      if (item.children) {
        // Auto-open if current path matches any child or if defaultOpen is true
        const hasActiveChild = item.children.some(child => 
          location.pathname === child.path || location.pathname.startsWith(child.path + '/')
        );
        initial[item.id] = hasActiveChild || item.defaultOpen || false;
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
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isGroupActive = (item: NavItem) => {
    if (!item.children) return isActive(item.path);
    return item.children.some(child => isActive(child.path));
  };

  const renderNavChild = (child: NavChild) => {
    const active = isActive(child.path);
    
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
  };

  const renderNavItem = (item: NavItem) => {
    const hasChildren = item.children && item.children.length > 0;
    const active = isActive(item.path);
    const groupActive = isGroupActive(item);

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
      {NAVIGATION_ITEMS.map((item) => renderNavItem(item))}
    </nav>
  );
};

export default SidebarNavigation;
