import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBrandingContext } from '@/contexts/BrandingContext';
import { canManageBranding } from '@/hooks/useBranding';
import InkfishFooter from '@/components/layout/InkfishFooter';
import InkfishWatermark from '@/components/InkfishWatermark';
import NotificationBell from '@/components/layout/NotificationBell';
import VesselSelector from '@/components/VesselSelector';
import SidebarNavigation from '@/components/layout/SidebarNavigation';
import {
  LogOut,
  User,
  ChevronDown,
  Menu,
  X,
  Palette,
  Settings,
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

  return (
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

      {/* Sidebar - Desktop: always visible, Mobile: slide in/out */}
      {/* Desktop sidebar - always visible on lg+ screens */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-sidebar z-10">
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
            </div>
            {clientDisplayName && (
              <span className="text-xs text-sidebar-foreground/70 mt-1 truncate">
                {clientDisplayName}
              </span>
            )}
          </div>

          {/* Navigation */}
          <SidebarNavigation onNavigate={() => {}} />

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

      {/* Mobile sidebar - slide-in drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar lg:hidden',
          'transform transition-transform duration-200 ease-in-out will-change-transform',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ 
          WebkitTransform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'
        }}
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
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 shadow-navbar relative z-20">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Vessel selector */}
          <div className="hidden lg:block">
            <VesselSelector />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Notification Bell */}
          <NotificationBell />

          {/* Client logo (desktop only) */}
          {clientLogoUrl && (
            <div className="hidden lg:flex items-center mr-4">
              <img
                src={clientLogoUrl}
                alt="Client logo"
                className="max-h-8 max-w-[120px] object-contain"
              />
            </div>
          )}

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
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

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>

        {/* Inkfish ownership watermark - persistent, unaffected by client branding */}
        <InkfishFooter />
      </div>
    </div>
  );
};

export default DashboardLayout;
