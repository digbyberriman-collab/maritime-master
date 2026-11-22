import React from 'react';
import { ShellContext, type ShellContextValue } from '@/app/shell/ShellContext';
import AppShell from '@/shared/components/layout/AppShell';

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** Keep the sidebar off-canvas at desktop widths so the page can use the full width (e.g. wide logbook sheets). */
  collapseSidebar?: boolean;
}

/**
 * The app shell's public entry point (about 90 pages and every scope layout
 * route render it). Idempotent (DECISIONS D-13): inside another
 * DashboardLayout (a scope layout route renders one around its <Outlet/>) it
 * renders its children only, so a page that still wraps itself in
 * DashboardLayout does not mount a second shell, and moving between pages of
 * one scope does not remount the shell. Otherwise it renders the AppShell
 * (top bar, sidebar, command palette) for the scope the route set.
 */
const DashboardLayout: React.FC<DashboardLayoutProps> = (props) => {
  const outer = React.useContext(ShellContext);
  if (outer) return <NestedDashboardLayout {...props} shell={outer} />;
  return <AppShell collapseSidebar={props.collapseSidebar}>{props.children}</AppShell>;
};

/** A DashboardLayout under a shell: no chrome, but `collapseSidebar` still reaches the shell. */
const NestedDashboardLayout: React.FC<DashboardLayoutProps & { shell: ShellContextValue }> = ({
  children,
  collapseSidebar = false,
  shell,
}) => {
  React.useEffect(() => (collapseSidebar ? shell.requestSidebarCollapse() : undefined), [collapseSidebar, shell]);
  return <>{children}</>;
};

export default DashboardLayout;
