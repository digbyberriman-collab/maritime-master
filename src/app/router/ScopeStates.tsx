/**
 * The bodies a scope layout renders instead of its page: loading, vessel not
 * found, no access, vessel archived, page not found. They render no shell; the
 * scope layout puts them inside its DashboardLayout. Built on the shared page
 * states (`@/shared/components/states`, gap/00 D7, gap/10 §A.12).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccessDenied, EmptyState, PageLoading, VesselArchived } from '@/shared/components/states';
import RbacRetryNotice from '@/shared/components/layout/topbar/RbacRetryNotice';

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

const homeLink = (homePath: string) => (
  <Button asChild variant="outline" size="sm">
    <Link to={homePath}>Go to my start page</Link>
  </Button>
);

/** 404 for a vessel code that matches no vessel of the company. */
export const VesselNotFound: React.FC<{ code: string; homePath: string }> = ({ code, homePath }) => (
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

/** No reach: the vessel (or scope) exists but the user may not open it. */
export const ScopeAccessDenied: React.FC<{ title?: string; detail?: string; homePath: string }> = ({
  title = "You don't have access to this vessel",
  detail = 'This vessel is not one of the vessels assigned to you. Ask your account admin if you need access.',
  homePath,
}) => <AccessDenied title={title} detail={detail} backTo={{ to: homePath, label: 'Go to my start page' }} headingLevel={1} />;

/** The vessel has been sold or archived; its records are kept but its pages are closed. */
export const VesselArchivedState: React.FC<{ name: string; homePath: string }> = ({ name, homePath }) => (
  <VesselArchived vesselName={name} action={homeLink(homePath)} headingLevel={1} />
);

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
export const ScopePageNotFound: React.FC<{ homePath: string }> = ({ homePath }) => (
  <EmptyState
    kind="filtered"
    icon={SearchX}
    headingLevel={1}
    title="Page not found"
    body="This page does not exist, or it has moved."
    action={homeLink(homePath)}
  />
);
