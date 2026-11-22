/**
 * The account's logo at the left of the top bar (gap/10 top bar element 1,
 * DS5; spec §2.1). A tenant logo sits on a light plate so dark ink stays
 * legible on Abyss; the plate's 1 px edge takes the tenant brand colour,
 * which is data (D-DS4: the brand colour never replaces Signal). No logo:
 * the display name in the display face. Neither: the STORM wordmark.
 * The link goes to the user's home (gap/01 landing rules).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';

export const StormWordmark: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn('font-display text-lg font-semibold uppercase leading-none tracking-[0.2em] text-foreground', className)}>
    STORM
  </span>
);

export interface TenantLogoProps {
  className?: string;
  /**
   * The surface it sits on: the top bar (theme surface, the default) or the
   * navigation drawer's header (the sidebar, Abyss in both themes), which
   * changes the ink of the name and wordmark and the focus ring offset.
   */
  surface?: 'topbar' | 'sidebar';
}

const TenantLogo: React.FC<TenantLogoProps> = ({ className, surface = 'topbar' }) => {
  const onSidebar = surface === 'sidebar';
  const { clientLogoUrl, clientDisplayName, brandColor, isLoading } = useBrandingContext();
  const access = useScopeAccess();
  const [logoFailed, setLogoFailed] = React.useState(false);
  React.useEffect(() => setLogoFailed(false), [clientLogoUrl]);
  const name = clientDisplayName?.trim() || null;
  const home = access.ready ? access.homePath : '/';
  const showLogo = Boolean(clientLogoUrl) && !logoFailed;

  return (
    <Link
      to={home}
      data-testid={SHELL_TEST_IDS.tenantLogo}
      aria-label={`${name ?? 'STORM'}, go to my start page`}
      className={cn(
        'min-h-11 shrink-0 items-center rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        onSidebar ? 'focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar' : 'focus-visible:ring-ring focus-visible:ring-offset-background',
        className,
      )}
    >
      {isLoading ? (
        <span aria-hidden="true" className={cn('block h-7 w-24 rounded-md', onSidebar ? 'bg-sidebar-accent' : 'bg-muted')} />
      ) : showLogo ? (
        <span
          className="flex h-7 max-w-[140px] items-center rounded-md border border-transparent bg-drift-50 p-1"
          style={brandColor ? { borderColor: brandColor } : undefined}
        >
          <img
            src={clientLogoUrl ?? undefined}
            alt=""
            className="max-h-[18px] max-w-[130px] object-contain object-left"
            onError={() => setLogoFailed(true)}
            draggable={false}
          />
        </span>
      ) : name ? (
        <span
          className={cn(
            'type-title block max-w-[140px] truncate font-display font-semibold',
            onSidebar ? 'text-sidebar-foreground' : 'text-foreground',
          )}
        >
          {name}
        </span>
      ) : (
        <StormWordmark className={onSidebar ? 'text-sidebar-foreground' : undefined} />
      )}
    </Link>
  );
};

export default TenantLogo;
