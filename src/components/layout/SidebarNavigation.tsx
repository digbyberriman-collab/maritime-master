import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigationConfig, isNavGroup, type NavigationItem, type NavGroup, type NavItem } from './NavigationConfig';
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
    navigationConfig.forEach((item) => {
      if (isNavGroup(item)) {
        // Auto-open if current path matches any child or if defaultOpen is true
        const hasActiveChild = item.items.some(child => 
          location.pathname === child.href || location.pathname.startsWith(child.href + '/')
        );
        initial[item.name] = hasActiveChild || item.defaultOpen || false;
      }
    });
    return initial;
  });

  const toggleGroup = (groupName: string) => {
    setOpenGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const handleNavigate = (href: string) => {
    navigate(href);
    onNavigate?.();
  };

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  const isGroupActive = (group: NavGroup) => {
    return group.items.some(item => isActive(item.href));
  };

  const renderNavItem = (item: NavItem, isNested = false) => {
    const active = isActive(item.href);
    
    return (
      <button
        key={item.href}
        onClick={() => handleNavigate(item.href)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isNested && 'pl-10',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
        )}
      >
        <item.icon className={cn('w-4 h-4', isNested && 'w-4 h-4')} />
        <span className="truncate">{item.name}</span>
      </button>
    );
  };

  const renderNavGroup = (group: NavGroup) => {
    const isOpen = openGroups[group.name];
    const hasActiveChild = isGroupActive(group);

    return (
      <Collapsible
        key={group.name}
        open={isOpen}
        onOpenChange={() => toggleGroup(group.name)}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              hasActiveChild
                ? 'bg-sidebar-accent/50 text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
            )}
          >
            <div className="flex items-center gap-3">
              <group.icon className="w-5 h-5" />
              <span>{group.name}</span>
            </div>
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1 space-y-1">
          {group.items.map((item) => renderNavItem(item, true))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {navigationConfig.map((item) => {
        if (isNavGroup(item)) {
          return renderNavGroup(item);
        }
        return renderNavItem(item);
      })}
    </nav>
  );
};

export default SidebarNavigation;
