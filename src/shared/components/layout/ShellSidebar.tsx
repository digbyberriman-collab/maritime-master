/**
 * The shell's sidebar contents for the current scope (spec §4.5): the tree
 * `useShellSidebar` chose (Fleet, the active vessel tab's, a workspace's, or
 * the legacy one) drawn by SidebarNavigation, then the footer with the Show
 * roadmap switch (D-29) and the collapse toggle (IA20). AppShell places it in
 * the static column (≥ 1024 px) or the drawer.
 */
import React from 'react';
import SidebarNavigation from './SidebarNavigation';
import SidebarFooter from './SidebarFooter';
import type { ShellSidebarModel } from './useShellSidebar';

export interface ShellSidebarProps {
  model: ShellSidebarModel;
  /** Icon-only rendering (static column, collapsed). */
  collapsed: boolean;
  /** Collapse or expand; absent where the sidebar cannot collapse (the drawer). */
  onToggleCollapsed?: () => void;
  /** A collapsed group's icon was clicked: expand the panel. */
  onExpand?: () => void;
  /** A link was followed (the drawer closes). */
  onNavigate?: () => void;
}

const ShellSidebar: React.FC<ShellSidebarProps> = ({ model, collapsed, onToggleCollapsed, onExpand, onNavigate }) => (
  <>
    <SidebarNavigation
      nodes={model.nodes}
      heading={model.heading}
      rootPath={model.rootPath}
      moduleParam={model.moduleParam}
      loading={model.loading}
      collapsed={collapsed}
      onExpand={onExpand}
      onNavigate={onNavigate}
    />
    <SidebarFooter collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} showRoadmapToggle={model.roadmapApplies} />
  </>
);

export default ShellSidebar;
