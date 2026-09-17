import React from 'react';
import { History } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfileAuditTrail, type ProfileAuditEntry } from '@/modules/hris/hooks/useHrProfile';
import { formatDateTime, humanise } from '@/modules/hris/lib/format';

interface ProfileAuditTrailProps {
  profileId: string;
  userId: string | null;
}

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CREATE: 'default',
  UPDATE: 'secondary',
  DELETE: 'destructive',
};

const changedFieldNames = (entry: ProfileAuditEntry): string[] => {
  const raw = entry.changed_fields;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw)
    .filter(([, flagged]) => Boolean(flagged))
    .map(([name]) => name);
};

/**
 * Compact "who changed what, when" list. audit_logs is only readable by
 * HR-level roles, so most viewers see the empty state.
 */
export const ProfileAuditTrail: React.FC<ProfileAuditTrailProps> = ({ profileId, userId }) => {
  const { data, isLoading, isError } = useProfileAuditTrail(profileId, userId);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          Audit trail
        </CardTitle>
        <CardDescription>Last {data?.length ? Math.min(data.length, 10) : 10} recorded changes to this profile.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {isError && <p className="text-sm text-muted-foreground">Audit history is not available for your role.</p>}
        {!isLoading && !isError && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        )}
        {data?.map((entry) => {
          const fields = changedFieldNames(entry);
          return (
            <div key={entry.id} className="rounded-md border border-border bg-background/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={ACTION_VARIANT[entry.action] ?? 'outline'} className="text-[10px] uppercase tracking-wide">
                  {entry.action}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(entry.timestamp)}</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {entry.actor_email ?? 'Unknown actor'}
                {entry.actor_role ? ` · ${humanise(entry.actor_role)}` : ''}
              </p>
              {fields.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {fields.slice(0, 8).map((f) => (
                    <Badge key={f} variant="outline" className="text-[10px] font-normal">
                      {humanise(f)}
                    </Badge>
                  ))}
                  {fields.length > 8 && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      +{fields.length - 8} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default ProfileAuditTrail;
