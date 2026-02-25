import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Users, Award, Plane, CheckSquare, LayoutDashboard, FileText, Shield, Wrench,
  Compass, Bell, Ship, Pencil, Plus, X, Target, AlertTriangle, Map, Trash2,
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
  const {
    effectiveShortcuts, suggestions, addPin, removePin, isPinned, hasPins, clearAllPins,
  } = usePinnedShortcuts();
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

  // Compact button style for uniform sizing
  const btnBase = 'inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium transition-all duration-200 whitespace-nowrap';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Pinned / Default shortcuts */}
      {effectiveShortcuts.map((action) => {
        const IconComponent = ICON_MAP[action.icon] || FileText;
        const isActive = location.pathname === action.target;

        return (
          <div key={action.target} className="relative flex items-center">
            <button
              onClick={() => !editMode && navigate(action.target)}
              className={cn(
                btnBase,
                editMode && 'pr-6 ring-1 ring-dashed ring-muted-foreground/30',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <IconComponent className="w-3 h-3 shrink-0" />
              <span className="hidden lg:inline">{action.label}</span>
            </button>
            {/* Remove button – always visible in edit mode */}
            {editMode && (
              <button
                onClick={() => removePin(action.target)}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:scale-110 transition-transform"
                title={`Remove ${action.label}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* Non-edit mode: suggestions + customize entry */}
      {!editMode && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(btnBase, 'bg-muted/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground')}
              title="Customize shortcuts"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {suggestions.length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Suggested (based on usage)
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
              </>
            )}
            <DropdownMenuItem onClick={() => setEditMode(true)} className="gap-2 cursor-pointer">
              <Pencil className="w-4 h-4" />
              Customize bar…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Edit mode controls */}
      {editMode && (
        <div className="flex items-center gap-1 ml-1">
          {/* Add shortcut dropdown with suggestions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1">
                <Plus className="w-3 h-3" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
              {/* Suggestions first */}
              {suggestions.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Suggested
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
                        <span className="ml-auto text-[10px] text-muted-foreground">suggested</span>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                All available
              </DropdownMenuLabel>
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
              {unpinnedShortcuts.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  All shortcuts are pinned
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear All */}
          {hasPins && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1 text-destructive hover:text-destructive"
              onClick={clearAllPins}
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </Button>
          )}

          {/* Done */}
          <Button
            variant="default"
            size="sm"
            className="h-6 px-2.5 text-[11px]"
            onClick={() => setEditMode(false)}
          >
            Done
          </Button>
        </div>
      )}
    </div>
  );
};

export default AdaptiveActionBar;
