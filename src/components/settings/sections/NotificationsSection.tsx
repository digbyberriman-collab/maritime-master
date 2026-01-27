import React, { useState, useEffect } from 'react';
import { Bell, Mail, Check, Save, AlertTriangle, Clock } from 'lucide-react';
import { SectionHeader, SettingsCard, Toggle, FormField } from '@/components/settings/common';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface NotificationChannels {
  in_app: boolean;
  email: boolean;
}

interface AlertSeverities {
  red: boolean;
  orange: boolean;
  yellow: boolean;
  green: boolean;
}

interface ModuleSubscriptions {
  incidents: boolean;
  certificates: boolean;
  audits: boolean;
  drills: boolean;
  training: boolean;
  hours_of_rest: boolean;
  crew_invites: boolean;
  maintenance: boolean;
  documents: boolean;
}

interface DigestSettings {
  daily_time: string;
  weekly_day: string;
  weekly_time: string;
}

interface SnoozeSettings {
  default_duration: number;
  max_snoozes: number;
}

interface NotificationSettings {
  channels: NotificationChannels;
  severities: AlertSeverities;
  modules: ModuleSubscriptions;
  digest: DigestSettings;
  snooze: SnoozeSettings;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  channels: { in_app: true, email: true },
  severities: { red: true, orange: true, yellow: true, green: false },
  modules: {
    incidents: true,
    certificates: true,
    audits: true,
    drills: true,
    training: true,
    hours_of_rest: true,
    crew_invites: true,
    maintenance: true,
    documents: true,
  },
  digest: {
    daily_time: '08:00',
    weekly_day: 'monday',
    weekly_time: '09:00',
  },
  snooze: {
    default_duration: 30,
    max_snoozes: 3,
  },
};

const SEVERITY_OPTIONS = [
  { key: 'red', label: 'Red (Urgent)', bgColor: 'bg-red-100 dark:bg-red-900/30', borderColor: 'border-red-400', textColor: 'text-red-800 dark:text-red-300' },
  { key: 'orange', label: 'Orange (Important)', bgColor: 'bg-orange-100 dark:bg-orange-900/30', borderColor: 'border-orange-400', textColor: 'text-orange-800 dark:text-orange-300' },
  { key: 'yellow', label: 'Yellow (Upcoming)', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30', borderColor: 'border-yellow-400', textColor: 'text-yellow-800 dark:text-yellow-300' },
  { key: 'green', label: 'Green (Info)', bgColor: 'bg-green-100 dark:bg-green-900/30', borderColor: 'border-green-400', textColor: 'text-green-800 dark:text-green-300' },
];

const MODULE_OPTIONS = [
  { key: 'incidents', label: 'Incidents & Investigations' },
  { key: 'certificates', label: 'Certificate Expiries' },
  { key: 'audits', label: 'Audits & Surveys' },
  { key: 'drills', label: 'Drills' },
  { key: 'training', label: 'Training' },
  { key: 'hours_of_rest', label: 'Hours of Rest' },
  { key: 'crew_invites', label: 'Crew Invitations' },
  { key: 'maintenance', label: 'Maintenance Alerts' },
  { key: 'documents', label: 'Document Updates' },
];

const WEEKDAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
];

const SNOOZE_DURATIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
];

const NotificationsSection: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadNotificationSettings();
    }
  }, [user?.id]);

  const loadNotificationSettings = async () => {
    if (!user?.id) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('user_preferences')
        .select('notification_channels, alert_severities, module_subscriptions, daily_digest_time, weekly_digest_day, weekly_digest_time, default_snooze_minutes')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const channels = data.notification_channels as unknown as NotificationChannels | null;
        const severities = data.alert_severities as unknown as AlertSeverities | null;
        const modules = data.module_subscriptions as unknown as ModuleSubscriptions | null;
        
        setSettings({
          channels: channels || DEFAULT_SETTINGS.channels,
          severities: severities || DEFAULT_SETTINGS.severities,
          modules: modules || DEFAULT_SETTINGS.modules,
          digest: {
            daily_time: data.daily_digest_time || DEFAULT_SETTINGS.digest.daily_time,
            weekly_day: data.weekly_digest_day || DEFAULT_SETTINGS.digest.weekly_day,
            weekly_time: data.weekly_digest_time || DEFAULT_SETTINGS.digest.weekly_time,
          },
          snooze: {
            default_duration: data.default_snooze_minutes || DEFAULT_SETTINGS.snooze.default_duration,
            max_snoozes: DEFAULT_SETTINGS.snooze.max_snoozes, // From org settings
          },
        });
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            notification_channels: settings.channels,
            alert_severities: settings.severities,
            module_subscriptions: settings.modules,
            daily_digest_time: settings.digest.daily_time,
            weekly_digest_day: settings.digest.weekly_day,
            weekly_digest_time: settings.digest.weekly_time,
            default_snooze_minutes: settings.snooze.default_duration,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      toast({
        title: 'Settings saved',
        description: 'Your notification preferences have been updated.',
      });
    } catch (error) {
      console.error('Error saving notification settings:', error);
      toast({
        title: 'Error saving settings',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleSeverity = (key: string) => {
    setSettings(prev => ({
      ...prev,
      severities: {
        ...prev.severities,
        [key]: !prev.severities[key as keyof AlertSeverities],
      },
    }));
  };

  const toggleModule = (key: string, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      modules: {
        ...prev.modules,
        [key]: value,
      },
    }));
  };

  const updateDigest = (key: keyof DigestSettings, value: string) => {
    setSettings(prev => ({
      ...prev,
      digest: {
        ...prev.digest,
        [key]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Notifications"
          description="Configure how and when you receive notifications"
          icon={Bell}
        />
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Notifications"
        description="Configure how and when you receive notifications"
        icon={Bell}
      />

      {/* Notification Channels */}
      <SettingsCard
        title="Notification Channels"
        description="Choose how you want to receive notifications"
      >
        <div className="space-y-1">
          <Toggle
            id="in-app-notifications"
            label="In-App Notifications"
            description="Show notifications in the app"
            icon={Bell}
            checked={settings.channels.in_app}
            onCheckedChange={(v) => setSettings(prev => ({
              ...prev,
              channels: { ...prev.channels, in_app: v }
            }))}
          />
          <Separator />
          <Toggle
            id="email-notifications"
            label="Email Notifications"
            description="Receive alerts via email"
            icon={Mail}
            checked={settings.channels.email}
            onCheckedChange={(v) => setSettings(prev => ({
              ...prev,
              channels: { ...prev.channels, email: v }
            }))}
          />
        </div>
      </SettingsCard>

      {/* Alert Severity Subscriptions */}
      <SettingsCard
        title="Alert Severity Subscriptions"
        description="Choose which alert levels you want to receive"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SEVERITY_OPTIONS.map(sev => {
            const isActive = settings.severities[sev.key as keyof AlertSeverities];
            return (
              <button
                key={sev.key}
                onClick={() => toggleSeverity(sev.key)}
                className={cn(
                  'p-3 rounded-lg border-2 text-center transition-all',
                  isActive
                    ? `${sev.bgColor} ${sev.borderColor} ${sev.textColor}`
                    : 'bg-muted/50 border-border text-muted-foreground hover:border-muted-foreground/50'
                )}
              >
                <span className="text-sm font-medium block">{sev.label}</span>
                {isActive && <Check className="w-4 h-4 mx-auto mt-1" />}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Module Subscriptions */}
      <SettingsCard
        title="Module Subscriptions"
        description="Select which modules you want to receive notifications from"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {MODULE_OPTIONS.map(mod => (
            <Toggle
              key={mod.key}
              id={`module-${mod.key}`}
              label={mod.label}
              checked={settings.modules[mod.key as keyof ModuleSubscriptions]}
              onCheckedChange={(v) => toggleModule(mod.key, v)}
              size="compact"
            />
          ))}
        </div>
      </SettingsCard>

      {/* Digest Settings */}
      <SettingsCard
        title="Digest Settings"
        description="Configure when you receive summary notifications"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Daily Summary Time</label>
            <Input
              type="time"
              value={settings.digest.daily_time}
              onChange={(e) => updateDigest('daily_time', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Weekly Summary</label>
            <div className="flex gap-2">
              <Select
                value={settings.digest.weekly_day}
                onValueChange={(v) => updateDigest('weekly_day', v)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map(day => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="time"
                value={settings.digest.weekly_time}
                onChange={(e) => updateDigest('weekly_time', e.target.value)}
                className="w-28"
              />
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* Snooze Defaults */}
      <SettingsCard
        title="Snooze Defaults"
        description="Configure default snooze behavior for alerts"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Default Snooze Duration</label>
            <Select
              value={settings.snooze.default_duration.toString()}
              onValueChange={(v) => setSettings(prev => ({
                ...prev,
                snooze: { ...prev.snooze, default_duration: parseInt(v) }
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SNOOZE_DURATIONS.map(duration => (
                  <SelectItem key={duration.value} value={duration.value.toString()}>
                    {duration.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FormField
            id="max-snoozes"
            label="Max Snoozes Before Escalation"
            hint="Set by organization policy"
          >
            <Input
              type="number"
              value={settings.snooze.max_snoozes}
              disabled
              className="bg-muted cursor-not-allowed"
            />
          </FormField>
        </div>
      </SettingsCard>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Notification Settings'}
        </Button>
      </div>
    </div>
  );
};

export default NotificationsSection;
