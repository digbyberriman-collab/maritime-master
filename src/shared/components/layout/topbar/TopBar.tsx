/**
 * The global top bar (gap/10 "Top bar", IA2; spec §1, §6.8): 52 px below
 * 1024 px, 56 px from 1024 px; Abyss (Daylight: white) at 88 % behind an 8 px
 * blur, with a 1 px bottom border. Warning-muted while impersonating.
 *
 *   < 640     ☰ · scope control (fills the middle) · search · bell · avatar,
 *             the avatar at the right edge even when there is no scope
 *             control; no workspace chip, the vessel as its code
 *   < 400     the vessel's AIS mark and compliance dot are left out
 *   < 360     with the switcher's chevron, only the lit scope segment shows
 *   640–767   + tenant logo, the workspace chip
 *   768–1023  + Apps, favourites, Help; the sidebar is still the drawer
 *   ≥ 1024    56 px, static sidebar (the menu button goes)
 *   ≥ 1280    search as a 280 px field with its shortcut
 *
 * Every control is 44 × 44 on a coarse pointer (`--control-h`, D-35), and no
 * two controls overlap at any width from 320 px (the visual harness checks
 * this as `topbarCollisions`). The row never overflows: the scope control is
 * the one part that shrinks, and it clips inside its own box, so it can never
 * paint over Search. The right-hand group sits above it (`relative z-10`), so
 * Search, the bell and the account button also win hit-testing over the
 * segments' enlarged touch areas, and `ml-auto` keeps it at the right edge
 * when the scope control renders nothing.
 *
 * The top bar stays mounted for the whole shell, so it also abandons a
 * vessel switch still in flight whenever the location changes
 * (`useInvalidateVesselSwitchOnNavigate`).
 */
import React from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useInvalidateVesselSwitchOnNavigate } from '@/app/nav/useVesselSwitch';
import TenantLogo from './TenantLogo';
import ScopeControl from './ScopeControl';
import AppsMenu from './AppsMenu';
import SearchTrigger from './SearchTrigger';
import FavouritesControl from './FavouritesControl';
import HelpMenu from './HelpMenu';
import AccountMenu from './AccountMenu';
import NotificationBell from '../NotificationBell';
import { topBarIconButton } from './styles';

export interface TopBarProps {
  /** Show the menu button that opens the navigation drawer. */
  mobileNavAvailable: boolean;
  /** The drawer is used at every width (a page asked for the wide layout), not only below 1024 px. */
  mobileNavAtAllWidths?: boolean;
  mobileNavOpen: boolean;
  onOpenMobileNav: () => void;
  mobileNavTriggerRef?: React.Ref<HTMLButtonElement>;
  /** Warning-muted surface while viewing as someone else. */
  impersonating?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({
  mobileNavAvailable,
  mobileNavAtAllWidths = false,
  mobileNavOpen,
  onOpenMobileNav,
  mobileNavTriggerRef,
  impersonating = false,
}) => {
  useInvalidateVesselSwitchOnNavigate();
  return (
    <header
      data-testid={SHELL_TEST_IDS.topBar}
      data-impersonating={impersonating || undefined}
      className={cn(
        'flex h-[52px] min-w-0 items-center gap-1 border-b px-2 backdrop-blur-md sm:gap-2 sm:px-3 lg:h-14 lg:px-4',
        impersonating ? 'border-warning/25 bg-warning-muted' : 'border-border bg-topbar/[0.88]',
      )}
    >
      {mobileNavAvailable && (
        <button
          ref={mobileNavTriggerRef}
          type="button"
          data-testid={SHELL_TEST_IDS.mobileNavTrigger}
          onClick={onOpenMobileNav}
          aria-label="Open navigation drawer"
          aria-haspopup="dialog"
          aria-controls="mobile-navigation-drawer"
          aria-expanded={mobileNavOpen}
          className={cn(topBarIconButton, 'text-foreground', !mobileNavAtAllWidths && 'lg:hidden')}
        >
          <Menu strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
      <TenantLogo className="hidden sm:flex" />
      <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-border sm:block" />
      <ScopeControl className="min-w-0 flex-1 sm:flex-initial" />
      <AppsMenu className="hidden md:inline-flex" />
      <div className="hidden min-w-0 flex-1 sm:block" />
      <div className="relative z-10 ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <SearchTrigger />
        <FavouritesControl className="hidden md:flex" />
        <HelpMenu className="hidden md:inline-flex" />
        <NotificationBell />
        <AccountMenu className="ml-0.5" />
      </div>
    </header>
  );
};

export default TopBar;
