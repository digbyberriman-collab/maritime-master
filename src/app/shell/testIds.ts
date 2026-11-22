/**
 * `data-testid` values for the Phase 1 shell and the command palette
 * (BUILD-PLAN S1–S6). They are a contract between the shell, the palette and
 * the visual harness: scripts/visual/routes.json scripts captures against
 * these exact strings ("click [data-testid=shell-account-trigger]"), so a
 * value never changes once shipped. Add keys freely; never rename one.
 *
 * Triggers carry the id on the button; menus, popovers and dialogs carry it
 * on their content element (the part rendered in a portal), so a harness can
 * wait for the open state.
 */
export const SHELL_TEST_IDS = {
  topBar: 'shell-topbar',
  tenantLogo: 'shell-tenant-logo',
  scopeControl: 'shell-scope-control',
  scopeFleet: 'shell-scope-fleet',
  scopeVessel: 'shell-scope-vessel',
  scopeWorkspaceChip: 'shell-scope-workspace',
  vesselSwitcherTrigger: 'shell-vessel-switcher-trigger',
  vesselSwitcher: 'shell-vessel-switcher',
  appsTrigger: 'shell-apps-trigger',
  appsMenu: 'shell-apps-menu',
  searchTrigger: 'shell-search-trigger',
  favouriteToggle: 'shell-favourite-toggle',
  favouritesTrigger: 'shell-favourites-trigger',
  favouritesMenu: 'shell-favourites-menu',
  helpTrigger: 'shell-help-trigger',
  helpMenu: 'shell-help-menu',
  notificationsTrigger: 'shell-notifications-trigger',
  notificationsPanel: 'shell-notifications-panel',
  accountTrigger: 'shell-account-trigger',
  accountMenu: 'shell-account-menu',
  keyboardShortcuts: 'shell-keyboard-shortcuts',
  impersonationBar: 'shell-impersonation-bar',
  rbacRetry: 'shell-rbac-retry',
  moduleSettingsRetry: 'shell-module-settings-retry',
  moduleTabBar: 'shell-module-tabs',
  moduleTabMore: 'shell-module-tabs-more',
  backToFleet: 'shell-back-to-fleet',
  vesselSettingsCog: 'shell-vessel-settings',
  sidebar: 'shell-sidebar',
  sidebarCollapse: 'shell-sidebar-collapse',
  mobileNavTrigger: 'shell-mobile-nav-trigger',
  mobileNavDrawer: 'shell-mobile-nav-drawer',
  pageHeader: 'shell-page-header',
  main: 'shell-main',
  // Added by the spec critic (keys only; values frozen once shipped).
  skipLink: 'shell-skip-link',
  shellNotices: 'shell-notices',
  roadmapToggle: 'shell-roadmap-toggle',
  mobileNavClose: 'shell-mobile-nav-close',
  /** The shell's fallback h1, rendered only when the page brings none (heading contract). */
  fallbackHeading: 'shell-page-title',
  footer: 'shell-footer',
  /** A vessel tab: `${moduleTabPrefix}${module.id}` (e.g. `shell-module-tab-crew`). */
  moduleTabPrefix: 'shell-module-tab-',
} as const;

export const PALETTE_TEST_IDS = {
  dialog: 'command-palette',
  input: 'command-palette-input',
  list: 'command-palette-list',
} as const;

export type ShellTestId = (typeof SHELL_TEST_IDS)[keyof typeof SHELL_TEST_IDS];
export type PaletteTestId = (typeof PALETTE_TEST_IDS)[keyof typeof PALETTE_TEST_IDS];
