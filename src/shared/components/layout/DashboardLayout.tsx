import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import InkfishFooter from '@/shared/components/layout/InkfishFooter';
import InkfishWatermark from '@/shared/components/InkfishWatermark';
import SidebarNavigation from '@/shared/components/layout/SidebarNavigation';
import ModuleTopNav from '@/shared/components/layout/ModuleTopNav';
import FloatingQuickActions from '@/shared/components/layout/FloatingQuickActions';
import SidebarAccountMenu from '@/shared/components/layout/SidebarAccountMenu';
import NotificationBell from '@/shared/components/layout/NotificationBell';
import { NAVIGATION_ITEMS, type NavChild } from '@/config/navigation';
import { resolveModuleForPath } from '@/shared/lib/moduleNavigation';
import { DashboardFilterProvider } from '@/modules/dashboard/contexts/DashboardFilterContext';
import FeedbackPanel from '@/modules/feedback/components/FeedbackPanel';
import FeedbackResolvedToast from '@/modules/feedback/components/FeedbackResolvedToast';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** Keep the sidebar off-canvas at desktop widths so the page can use the full width (e.g. wide logbook sheets). */
  collapseSidebar?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, collapseSidebar = false }) => {
  const { clientDisplayName, clientLogoUrl } = useBrandingContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const activeModule = React.useMemo(() => {
    const requestedModule = new URLSearchParams(location.search).get('module');
    return NAVIGATION_ITEMS.find((item) => item.id === requestedModule) ?? resolveModuleForPath(location.pathname);
  }, [location.pathname, location.search]);

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
    if (destination) {
      const [pathname, query = ''] = destination.split('?');
      const params = new URLSearchParams(query);
      params.set('module', moduleId);
      navigate(`${pathname}?${params.toString()}`);
    }
  }, [firstLeafPath, navigate]);

  return (
    <DashboardFilterProvider>
    <div className="min-h-screen bg-background flex relative">
      {/* Inkfish watermark - renders behind all content */}
      <InkfishWatermark />
      
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className={cn('fixed inset-0 bg-foreground/50 z-40', !collapseSidebar && 'lg:hidden')}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - z-10 to be above watermark */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-200 ease-in-out',
          !collapseSidebar && 'lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Commercial branding and alerts */}
          <div className="flex flex-col px-4 py-3 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <Link 
                to="/dashboard"
                className="flex min-w-0 flex-1 items-center py-1 text-lg font-bold text-sidebar-foreground hover:text-sidebar-accent-foreground hover:opacity-80 transition-all focus:outline-none focus:ring-2 focus:ring-sidebar-ring"
                aria-label="Return to Dashboard"
                title="Return to Dashboard"
              >
                {clientLogoUrl ? (
                  <img src={clientLogoUrl} alt={clientDisplayName || 'Company logo'} className="max-h-9 max-w-[150px] object-contain object-left" />
                ) : (
                  <span className="truncate">{clientDisplayName || 'STORM'}</span>
                )}
              </Link>
              <NotificationBell />
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className={cn('text-sidebar-foreground', !collapseSidebar && 'lg:hidden')}
                aria-label="Close folder panel"
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

          <div className="mt-auto shrink-0">
            <SidebarAccountMenu onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      </aside>

      {/* Main content - z-10 to be above watermark */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top navbar */}
        <header className="min-h-16 bg-card border-b border-border flex items-center gap-2 px-3 lg:px-5 py-2 shadow-navbar relative z-20">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className={cn('p-2 text-foreground', !collapseSidebar && 'lg:hidden')}
            aria-label="Open folder panel"
          >
            <Menu className="w-5 h-5" />
          </button>

          <ModuleTopNav activeModuleId={activeModule?.id ?? null} onModuleChange={handleModuleChange} />
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
