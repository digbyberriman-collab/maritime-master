import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, PageEmpty, PageLoading } from '@/shared/components/states';
import { useCapability } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { CREW_CAPS } from '@/modules/crew/paths';
import { useCrewDocuments } from '@/modules/crew/hooks/useCrewDocuments';
import { CREW_DOCUMENT_TABS, CREW_DOCUMENT_TAB_LABEL, isCrewDocumentTab } from '@/modules/crew/lib/documentTabs';
import type { CrewDocumentTab } from '@/modules/crew/types/db.pending';
import { DocumentsPanel } from '@/modules/crew/components/documents/DocumentsTab';

export const MY_DOCUMENTS_TITLE = 'My documents';
export const MY_DOCUMENTS_DESCRIPTION =
  'Your passports, visas, certificates and qualifications as STORM holds them. To correct one, ask the person who looks after crew documents on board.';
export const NO_PROFILE_TITLE = 'Your crew profile is not linked yet';
export const NO_PROFILE_BODY = 'Documents are kept against your crew profile. Ask your fleet manager to link your sign-in to it.';

const tabLink = (active: boolean) =>
  cn(
    'relative inline-flex h-full shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-sm px-3 type-body font-medium transition-colors duration-quick ease-tide',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    'after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-transform after:duration-indicator after:ease-tide',
    active ? 'text-foreground after:scale-x-100 after:shadow-glow-signal' : 'text-muted-foreground after:scale-x-0 hover:text-foreground',
  );

/**
 * The person's own crew documents at /me/documents (gap/04 C24-C26; X1
 * spec §4 personal row; PR-X1-J): the Documents, STCW and Qualifications
 * tabs of their own profile in one page (`?tab=`), read-only. Add is there
 * only when the server says so: crew certificate creation for the person, or
 * crew uploads switched on for one of their vessels (crew_document_rights).
 *
 * Gate: the route's vessel.crew.crew_certificates.view_own, asked again here
 * (nothing is read while it loads; denied is AccessDenied); the server
 * answers only for the caller's own profile. A sign-in with no crew profile
 * says so. D-01 and errors as on the profile tabs (DocumentsPanel).
 */
const MyDocumentsPage: React.FC = () => {
  const { profile, user, loading } = useAuth();
  const gate = useCapability(CREW_CAPS.documentsViewOwn);
  const [params] = useSearchParams();
  const requested = params.get('tab');
  const tab: CrewDocumentTab = isCrewDocumentTab(requested) ? requested : 'documents';

  if (loading || gate.status === 'loading') return <PageLoading variant="detail" label="Loading your documents…" />;
  if (!gate.allowed) {
    return (
      <AccessDenied
        title="You can't open your documents here"
        detail="Your own crew documents need a STORM sign-in that is active in your company."
        backTo={{ to: '/me/profile', label: 'Back to my profile' }}
      />
    );
  }
  if (!profile?.id || !profile.company_id) {
    return (
      <div className="min-w-0">
        <PageHeader title={MY_DOCUMENTS_TITLE} />
        <PageEmpty title={NO_PROFILE_TITLE} body={NO_PROFILE_BODY} bordered />
      </div>
    );
  }
  return <MyDocuments profileId={profile.id} userId={user?.id ?? profile.user_id ?? null} companyId={profile.company_id} tab={tab} />;
};

const MyDocuments: React.FC<{ profileId: string; userId: string | null; companyId: string; tab: CrewDocumentTab }> = ({ profileId, userId, companyId, tab }) => {
  // The same query as the panel's (one request): the tab row shows each tab's count.
  const documents = useCrewDocuments(profileId, { companyId, userId });
  const counts = React.useMemo(() => {
    const out: Record<CrewDocumentTab, number> = { documents: 0, stcw: 0, qualifications: 0 };
    if (documents.status === 'ready') for (const d of documents.documents) out[d.tab] += 1;
    return out;
  }, [documents]);
  const ready = documents.status === 'ready';

  return (
    <div className="min-w-0 space-y-4" data-my-documents="">
      <PageHeader title={MY_DOCUMENTS_TITLE} description={MY_DOCUMENTS_DESCRIPTION} className="mb-0" />
      <nav aria-label="Document tabs" className="min-w-0">
        <ul className="flex h-11 max-w-full snap-x items-stretch gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain shadow-[inset_0_-1px_0_0_hsl(var(--border))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CREW_DOCUMENT_TABS.map((t) => {
            const active = t === tab;
            return (
              <li key={t} className="flex shrink-0">
                <Link to={`?tab=${t}`} replace aria-current={active ? 'page' : undefined} className={tabLink(active)} data-active={active ? 'true' : undefined}>
                  {CREW_DOCUMENT_TAB_LABEL[t]}
                  {ready ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 type-caption tabular-nums text-muted-foreground" aria-label={`${counts[t]} documents`}>
                      {counts[t]}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <DocumentsPanel key={tab} tab={tab} profileId={profileId} userId={userId} companyId={companyId} context="own" headingLevel={2} />
    </div>
  );
};

export default MyDocumentsPage;
