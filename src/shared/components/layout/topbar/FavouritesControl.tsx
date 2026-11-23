/**
 * Favourites in the top bar (gap/10 top bar element 6, IA13; spec §6.4): a
 * star that pins or unpins the current page, and a menu of the user's real
 * pins (no suggested defaults) with "Manage favourites". Backed by
 * `user_pinned_shortcuts` through `usePinnedShortcuts`; replaces the old
 * floating quick-action button.
 *
 * Fail closed: the star waits (aria-disabled) while the pins load, while a
 * change is being saved (a second click cannot add a duplicate), and after a
 * load error (with the reason in its tooltip and a Retry in the menu). It
 * shows the saved state only, never an unsaved success. There is no star
 * where there is no page to pin: on a vessel page whose vessel has not
 * resolved (unknown, out of reach, sold, or still loading), and on every
 * shell-owned state other than ModuleOff (the in-scope 404, "Vessel not
 * found", access denied, archived, no vessel, the module-settings error),
 * which name themselves through the page location override. ModuleOff keeps
 * the star: its page exists, only switched off.
 *
 * Only in-app paths become links (`isInAppPath`): a stored target such as
 * `javascript:…`, `https://…` or `//host` is listed as "Not a page in STORM"
 * with Remove, and never navigates. Each in-app pin is then resolved by scope
 * (`usePinAvailability`: fleet reach, vessel reach, that vessel's module
 * settings, the workspace's Apps entry): a pin the viewer can no longer open
 * is listed as "No longer available" with Remove, and a pin waits (no link)
 * while access loads.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Loader2, RotateCw, Settings2, Star } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { isInAppPath, usePinnedShortcuts, type PinnedShortcut } from '@/shared/hooks/usePinnedShortcuts';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { topBarIconButton } from './styles';
import { useCurrentFavourite } from './useCurrentFavourite';
import { usePinAvailability } from './pinAvailability';
import TopBarTooltip from './TopBarTooltip';

const MANAGE_FAVOURITES_PATH = '/me/shortcuts';

/** A pin that is not a link: selecting it removes the pin, and the menu stays open. */
const RemovablePin: React.FC<{ pin: PinnedShortcut; reason: string; onRemove: (target: string) => void }> = ({ pin, reason, onRemove }) => (
  <DropdownMenuItem
    aria-label={`Remove ${pin.shortcut_label}, ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`}
    className="gap-2 text-muted-foreground"
    onSelect={(event) => {
      event.preventDefault();
      onRemove(pin.shortcut_target);
    }}
  >
    <Star className="h-[18px] w-[18px] shrink-0 opacity-60" strokeWidth={1.75} aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block truncate">{pin.shortcut_label}</span>
      <span className="type-caption block">{reason}</span>
    </span>
    <span className="type-caption shrink-0 font-medium text-primary">Remove</span>
  </DropdownMenuItem>
);

/**
 * One in-app pin, resolved by scope while the menu is open (D-93, D-04): a
 * link when the viewer can open it, "No longer available" with Remove when
 * they cannot, and a muted row with no link while access loads.
 */
const PinItem: React.FC<{ pin: PinnedShortcut; current: boolean; onRemove: (target: string) => void }> = ({ pin, current, onRemove }) => {
  const availability = usePinAvailability(pin.shortcut_target);
  if (availability === 'unavailable') return <RemovablePin pin={pin} reason="No longer available" onRemove={onRemove} />;
  if (availability === 'waiting') {
    return (
      // Disabled: aria-disabled, skipped by the arrow keys, never a link until access is in.
      <DropdownMenuItem disabled data-pin-state="waiting" className="gap-2 text-muted-foreground">
        <Star className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{pin.shortcut_label}</span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem asChild>
      <Link to={pin.shortcut_target} aria-current={current ? 'page' : undefined} className="gap-2">
        <Star
          className={cn('h-[18px] w-[18px] shrink-0', current ? 'fill-primary text-primary' : 'text-muted-foreground')}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{pin.shortcut_label}</span>
        {current && <span className="type-caption shrink-0 text-muted-foreground">This page</span>}
      </Link>
    </DropdownMenuItem>
  );
};

/** The favourites list as dropdown items: the top-bar menu and the account menu's More group share it. */
export const FavouritesMenuItems: React.FC = () => {
  const { pins, status, retry, removePin } = usePinnedShortcuts();
  const { pathname, search } = useLocation();
  const here = `${pathname}${search}`;
  const remove = React.useCallback((target: string) => void removePin(target), [removePin]);

  return (
    <>
      <DropdownMenuLabel className="type-eyebrow text-muted-foreground">Favourites</DropdownMenuLabel>
      {status === 'loading' && (
        <div role="status" className="type-body-sm flex items-center gap-2 px-2 py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          Loading favourites…
        </div>
      )}
      {status === 'error' && (
        <>
          <p role="alert" className="type-body-sm px-2 py-1.5 text-destructive">
            Favourites could not load.
          </p>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              void retry();
            }}
          >
            <RotateCw className="mr-2 h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
            Retry
          </DropdownMenuItem>
        </>
      )}
      {status === 'ready' && pins.length === 0 && (
        <p className="type-body-sm max-w-[16rem] px-2 py-2 text-muted-foreground">Star a page to keep it here.</p>
      )}
      {status === 'ready' &&
        pins.map((pin) =>
          isInAppPath(pin.shortcut_target) ? (
            <PinItem key={pin.id} pin={pin} current={pin.shortcut_target === here} onRemove={remove} />
          ) : (
            // Not a page of this app: never a link. Selecting it removes the pin.
            <RemovablePin key={pin.id} pin={pin} reason="Not a page in STORM" onRemove={remove} />
          ),
        )}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link to={MANAGE_FAVOURITES_PATH} className="gap-2">
          <Settings2 className="h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          Manage favourites
        </Link>
      </DropdownMenuItem>
    </>
  );
};

const FavouritesControl: React.FC<{ className?: string }> = ({ className }) => {
  const { status, isPinned, togglePin, toggling } = usePinnedShortcuts();
  const page = useCurrentFavourite();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pinned = status === 'ready' && page !== null && isPinned(page.target);
  const waiting = status !== 'ready' || toggling;
  const label = page ? (pinned ? `Remove ${page.label} from favourites` : `Add ${page.label} to favourites`) : '';
  const hint = status === 'error' ? 'Favourites could not load' : status === 'loading' ? 'Loading favourites…' : label;

  const onToggle = () => {
    if (waiting || !page) return;
    void togglePin(page);
  };

  return (
    <div className={cn('items-center', className)}>
      {page && (
        <TopBarTooltip label={hint}>
          <button
            type="button"
            data-testid={SHELL_TEST_IDS.favouriteToggle}
            aria-pressed={pinned}
            aria-disabled={waiting || undefined}
            aria-label={status === 'error' ? `${label} (favourites could not load)` : label}
            onClick={onToggle}
            className={cn(topBarIconButton, 'rounded-r-none', waiting && 'cursor-not-allowed opacity-60 hover:bg-transparent')}
          >
            {toggling ? (
              <Loader2 className="motion-safe:animate-spin" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Star className={cn(pinned && 'fill-primary text-primary')} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </TopBarTooltip>
      )}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <TopBarTooltip label="Favourites" suppressed={menuOpen}>
            <button
              type="button"
              data-testid={SHELL_TEST_IDS.favouritesTrigger}
              aria-label="Favourites"
              className={cn(
                topBarIconButton,
                // 24 px beside the star on a fine pointer; 44 px on touch (D-35), like the vessel switcher's chevron.
                'w-6 [@media(pointer:coarse)]:w-11 [&_svg]:h-4 [&_svg]:w-4',
                page && 'rounded-l-none',
              )}
            >
              <ChevronDown
                className="transition-transform duration-quick ease-tide motion-reduce:transition-none [[data-state=open]>&]:rotate-180"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          </TopBarTooltip>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          data-testid={SHELL_TEST_IDS.favouritesMenu}
          className="w-[min(18rem,calc(100vw-2rem))]"
        >
          <FavouritesMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default FavouritesControl;
