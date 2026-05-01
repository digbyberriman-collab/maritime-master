import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';
import { History } from 'lucide-react';
import { listAuditLog } from '../services/workRestService';

interface Props {
  submissionId: string;
}

export const AuditLogPanel: React.FC<Props> = ({ submissionId }) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listAuditLog(submissionId)
      .then((d) => !cancelled && setEntries(d))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-5 w-5" /> Audit history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-muted-foreground">No history yet.</div>
        ) : (
          <ol className="space-y-2 text-xs">
            {entries.map((e) => (
              <li key={e.id} className="border-l-2 border-primary/40 pl-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium uppercase tracking-wide">
                    {e.action.replace(/_/g, ' ')}
                  </span>
                  <span className="text-muted-foreground">
                    {format(parseISO(e.created_at), 'd MMM yyyy HH:mm')}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {e.profiles?.first_name} {e.profiles?.last_name}
                  {e.actor_role ? ` · ${e.actor_role}` : ''}
                </div>
                {e.metadata && (
                  <pre className="text-[10px] bg-muted/30 p-1 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(e.metadata, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};
