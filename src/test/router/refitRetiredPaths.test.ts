/**
 * The old double-slug Refit sidebar URLs (before Phase 0 every Refit leaf
 * linked `<page>/<slug of its label>`) still open their Refit page, for one
 * release (gap/10 W3; D-02, D-06; REFIT_RETIRED_SIDEBAR_REDIRECTS).
 *
 * The URLs are rebuilt here from the old sidebar's own rules (its `slug()`
 * and its leaf labels and bases, as they stood at 750f61d), not read from
 * the redirect list, so a missing or mistyped entry fails.
 */
import { describe, expect, it, vi } from 'vitest';

// Importing the route tree imports the guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import RefitShell from '@/modules/refit/components/layout/RefitShell';
import { REFIT_PATHS, REFIT_RETIRED_SIDEBAR_REDIRECTS } from '@/modules/refit/paths';
import { appRouteObjects, isLazyPage, resolveUrl } from './routeHarness';

/** The old sidebar's slug(), verbatim. */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** [label, the old leaf base, the page it opens now]. */
const OLD_LEAVES: [string, string, string][] = [
  ['Dashboard', '/yard/refit/overview/dashboard', REFIT_PATHS.dashboard],
  ['Approvals Centre', '/yard/refit/overview/approvals', REFIT_PATHS.approvals],
  ['Notifications', '/yard/refit/overview/notifications', REFIT_PATHS.notifications],
  ['Search', '/yard/refit/overview/search', REFIT_PATHS.search],
  ['Change Orders', '/yard/refit/workflow/change-orders', REFIT_PATHS.changeOrders],
  ['Crew Requests', '/yard/refit/workflow/crew-requests', REFIT_PATHS.crewRequests],
  ['Snags & Warranty', '/yard/refit/workflow/snags', REFIT_PATHS.snags],
  ['Works Orders', '/yard/refit/workflow/works', REFIT_PATHS.works],
  ['Meetings', '/yard/refit/workflow/meetings', REFIT_PATHS.meetings],
  ['Risk Register', '/yard/refit/workflow/risks', REFIT_PATHS.risks],
  ['Schedule', '/yard/refit/project/schedule', REFIT_PATHS.schedule],
  ['Logistics', '/yard/refit/project/logistics', REFIT_PATHS.logistics],
  ['Inventory & Equipment', '/yard/refit/project/inventory', REFIT_PATHS.inventory],
  ['Contractors', '/yard/refit/project/contractors', REFIT_PATHS.contractors],
  ['Suppliers', '/yard/refit/project/suppliers', REFIT_PATHS.suppliers],
  ['Drawings & Plans', '/yard/refit/documents/drawings', REFIT_PATHS.drawings],
  ['Document Control', '/yard/refit/documents/document-control', REFIT_PATHS.documentControl],
  ['Files', '/yard/refit/documents/files', REFIT_PATHS.files],
  ['Budget', '/yard/refit/finance/budget', REFIT_PATHS.budget],
  ['Purchase Orders', '/yard/refit/finance/purchase-orders', REFIT_PATHS.purchaseOrders],
  ['Invoices', '/yard/refit/finance/invoices', REFIT_PATHS.invoices],
  // D-24: the old Compliance page is the compliance overview.
  ['Compliance', '/yard/refit/compliance/compliance', REFIT_PATHS.compliance],
  ['Crew & Certification', '/yard/refit/compliance/crew', REFIT_PATHS.crew],
  ['Audit Log', '/yard/refit/compliance/audit-log', REFIT_PATHS.auditLog],
  ['Reporting', '/yard/refit/compliance/reporting', REFIT_PATHS.reporting],
  ['Access Profile', '/yard/refit/account/access', REFIT_PATHS.access],
  ['Communications', '/yard/refit/account/communications', REFIT_PATHS.communications],
  ['Diagnostics', '/yard/refit/account/diagnostics', REFIT_PATHS.diagnostics],
  ['Access Check', '/yard/refit/account/access-check', REFIT_PATHS.accessCheck],
  ['Admin & Settings', '/yard/refit/account/admin', REFIT_PATHS.admin],
  ['Import & API', '/yard/refit/account/import', REFIT_PATHS.import],
  ['Login Diagnostics', '/yard/refit/account/login-diagnostics', REFIT_PATHS.loginDiagnostics],
];

const routes = appRouteObjects();
const layoutOf = (el: unknown) => ((el as { type?: { meta?: { layout?: unknown } } } | null)?.type?.meta?.layout ?? null);

describe('retired double-slug Refit URLs (one release)', () => {
  it('covers all 32 old sidebar leaves', () => {
    expect(OLD_LEAVES).toHaveLength(32);
    expect(REFIT_RETIRED_SIDEBAR_REDIRECTS).toHaveLength(32);
    expect(new Set(REFIT_RETIRED_SIDEBAR_REDIRECTS.map((r) => r.from)).size).toBe(32);
  });

  it.each(OLD_LEAVES)('%s: the old URL opens its Refit page in the Refit shell', (label, base, page) => {
    const url = `${base}/${slug(label)}`;
    const r = resolveUrl(routes, `${url}?module=yard`);
    expect(r.pattern, `${url} fell to the catch-all`).not.toBe('*');
    expect(r.hops).toEqual([url]);
    expect(r.pattern).toBe(page);
    expect(isLazyPage(r.element), r.pattern).toBe(true);
    expect(layoutOf(r.element)).toBe(RefitShell);
  });

  it('is an explicit list: a mistyped old-style URL is not redirected', () => {
    expect(resolveUrl(routes, '/yard/refit/overview/dashboard/dashbord').hops).toEqual([]);
  });
});
