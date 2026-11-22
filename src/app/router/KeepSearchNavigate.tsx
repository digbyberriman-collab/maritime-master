/**
 * A `<Navigate replace>` that keeps the query string and hash, for the
 * router's own redirects: a scope's index or sub-root (`/fleet` →
 * `/fleet/dashboard`, `/v/dra/crew/compliance` → `…/status`), the vessel
 * module roots, the retired Coming Soon URLs and the workspace section
 * redirects.
 *
 * The rule is the one the legacy redirects follow (the header of
 * ./legacyRedirects.ts: "The query string and hash are kept; a query in `to`
 * is added to them"), applied through the same `withSearch`, so a parameter
 * the target sets itself (a section redirect's `?module=`) wins over the
 * incoming one. A relative `to` stays relative to the route, as with a bare
 * `<Navigate>`. Navigation state is passed on too.
 *
 * Route tests treat it exactly like `<Navigate>` (src/test/router/routeHarness.ts).
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { withSearch } from './legacyResolve';

const KeepSearchNavigate: React.FC<{ to: string }> = ({ to }) => {
  const { search, hash, state } = useLocation();
  return <Navigate replace state={state} to={withSearch(to, search, hash)} />;
};

export default KeepSearchNavigate;
