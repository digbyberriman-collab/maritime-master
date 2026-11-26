import React, { useId, useMemo, useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Mail, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import { CadenceBadge } from '../components/CadenceBadge';
import { EditSubscriptionDrawer } from '../components/EditSubscriptionDrawer';
import {
  useNotificationTypes,
  useNotificationSubscriptions,
  type NotificationType,
} from '../hooks/useNotificationData';
import {
  EMAIL_DELIVERY_LIVE,
  EMAIL_NOT_LIVE_DESCRIPTION,
  EMAIL_NOT_LIVE_TITLE,
  IN_APP_ONLY_COPY,
  IN_APP_ONLY_DESCRIPTION,
  isNotificationTypeAvailable,
  NOT_AVAILABLE_COPY,
  NOT_AVAILABLE_DESCRIPTION,
  takesSubscriptions,
} from '../lib/notificationEmitters';

/** Visible focus and a 44 px target on coarse pointers (D-35). */
const INTERACTIVE =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(pointer:coarse)]:min-h-11';

const NotificationManagementPage: React.FC = () => {
  const { data: types = [] } = useNotificationTypes();
  const { data: subs = [] } = useNotificationSubscriptions();
  const [filter, setFilter] = useState<string>('all');
  const [editing, setEditing] = useState<NotificationType | null>(null);

  // Engine types, live or deferred, are in-app only (D-249, amending D-238):
  // the engine picks their audience, so they take no email subscription and
  // are left out of the recipient stats. They are not a gap an admin can fill.
  const subscribableTypes = useMemo(() => types.filter((t) => takesSubscriptions(t.key)), [types]);

  const subsByType = useMemo(() => {
    const map = new Map<string, typeof subs>();
    subs.forEach((s) => {
      const arr = map.get(s.notification_type_key) ?? [];
      arr.push(s);
      map.set(s.notification_type_key, arr);
    });
    return map;
  }, [subs]);

  const stats = useMemo(() => {
    const configured = subscribableTypes.filter((t) => (subsByType.get(t.key)?.length ?? 0) > 0).length;
    const noRecipients = subscribableTypes.length - configured;
    const uniqueEmails = new Set(
      subs.filter((s) => takesSubscriptions(s.notification_type_key)).map((s) => s.email).filter(Boolean),
    ).size;
    return { total: subscribableTypes.length, configured, noRecipients, uniqueEmails };
  }, [subscribableTypes, subs, subsByType]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    types.forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + 1));
    return Array.from(map.entries());
  }, [types]);

  const filtered = useMemo(() => {
    if (filter === 'all') return types;
    if (filter === 'no_recipients') return subscribableTypes.filter((t) => (subsByType.get(t.key)?.length ?? 0) === 0);
    return types.filter((t) => t.category === filter);
  }, [types, subscribableTypes, filter, subsByType]);

  const grouped = useMemo(() => {
    const m = new Map<string, NotificationType[]>();
    filtered.forEach((t) => {
      const arr = m.get(t.category) ?? [];
      arr.push(t);
      m.set(t.category, arr);
    });
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-4 max-w-6xl">
        <div>
          <h1 className="text-2xl font-semibold">Notification Management</h1>
          <p className="text-sm text-muted-foreground">Configure who receives notifications for each notification type</p>
        </div>

        {/* No code path emails a subscriber until the gap/03 C3 dispatcher
            lands (D-249): say so, and do not present a missing recipient as
            a fault. role="status" replaces the Alert's default role="alert". */}
        {!EMAIL_DELIVERY_LIVE && (
          <Alert variant="info" role="status" data-email-delivery-notice="not-live">
            <Info aria-hidden="true" className="h-4 w-4" />
            <AlertTitle>{EMAIL_NOT_LIVE_TITLE}</AlertTitle>
            <AlertDescription>{EMAIL_NOT_LIVE_DESCRIPTION}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total types" value={stats.total} />
          <StatCard label="Configured" value={stats.configured} />
          <StatCard
            label="No recipients"
            value={stats.noRecipients}
            tone={EMAIL_DELIVERY_LIVE && stats.noRecipients > 0 ? 'destructive' : undefined}
          />
          <StatCard label="Unique emails" value={stats.uniqueEmails} />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All types</Chip>
            <Chip
              active={filter === 'no_recipients'}
              tone={EMAIL_DELIVERY_LIVE ? 'destructive' : undefined}
              onClick={() => setFilter('no_recipients')}
            >
              No recipients ({stats.noRecipients})
            </Chip>
            {categories.map(([cat, n]) => (
              <Chip key={cat} active={filter === cat} onClick={() => setFilter(cat)}>
                {cat} ({n})
              </Chip>
            ))}
          </div>
          <Button
            className="[@media(pointer:coarse)]:h-11"
            disabled={subscribableTypes.length === 0}
            onClick={() => setEditing(subscribableTypes[0] ?? null)}
          >
            <UserPlus className="w-4 h-4 mr-1.5" /> Subscribe Email
          </Button>
        </div>

        <div className="space-y-4">
          {grouped.map(([cat, items]) => (
            <section key={cat} className="space-y-1">
              <div className="px-2 py-1.5 bg-muted/40 rounded text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {cat}
              </div>
              {items.map((t) => {
                if (!takesSubscriptions(t.key)) return <EngineTypeRow key={t.key} type={t} />;
                const recipients = subsByType.get(t.key) ?? [];
                return (
                  <button
                    key={t.key}
                    type="button"
                    data-notification-type={t.key}
                    onClick={() => setEditing(t)}
                    className={cn(
                      'w-full text-left bg-card border rounded-md px-3 py-2.5 hover:border-primary/40 hover:bg-muted/30 transition-colors flex items-center gap-3',
                      INTERACTIVE,
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{t.name}</span>
                        <CadenceBadge cadence={t.cadence} />
                      </div>
                      <div className="text-xs mt-0.5">
                        {recipients.length === 0 ? (
                          <span className={EMAIL_DELIVERY_LIVE ? 'text-destructive' : 'text-muted-foreground'}>
                            No recipients
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {recipients.map((r) => r.email ?? 'User').join(', ')}{' '}
                            <span className="text-[10px] uppercase tracking-wider ml-1">All</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="gap-1 bg-muted/50">
                      <Mail className="w-3 h-3" /> {recipients.length}
                    </Badge>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>

      <EditSubscriptionDrawer
        type={editing}
        existing={editing ? subsByType.get(editing.key) ?? [] : []}
        open={!!editing && takesSubscriptions(editing.key)}
        onClose={() => setEditing(null)}
      />
    </DashboardLayout>
  );
};

/**
 * A seeded engine type (D-249): a plain row, not a button, so it opens no
 * drawer and takes no subscription (non-negotiable 9). A deferred type
 * (D-238) shows "Not available yet"; a live one shows "In-app only", since
 * the engine picks its audience and nothing emails it.
 */
const EngineTypeRow: React.FC<{ type: NotificationType }> = ({ type }) => {
  const descriptionId = useId();
  const deferred = !isNotificationTypeAvailable(type.key);
  return (
    <div
      data-notification-type={type.key}
      className="w-full bg-card border rounded-md px-3 py-2.5 flex items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{type.name}</span>
          <CadenceBadge cadence={type.cadence} />
        </div>
        <div id={descriptionId} className="text-xs mt-0.5 text-muted-foreground">
          {deferred ? NOT_AVAILABLE_DESCRIPTION : IN_APP_ONLY_DESCRIPTION}
        </div>
      </div>
      <StatusPill tone="neutral" icon={null} aria-describedby={descriptionId}>
        {deferred ? NOT_AVAILABLE_COPY : IN_APP_ONLY_COPY}
      </StatusPill>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; tone?: 'destructive' }> = ({ label, value, tone }) => (
  <Card>
    <CardContent className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={cn('text-2xl font-semibold mt-0.5', tone === 'destructive' && value > 0 && 'text-destructive')}>{value}</div>
    </CardContent>
  </Card>
);

const Chip: React.FC<{ active?: boolean; tone?: 'destructive'; onClick: () => void; children: React.ReactNode }> = ({ active, tone, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active ?? false}
    onClick={onClick}
    className={cn(
      'px-3 py-1 text-xs rounded-full border transition-colors',
      INTERACTIVE,
      active
        ? tone === 'destructive'
          ? 'bg-destructive text-destructive-foreground border-destructive'
          : 'bg-primary text-primary-foreground border-primary'
        : tone === 'destructive'
          ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
          : 'border-border text-muted-foreground hover:bg-muted'
    )}
  >
    {children}
  </button>
);

export default NotificationManagementPage;