import React from 'react';
import { Users, FilterX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CrewListEmptyStateProps {
  variant: 'empty' | 'filtered';
  onAddCrew?: () => void;
  onClearFilters?: () => void;
}

export const CrewListEmptyState: React.FC<CrewListEmptyStateProps> = ({ variant, onAddCrew, onClearFilters }) => (
  <div className="flex flex-col items-center justify-center text-center py-16 border rounded-md bg-card gap-4">
    {variant === 'empty' ? (
      <>
        <Users className="h-10 w-10 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold">No crew on file</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Add your first crew member or import an existing roster to get started.
          </p>
        </div>
        {onAddCrew && <Button onClick={onAddCrew}>Add Crew Member</Button>}
      </>
    ) : (
      <>
        <FilterX className="h-10 w-10 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold">No matches</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            No crew match your current filters. Adjust filters or search to see results.
          </p>
        </div>
        {onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </>
    )}
  </div>
);
