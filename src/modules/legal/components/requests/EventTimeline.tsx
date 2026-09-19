import React from 'react';
import { History } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLegalPeople } from '@/modules/legal/hooks/useLegalLookups';
import { priorityDef, riskDef, statusDef } from '@/modules/legal/lib/constants';
import type { LegalEventRow } from '@/modules/legal/lib/requests';

const describe = (e: LegalEventRow, nameFor: (id: string | null | undefined) => string): string => {
  switch (e.event_type) {
    case 'created':
      return 'Request submitted';
    case 'status_changed':
      return `Status ${statusDef(e.old_value).label} → ${statusDef(e.new_value).label}`;
    case 'assigned':
      return e.new_value ? `Assigned to ${nameFor(e.new_value)}` : 'Assignment cleared';
    case 'risk_changed':
      return `Risk ${e.old_value ? riskDef(e.old_value).label : '—'} → ${e.new_value ? riskDef(e.new_value).label : '—'}`;
    case 'priority_changed':
      return `Priority ${priorityDef(e.old_value).label} → ${priorityDef(e.new_value).label}`;
    case 'sla_changed':
      return e.new_value ? `SLA deadline set to ${format(new Date(e.new_value), 'd MMM yyyy, HH:mm')}` : 'SLA deadline cleared';
    case 'resolution_updated':
      return 'Resolution summary updated';
    case 'details_edited':
      return 'Details edited';
    case 'attachment_added':
      return 'Attachment added';
    case 'attachment_removed':
      return 'Attachment removed';
    default:
      return e.event_type.replace(/_/g, ' ');
  }
};

/** Trigger-written audit trail of the request. */
export const EventTimeline: React.FC<{ events: LegalEventRow[]; isLoading?: boolean }> = ({ events, isLoading }) => {
  const { nameFor } = useLegalPeople();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden /> Audit trail
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-border pl-4">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden />
                <p className="text-foreground">{describe(e, nameFor)}</p>
                <p className="text-xs text-muted-foreground">
                  {e.actor_id ? nameFor(e.actor_id) : 'System'} · {format(new Date(e.created_at), 'd MMM yyyy, HH:mm')}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};

export default EventTimeline;
