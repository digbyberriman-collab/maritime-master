import * as React from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, type EmptyStateProps } from './EmptyState';

export interface PageEmptyProps extends Omit<EmptyStateProps, 'kind'> {
  /** The list is empty because of the current filters or search. */
  filtered?: boolean;
  /** With `filtered`: shows "Clear filters" when no other action is given. */
  onClearFilters?: () => void;
}

/**
 * Empty page or list (gap/10 §A.12): first use ("No permits yet" + the
 * create action when allowed) or filtered ("Nothing matches these filters" +
 * "Clear filters").
 */
export const PageEmpty = React.forwardRef<HTMLDivElement, PageEmptyProps>(
  ({ filtered, onClearFilters, action, ...props }, ref) => {
    const clear =
      filtered && onClearFilters && !action ? (
        <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : null;
    return <EmptyState ref={ref} kind={filtered ? 'filtered' : 'first-use'} action={action ?? clear} {...props} />;
  },
);
PageEmpty.displayName = 'PageEmpty';
