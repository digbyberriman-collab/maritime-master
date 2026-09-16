import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { canManageBranding } from '@/shared/hooks/useBranding';
import InkfishFooter from '@/shared/components/layout/InkfishFooter';
import InkfishWatermark from '@/shared/components/InkfishWatermark';
import GlobalHeaderControls from '@/shared/components/layout/GlobalHeaderControls';
import SidebarNavigation from '@/shared/components/layout/SidebarNavigation';
import ModuleTopNav from '@/shared/components/layout/ModuleTopNav';
import FloatingQuickActions from '@/shared/components/layout/FloatingQuickActions';
import { NAVIGATION_ITEMS, type NavChild } from '@/config/navigation';
import { resolveModuleForPath } from '@/shared/lib/moduleNavigation';
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
  const activeModule = React.useMemo(() => resolveModuleForPath(location.pathname), [location.pathname]);

  const firstLeafPath = React.useCallback((children?: NavChild[]): string | null => {
    for (const child of children ?? []) {
      const nested = firstLeafPath(child.children);
      if (nested) return nested;
      if (!child.children?.length) return child.path;
    }
    return null;
  }, []);

  const handleModuleChange = React.useCallback((moduleId: string) => {
    const module = NAVIGATION_ITEMS.find((item) => item.id === moduleId);
    const destination = firstLeafPath(module?.children) ?? module?.path;
    if (destination) navigate(destination);
  }, [firstLeafPath, navigate]);

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
          <SidebarNavigation moduleId={activeModule?.id ?? null} onNavigate={() => setSidebarOpen(false)} />

          {/* Bottom-pinned group: Report an Issue, Settings, User profile.
              mt-auto keeps it anchored to the bottom regardless of nav length;
              shrink-0 prevents it from being compressed away. */}
          <div className="mt-auto shrink-0">
            <div className="px-3 pb-1 pt-2">
              <button
                onClick={() => setPanelOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              >
                <MessageSquareWarning className="w-5 h-5" />
                <span>Report an Issue</span>
              </button>
            </div>

            <div className="px-3 pb-2">
              <button
                onClick={() => navigate('/settings')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </button>
            </div>

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
        </div>
      </aside>

      {/* Main content - z-10 to be above watermark */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top navbar */}
        <header className="min-h-16 bg-card border-b border-border flex items-center gap-2 px-3 lg:px-5 py-2 shadow-navbar relative z-20">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>

          <ModuleTopNav activeModuleId={activeModule?.id ?? null} onModuleChange={handleModuleChange} />

          {/* Client logo (desktop only) */}
          {clientLogoUrl && (
            <div className="hidden lg:flex items-center mr-2">
              <img
                src={clientLogoUrl}
                alt="Client logo"
                className="max-h-8 max-w-[120px] object-contain"
              />
            </div>
          )}

          {/* Right-side chip cluster (Sealogical-style pill controls) */}
          <div className="flex items-center gap-2">
            {/* Global Header Controls (multi-vessel filter + bell) */}
            <GlobalHeaderControls className="hidden sm:flex" />

            {/* Role chip */}
            {profile?.role && (
              <span className="hidden lg:inline-flex items-center h-8 px-3 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground">
                {roleLabels[profile.role] || profile.role}
              </span>
            )}

            {/* User menu chip */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full h-8 gap-2">
                <Avatar className="w-8 h-8">
                  <AvatarFallback 
                    className="text-sm"
                    style={{ backgroundColor: brandColor, color: 'white' }}
                  >
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium max-w-[180px] truncate">
                  {profile?.email || profile?.first_name}
                </span>
                <ChevronDown className="w-4 h-4" />
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
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>

        <FloatingQuickActions />

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
