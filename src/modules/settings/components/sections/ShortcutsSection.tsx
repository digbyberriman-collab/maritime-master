import React from 'react';
import {
  Users, Award, Plane, CheckSquare, LayoutDashboard, FileText, Shield, Wrench,
  Compass, Bell, Ship, Plus, Trash2, GripVertical, Target, AlertTriangle, Map,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePinnedShortcuts, ALL_AVAILABLE_SHORTCUTS, type AvailableShortcut } from '@/shared/hooks/usePinnedShortcuts';
import { cn } from '@/lib/utils';

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

const ShortcutsSection: React.FC = () => {
  const { pins, addPin, removePin, isPinned, loading } = usePinnedShortcuts();

  const unpinned = ALL_AVAILABLE_SHORTCUTS.filter(s => !isPinned(s.target));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Quick Action Shortcuts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which shortcuts appear in your top navigation bar. Drag to reorder.
        </p>
      </div>

      {/* Current Pins */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pinned Shortcuts</CardTitle>
          <CardDescription>These appear in your header bar for quick access.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : pins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No shortcuts pinned yet. Add some below or use the app — frequently visited pages will be suggested.
            </p>
          ) : (
            <div className="space-y-1">
              {pins.map((pin) => {
                const Icon = ICON_MAP[pin.shortcut_icon] || FileText;
                return (
                  <div
                    key={pin.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-md border bg-card hover:bg-accent/50 transition group"
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium flex-1">{pin.shortcut_label}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">{pin.shortcut_target}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => removePin(pin.shortcut_target)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available to Add */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Available Shortcuts</CardTitle>
          <CardDescription>Click to add a shortcut to your bar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unpinned.map((shortcut) => {
              const Icon = ICON_MAP[shortcut.icon] || FileText;
              return (
                <button
                  key={shortcut.target}
                  onClick={() => addPin(shortcut)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md border border-dashed',
                    'hover:bg-accent hover:border-solid transition-all text-left group'
                  )}
                >
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm flex-1">{shortcut.label}</span>
                  <Plus className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ShortcutsSection;
