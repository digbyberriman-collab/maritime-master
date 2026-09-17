import React from 'react';
import { formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, humanise } from '@/modules/hris/lib/format';
import type { HrActivityRow } from '@/modules/hris/hooks/useHrDashboard';

const ACTION_CLASS: Record<string, string> = {
  CREATE: 'bg-green-500/10 text-green-600 border-green-500/20',
  INSERT: 'bg-green-500/10 text-green-600 border-green-500/20',
  UPDATE: 'bg-primary/10 text-primary border-primary/20',
  DELETE: 'bg-destructive/10 text-destructive border-destructive/20',
  ARCHIVE: 'bg-muted text-muted-foreground border-border',
};

const relative = (ts: string | null): string => {
  if (!ts) return '—';
  const d = parseISO(ts);
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : '—';
};

interface RecentActivityProps {
  rows: HrActivityRow[];
  isLoading?: boolean;
}

/** Last HR-related audit_logs rows. RLS may return nothing for some roles; that is shown, not treated as an error. */
export const RecentActivity: React.FC<RecentActivityProps> = ({ rows, isLoading }) => (
  <Card className="bg-card">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-base">
        <History className="h-4 w-4 text-muted-foreground" /> Recent activity
      </CardTitle>
      <CardDescription>Latest changes to HR records, from the audit log.</CardDescription>
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-5/6" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recent HR activity is visible to you.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-2 text-sm">
              <Badge variant="outline" className={cn('mt-0.5 w-[72px] justify-center text-[10px]', ACTION_CLASS[r.action.toUpperCase()] ?? 'bg-muted text-muted-foreground border-border')}>
                {r.action.toLowerCase()}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className="font-medium">{humanise(r.entity_type)}</span>
                  {r.changed_fields.length > 0 && <span className="text-muted-foreground"> · {r.changed_fields.slice(0, 4).join(', ')}{r.changed_fields.length > 4 ? '…' : ''}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.actor_email ?? 'System'}
                  {r.actor_role ? ` (${humanise(r.actor_role)})` : ''}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(r.timestamp)}>
                {relative(r.timestamp)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default RecentActivity;
