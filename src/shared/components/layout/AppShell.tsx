/**
 * The STORM shell (gap/10 IA1, BUILD-PLAN S1; spec §1): one frame for the
 * Fleet, vessel, workspace and personal scopes, and for legacy pages that
 * still render in place.
 *
 *   root (relative isolate, the page background; the watermark sits behind content)
 *   ├─ skip link → #main-content
 *   ├─ sticky header: impersonation bar, top bar, vessel tab row   (height → --shell-header-h)
 *   ├─ row: sidebar (the scope's tree, static ≥ 1024 px; none when the scope
 *   │       has no tree here) │ notices (RBAC and module-settings Retry), main (breadcrumb
 *   │       row, the page), footer
 *   ├─ navigation drawer below 1024 px (and in wide mode): a left Sheet with the
 *   │       same sidebar, never collapsed (IA19; spec §9)
 *   └─ feedback panel, keyboard shortcuts dialog
 *
 * Providers, outermost first: ShellContext (nested layouts ask for the wide
 * mode), ShellActionsContext (what the palette and shortcuts may open),
 * ShellUiContext (the open state behind those actions), the command palette
 * (once per shell), the dashboard filter (until doc 02 makes it a page filter).
 *
 * Render it through DashboardLayout, which keeps it idempotent (D-13).
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavScope } from '@/config/navigation-types';
import InkfishFooter from '@/shared/components/layout/InkfishFooter';
import InkfishWatermark from '@/shared/components/InkfishWatermark';
import PageLocationHeader from '@/shared/components/layout/PageLocationHeader';
import { DashboardFilterProvider } from '@/modules/dashboard/contexts/DashboardFilterContext';
import FeedbackPanel from '@/modules/feedback/components/FeedbackPanel';
import FeedbackResolvedToast from '@/modules/feedback/components/FeedbackResolvedToast';
import { CommandPaletteProvider } from '@/shared/components/command-palette';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { ShellContext, type ShellContextValue } from '@/app/shell/ShellContext';
import { ShellActionsContext, type ShellActions } from '@/app/shell/shellActions';
import { ShellUiContext, type ShellUi } from '@/app/shell/shellUi';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { isEditableTarget } from '@/app/shell/keyboard';
import { SHELL_MEDIA, useMediaQuery } from '@/app/shell/useMediaQuery';
import { useImpersonation } from '@/app/shell/impersonation';
import { useScope } from '@/app/router/scopeContext';
import { recordRecentVessel } from '@/app/nav/recentVessels';
import { useSidebarCollapsed } from '@/app/shell/sidebarCollapsed';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import ShellSidebar from './ShellSidebar';
import TenantLogo from './topbar/TenantLogo';
import ModuleTabBar from './ModuleTabBar';
import TopBar from './topbar/TopBar';
import ImpersonationBar from './topbar/ImpersonationBar';
import ShellNotices from './topbar/ShellNotices';
import KeyboardShortcutsDialog from './topbar/KeyboardShortcutsDialog';
import ShellShortcuts from './topbar/ShellShortcuts';
import { useVesselSwitcherAvailable } from './topbar/useVesselSwitcherAvailable';
import { useShellSidebar } from './useShellSidebar';

/** The scope the shell draws; `legacy` is an old URL rendering in place. */
export type ShellScope = NavScope | 'legacy';

export interface AppShellProps {
  children: React.ReactNode;
  /** Defaults to the scope the route set (`useScope()`). */
  scope?: ShellScope;
  /** Keep the sidebar off-canvas at every width, so the page can use the full width. */
  collapseSidebar?: boolean;
}

/** Open state for one shell surface, with a stable setter. */
function useSurface(): ShellUi['notifications'] {
  const [open, setOpen] = React.useState(false);
  return React.useMemo(() => ({ open, setOpen }), [open]);
}

const SkipLink: React.FC = () => (
  <a
    href="#main-content"
    data-testid={SHELL_TEST_IDS.skipLink}
    onClick={(event) => {
      // Move focus without touching the URL hash (pages read location.hash).
      event.preventDefault();
      // Focusing the landmark also scrolls it into view.
      document.getElementById('main-content')?.focus();
    }}
    className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-e2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  >
    Skip to content
  </a>
);

const AppShell: React.FC<AppShellProps> = ({ children, scope: scopeProp, collapseSidebar: collapseSidebarProp = false }) => {
  const scopeValue = useScope();
  const scope: ShellScope = scopeProp ?? scopeValue.scope;
  const location = useLocation();
  const { user } = useAuth();
  const impersonation = useImpersonation();

  // Nested layouts (pages under a scope layout route) ask for the wide,
  // off-canvas sidebar through the shell context.
  const [collapseRequests, setCollapseRequests] = React.useState(0);
  const shellValue = React.useMemo<ShellContextValue>(
    () => ({
      requestSidebarCollapse: () => {
        setCollapseRequests((n) => n + 1);
        let released = false;
        return () => {
          if (released) return;
          released = true;
          setCollapseRequests((n) => n - 1);
        };
      },
    }),
    [],
  );
  const wide = collapseSidebarProp || collapseRequests > 0;
  const desktop = useMediaQuery(SHELL_MEDIA.lg);
  // The tree this scope draws; none (vessel Home, Calendar, Reports; the
  // personal area until its tree lands) means no column and no menu button.
  const sidebar = useShellSidebar(scope);
  const hasSidebar = sidebar.available;
  const staticSidebar = desktop && !wide && hasSidebar;

  // Icon-only sidebar on desktop: the device value, else the profile's (IA20).
  const { collapsed: sidebarCollapsed, toggle: toggleSidebarCollapsed } = useSidebarCollapsed();

  // ⌘/Ctrl+B collapses the static sidebar; never while typing, never without one.
  React.useEffect(() => {
    if (!staticSidebar) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'b') return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      toggleSidebarCollapsed();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [staticSidebar, toggleSidebarCollapsed]);

  // The navigation drawer (below 1024 px, or at every width in wide mode):
  // a left Sheet, so Radix gives it the focus trap, Esc, the overlay tap and
  // the scroll lock; a route change closes it, and focus goes back to the
  // menu button.
  const drawerAvailable = hasSidebar && !staticSidebar;
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const drawerTriggerRef = React.useRef<HTMLButtonElement>(null);
  const drawerCloseRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);
  // Gone when there is nothing to draw, or the static sidebar took over (≥ 1024 px).
  React.useEffect(() => {
    if (!drawerAvailable) setDrawerOpen(false);
  }, [drawerAvailable]);

  // The sticky header's height, for the sidebar's sticky offset.
  const headerRef = React.useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const measure = () => setHeaderHeight(Math.round(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Every vessel-scope visit goes to the front of the user's recent vessels.
  const scopeVesselId = scope === 'vessel' ? scopeValue.vessel?.id ?? null : null;
  const userId = user?.id ?? null;
  React.useEffect(() => {
    recordRecentVessel(userId, scopeVesselId);
  }, [userId, scopeVesselId]);

  // What other parts of the app may open (undefined = not available here).
  const notifications = useSurface();
  const vesselSwitcher = useSurface();
  const help = useSurface();
  const keyboardShortcuts = useSurface();
  const switcherAvailable = useVesselSwitcherAvailable();
  const helpInTopBar = useMediaQuery(SHELL_MEDIA.md);
  const ui = React.useMemo<ShellUi>(
    () => ({ notifications, vesselSwitcher, help, keyboardShortcuts, staticSidebar }),
    [notifications, vesselSwitcher, help, keyboardShortcuts, staticSidebar],
  );
  const openNotifications = notifications.setOpen;
  const openSwitcher = vesselSwitcher.setOpen;
  const openHelp = help.setOpen;
  const openShortcuts = keyboardShortcuts.setOpen;
  const actions = React.useMemo<ShellActions>(
    () => ({
      openNotifications: () => openNotifications(true),
      openVesselSwitcher: switcherAvailable ? () => openSwitcher(true) : undefined,
      openHelp: helpInTopBar ? () => openHelp(true) : undefined,
      openKeyboardShortcuts: () => openShortcuts(true),
    }),
    [openNotifications, openSwitcher, openHelp, openShortcuts, switcherAvailable, helpInTopBar],
  );

  const collapsedIcons = staticSidebar && sidebarCollapsed;
  const rootStyle = headerHeight !== null ? ({ '--shell-header-h': `${headerHeight}px` } as React.CSSProperties) : undefined;

  return (
    <ShellContext.Provider value={shellValue}>
      <ShellActionsContext.Provider value={actions}>
        <ShellUiContext.Provider value={ui}>
          {/* One command palette per shell (BUILD-PLAN S5); the top bar's search trigger opens it. */}
          <CommandPaletteProvider>
            <DashboardFilterProvider>
              <div data-shell-scope={scope} className="relative isolate min-h-dvh bg-background" style={rootStyle}>
                {/* Behind all content: the root is its own stacking context. */}
                <InkfishWatermark />
                <SkipLink />

                <div ref={headerRef} data-shell-header="" className="sticky top-0 z-40">
                  {impersonation && <ImpersonationBar targetLabel={impersonation.targetLabel} onEnd={impersonation.end} />}
                  <TopBar
                    mobileNavAvailable={drawerAvailable}
                    mobileNavAtAllWidths={wide}
                    mobileNavOpen={drawerOpen}
                    onOpenMobileNav={() => setDrawerOpen(true)}
                    mobileNavTriggerRef={drawerTriggerRef}
                    impersonating={Boolean(impersonation)}
                  />
                  {/* The vessel's module tabs (IA5), on the top bar's surface. */}
                  {scope === 'vessel' && <ModuleTabBar />}
                </div>

                {/* At least the viewport below the header, so the footer sits at the bottom of a short page. */}
                <div className="flex min-h-[calc(100dvh-var(--shell-header-h,56px))] min-w-0">
                  {staticSidebar && (
                    <aside
                      data-testid={SHELL_TEST_IDS.sidebar}
                      aria-label="Main navigation"
                      className={cn(
                        'sticky top-[var(--shell-header-h,56px)] z-30 flex h-[calc(100dvh-var(--shell-header-h,56px))] shrink-0 flex-col self-start bg-sidebar',
                        'transition-[width] duration-panel ease-tide motion-reduce:transition-none',
                        sidebarCollapsed ? 'w-16' : 'w-[248px]',
                      )}
                    >
                      <ShellSidebar
                        model={sidebar}
                        collapsed={collapsedIcons}
                        onToggleCollapsed={toggleSidebarCollapsed}
                        onExpand={toggleSidebarCollapsed}
                      />
                    </aside>
                  )}

                  <div className="flex min-w-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
                    {/* Non-blocking strips (RBAC Retry, the vessel's module settings). In the content column, so the sticky sidebar keeps its full height. */}
                    <ShellNotices />
                    <main
                      id="main-content"
                      data-testid={SHELL_TEST_IDS.main}
                      tabIndex={-1}
                      className="storm-compact min-w-0 flex-1 overflow-auto p-3 focus:outline-none lg:p-4"
                    >
                      <PageLocationHeader />
                      {children}
                    </main>
                    {/* Inkfish ownership footer: persistent, unaffected by client branding. */}
                    <InkfishFooter />
                  </div>
                </div>
              </div>

              {drawerAvailable && (
                <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                  <SheetContent
                    side="left"
                    // This header has a 44 px close button (D-35); the Sheet's own is 16 px.
                    hideClose
                    id="mobile-navigation-drawer"
                    data-testid={SHELL_TEST_IDS.mobileNavDrawer}
                    aria-describedby={undefined}
                    onOpenAutoFocus={(event) => {
                      event.preventDefault();
                      drawerCloseRef.current?.focus();
                    }}
                    onCloseAutoFocus={(event) => {
                      event.preventDefault();
                      drawerTriggerRef.current?.focus();
                    }}
                    className={cn(
                      // Width min(20rem, 100vw − 3rem); the sidebar's own surface in both themes.
                      'flex w-[min(20rem,calc(100vw-3rem))] max-w-none flex-col gap-0 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-none',
                      'pl-[env(safe-area-inset-left)] pb-[env(safe-area-inset-bottom)]',
                    )}
                  >
                    <SheetTitle className="sr-only">Main navigation</SheetTitle>
                    <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-sidebar-border pl-2 pr-1">
                      <TenantLogo surface="sidebar" className="flex min-w-0" />
                      <button
                        ref={drawerCloseRef}
                        type="button"
                        data-testid={SHELL_TEST_IDS.mobileNavClose}
                        onClick={() => setDrawerOpen(false)}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors duration-quick ease-tide hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:transition-none"
                        aria-label="Close navigation drawer"
                      >
                        <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                    <ShellSidebar model={sidebar} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
                  </SheetContent>
                </Sheet>
              )}

              <KeyboardShortcutsDialog />
              <ShellShortcuts />
              <FeedbackPanel />
              <FeedbackResolvedToast />
            </DashboardFilterProvider>
          </CommandPaletteProvider>
        </ShellUiContext.Provider>
      </ShellActionsContext.Provider>
    </ShellContext.Provider>
  );
};

export default AppShell;
