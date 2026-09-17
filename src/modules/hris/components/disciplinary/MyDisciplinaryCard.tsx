import React from 'react';
import { Gavel } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDisciplinaryMutations, useMyDisciplinaryRecords } from '@/modules/hris/hooks/useDisciplinary';
import { AcknowledgeCard } from './AcknowledgeCard';

interface MyDisciplinaryCardProps {
  /** Render nothing when the crew member has no records (default true). */
  hideWhenEmpty?: boolean;
  className?: string;
}

/**
 * Subject view: my own disciplinary matters through the `disciplinary_records_self`
 * view (no investigation file), with acknowledgement. Embed on Personal
 * Details or the crew dashboard.
 */
export const MyDisciplinaryCard: React.FC<MyDisciplinaryCardProps> = ({ hideWhenEmpty = true, className }) => {
  const { records, isLoading } = useMyDisciplinaryRecords();
  const { acknowledge } = useDisciplinaryMutations();

  if (!isLoading && records.length === 0 && hideWhenEmpty) return null;

  const pending = records.filter((r) => !r.acknowledged_by_crew_at).length;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gavel className="h-4 w-4 text-muted-foreground" /> Disciplinary matters
        </CardTitle>
        <CardDescription>
          {isLoading
            ? 'Loading…'
            : records.length === 0
              ? 'Nothing on file.'
              : pending > 0
                ? `${pending} record${pending === 1 ? '' : 's'} awaiting your acknowledgement.`
                : 'All records acknowledged.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : (
          records.map((r) => (
            <AcknowledgeCard
              key={r.id ?? `${r.incident_date}-${r.stage}`}
              record={r}
              onAcknowledge={(id) => acknowledge.mutate(id)}
              isPending={acknowledge.isPending && acknowledge.variables === r.id}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default MyDisciplinaryCard;
