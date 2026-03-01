import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { canManageBranding } from '@/shared/hooks/useBranding';
import InkfishFooter from '@/shared/components/layout/InkfishFooter';
import InkfishWatermark from '@/shared/components/InkfishWatermark';
import GlobalHeaderControls from '@/shared/components/layout/GlobalHeaderControls';
import AdaptiveActionBar from '@/shared/components/layout/AdaptiveActionBar';
import SidebarNavigation from '@/shared/components/layout/SidebarNavigation';
import { DashboardFilterProvider } from '@/modules/dashboard/contexts/DashboardFilterContext';
import FeedbackPanel from '@/modules/feedback/components/FeedbackPanel';
import FeedbackResolvedToast from '@/modules/feedback/components/FeedbackResolvedToast';
import { useFeedbackStore } from '@/modules/feedback/store/feedbackStore';
import {
  LogOut,
  User,
  ChevronDown,
  Menu,
  X,
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
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { profile, signOut } = useAuth();
  const { clientDisplayName, brandColor, clientLogoUrl } = useBrandingContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

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
    <div className="min-h-screen bg-background flex relative">
      {/* Inkfish watermark - renders behind all content */}
      <InkfishWatermark />
      
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - z-10 to be above watermark */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo with client branding */}
          <div className="flex flex-col px-6 py-4 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <Link 
                to="/dashboard"
                className="text-xl sm:text-2xl font-black tracking-tight text-sidebar-foreground hover:text-sidebar-accent-foreground hover:opacity-80 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-sidebar-ring py-1"
                aria-label="STORM Home - Return to Dashboard"
                title="Return to Dashboard"
              >
                STORM
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-sidebar-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {clientDisplayName && (
              <span className="text-xs text-sidebar-foreground/70 mt-1 truncate">
                {clientDisplayName}
              </span>
            )}
          </div>

          {/* Navigation */}
          <SidebarNavigation onNavigate={() => setSidebarOpen(false)} />

          {/* Feedback button - above user profile */}
          <div className="px-3 pb-1">
            <button
              onClick={() => setPanelOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            >
              <MessageSquareWarning className="w-5 h-5" />
              <span>Report an Issue</span>
            </button>
          </div>

          {/* User info at bottom */}
          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 text-sidebar-foreground">
              <Avatar className="w-8 h-8">
                <AvatarFallback
                  className="text-sm"
                  style={{ backgroundColor: brandColor, color: 'white' }}
                >
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-xs text-sidebar-foreground/70 truncate">
                  {profile?.role ? roleLabels[profile.role] : ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content - z-10 to be above watermark */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top navbar */}
        <header className="h-14 lg:h-16 bg-card border-b border-border flex items-center justify-between px-3 lg:px-6 shadow-navbar relative z-20">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Frequently Used Quick Actions Bar */}
          <div className="flex-1 mx-2">
            <AdaptiveActionBar />
          </div>

          {/* Client logo */}
          {clientLogoUrl && (
            <div className="flex items-center mr-2">
              <img
                src={clientLogoUrl}
                alt="Client logo"
                className="max-h-6 sm:max-h-8 max-w-[80px] sm:max-w-[120px] object-contain"
              />
            </div>
          )}

          {/* Global Header Controls: Fleet Filter + Alerts Bell */}
          <GlobalHeaderControls className="mr-1 sm:mr-2" />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-1 sm:gap-2 px-2 sm:px-4">
                <Avatar className="w-7 h-7 sm:w-8 sm:h-8">
                  <AvatarFallback
                    className="text-xs sm:text-sm"
                    style={{ backgroundColor: brandColor, color: 'white' }}
                  >
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium">
                  {profile?.first_name}
                </span>
                <ChevronDown className="w-4 h-4 hidden sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover">
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <User className="w-4 h-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              {canAccessBranding && (
                <DropdownMenuItem onClick={() => navigate('/settings/branding')}>
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

        {/* Page content with washed-out client logo watermark */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto relative">
          {/* Client logo watermark - washed out behind content */}
          {clientLogoUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden" aria-hidden="true">
              <img
                src={clientLogoUrl}
                alt=""
                className="w-[60%] sm:w-[50%] lg:w-[40%] max-w-[500px] object-contain opacity-[0.04] grayscale"
                draggable={false}
              />
            </div>
          )}
          <div className="relative z-[1]">
            {children}
          </div>
        </main>

        {/* Inkfish ownership watermark - persistent, unaffected by client branding */}
        <InkfishFooter />
      </div>
    </div>

    {/* Feedback panel & resolved notification */}
    <FeedbackPanel />
    <FeedbackResolvedToast />
    </DashboardFilterProvider>
  );
};

export default DashboardLayout;
