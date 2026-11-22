import * as React from 'react';
import { RotateCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isMissingRelationError, normaliseError } from '@/shared/lib/notify';
import { EmptyState } from './EmptyState';

export interface PageErrorProps {
  /** Whatever was thrown or returned as `error` (Error, PostgREST error, string …). */
  error?: unknown;
  title?: React.ReactNode;
  /** Shows "Try again". */
  onRetry?: () => void;
  /** Reference for support; defaults to the error code when there is one. */
  reference?: string;
  /** `page` (centred state) or `inline` (alert inside a page or card). */
  variant?: 'page' | 'inline';
  /**
   * A table, column or RPC missing from the live schema means the feature is
   * not switched on yet (DECISIONS D-01): show that instead of an error.
   * Default true.
   */
  treatMissingAsOff?: boolean;
  headingLevel?: 1 | 2 | 3 | 4;
  className?: string;
}

/**
 * Error body (gap/10 §A.12): what failed, in a sentence the reader can act
 * on, a retry when there is one, and a reference for support. Never mock
 * data, never a blank page.
 */
export function PageError({
  error,
  title,
  onRetry,
  reference,
  variant = 'page',
  treatMissingAsOff = true,
  headingLevel,
  className,
}: PageErrorProps) {
  const normalised = normaliseError(error);
  const ref = reference ?? normalised.code;
  const retry = onRetry ? (
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      <RotateCw aria-hidden="true" />
      Try again
    </Button>
  ) : null;

  if (treatMissingAsOff && isMissingRelationError(error)) {
    return (
      <EmptyState
        kind="not-enabled"
        title="Not available yet"
        body={normalised.message}
        headingLevel={headingLevel}
        bordered={variant === 'inline'}
        compact={variant === 'inline'}
        className={className}
      />
    );
  }

  if (variant === 'inline') {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTitle>{title ?? 'This could not load'}</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{normalised.message}</p>
          {ref ? <p className="type-mono text-muted-foreground">Reference {ref}</p> : null}
          {retry}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <EmptyState
      kind="error"
      title={title}
      body={normalised.message}
      action={retry}
      secondary={ref ? <span className="type-mono">Reference {ref}</span> : null}
      headingLevel={headingLevel}
      className={className}
    />
  );
}
