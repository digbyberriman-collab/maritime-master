import React, { useState, useEffect } from 'react';
import { Palette, Sun, Moon, Monitor, Check, Save, LayoutDashboard, Ship, Grid3X3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import SettingsCard from '../common/SettingsCard';

interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  sidebar_collapsed: boolean;
  default_vessel_id: string | null;
  dashboard_widgets: string[];
}

interface Vessel {
  id: string;
  name: string;
}

const AVAILABLE_WIDGETS = [
  { id: 'ais_map', label: 'Fleet Map' },
  { id: 'alerts', label: 'Active Alerts' },
  { id: 'certificates', label: 'Expiring Certificates' },
  { id: 'drills', label: 'Upcoming Drills' },
  { id: 'incidents', label: 'Recent Incidents' },
  { id: 'hours_of_rest', label: 'Hours of Rest NCs' },
  { id: 'weather', label: 'Weather' },
  { id: 'todo', label: 'My To-Do List' }
];

const DEFAULT_WIDGETS = ['alerts', 'certificates', 'drills'];

const AppearanceSection: React.FC = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [settings, setSettings] = useState<AppearanceSettings>({
    theme: 'system',
    sidebar_collapsed: false,
    default_vessel_id: null,
    dashboard_widgets: DEFAULT_WIDGETS
  });

  useEffect(() => {
    if (user?.id) {
      loadAppearanceSettings();
      loadUserVessels();
    }
  }, [user?.id]);

  const loadAppearanceSettings = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await (supabase as any)
        .from('user_preferences')
        .select('theme, sidebar_collapsed, default_vessel_id, dashboard_widgets')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          theme: (data.theme as AppearanceSettings['theme']) || 'system',
          sidebar_collapsed: data.sidebar_collapsed || false,
          default_vessel_id: data.default_vessel_id || null,
          dashboard_widgets: data.dashboard_widgets || DEFAULT_WIDGETS
        });
      }
    } catch (error) {
      console.error('Error loading appearance settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserVessels = async () => {
    if (!profile?.company_id) return;

    try {
      // Get vessels from the user's company
      const { data, error } = await supabase
        .from('vessels')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .neq('status', 'Sold')
        .order('name');

      if (error) throw error;
      setVessels(data || []);
    } catch (error) {
      console.error('Error loading vessels:', error);
    }
  };

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    
    setSaving(true);

    try {
      const { error } = await (supabase as any)
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          theme: settings.theme,
          sidebar_collapsed: settings.sidebar_collapsed,
          default_vessel_id: settings.default_vessel_id,
          dashboard_widgets: settings.dashboard_widgets,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      // Apply theme immediately
      applyTheme(settings.theme);

      toast({
        title: 'Preferences saved',
        description: 'Your appearance settings have been updated.'
      });
    } catch (error) {
      console.error('Error saving appearance settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save preferences. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleWidget = (widgetId: string) => {
    const widgets = settings.dashboard_widgets;
    if (widgets.includes(widgetId)) {
      setSettings({ 
        ...settings, 
        dashboard_widgets: widgets.filter(w => w !== widgetId) 
      });
    } else {
      setSettings({ 
        ...settings, 
        dashboard_widgets: [...widgets, widgetId] 
      });
    }
  };

  const themes = [
    { id: 'light' as const, label: 'Light', icon: Sun, description: 'Classic light mode' },
    { id: 'dark' as const, label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
    { id: 'system' as const, label: 'System', icon: Monitor, description: 'Match system settings' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Appearance</h2>
          <p className="text-muted-foreground mt-1">Customize the look and feel of the application</p>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-48 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Appearance</h2>
        <p className="text-muted-foreground mt-1">Customize the look and feel of the application</p>
      </div>

      {/* Theme Selection */}
      <SettingsCard
        title="Theme"
        description="Select your preferred color theme"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {themes.map((t) => {
            const Icon = t.icon;
            const isSelected = settings.theme === t.id;

            return (
              <button
                key={t.id}
                onClick={() => setSettings({ ...settings, theme: t.id })}
                className={cn(
                  'relative flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all',
                  'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
                  isSelected ? 'border-primary bg-primary/5' : 'border-border'
                )}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={cn(
                  'p-3 rounded-full',
                  isSelected ? 'bg-primary/10' : 'bg-muted'
                )}>
                  <Icon className={cn('h-6 w-6', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                </div>
                <div className="text-center">
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Layout Options */}
      <SettingsCard
        title="Layout"
        description="Customize your workspace layout"
      >
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label htmlFor="sidebar-collapsed" className="font-medium cursor-pointer">
                Sidebar Collapsed by Default
              </Label>
              <p className="text-sm text-muted-foreground">
                Start with a compact sidebar
              </p>
            </div>
          </div>
          <Switch
            id="sidebar-collapsed"
            checked={settings.sidebar_collapsed}
            onCheckedChange={(checked) => setSettings({ ...settings, sidebar_collapsed: checked })}
          />
        </div>
      </SettingsCard>

      {/* Default Vessel */}
      <SettingsCard
        title="Default Dashboard Vessel"
        description="Choose which vessel to show by default on the dashboard"
      >
        <div className="flex items-center gap-3">
          <Ship className="h-5 w-5 text-muted-foreground shrink-0" />
          <Select
            value={settings.default_vessel_id || 'all'}
            onValueChange={(value) => setSettings({ 
              ...settings, 
              default_vessel_id: value === 'all' ? null : value 
            })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Show all vessels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Show all vessels</SelectItem>
              {vessels.map(vessel => (
                <SelectItem key={vessel.id} value={vessel.id}>
                  {vessel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsCard>

      {/* Dashboard Widgets */}
      <SettingsCard
        title="Dashboard Widgets"
        description="Select which widgets appear on your dashboard"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {AVAILABLE_WIDGETS.map(widget => {
            const isSelected = settings.dashboard_widgets.includes(widget.id);
            
            return (
              <button
                key={widget.id}
                onClick={() => toggleWidget(widget.id)}
                className={cn(
                  'p-3 rounded-lg border text-sm text-left transition-all',
                  isSelected 
                    ? 'border-primary bg-primary/5 text-primary' 
                    : 'border-border hover:border-primary/30'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{widget.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  );
};

export default AppearanceSection;
