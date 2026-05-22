import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { canManageBranding } from '@/shared/hooks/useBranding';
import InkfishFooter from '@/shared/components/layout/InkfishFooter';
import InkfishWatermark from '@/shared/components/InkfishWatermark';
import GlobalHeaderControls from '@/shared/components/layout/GlobalHeaderControls';
import AdaptiveActionBar from '@/shared/components/layout/AdaptiveActionBar';
import SidebarNavigation from '@/shared/components/layout/SidebarNavigation';
import SmartTabBar from '@/shared/components/layout/SmartTabBar';
import UniversalSearch from '@/shared/components/layout/UniversalSearch';
import { DashboardFilterProvider } from '@/modules/dashboard/contexts/DashboardFilterContext';
import FeedbackPanel from '@/modules/feedback/components/FeedbackPanel';
import FeedbackResolvedToast from '@/modules/feedback/components/FeedbackResolvedToast';
import { useFeedbackStore } from '@/modules/feedback/store/feedbackStore';
import {
  LogOut,
  User,
  ChevronDown,
  Palette,
  Settings,
  MessageSquareWarning,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { profile, signOut } = useAuth();
  const { clientDisplayName, brandColor, clientLogoUrl } = useBrandingContext();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const userInitials = profile
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : 'U';

  const roleLabels: Record<string, string> = {
    master: 'Master',
    chief_engineer: 'Chief Engineer',
    chief_officer: 'Chief Officer',
    crew: 'Crew',
    dpa: 'DPA',
    shore_management: 'Shore Management',
  };

  const canAccessBranding = canManageBranding(profile?.role);
  const { setPanelOpen } = useFeedbackStore();

  return (
    <DashboardFilterProvider>
      <SidebarProvider defaultOpen>
        <div className="min-h-screen w-full bg-background flex relative">
          {/* Inkfish watermark - renders behind all content */}
          <InkfishWatermark />

          <Sidebar collapsible="icon" className="z-40">
            <SidebarHeader className="px-4 py-3 border-b border-sidebar-border">
              <Link
                to="/home"
                className="flex flex-col text-sidebar-foreground hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-sidebar-ring rounded"
                aria-label="STORM Home"
                title="Return to Home"
              >
                <span className="text-xl font-black tracking-tight leading-none group-data-[collapsible=icon]:hidden">
                  STORM
                </span>
                <span className="hidden group-data-[collapsible=icon]:inline text-sm font-black tracking-tight">
                  S
                </span>
                {clientDisplayName && (
                  <span className="text-xs text-sidebar-foreground/70 mt-1 truncate group-data-[collapsible=icon]:hidden">
                    {clientDisplayName}
                  </span>
                )}
              </Link>
            </SidebarHeader>

            <SidebarContent className="px-2">
              <SidebarNavigation />
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border">
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
                title="Report an Issue"
              >
                <MessageSquareWarning className="w-5 h-5 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Report an Issue</span>
              </button>

              <div className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback
                    className="text-sm"
                    style={{ backgroundColor: brandColor, color: 'white' }}
                  >
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="text-sm font-medium truncate">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="text-xs text-sidebar-foreground/70 truncate">
                    {profile?.role ? roleLabels[profile.role] : ''}
                  </p>
                </div>
              </div>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="relative z-10 min-w-0">
            {/* Top navbar */}
            <header className="h-16 bg-card border-b border-border flex items-center gap-2 px-3 lg:px-4 shadow-navbar relative z-20">
              <SidebarTrigger className="shrink-0" />

              {/* Universal Search */}
              <UniversalSearch className="hidden sm:inline-flex" />

              {/* Frequently Used Quick Actions Bar */}
              <div className="hidden lg:block flex-1 min-w-0 mx-2">
                <AdaptiveActionBar />
              </div>

              <div className="flex-1 lg:hidden" />

              {/* Client logo (desktop only) */}
              {clientLogoUrl && (
                <div className="hidden lg:flex items-center mr-2 shrink-0">
                  <img
                    src={clientLogoUrl}
                    alt="Client logo"
                    className="max-h-8 max-w-[120px] object-contain"
                  />
                </div>
              )}

              {/* Global Header Controls: Fleet Filter + Alerts Bell */}
              <GlobalHeaderControls className="mr-2 shrink-0" />

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 shrink-0">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback
                        className="text-sm"
                        style={{ backgroundColor: brandColor, color: 'white' }}
                      >
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-medium">
                      {profile?.first_name}
                    </span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-popover">
                  <DropdownMenuItem onClick={() => navigate('/administration/vessel-settings')}>
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/administration/vessel-settings')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  {canAccessBranding && (
                    <DropdownMenuItem onClick={() => navigate('/administration/branding')}>
                      <Palette className="w-4 h-4 mr-2" />
                      Branding
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            {/* Smart tab bar — renders nothing on routes that don't belong to a domain */}
            <SmartTabBar />

            {/* Page content */}
            <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>

            <InkfishFooter />
          </SidebarInset>
        </div>
      </SidebarProvider>

      {/* Feedback panel & resolved notification */}
      <FeedbackPanel />
      <FeedbackResolvedToast />
    </DashboardFilterProvider>
  );
};

export default DashboardLayout;
