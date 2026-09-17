import React from 'react';
import { CalendarDays, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime, humanise } from '@/modules/hris/lib/format';
import type { DisciplinarySelfRow } from '@/modules/hris/lib/disciplinary';
import { AppealBadge, SeverityBadge, StageBadge } from './DisciplinaryBadges';

interface AcknowledgeCardProps {
  record: DisciplinarySelfRow;
  onAcknowledge?: (recordId: string) => void;
  isPending?: boolean;
}

/**
 * What a crew member sees of one of their own matters: the outcome, never
 * the investigation file. Offers a one-time acknowledgement.
 */
export const AcknowledgeCard: React.FC<AcknowledgeCardProps> = ({ record, onAcknowledge, isPending }) => {
  const acknowledged = Boolean(record.acknowledged_by_crew_at);
  const historical = record.status === 'expired' || record.status === 'overturned';
  return (
    <div className={cn('space-y-3 rounded-lg border bg-card p-4', historical && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> {formatDate(record.incident_date)} · {humanise(record.category)}
          </p>
          {record.expiry_date && (
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> {record.status === 'expired' ? 'Lapsed' : 'On file until'} {formatDate(record.expiry_date)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <SeverityBadge severity={record.severity} />
          <StageBadge stage={record.stage} />
          <AppealBadge appeal={record.appeal_status} />
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">{record.description}</p>
      {record.outcome && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Outcome{record.outcome_date ? ` (${formatDate(record.outcome_date)})` : ''}:</span> {record.outcome}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {acknowledged ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-green-500">
            <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged {formatDateTime(record.acknowledged_by_crew_at)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Acknowledging confirms you have read this record; it does not mean you agree with it.</span>
        )}
        {!acknowledged && onAcknowledge && record.id && (
          <Button size="sm" onClick={() => onAcknowledge(record.id as string)} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Acknowledge
          </Button>
        )}
      </div>
    </div>
  );
};

export default AcknowledgeCard;
