import React, { useMemo } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Bell, Settings as SettingsIcon, Info } from 'lucide-react';
import { CadenceBadge } from '@/modules/notifications-admin/components/CadenceBadge';
import {
  useNotificationTypes,
  useMyNotificationPreferences,
  useToggleMyPreference,
  type NotificationType,
} from '@/modules/notifications-admin/hooks/useNotificationData';
import { useToast } from '@/shared/hooks/use-toast';

const NotificationsPage: React.FC = () => {
  const { data: types = [] } = useNotificationTypes();
  const { data: prefs = [] } = useMyNotificationPreferences();
  const toggle = useToggleMyPreference();
  const { toast } = useToast();

  const prefMap = useMemo(() => {
    const m = new Map<string, boolean>();
    prefs.forEach((p) => m.set(p.notification_type_key, p.in_app_enabled));
    return m;
  }, [prefs]);

  const grouped = useMemo(() => {
    const m = new Map<string, NotificationType[]>();
    types.forEach((t) => {
      const arr = m.get(t.category) ?? [];
      arr.push(t);
      m.set(t.category, arr);
    });
    return Array.from(m.entries());
  }, [types]);

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Choose which notifications appear in your inbox and arrive by email.</p>
        </div>

        <Tabs defaultValue="preferences">
          <TabsList>
            <TabsTrigger value="inbox" className="gap-1.5"><Bell className="w-3.5 h-3.5" /> Inbox</TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5"><SettingsIcon className="w-3.5 h-3.5" /> Preferences</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-4">
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Your inbox is empty.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="mt-4 space-y-4">
            <div className="bg-muted/50 border rounded-md p-3 text-xs text-muted-foreground flex gap-2">
              <Info className="w-4 h-4 shrink-0 text-primary" />
              <div>
                Every notification type you're eligible to receive is listed below. Use the toggles to control whether each one appears in your in-app inbox. Changes take effect immediately.
                <div className="mt-1 opacity-80">Email delivery is configured separately by your administrator in Notification Management.</div>
              </div>
            </div>

            {grouped.map(([cat, items]) => (
              <section key={cat} className="space-y-1.5">
                <h2 className="text-sm font-semibold">{cat}</h2>
                <div className="space-y-1.5">
                  {items.map((t) => {
                    const enabled = prefMap.get(t.key) ?? true;
                    return (
                      <div key={t.key} className="bg-card border rounded-md px-3 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{t.name}</span>
                            <CadenceBadge cadence={t.cadence} />
                          </div>
                          {t.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                          )}
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(v) =>
                            toggle.mutate(
                              { typeKey: t.key, enabled: v },
                              { onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }) }
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default NotificationsPage;