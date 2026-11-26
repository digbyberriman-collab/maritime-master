/**
 * An application's history (gap/02 TR5; X5-07B; D-X5-23): every step from
 * `development_application_events`, oldest first, with who took it (their
 * part and, when it can be read, their name), the status it moved from and
 * to, the comment or reason, and for an approver's correction each field
 * that changed, from and to. A name that cannot be read is said, never
 * invented.
 *
 * D-01: while the events table is missing the panel says the history is
 * not set up yet; any other failure is an inline error with Retry.
 */
import React from 'react';
import { History } from 'lucide-react';
import { PageError } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { ACTOR_LABELS, EVENT_ACTION_LABELS, FIELD_LABELS, diffValue } from './eventLabels';
import { useApplicationEvents, type ApplicationEvent } from './useFleetTrainingData';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function EventItem({ event }: { event: ApplicationEvent }) {
  const who = [event.actorRole ? ACTOR_LABELS[event.actorRole] : null, event.actorName ?? (event.actorRole ? 'name not available' : null)]
    .filter(Boolean)
    .join(', ');
  const moved = event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus;
  return (
    <li className="relative space-y-1 border-l border-border pb-3 pl-4 last:pb-0">
      <span aria-hidden="true" className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border border-border bg-card" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">{EVENT_ACTION_LABELS[event.action] ?? event.action}</p>
        <time dateTime={event.createdAt} className="type-caption tabular-nums text-muted-foreground">
          {when(event.createdAt)}
        </time>
      </div>
      {who ? <p className="type-caption text-muted-foreground">By {who}</p> : null}
      {moved ? (
        <p className="flex flex-wrap items-center gap-1.5 type-caption text-muted-foreground">
          <StatusPill domain="training_application" status={event.fromStatus} size="sm" />
          <span aria-hidden="true">→</span>
          <span className="sr-only">to</span>
          <StatusPill domain="training_application" status={event.toStatus} size="sm" />
        </p>
      ) : null}
      {event.comment ? <p className="whitespace-pre-line text-sm text-foreground">{event.comment}</p> : null}
      {event.fieldDiff ? (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-muted/40 p-2 text-sm" aria-label="What changed">
          {Object.entries(event.fieldDiff).map(([field, change]) => (
            <React.Fragment key={field}>
              <dt className="text-muted-foreground">{FIELD_LABELS[field] ?? field}</dt>
              <dd className="min-w-0 break-words">
                <span className="text-muted-foreground line-through">{diffValue(change.from)}</span>
                <span aria-hidden="true"> → </span>
                <span className="sr-only"> changed to </span>
                <span className="text-foreground">{diffValue(change.to)}</span>
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

export function ApplicationEventLog({ applicationId, enabled = true }: { applicationId: string; enabled?: boolean }) {
  const events = useApplicationEvents(applicationId, enabled);
  return (
    <section aria-labelledby="dev-app-history" className="space-y-2">
      <h3 id="dev-app-history" className="flex items-center gap-2 text-sm font-semibold">
        <History aria-hidden="true" className="h-4 w-4" /> History
      </h3>
      {events.status === 'loading' ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading the history…
        </p>
      ) : events.status === 'not_set_up' ? (
        <p className="text-sm text-muted-foreground" data-testid="dev-app-history-not-set-up">
          The step-by-step history is not set up yet. The review decisions above are recorded on the application.
        </p>
      ) : events.status === 'error' ? (
        <PageError variant="inline" error={events.error} title="The history could not be loaded" onRetry={events.retry} treatMissingAsOff={false} headingLevel={4} />
      ) : events.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No steps recorded yet.</p>
      ) : (
        <ol className="space-y-0 pl-1" aria-label="Application history">
          {events.events.map((event) => (
            <EventItem key={event.id} event={event} />
          ))}
        </ol>
      )}
    </section>
  );
}
