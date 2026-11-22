/**
 * The sidebar's footer (spec §4.5): the "Show roadmap" switch for owners and
 * admins (D-06, D-29) and the collapse-to-icons toggle (⌘/Ctrl+B). Both are
 * 44 px targets on the sidebar's own tokens, which stay Abyss in both themes.
 */
import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useNavAccess } from '@/app/nav/navAccess';
import { canUseRoadmap, useShowRoadmapPreference } from '@/app/nav/roadmap';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { isApplePlatform } from '@/app/shell/keyboard';

export interface SidebarFooterProps {
  /** The sidebar is drawn as icons only. */
  collapsed: boolean;
  /** Collapse or expand; absent where the sidebar cannot collapse (the drawer). */
  onToggleCollapsed?: () => void;
  /** Whether this sidebar shows a nav tree that can hold planned leaves. */
  showRoadmapToggle?: boolean;
}

const sidebarControl =
  'flex min-h-11 items-center rounded-md text-sidebar-foreground/80 transition-colors duration-quick ease-tide hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar';

const SidebarFooter: React.FC<SidebarFooterProps> = ({ collapsed, onToggleCollapsed, showRoadmapToggle = true }) => {
  // Owner/admin only, fail closed while roles load (D-06), as the sidebar decides it.
  const navAccess = useNavAccess();
  const storeRoles = usePermissionsStore((s) => s.userRoles);
  const roadmapAllowed = canUseRoadmap({
    ready: navAccess.ready,
    legacyRole: navAccess.legacyRole,
    rbacRoles: navAccess.rbacRoles.length ? navAccess.rbacRoles : (storeRoles ?? []).map((r) => r.role_name),
  });
  const [showRoadmap, setShowRoadmap] = useShowRoadmapPreference();
  const roadmap = roadmapAllowed && showRoadmapToggle && !collapsed;
  if (!roadmap && !onToggleCollapsed) return null;
  const modifier = isApplePlatform() ? '⌘' : 'Ctrl';
  const collapseLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar to icons';

  return (
    <div className={cn('shrink-0 space-y-1 border-t border-sidebar-border py-2', collapsed ? 'px-2' : 'px-3')}>
      {roadmap && (
        <button
          type="button"
          role="switch"
          aria-checked={showRoadmap}
          data-testid={SHELL_TEST_IDS.roadmapToggle}
          onClick={() => setShowRoadmap(!showRoadmap)}
          title="Show pages that are planned but not built yet"
          className={cn(sidebarControl, 'w-full justify-between gap-3 px-3 text-left text-xs font-medium')}
        >
          <span>Show roadmap</span>
          <span
            aria-hidden="true"
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-quick ease-tide',
              showRoadmap ? 'border-sidebar-primary bg-sidebar-primary/25' : 'border-sidebar-border bg-sidebar-accent',
            )}
          >
            <span
              className={cn(
                'absolute h-3.5 w-3.5 rounded-full transition-transform duration-quick ease-tide motion-reduce:transition-none',
                showRoadmap ? 'translate-x-[18px] bg-sidebar-primary' : 'translate-x-0.5 bg-sidebar-muted-foreground',
              )}
            />
          </span>
        </button>
      )}
      {onToggleCollapsed && (
        <button
          type="button"
          data-testid={SHELL_TEST_IDS.sidebarCollapse}
          onClick={onToggleCollapsed}
          aria-label={collapseLabel}
          title={`${collapseLabel} (${modifier}+B)`}
          className={cn(sidebarControl, 'w-full gap-3 text-xs font-medium', collapsed ? 'justify-center px-0' : 'px-3')}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      )}
    </div>
  );
};

export default SidebarFooter;
