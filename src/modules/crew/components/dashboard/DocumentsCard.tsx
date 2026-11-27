import React from 'react';
import { FileWarning } from 'lucide-react';
import { PageError } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { useScopedPath } from '@/app/router/scopes';
import {
  DASHBOARD_ANCHORS,
  DASHBOARD_PEOPLE_LIMIT,
  complianceHref,
  isCapped,
  nextExpiryText,
  type CardState,
  type DocumentsSection,
} from '@/modules/crew/lib/dashboardModel';
import { profileTabPath } from '@/modules/crew/lib/onboarding';
import { CardLink, CardNote, CardRowsLoading, DashboardCard, PersonName } from './DashboardCard';

/**
 * Documents & certificates (gap/04 C2): the current crew's documents that
 * have expired or are in their warning window (alerts off not counted),
 * grouped by person, worst first, at most 20 people as the server sends
 * them. Each name opens the person's Documents tab (with crew profile
 * access); Full report opens the compliance documents view (with crew
 * compliance access).
 */
export interface DocumentsCardProps {
  state: CardState<DocumentsSection>;
  today: string;
  canOpenProfiles: boolean;
  /** The viewer reads crew compliance on the vessel (the Full report). */
  canOpenReport: boolean;
  onRetry: () => void;
}

export const DocumentsCard: React.FC<DocumentsCardProps> = ({ state, today, canOpenProfiles, canOpenReport, onRetry }) => {
  const scopedPath = useScopedPath();
  if (state.kind === 'hidden') return null;
  const total = state.kind === 'ready' ? state.data.expired + state.data.expiring : null;
  return (
    <DashboardCard
      anchor={DASHBOARD_ANCHORS.documents}
      title="Documents & certificates"
      subtitle="Expired or in their warning window, by crew member"
      icon={FileWarning}
      data-dashboard-card="documents"
      aside={total !== null && total > 0 ? <span className="type-caption tabular-nums text-muted-foreground">{total === 1 ? '1 document' : `${total} documents`}</span> : null}
      footer={
        canOpenReport && state.kind === 'ready' ? (
          <CardLink to={scopedPath(complianceHref({ view: 'documents' }))} data-card-link="documents-report">
            Full report
          </CardLink>
        ) : null
      }
    >
      {state.kind === 'loading' ? (
        <CardRowsLoading label="Loading the documents" />
      ) : state.kind === 'not_set_up' ? (
        <CardNote data-card-note="not-set-up">Turns on once the crew update is applied.</CardNote>
      ) : state.kind === 'error' || state.kind === 'invalid' || state.kind === 'off' ? (
        <PageError variant="inline" title="The documents could not load" onRetry={onRetry} treatMissingAsOff={false} error={state.kind === 'invalid' ? 'This list could not be read.' : undefined} />
      ) : state.data.people.length === 0 ? (
        <CardNote data-card-note="empty">No crew document has expired or is due.</CardNote>
      ) : (
        <>
          <ul className="divide-y divide-border" aria-label="Crew with documents to renew">
            {state.data.people.map((p) => (
              <li key={p.profileId} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5" data-documents-person={p.profileId}>
                <div className="min-w-0 flex-1 basis-40">
                  <PersonName name={p.displayName} href={canOpenProfiles ? scopedPath(profileTabPath(p.profileId, 'documents')) : null} />
                  {nextExpiryText(p, today) ? <p className="type-caption text-muted-foreground">{nextExpiryText(p, today)}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {p.expired > 0 ? <StatusPill tone="danger">{p.expired} expired</StatusPill> : null}
                  {p.expiring > 0 ? <StatusPill tone="warn">{p.expiring} expiring</StatusPill> : null}
                </div>
              </li>
            ))}
          </ul>
          {isCapped(state.data.people) ? <p className="type-caption text-muted-foreground">The {DASHBOARD_PEOPLE_LIMIT} most urgent crew members are shown.</p> : null}
        </>
      )}
    </DashboardCard>
  );
};
