import * as React from 'react';
import type { DateInput } from '@/lib/records/dates';
import type { ExpiryBucket } from '@/lib/records/expiry';
import { StatusPill, type StatusPillProps } from './StatusPill';
import { statusMeta } from './statusTone';
import { expiryDetail, resolveExpiry } from './helpers';

export interface ExpiryPillProps extends Omit<StatusPillProps, 'tone' | 'domain' | 'status' | 'label'> {
  /** Bucket from the server (`expiry_bucket()`), if known. */
  bucket?: ExpiryBucket | null;
  /**
   * Days left from the server (negative once expired), if known. Preferred
   * over the days counted from `today`, so the detail agrees with `bucket`.
   */
  daysRemaining?: number | null;
  /** Expiry date (`yyyy-MM-dd` or a Date). Null or blank means it does not expire. */
  expiresOn?: DateInput | null;
  /** The item type's window from `expiry_window_rules` (default 90). */
  windowDays?: number | null;
  noExpiry?: boolean;
  /**
   * Today, for reproducible output. Callers that know the server's date (the
   * `current_date` behind `bucket`) pass it here, so a server bucket and the
   * locally counted days use the same day.
   */
  today?: DateInput;
  /** Append "in 18d" / "52d overdue" / "to 03 Mar 2027" when a date is known. Default true. */
  showDetail?: boolean;
}

/**
 * Expiry tier pill (engine 1; DECISIONS C5; gap/10 §A.8): Expired → danger,
 * ≤ 30 d → orange, Due ≤ window → warn, Valid → ok, No expiry → neutral.
 * Pass the server's `bucket` (and its `daysRemaining`), or an `expiresOn`
 * date (with the type's `windowDays`) and the bucket is computed with the
 * shared expiry engine. A server bucket wins; a locally counted day number
 * that contradicts it is dropped (see `resolveExpiry`).
 */
export const ExpiryPill = React.forwardRef<HTMLSpanElement, ExpiryPillProps>(
  ({ bucket, daysRemaining, expiresOn, windowDays, noExpiry, today, showDetail = true, ...props }, ref) => {
    const resolved = resolveExpiry({ bucket, daysRemaining, expiresOn, windowDays, noExpiry, today });
    if (resolved.bucket === null) {
      return (
        <StatusPill ref={ref} tone="neutral" data-bucket="unknown" {...props}>
          Expiry unknown
        </StatusPill>
      );
    }
    const meta = statusMeta('expiry', resolved.bucket);
    const detail = showDetail ? expiryDetail(resolved) : null;
    return (
      <StatusPill ref={ref} tone={meta.tone} data-bucket={resolved.bucket} {...props}>
        {meta.label}
        {detail && (
          <>
            <span aria-hidden="true"> · </span>
            <span className="font-medium tabular-nums">{detail}</span>
          </>
        )}
      </StatusPill>
    );
  },
);
ExpiryPill.displayName = 'ExpiryPill';
