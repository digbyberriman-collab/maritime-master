import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import {
  getPrimaryDomains,
  getPinnedDomains,
  isPhase2Enabled,
  type NavDomain,
  type NavRole,
} from '@/config/navigation';

interface SidebarNavigationProps {
  onNavigate?: () => void;
}

/**
 * Top-level sidebar items. Each item represents a functional domain and
 * routes to that domain's default tab; sub-navigation is rendered as
 * horizontal tabs in the content header via `SmartTabBar`. There is no
 * nested submenu in the sidebar.
 */
const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { canAccessModule, profile } = useAuth();
  const role = (profile?.role ?? null) as NavRole | null;
  const phase2 = isPhase2Enabled();

  const { primary, pinned } = useMemo(() => {
    const filter = (domain: NavDomain): boolean => {
      if (domain.phase === 2 && !phase2) return false;
      if (domain.requiredRoles && (!role || !domain.requiredRoles.includes(role))) return false;
      return canAccessModule(domain.moduleId ?? domain.id);
    };
    return {
      primary: getPrimaryDomains().filter(filter),
      pinned: getPinnedDomains().filter(filter),
    };
  }, [canAccessModule, role, phase2]);

  // A domain is active when the pathname starts with its first path segment.
  const isDomainActive = (domain: NavDomain): boolean => {
    const segments = domain.path.split('/').filter(Boolean);
    if (segments.length === 0) return location.pathname === '/';
    const prefix = `/${segments[0]}`;
    return location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const renderItem = (domain: NavDomain) => {
    const active = isDomainActive(domain);
    const isEmergency = domain.id === 'emergency';

    return (
      <SidebarMenuItem key={domain.id}>
        <SidebarMenuButton
          tooltip={domain.label}
          isActive={active}
          onClick={() => handleNavigate(domain.path)}
          className={cn(
            isEmergency &&
              'border border-sidebar-border bg-sidebar-accent/30 data-[active=true]:bg-sidebar-accent',
          )}
          data-emergency={isEmergency || undefined}
          aria-label={domain.label}
        >
          <domain.icon className="w-5 h-5" />
          <span>{domain.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <>
      <SidebarGroup className="flex-1 overflow-y-auto">
        <SidebarMenu>
          {primary.map(renderItem)}
        </SidebarMenu>
      </SidebarGroup>

      {pinned.length > 0 && (
        <>
          <SidebarSeparator />
          <SidebarGroup>
            <SidebarMenu>{pinned.map(renderItem)}</SidebarMenu>
          </SidebarGroup>
        </>
      )}
    </>
  );
};

export default SidebarNavigation;
