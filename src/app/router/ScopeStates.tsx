/**
 * The bodies a scope layout renders instead of its page: loading, vessel not
 * found, no access, vessel archived, page not found, the vessel list could
 * not load. They render no shell; the scope layout puts them inside its
 * DashboardLayout (the two `FullPage…` states are for the routes that decide
 * before any shell renders). Built on the shared page states
 * (`@/shared/components/states`, gap/00 D7, gap/10 §A.12).
 *
 * Each state that replaces a page names itself to the page header
 * (`usePageLocationOverride`, spec §7), so the document title and the
 * breadcrumb say what is shown ("Page not found"), never the URL's nav title.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccessDenied, EmptyState, PageError, PageLoading, VesselArchived } from '@/shared/components/states';
import RbacRetryNotice from '@/shared/components/layout/topbar/RbacRetryNotice';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';

/**
 * Placeholder inside the shell while a scope works out what to show. It
 * carries the route-loading marker (`data-route-loading`, `aria-busy`) so the
 * shell's heading check waits for the page instead of titling the wait.
 */
export const ScopeLoading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div data-route-loading="" aria-busy="true">
    <PageLoading variant="detail" label={label} />
  </div>
);

/**
 * Full-page spinner, for routes that decide before any shell renders (`/`,
 * legacy redirects, as ProtectedRoute does). With no shell around it, it
 * shows the RBAC Retry notice itself, so a failed first role load never
 * leaves a bare spinner (D-56).
 */
export const FullPageLoading: React.FC = () => (
  <div data-route-loading="" aria-busy="true" className="flex min-h-dvh flex-col bg-background">
    <RbacRetryNotice />
    <div role="status" aria-live="polite" className="flex flex-1 items-center justify-center">
      <Loader2 className="h-8 w-8 text-primary motion-safe:animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  </div>
);

/** The heading (and page title) of the failed vessel-list state. */
export const VESSEL_LIST_ERROR_TITLE = 'Your vessels could not load';

/**
 * PageError's Try again is a small button; on touch it gets the 44 px target
 * (D-35, gap/10 A.7) the strips' Retry has.
 */
const COARSE_RETRY_TARGET = '[@media(pointer:coarse)]:[&_button]:h-11';

interface VesselListErrorProps {
  /** What failed (a sentence, or the error itself). */
  error?: unknown;
  onRetry: () => void;
}

/**
 * The vessel lists could not load (D-04, gap/10 A.12): an error with Retry,
 * shown instead of "Vessel not found", "no access", "archived" or "No vessel
 * to open", none of which is known while the list is missing. The table is
 * live, so a missing-relation code is an error here, not "not switched on".
 * Inside the shell; the shell's strip (VesselListNotice) says the same.
 */
export const VesselListError: React.FC<VesselListErrorProps> = ({ error, onRetry }) => {
  usePageLocationOverride({ title: VESSEL_LIST_ERROR_TITLE, crumbs: 'none' });
  return (
    <PageError
      title={VESSEL_LIST_ERROR_TITLE}
      error={error}
      onRetry={onRetry}
      headingLevel={1}
      treatMissingAsOff={false}
      className={COARSE_RETRY_TARGET}
    />
  );
};

/**
 * The same error for the routes with no shell (`/`, legacy redirects), in
 * FullPageLoading's frame: the RBAC Retry notice on top, the error centred.
 */
export const FullPageVesselListError: React.FC<VesselListErrorProps> = ({ error, onRetry }) => (
  <div className="flex min-h-dvh flex-col bg-background">
    <RbacRetryNotice />
    <main className="flex flex-1 items-center justify-center px-4">
      <PageError
        title={VESSEL_LIST_ERROR_TITLE}
        error={error}
        onRetry={onRetry}
        headingLevel={1}
        treatMissingAsOff={false}
        className={COARSE_RETRY_TARGET}
      />
    </main>
  </div>
);

const homeLink = (homePath: string) => (
  <Button asChild variant="outline" size="sm">
    <Link to={homePath}>Go to my start page</Link>
  </Button>
);

/** 404 for a vessel code that matches no vessel of the company. No scope root to name: the title alone. */
export const VesselNotFound: React.FC<{ code: string; homePath: string }> = ({ code, homePath }) => {
  usePageLocationOverride({ title: 'Vessel not found', crumbs: 'none' });
  return (
    <EmptyState
      kind="filtered"
      icon={SearchX}
      headingLevel={1}
      title="Vessel not found"
      body={
        <>
          No vessel has the code <span className="font-mono">{code.toUpperCase()}</span>. Check the link, or pick the
          vessel from the vessel menu.
        </>
      }
      action={homeLink(homePath)}
    />
  );
};

/** No reach: the vessel (or scope) exists but the user may not open it. */
export const ScopeAccessDenied: React.FC<{ title?: string; detail?: string; homePath: string }> = ({
  title = "You don't have access to this vessel",
  detail = 'This vessel is not one of the vessels assigned to you. Ask your account admin if you need access.',
  homePath,
}) => {
  usePageLocationOverride({ title });
  return <AccessDenied title={title} detail={detail} backTo={{ to: homePath, label: 'Go to my start page' }} headingLevel={1} />;
};

/** The vessel has been sold or archived; its records are kept but its pages are closed. */
export const VesselArchivedState: React.FC<{ name: string; homePath: string }> = ({ name, homePath }) => {
  // VesselArchived's own heading.
  usePageLocationOverride({ title: `${name} is archived` });
  return <VesselArchived vesselName={name} action={homeLink(homePath)} headingLevel={1} />;
};

/**
 * A vessel link that means "my vessel", for someone with no vessel to open
 * (gap/01 landing rules: no vessels assigned yet).
 */
export const NoVesselState: React.FC<{ homePath: string }> = ({ homePath }) => (
  <ScopeAccessDenied
    title="No vessel to open"
    detail="No vessel has been assigned to you yet. Ask your account admin to assign one."
    homePath={homePath}
  />
);

/** A path inside a scope that no page answers. */
export const ScopePageNotFound: React.FC<{ homePath: string }> = ({ homePath }) => {
  usePageLocationOverride({ title: 'Page not found' });
  return (
    <EmptyState
      kind="filtered"
      icon={SearchX}
      headingLevel={1}
      title="Page not found"
      body="This page does not exist, or it has moved."
      action={homeLink(homePath)}
    />
  );
};
