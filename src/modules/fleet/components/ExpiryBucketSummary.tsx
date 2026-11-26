/**
 * Expiry counts per bucket (gap/02 X2, D3; DECISIONS C5): one pill per
 * bucket with items, in the expiry tones (`statusTone('expiry', …)`, the
 * same as `ExpiryPill`), then the endorsement states and the items whose
 * alerts are off. Every pill says its label and its number, so nothing
 * depends on colour alone.
 *
 * - Expired, ≤ 30 d and Due ≤ window are shown by default (the alert
 *   buckets); pass `buckets` to show others (Valid, No expiry).
 * - A bucket with no items is left out; when every shown bucket is empty
 *   and no endorsement is due, one "None due" pill says so (an honest zero,
 *   only for data that loaded: the caller renders loading, not set up and
 *   errors itself).
 * - `bucketHref` turns a pill into a link to the pre-filtered list.
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import { EXPIRY_BUCKET_SEVERITY, type ExpiryBucket } from '@/lib/records/expiry';
import { StatusPill, statusMeta, type Tone } from '@/shared/components/status';
import { cn } from '@/lib/utils';
import { ENDORSEMENT_STATES, ENDORSEMENT_STATE_LABELS, type EndorsementState } from '../lib/endorsement';
import { ALERT_BUCKETS, tallyExpirySummary, type ExpiryTally, type FleetExpirySummaryEntry } from '../hooks/useFleetExpiry';

export interface ExpiryBucketSummaryProps {
  /** Summary entries (`useFleetExpirySummary`), or a tally already added up. */
  entries?: readonly FleetExpirySummaryEntry[];
  tally?: ExpiryTally;
  /** Buckets to show, most urgent first. Default: expired, ≤ 30 d, due ≤ window. */
  buckets?: readonly ExpiryBucket[];
  /** Also show endorsements overdue / due. Default true. */
  showEndorsements?: boolean;
  /** Also show how many items have their alerts off. Default true. */
  showMuted?: boolean;
  /** A link for a bucket's pill (null: no link). */
  bucketHref?: (bucket: ExpiryBucket) => string | null;
  /** Accessible name of the list. */
  label?: string;
  className?: string;
}

const LINK = cn(
  'inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center',
);

function CountPill({ tone, label, count }: { tone: Tone; label: string; count: number }) {
  return (
    <StatusPill tone={tone} size="md">
      {label}
      <span aria-hidden="true"> · </span>
      <span className="font-semibold tabular-nums">{count}</span>
    </StatusPill>
  );
}

export function ExpiryBucketSummary({
  entries,
  tally: given,
  buckets = ALERT_BUCKETS,
  showEndorsements = true,
  showMuted = true,
  bucketHref,
  label = 'Expiry summary',
  className,
}: ExpiryBucketSummaryProps) {
  const tally = React.useMemo(() => given ?? tallyExpirySummary(entries ?? []), [given, entries]);
  const ordered = [...buckets].sort((a, b) => EXPIRY_BUCKET_SEVERITY[a] - EXPIRY_BUCKET_SEVERITY[b]);
  const shownBuckets = ordered.filter((b) => tally.buckets[b] > 0);
  const endorsements: EndorsementState[] = showEndorsements ? ENDORSEMENT_STATES.filter((s) => tally.endorsements[s] > 0) : [];
  const nothingDue = shownBuckets.length === 0 && endorsements.length === 0;

  return (
    <ul aria-label={label} className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      {shownBuckets.map((bucket) => {
        const meta = statusMeta('expiry', bucket);
        const pill = <CountPill tone={meta.tone} label={meta.label} count={tally.buckets[bucket]} />;
        const href = bucketHref?.(bucket) ?? null;
        return (
          <li key={bucket} data-bucket={bucket}>
            {href ? (
              <Link to={href} className={LINK} aria-label={`${meta.label}: ${tally.buckets[bucket]}. Open the list`}>
                {pill}
              </Link>
            ) : (
              pill
            )}
          </li>
        );
      })}
      {endorsements.map((state) => (
        <li key={state} data-endorsement={state}>
          <CountPill
            tone={statusMeta('crew_document_state', `endorsement_${state}`).tone}
            label={ENDORSEMENT_STATE_LABELS[state]}
            count={tally.endorsements[state]}
          />
        </li>
      ))}
      {nothingDue && (
        <li data-bucket="none">
          <StatusPill tone="ok" size="md">
            None due
          </StatusPill>
        </li>
      )}
      {showMuted && tally.muted > 0 && (
        <li data-muted="">
          <CountPill tone="neutral" label="Alerts off" count={tally.muted} />
        </li>
      )}
    </ul>
  );
}

export default ExpiryBucketSummary;
