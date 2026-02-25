import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Users, Award, Plane, CheckSquare, LayoutDashboard, FileText, Shield, Wrench,
  Compass, Bell, Ship, MoreHorizontal, Pencil, Plus, X, Target, AlertTriangle, Map,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { usePinnedShortcuts, ALL_AVAILABLE_SHORTCUTS, type AvailableShortcut } from '@/shared/hooks/usePinnedShortcuts';

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
  target: Target,
  'alert-triangle': AlertTriangle,
  map: Map,
};

interface AdaptiveActionBarProps {
  className?: string;
}

const AdaptiveActionBar: React.FC<AdaptiveActionBarProps> = ({ className }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { effectiveShortcuts, suggestions, addPin, removePin, isPinned, hasPins } = usePinnedShortcuts();
  const [editMode, setEditMode] = useState(false);

  // Log activity to sessionStorage for suggestions
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
      try {
        const key = 'storm_activity_log';
        const raw = sessionStorage.getItem(key);
        const log: Record<string, { label: string; icon: string; count: number }> = raw ? JSON.parse(raw) : {};
        if (!log[path]) log[path] = { ...match, count: 0 };
        log[path].count += 1;
        sessionStorage.setItem(key, JSON.stringify(log));
      } catch { /* ignore */ }
    }
  }, [location.pathname]);

  const unpinnedShortcuts = ALL_AVAILABLE_SHORTCUTS.filter(s => !isPinned(s.target));

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Pinned / Default shortcuts */}
      {effectiveShortcuts.map((action) => {
        const IconComponent = ICON_MAP[action.icon] || FileText;
        const isActive = location.pathname === action.target;

        return (
          <div key={action.target} className="relative group">
            <button
              onClick={() => !editMode && navigate(action.target)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all duration-200',
                editMode && 'ring-1 ring-dashed ring-muted-foreground/40',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <IconComponent className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{action.label}</span>
            </button>
            {/* Remove button in edit mode */}
            {editMode && hasPins && (
              <button
                onClick={() => removePin(action.target)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* Suggestions indicator */}
      {!editMode && suggestions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center px-1.5 py-1 rounded text-xs text-muted-foreground hover:bg-accent transition">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Suggested shortcuts
            </DropdownMenuLabel>
            {suggestions.map((s) => {
              const Icon = ICON_MAP[s.icon] || FileText;
              return (
                <DropdownMenuItem
                  key={s.target}
                  onClick={() => addPin(s)}
                  className="gap-2 cursor-pointer"
                >
                  <Icon className="w-4 h-4" />
                  {s.label}
                  <Plus className="w-3 h-3 ml-auto text-muted-foreground" />
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setEditMode(true)} className="gap-2 cursor-pointer">
              <Pencil className="w-4 h-4" />
              Customize bar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Edit mode: add more + done button */}
      {editMode && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1">
                <Plus className="w-3 h-3" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 max-h-64 overflow-y-auto">
              {unpinnedShortcuts.map((s) => {
                const Icon = ICON_MAP[s.icon] || FileText;
                return (
                  <DropdownMenuItem
                    key={s.target}
                    onClick={() => addPin(s)}
                    className="gap-2 cursor-pointer"
                  >
                    <Icon className="w-4 h-4" />
                    {s.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setEditMode(false)}
          >
            Done
          </Button>
        </>
      )}

      {/* Edit toggle when not in edit mode and no suggestions */}
      {!editMode && suggestions.length === 0 && (
        <button
          onClick={() => setEditMode(true)}
          className="flex items-center px-1.5 py-1 rounded text-xs text-muted-foreground hover:bg-accent transition"
          title="Customize shortcuts"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default AdaptiveActionBar;
