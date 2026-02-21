import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Users, Award, Plane, CheckSquare, LayoutDashboard, FileText, Shield, Wrench,
  Compass, Bell, Ship, MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FrequentAction {
  target: string;
  label: string;
  icon: string;
  count: number;
}

const ICON_MAP: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  users: Users,
  award: Award,
  plane: Plane,
  'check-square': CheckSquare,
  'file-text': FileText,
  shield: Shield,
  wrench: Wrench,
  compass: Compass,
  bell: Bell,
  ship: Ship,
};

const DEFAULT_ACTIONS: FrequentAction[] = [
  { target: '/dashboard', label: 'Dashboard', icon: 'dashboard', count: 0 },
  { target: '/crew', label: 'Crew List', icon: 'users', count: 0 },
  { target: '/certificates', label: 'Certificates', icon: 'award', count: 0 },
  { target: '/crew/flights', label: 'Flights', icon: 'plane', count: 0 },
  { target: '/vessel/draak/checklists', label: 'Checklists', icon: 'check-square', count: 0 },
  { target: '/compliance', label: 'Compliance', icon: 'shield', count: 0 },
];

// Simple hook that tracks page views in sessionStorage
function useFrequentActions(limit: number = 6): { actions: FrequentAction[]; logActivity: (target: string, label: string, icon: string) => void } {
  const [actions, setActions] = React.useState<FrequentAction[]>(DEFAULT_ACTIONS.slice(0, limit));

  const logActivity = React.useCallback((target: string, label: string, icon: string) => {
    try {
      const key = 'storm_activity_log';
      const raw = sessionStorage.getItem(key);
      const log: Record<string, { label: string; icon: string; count: number }> = raw ? JSON.parse(raw) : {};

      if (!log[target]) {
        log[target] = { label, icon, count: 0 };
      }
      log[target].count += 1;

      sessionStorage.setItem(key, JSON.stringify(log));

      const sorted = Object.entries(log)
        .map(([t, data]) => ({ target: t, label: data.label, icon: data.icon, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      if (sorted.length >= 3) {
        setActions(sorted);
      }
    } catch {
      // Ignore storage errors
    }
  }, [limit]);

  return { actions, logActivity };
}

interface AdaptiveActionBarProps {
  className?: string;
}

const AdaptiveActionBar: React.FC<AdaptiveActionBarProps> = ({ className }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { actions, logActivity } = useFrequentActions(6);

  // Log current page view
  React.useEffect(() => {
    const path = location.pathname;
    const pathLabels: Record<string, { label: string; icon: string }> = {
      '/dashboard': { label: 'Dashboard', icon: 'dashboard' },
      '/crew': { label: 'Crew List', icon: 'users' },
      '/crew/roster': { label: 'Crew List', icon: 'users' },
      '/certificates': { label: 'Certificates', icon: 'award' },
      '/crew/flights': { label: 'Flights', icon: 'plane' },
      '/compliance': { label: 'Compliance', icon: 'shield' },
      '/maintenance': { label: 'Maintenance', icon: 'wrench' },
      '/documents': { label: 'Documents', icon: 'file-text' },
      '/itinerary': { label: 'Itinerary', icon: 'compass' },
      '/alerts': { label: 'Alerts', icon: 'bell' },
    };

    const match = pathLabels[path];
    if (match) {
      logActivity(path, match.label, match.icon);
    }
  }, [location.pathname, logActivity]);

  const visibleActions = actions.slice(0, 5);
  const overflowActions = actions.slice(5);

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {visibleActions.map((action) => {
        const IconComponent = ICON_MAP[action.icon] || FileText;
        const isActive = location.pathname === action.target;

        return (
          <button
            key={action.target}
            onClick={() => navigate(action.target)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all duration-200',
              isActive
                ? 'bg-[#1A2740] text-white'
                : 'bg-[#1A2740]/30 text-[#94A3B8] hover:bg-[#1A2740]/60 hover:text-white'
            )}
          >
            <IconComponent className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{action.label}</span>
          </button>
        );
      })}

      {overflowActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center px-1.5 py-1 rounded text-xs text-[#94A3B8] hover:bg-[#1A2740]/30 transition">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#111D33] border-[#1A2740]">
            {overflowActions.map((action) => {
              const IconComponent = ICON_MAP[action.icon] || FileText;
              return (
                <DropdownMenuItem
                  key={action.target}
                  onClick={() => navigate(action.target)}
                  className="gap-2 text-[#E2E8F0] hover:bg-[#1A2740]"
                >
                  <IconComponent className="w-4 h-4" />
                  {action.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default AdaptiveActionBar;
