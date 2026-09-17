import React from 'react';
import { format } from 'date-fns';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useLogbookEntryAudit } from '@/modules/logbooks/hooks/useLogbookEntryAudit';

const FIELD_LABELS: Record<string, string> = {
  entry_at: 'date & time',
  entry_date: 'date',
  watch_period: 'watch',
  page_number: 'page',
  summary: 'summary',
  remarks: 'remarks',
  data: 'details',
  latitude: 'latitude',
  longitude: 'longitude',
  position_text: 'position',
  status: 'status',
  signed_by: 'signature',
  signed_by_name: 'signature',
  signed_at: 'signature time',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  signed: 'Signed off',
  deleted: 'Deleted',
};

interface Props {
  entryId: string | null;
  createdAt?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
}

const LogbookEntryHistory: React.FC<Props> = ({
  entryId, createdAt, createdByName, updatedAt, updatedByName,
}) => {
  const { data: rows = [], isLoading } = useLogbookEntryAudit(entryId);

  if (!entryId) return null;

  const describe = (fields: string[] | null) => {
    if (!fields || fields.length === 0) return null;
    const labels = Array.from(new Set(fields.map((field) => FIELD_LABELS[field] ?? field)));
    return `Changed ${labels.join(', ')}`;
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <Label className="flex items-center gap-2">
        <History className="h-4 w-4" /> Audit trail
      </Label>

      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {createdAt && (
          <span>
            Created {format(new Date(createdAt), 'dd MMM yyyy HH:mm')}
            {createdByName ? ` by ${createdByName}` : ''}
          </span>
        )}
        {updatedAt && (
          <span>
            Last updated {format(new Date(updatedAt), 'dd MMM yyyy HH:mm')}
            {updatedByName ? ` by ${updatedByName}` : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline gap-2 border-l-2 border-border pl-3 text-sm">
              <Badge variant={row.action === 'signed' ? 'default' : 'secondary'} className="text-[10px]">
                {ACTION_LABELS[row.action] ?? row.action}
              </Badge>
              <span className="text-muted-foreground">
                {format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}
              </span>
              <span>{row.actor_name ?? 'Unknown user'}</span>
              {describe(row.changed_fields) && (
                <span className="text-xs text-muted-foreground">— {describe(row.changed_fields)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default LogbookEntryHistory;
