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
 * shows the saved state only, never an unsaved success.
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { usePinnedShortcuts } from '@/shared/hooks/usePinnedShortcuts';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { topBarIconButton } from './styles';
import { useCurrentFavourite } from './useCurrentFavourite';

const MANAGE_FAVOURITES_PATH = '/me/shortcuts';

/** The favourites list as dropdown items: the top-bar menu and the account menu's More group share it. */
export const FavouritesMenuItems: React.FC = () => {
  const { pins, status, retry } = usePinnedShortcuts();
  const { pathname, search } = useLocation();
  const here = `${pathname}${search}`;

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
        pins.map((pin) => {
          const current = pin.shortcut_target === here;
          return (
            <DropdownMenuItem key={pin.id} asChild>
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
        })}
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
  const pinned = status === 'ready' && isPinned(page.target);
  const waiting = status !== 'ready' || toggling;
  const label = pinned ? `Remove ${page.label} from favourites` : `Add ${page.label} to favourites`;
  const hint = status === 'error' ? 'Favourites could not load' : status === 'loading' ? 'Loading favourites…' : label;

  const onToggle = () => {
    if (waiting) return;
    void togglePin(page);
  };

  return (
    <div className={cn('items-center', className)}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent side="bottom" className="type-caption">
            {hint}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid={SHELL_TEST_IDS.favouritesTrigger}
            aria-label="Favourites"
            className={cn(topBarIconButton, 'w-6 rounded-l-none [@media(pointer:coarse)]:w-8 [&_svg]:h-4 [&_svg]:w-4')}
          >
            <ChevronDown strokeWidth={1.75} aria-hidden="true" />
          </button>
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
