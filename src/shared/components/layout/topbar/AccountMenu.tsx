/**
 * The account menu at the right of the top bar (gap/10 top bar element 9,
 * IA16; spec §6.6). Replaces the sidebar's account menu; it no longer narrows
 * the vessel scope (the scope control does that, D-71 as proposed).
 *
 * Header: name, user kind, job role, current vessel. Items: My profile,
 * Security, Appearance (Theme radio mirrored to the user's preferences,
 * gap/10 W1; Density radio on this device, D-19; Appearance settings…),
 * Keyboard shortcuts, Branding (account admins), Report an issue, Sign out.
 * Below 768 px a More group carries Favourites, Apps and Help, whose top-bar
 * buttons are hidden there; there Appearance and the More entries open in
 * place (with Back), since a side sub-menu cannot fit beside the menu on a
 * phone. Signature joins once its page is live (planned).
 *
 * The avatar's initials sit on Slate-900 with Drift-50 ink in both themes,
 * never on the tenant brand colour (D-DS4).
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AppWindow,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Keyboard,
  KeyRound,
  LogOut,
  MessageSquareWarning,
  Monitor,
  Moon,
  Palette,
  Rows3,
  Ship,
  SlidersHorizontal,
  Star,
  Sun,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDensity } from '@/components/ui/use-density';
import { isDensity, isThemePreference } from '@/components/ui/theme-config';
import { cn } from '@/lib/utils';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useFeedbackStore } from '@/modules/feedback/store/feedbackStore';
import { canManageBranding } from '@/shared/hooks/useBranding';
import { useThemeChoice } from '@/app/shell/themeChoice';
import { useShellActions } from '@/app/shell/shellActions';
import { SHELL_MEDIA, useMediaQuery } from '@/app/shell/useMediaQuery';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { ACCOUNT_PATHS, ROLE_LABELS, accountInitials, jobRoleOf } from './accountModel';
import { FavouritesMenuItems } from './FavouritesControl';
import { useHelpItems } from './helpItems';
import { useWorkspaceApps } from './useWorkspaceApps';
import { useShellVessel } from './useShellVessel';
import { focusRing } from './styles';
import TopBarTooltip from './TopBarTooltip';

const item = 'gap-2.5 [@media(pointer:coarse)]:min-h-11';
const icon = 'h-[18px] w-[18px] shrink-0 text-muted-foreground';

/** After the menu has closed and given focus back, so a dialog it opens keeps focus. */
const afterClose = (fn: () => void) => () => window.requestAnimationFrame(fn);

type Section = 'appearance' | 'favourites' | 'apps' | 'help';

const SECTION_TITLE: Readonly<Record<Section, string>> = {
  appearance: 'Appearance',
  favourites: 'Favourites',
  apps: 'Apps',
  help: 'Help',
};

/** Theme, density and the Appearance page link: a sub-menu on wide screens, a section on phones. */
const AppearanceItems: React.FC = () => {
  const { theme, choose } = useThemeChoice();
  const [density, setDensity] = useDensity();
  // Each radio group is named by its visible label.
  const themeLabelId = React.useId();
  const densityLabelId = React.useId();
  return (
    <>
      <DropdownMenuLabel id={themeLabelId} className="type-eyebrow text-muted-foreground">
        Theme
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-labelledby={themeLabelId}
        value={theme ?? undefined}
        onValueChange={(next) => {
          if (isThemePreference(next)) void choose(next);
        }}
      >
        <DropdownMenuRadioItem value="dark" className={item}>
          <Moon className={icon} strokeWidth={1.75} aria-hidden="true" />
          Dark
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="light" className={item}>
          <Sun className={icon} strokeWidth={1.75} aria-hidden="true" />
          Light
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system" className={item}>
          <Monitor className={icon} strokeWidth={1.75} aria-hidden="true" />
          System
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel id={densityLabelId} className="type-eyebrow text-muted-foreground">
        Density · this device
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-labelledby={densityLabelId}
        value={density}
        onValueChange={(next) => {
          if (isDensity(next)) setDensity(next);
        }}
      >
        <DropdownMenuRadioItem value="comfortable" className={item}>
          Comfortable
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="default" className={item}>
          Default
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="compact" className={item}>
          Compact
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className={item}>
        <Link to={ACCOUNT_PATHS.appearance}>
          <Rows3 className={icon} strokeWidth={1.75} aria-hidden="true" />
          Appearance settings…
        </Link>
      </DropdownMenuItem>
    </>
  );
};

const AppItems: React.FC = () => {
  const { apps } = useWorkspaceApps();
  return (
    <>
      {apps.map((app) => (
        <DropdownMenuItem key={app.id} asChild className={item}>
          <Link to={app.path}>
            <app.icon className={icon} strokeWidth={1.75} aria-hidden="true" />
            {app.label}
          </Link>
        </DropdownMenuItem>
      ))}
    </>
  );
};

const HelpItems: React.FC = () => {
  const help = useHelpItems();
  return (
    <>
      {help.map((entry) =>
        entry.to ? (
          <DropdownMenuItem key={entry.id} asChild className={item}>
            <Link to={entry.to}>
              <entry.icon className={icon} strokeWidth={1.75} aria-hidden="true" />
              {entry.label}
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem key={entry.id} className={item} onSelect={afterClose(() => entry.onSelect?.())}>
            <entry.icon className={icon} strokeWidth={1.75} aria-hidden="true" />
            {entry.label}
          </DropdownMenuItem>
        ),
      )}
    </>
  );
};

/**
 * One section of the menu on a phone. A sub-menu beside a 288 px menu cannot
 * fit on a 390 px screen, so below 768 px Appearance, Favourites, Apps and
 * Help open in place, with Back to the main list.
 */
const SectionView: React.FC<{ section: Section; onBack: () => void }> = ({ section, onBack }) => {
  const back = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => back.current?.focus(), [section]);
  return (
    <>
      <DropdownMenuItem
        ref={back}
        className={item}
        onSelect={(event) => {
          event.preventDefault();
          onBack();
        }}
      >
        <ChevronLeft className={icon} strokeWidth={1.75} aria-hidden="true" />
        Back
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {section === 'appearance' && <AppearanceItems />}
      {section === 'favourites' && <FavouritesMenuItems />}
      {section === 'apps' && (
        <>
          <DropdownMenuLabel className="type-eyebrow text-muted-foreground">{SECTION_TITLE.apps}</DropdownMenuLabel>
          <AppItems />
        </>
      )}
      {section === 'help' && (
        <>
          <DropdownMenuLabel className="type-eyebrow text-muted-foreground">{SECTION_TITLE.help}</DropdownMenuLabel>
          <HelpItems />
        </>
      )}
    </>
  );
};

/** The phone-only More group: Favourites, Apps (when any workspace is open to the user) and Help. */
const MoreItems: React.FC<{ item: (key: Section, Icon: LucideIcon, label: string) => React.ReactNode }> = ({ item: render }) => {
  const { apps } = useWorkspaceApps();
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="type-eyebrow text-muted-foreground">More</DropdownMenuLabel>
      {render('favourites', Star, 'Favourites')}
      {apps.length > 0 && render('apps', AppWindow, 'Apps')}
      {render('help', CircleHelp, 'Help')}
    </>
  );
};

/** An item that opens a section in place (phones). */
const SectionItem = React.forwardRef<HTMLDivElement, { section: Section; onOpen: (section: Section) => void; children: React.ReactNode }>(
  ({ section, onOpen, children }, ref) => (
    <DropdownMenuItem
      ref={ref}
      className={item}
      aria-haspopup="menu"
      onSelect={(event) => {
        event.preventDefault();
        onOpen(section);
      }}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
    </DropdownMenuItem>
  ),
);
SectionItem.displayName = 'SectionItem';

const AccountMenu: React.FC<{ className?: string }> = ({ className }) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const setPanelOpen = useFeedbackStore((s) => s.setPanelOpen);
  const { openKeyboardShortcuts } = useShellActions();
  const wide = useMediaQuery(SHELL_MEDIA.md);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [section, setSection] = React.useState<Section | null>(null);
  const [returnTo, setReturnTo] = React.useState<Section | null>(null);
  const sectionItems = React.useRef<Partial<Record<Section, HTMLDivElement | null>>>({});

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  const initials = accountInitials(profile);
  const kind = profile?.role ? ROLE_LABELS[profile.role] ?? profile.role : null;
  const jobRole = jobRoleOf(profile);
  const vessel = useShellVessel();

  // Back from a section: focus the item that opened it.
  React.useEffect(() => {
    if (section === null && returnTo) sectionItems.current[returnTo]?.focus();
  }, [section, returnTo]);

  const openSection = (next: Section) => {
    setReturnTo(next);
    setSection(next);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const sectionItem = (key: Section, Icon: LucideIcon, label: string) => (
    <SectionItem
      section={key}
      onOpen={openSection}
      ref={(el) => {
        sectionItems.current[key] = el;
      }}
    >
      <Icon className={icon} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </SectionItem>
  );

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) {
          setSection(null);
          setReturnTo(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <TopBarTooltip label="Account" suppressed={menuOpen}>
          <button
            type="button"
            data-testid={SHELL_TEST_IDS.accountTrigger}
            aria-label={fullName ? `Account menu for ${fullName}` : 'Account menu'}
            className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full', focusRing, className)}
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-slate-ui-900 text-sm font-semibold text-drift-50">{initials}</AvatarFallback>
            </Avatar>
          </button>
        </TopBarTooltip>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        data-testid={SHELL_TEST_IDS.accountMenu}
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto"
      >
        {section ? (
          <SectionView section={section} onBack={() => setSection(null)} />
        ) : (
          <>
            <div className="px-2 pb-2 pt-1.5">
              <p className="type-body truncate font-semibold text-foreground">{fullName || 'Signed in'}</p>
              {(kind || jobRole) && (
                <p className="type-caption truncate text-muted-foreground">{[kind, jobRole].filter(Boolean).join(' · ')}</p>
              )}
              {vessel && (
                <p className="type-caption mt-1 flex min-w-0 items-center gap-1.5 text-foreground">
                  <Ship className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                  <span className="sr-only">Current vessel: </span>
                  <span className="truncate font-display">{vessel.name}</span>
                </p>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className={item}>
                <Link to={ACCOUNT_PATHS.profile}>
                  <User className={icon} strokeWidth={1.75} aria-hidden="true" />
                  My profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={item}>
                <Link to={ACCOUNT_PATHS.security}>
                  <KeyRound className={icon} strokeWidth={1.75} aria-hidden="true" />
                  Security
                </Link>
              </DropdownMenuItem>
              {wide ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className={item}>
                    <SlidersHorizontal className={icon} strokeWidth={1.75} aria-hidden="true" />
                    Appearance
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-60">
                    <AppearanceItems />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                sectionItem('appearance', SlidersHorizontal, 'Appearance')
              )}
              {openKeyboardShortcuts && (
                <DropdownMenuItem className={item} onSelect={afterClose(openKeyboardShortcuts)}>
                  <Keyboard className={icon} strokeWidth={1.75} aria-hidden="true" />
                  Keyboard shortcuts
                </DropdownMenuItem>
              )}
              {canManageBranding(profile?.role) && (
                <DropdownMenuItem asChild className={item}>
                  <Link to={ACCOUNT_PATHS.branding}>
                    <Palette className={icon} strokeWidth={1.75} aria-hidden="true" />
                    Branding
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className={item} onSelect={afterClose(() => setPanelOpen(true))}>
                <MessageSquareWarning className={icon} strokeWidth={1.75} aria-hidden="true" />
                Report an issue
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {!wide && <MoreItems item={sectionItem} />}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={cn(item, 'text-destructive focus:text-destructive')}
              onSelect={() => {
                void handleSignOut();
              }}
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AccountMenu;
