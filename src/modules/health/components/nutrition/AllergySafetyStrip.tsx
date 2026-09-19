import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { badgeToneClass, SEVERITY_TONE } from '@/modules/health/lib/format';
import { useAllergies } from '@/modules/health/hooks/usePatientRecord';

interface AllergySafetyStripProps {
  personId: string | null | undefined;
  className?: string;
}

/**
 * Allergies for one subject, shown as a safety strip above their nutrition.
 * The clinical tables return nothing when the reader has no access or the
 * subject has not consented, so an empty result stays quiet rather than
 * claiming the person has no allergies.
 */
export const AllergySafetyStrip: React.FC<AllergySafetyStripProps> = ({ personId, className }) => {
  const { allergies, isLoading } = useAllergies({ personId, activeOnly: true });

  if (!personId || isLoading || allergies.length === 0) return null;

  const severe = allergies.filter((a) => ['severe', 'anaphylaxis'].includes(a.severity ?? ''));

  return (
    <Alert
      className={cn(
        severe.length ? 'border-destructive/40 bg-destructive/5' : 'border-warning/40 bg-warning/5',
        className,
      )}
    >
      <ShieldAlert className={cn('h-4 w-4', severe.length ? 'text-destructive' : 'text-warning')} />
      <AlertTitle>{severe.length ? 'Severe allergy on this record' : 'Allergies on this record'}</AlertTitle>
      <AlertDescription>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {allergies.map((a) => (
            <Badge
              key={a.id}
              variant="outline"
              className={cn('text-[10px]', badgeToneClass[SEVERITY_TONE[a.severity ?? ''] ?? 'default'])}
            >
              {a.allergen}
              {a.severity ? ` · ${a.severity}` : ''}
            </Badge>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default AllergySafetyStrip;
