import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, LogOut, MessageSquareWarning, Palette, Settings, Ship, User } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useDashboardFilter } from '@/modules/dashboard/contexts/DashboardFilterContext';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { canManageBranding } from '@/shared/hooks/useBranding';
import { useFeedbackStore } from '@/modules/feedback/store/feedbackStore';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROLE_LABELS: Record<string, string> = {
  master: 'Master',
  captain: 'Captain',
  chief_engineer: 'Chief Engineer',
  chief_officer: 'Chief Officer',
  crew: 'Crew',
  dpa: 'DPA',
  shore_management: 'Shore Management',
};

interface SidebarAccountMenuProps {
  onNavigate?: () => void;
}

const SidebarAccountMenu: React.FC<SidebarAccountMenuProps> = ({ onNavigate }) => {
  const { profile, signOut } = useAuth();
  const { vessels, loading, selectedVessel, setSelectedVesselById } = useVessel();
  const { selectedVesselIds, setSelectedVesselIds } = useDashboardFilter();
  const { brandColor } = useBrandingContext();
  const { setPanelOpen } = useFeedbackStore();
  const navigate = useNavigate();

  const initials = profile
    ? `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U';
  const role = profile?.role ? ROLE_LABELS[profile.role] || profile.role : '';
  const allSelected = vessels.length > 0 && selectedVesselIds.length === vessels.length;
  const vesselLabel = allSelected
    ? 'All vessels'
    : selectedVesselIds.length === 1
      ? vessels.find((vessel) => vessel.id === selectedVesselIds[0])?.name ?? '1 vessel'
      : `${selectedVesselIds.length} vessels`;

  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const selectOnly = (vesselId: string) => {
    setSelectedVesselById(vesselId);
    setSelectedVesselIds([vesselId]);
  };

  const selectAll = () => {
    const all = vessels.map((vessel) => vessel.id);
    if (all.length > 0) setSelectedVesselIds(all);
  };



  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="border-t border-sidebar-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className="text-sm text-primary-foreground" style={{ backgroundColor: brandColor }}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">
                {profile?.first_name} {profile?.last_name}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-sidebar-foreground/70">
                <span className="shrink-0">{role}</span>
                <span aria-hidden="true">·</span>
                <Ship className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{loading ? 'Loading vessels' : vesselLabel}</span>
              </span>
            </span>
            <ChevronUp className="h-4 w-4 shrink-0 text-sidebar-foreground/60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-64 bg-popover">
          {!loading && vessels.length > 0 && (
            <>
              <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                <Ship className="h-4 w-4" />
                Vessel scope
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={allSelected} onCheckedChange={toggleAll} onSelect={(event) => event.preventDefault()}>
                All vessels
              </DropdownMenuCheckboxItem>
              {vessels.map((vessel) => (
                <DropdownMenuCheckboxItem
                  key={vessel.id}
                  checked={selectedVesselIds.includes(vessel.id)}
                  onCheckedChange={() => toggleVessel(vessel.id)}
                  onSelect={(event) => event.preventDefault()}
                  className="pr-2"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate">{vessel.name}</span>
                    <button
                      type="button"
                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); selectOnly(vessel.id); }}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        selectedVessel?.id === vessel.id
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {selectedVessel?.id === vessel.id ? 'Active' : 'Only'}
                    </button>
                  </span>
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => go('/settings')}>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          {canManageBranding(profile?.role) && (
            <DropdownMenuItem onClick={() => go('/settings/branding')}>
              <Palette className="mr-2 h-4 w-4" />
              Branding
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setPanelOpen(true)}>
            <MessageSquareWarning className="mr-2 h-4 w-4" />
            Report an issue
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default SidebarAccountMenu;