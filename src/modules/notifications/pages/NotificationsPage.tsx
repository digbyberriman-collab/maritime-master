import React, { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
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
import {
  isNotificationTypeAvailable,
  NOT_AVAILABLE_COPY,
  NOT_AVAILABLE_DESCRIPTION,
} from '@/modules/notifications-admin/lib/notificationEmitters';
import { StatusPill } from '@/shared/components/status';
import { useToast } from '@/shared/hooks/use-toast';

/**
 * A seeded engine type with no emitter yet (D-238): a plain pill, never a
 * switch, so no preference write is reachable for it (non-negotiable 9).
 */
const NotAvailablePill: React.FC = () => {
  const descriptionId = useId();
  return (
    <>
      <StatusPill tone="neutral" icon={null} aria-describedby={descriptionId} title={NOT_AVAILABLE_DESCRIPTION}>
        {NOT_AVAILABLE_COPY}
      </StatusPill>
      <span id={descriptionId} className="sr-only">
        {NOT_AVAILABLE_DESCRIPTION}
      </span>
    </>
  );
};

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
          <h1 className="text-2xl font-semibold">Notification preferences</h1>
          <p className="text-sm text-muted-foreground">Choose which notifications and sidebar badges you see.</p>
        </div>

        <Tabs defaultValue="preferences">
          <TabsList>
            <TabsTrigger value="inbox" className="gap-1.5"><Bell className="w-3.5 h-3.5" /> Inbox</TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5"><SettingsIcon className="w-3.5 h-3.5" /> Preferences</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-4">
            {/* The inbox has its own page; this tab used to say "empty" without reading anything. */}
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
                <p>Your notifications are in the Inbox.</p>
                <Button variant="outline" asChild>
                  <Link to="/inbox">Open inbox</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="mt-4 space-y-4">
            <div className="bg-muted/50 border rounded-md p-3 text-xs text-muted-foreground flex gap-2">
              <Info className="w-4 h-4 shrink-0 text-primary" />
              <div>
                Every notification type you're eligible to receive is listed below. Use the toggles to control whether each one appears in your in-app inbox. Changes take effect immediately.
                <div className="mt-1 opacity-80">Email delivery is configured separately by your administrator in Notification Management.</div>
                <div className="mt-1 opacity-80">A type marked “{NOT_AVAILABLE_COPY}” is listed for completeness: STORM does not send it yet, so it has no toggle.</div>
              </div>
            </div>

            {grouped.map(([cat, items]) => (
              <section key={cat} className="space-y-1.5">
                <h2 className="text-sm font-semibold">{cat}</h2>
                <div className="space-y-1.5">
                  {items.map((t) => {
                    const enabled = prefMap.get(t.key) ?? true;
                    return (
                      <div key={t.key} data-notification-type={t.key} className="bg-card border rounded-md px-3 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{t.name}</span>
                            <CadenceBadge cadence={t.cadence} />
                          </div>
                          {t.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                          )}
                        </div>
                        {isNotificationTypeAvailable(t.key) ? (
                          <Switch
                            aria-label={`${enabled ? 'Hide' : 'Show'} ${t.name}`}
                            checked={enabled}
                            disabled={toggle.isPending}
                            onCheckedChange={(v) =>
                              toggle.mutate(
                                { typeKey: t.key, enabled: v },
                                { onError: (e: unknown) => toast({ title: 'Failed', description: e instanceof Error ? e.message : 'The preference was not saved.', variant: 'destructive' }) }
                              )
                            }
                          />
                        ) : (
                          <NotAvailablePill />
                        )}
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