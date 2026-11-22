import * as React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from './EmptyState';

export interface AccessDeniedProps {
  title?: React.ReactNode;
  /** Why, and who can grant it. */
  detail?: React.ReactNode;
  /** Primary action, e.g. a pre-filled "Request access" support link. */
  action?: React.ReactNode;
  /** A way out. Defaults to the start page; `null` hides it. */
  backTo?: { to: string; label: string } | null;
  headingLevel?: 1 | 2 | 3 | 4;
  className?: string;
}

/**
 * No-access body (gap/10 §A.12; gap/00 D7). It renders no shell, so a route
 * guard can wrap it in whatever layout the scope uses. Gates fail closed:
 * show this while access is unknown only after loading has finished.
 */
export function AccessDenied({
  title = "You don't have access to this page",
  detail,
  action,
  backTo = { to: '/', label: 'Back to the start page' },
  headingLevel = 1,
  className,
}: AccessDeniedProps) {
  const back = backTo ? (
    <Button asChild variant="outline" size="sm">
      <Link to={backTo.to}>{backTo.label}</Link>
    </Button>
  ) : null;
  return (
    <EmptyState
      kind="no-access"
      title={title}
      body={detail}
      action={
        action || back ? (
          <>
            {action}
            {back}
          </>
        ) : undefined
      }
      headingLevel={headingLevel}
      className={className}
    />
  );
}
