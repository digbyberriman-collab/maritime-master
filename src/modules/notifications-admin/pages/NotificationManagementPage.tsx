import React, { useMemo, useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CadenceBadge } from '../components/CadenceBadge';
import { EditSubscriptionDrawer } from '../components/EditSubscriptionDrawer';
import {
  useNotificationTypes,
  useNotificationSubscriptions,
  type NotificationType,
} from '../hooks/useNotificationData';

const NotificationManagementPage: React.FC = () => {
  const { data: types = [] } = useNotificationTypes();
  const { data: subs = [] } = useNotificationSubscriptions();
  const [filter, setFilter] = useState<string>('all');
  const [editing, setEditing] = useState<NotificationType | null>(null);

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
    const configured = types.filter((t) => (subsByType.get(t.key)?.length ?? 0) > 0).length;
    const noRecipients = types.length - configured;
    const uniqueEmails = new Set(subs.map((s) => s.email).filter(Boolean)).size;
    return { total: types.length, configured, noRecipients, uniqueEmails };
  }, [types, subs, subsByType]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    types.forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + 1));
    return Array.from(map.entries());
  }, [types]);

  const filtered = useMemo(() => {
    if (filter === 'all') return types;
    if (filter === 'no_recipients') return types.filter((t) => (subsByType.get(t.key)?.length ?? 0) === 0);
    return types.filter((t) => t.category === filter);
  }, [types, filter, subsByType]);

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
        <PageHeader
          title="Notification Management"
          description="Configure who receives notifications for each notification type"
        />

        <StatGrid>
          <StatCard label="Total types" value={stats.total} />
          <StatCard label="Configured" value={stats.configured} />
          <StatCard label="No recipients" value={stats.noRecipients} tone={stats.noRecipients > 0 ? 'danger' : 'default'} />
          <StatCard label="Unique emails" value={stats.uniqueEmails} />
        </StatGrid>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All types</Chip>
            <Chip
              active={filter === 'no_recipients'}
              tone="destructive"
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
          <Button onClick={() => setEditing(types[0] ?? null)}>
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
                const recipients = subsByType.get(t.key) ?? [];
                return (
                  <button
                    key={t.key}
                    onClick={() => setEditing(t)}
                    className="w-full text-left bg-card border rounded-md px-3 py-2.5 hover:border-primary/40 hover:bg-muted/30 transition-colors flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{t.name}</span>
                        <CadenceBadge cadence={t.cadence} />
                      </div>
                      <div className="text-xs mt-0.5">
                        {recipients.length === 0 ? (
                          <span className="text-destructive">No recipients</span>
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
        open={!!editing}
        onClose={() => setEditing(null)}
      />
    </DashboardLayout>
  );
};

const Chip: React.FC<{ active?: boolean; tone?: 'destructive'; onClick: () => void; children: React.ReactNode }> = ({ active, tone, onClick, children }) => (
  <button
    onClick={onClick}
    className={cn(
      'px-3 py-1 text-xs rounded-full border transition-colors',
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