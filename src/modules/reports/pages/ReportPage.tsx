/**
 * Fleet › Reports › one report (`/fleet/reports/:reportKey`; gap/02 R1;
 * DECISIONS C12, D-04, D-X5-11). The registry decides what opens:
 *
 * - an unknown key (or another scope's report) is the in-scope "Report not
 *   found", with a link back to the reports hub;
 * - the report's own capability is checked before anything is loaded or
 *   read: while it loads the page is a skeleton (deny while loading), denied
 *   is AccessDenied;
 * - a registry report's component is loaded lazily (one chunk per report,
 *   cached per key) and renders its own ReportShell;
 * - a legacy report keeps its own static route, which outranks
 *   `:reportKey`; if this page is ever reached for one, it links there
 *   instead of redirecting (a redirect to the same URL would loop).
 *
 * The route guard (`fleet.operations.fleet_reports.view`) has already run.
 */
import React, { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCapability } from '@/lib/permissions/useCan';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { AccessDenied, EmptyState, PageLoading } from '@/shared/components/states';
import { FLEET_REPORTS_ROOT } from '../paths';
import { fleetReportPath, getReport, type ReportComponentProps, type ReportDefinition, type ReportLoader } from '../registry';

const loaded = new Map<string, LazyExoticComponent<ComponentType<ReportComponentProps>>>();

/** One lazy component per report key, so a re-render never reloads the report. */
function lazyReport(key: string, load: ReportLoader) {
  let component = loaded.get(key);
  if (!component) {
    component = lazy(load);
    loaded.set(key, component);
  }
  return component;
}

function BackToReports() {
  return (
    <Button asChild variant="outline" size="sm" className="[@media(pointer:coarse)]:min-h-11">
      <Link to={FLEET_REPORTS_ROOT}>All reports</Link>
    </Button>
  );
}

function ReportNotFound() {
  usePageLocationOverride({ title: 'Report not found' });
  return (
    <EmptyState
      kind="filtered"
      icon={SearchX}
      headingLevel={1}
      title="Report not found"
      body="There is no fleet report at this address. It may have moved or been renamed."
      action={<BackToReports />}
    />
  );
}

function LegacyReportLink({ definition }: { definition: ReportDefinition }) {
  usePageLocationOverride({ title: definition.title, crumbs: 'page' });
  return (
    <EmptyState
      headingLevel={1}
      title={definition.title}
      body="This report opens on its own page."
      action={
        <Button asChild size="sm" className="[@media(pointer:coarse)]:min-h-11">
          <Link to={fleetReportPath(definition)}>
            Open {definition.title}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
      }
    />
  );
}

function ReportGate({ definition }: { definition: ReportDefinition }) {
  const access = useCapability(definition.capability);
  if (access.status === 'loading') return <PageLoading label={`Loading ${definition.title}`} />;
  if (!access.allowed) {
    return <AccessDenied detail={`${definition.title} needs access to its data. If you think you should see it, ask your account admin.`} />;
  }
  if (!definition.load) return <LegacyReportLink definition={definition} />;
  const Report = lazyReport(definition.key, definition.load);
  return (
    <Suspense fallback={<PageLoading label={`Loading ${definition.title}`} />}>
      <Report definition={definition} />
    </Suspense>
  );
}

const ReportPage: React.FC = () => {
  const { reportKey } = useParams<{ reportKey: string }>();
  const definition = getReport(reportKey, 'fleet');
  if (!definition) return <ReportNotFound />;
  return <ReportGate key={definition.key} definition={definition} />;
};

export default ReportPage;
