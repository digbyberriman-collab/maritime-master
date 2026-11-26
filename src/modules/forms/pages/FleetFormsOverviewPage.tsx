/**
 * Fleet › Forms & Checklists (`/fleet/forms?vessel=`; gap/02 FC1, FC5,
 * FC6, FC7, W2; DECISIONS C6, D-01, D-04, D-88; X5 spec X5-06B). What
 * crews see, by where they find it on board.
 *
 * - Gate `fleet.operations.fleet_checklists.view` (the route guard uses
 *   the same key): nothing is read while it loads (skeleton), denied is
 *   AccessDenied.
 * - One card per area (Charter / Trip, Safety, Technical, Movement,
 *   Permits, Familiarisation, Crew, SMS forms, Technical forms, and
 *   Unsorted when a template has no area), with its counts on the vessels
 *   in view: shown, customised (a Customise copy shown), hidden (on at
 *   least one vessel), drafts for editors and, when run tracking answers,
 *   how many templates are overdue. Each card opens its area page.
 * - "Showing": the whole fleet (every counted vessel) or one vessel
 *   (`?vessel=<CODE>`, kept on the links); an unknown code says so and
 *   shows the whole fleet.
 * - Reads: the catalogue (one request each for the live and the catalogue
 *   columns), the per-vessel settings and `form_template_run_stats` for
 *   every area (one RPC).
 * - D-01: without the catalogue columns every template is under Unsorted
 *   ("Areas are not set up yet"), with no hidden counts; without the
 *   settings table nothing is hidden; without the run statistics there is
 *   no overdue count. Any other failure is PageError with Retry, never
 *   sample rows.
 * - FC7: the Permits card says permit types are set up with Safety ›
 *   Permits to Work (planned until that page exists).
 */
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useFleetVesselsShown } from '@/modules/fleet';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { todayDateOnly } from '@/shared/lib/form';
import { AreaCard } from '../components/AreaCard';
import { AREAS_NOT_SET_UP, COARSE, FreshnessActions, Notice, ShowingSelect } from '../components/FormsParts';
import { formsKeys } from '../hooks/keys';
import { useFormTemplateCatalogue, useFormTemplateRunStats, useFormTemplateVesselSettings } from '../hooks/useFleetFormTemplates';
import { areaCounts, areaKeySlug, indexSettings, resolveShowing, showingPhrase } from '../lib/catalogueModel';
import { FORMS_CAPS, FORMS_PARAMS, fleetFormsPath } from '../paths';

const FleetFormsOverviewPage: React.FC = () => {
  const access = useCapability(FORMS_CAPS.view);
  if (access.status === 'loading') return <PageLoading variant="cards" label="Loading forms and checklists" />;
  if (!access.allowed) {
    return <AccessDenied detail="Forms & Checklists needs fleet checklist access. If you think you should see it, ask your account admin." />;
  }
  return <OverviewBody />;
};

export default FleetFormsOverviewPage;

function OverviewBody() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const canCreate = useCan(FORMS_CAPS.create);
  const canEdit = useCan(FORMS_CAPS.edit);
  const today = todayDateOnly();

  const fleet = useFleetVesselsShown();
  const vessels = fleet.status === 'ready' ? fleet.vessels : [];
  const { showing, unknownCode } = resolveShowing(vessels, params.get(FORMS_PARAMS.vessel));

  const catalogue = useFormTemplateCatalogue();
  const areasSetUp = catalogue.status === 'ready' && catalogue.areasSetUp;
  const vesselsReady = fleet.status === 'ready';
  const settings = useFormTemplateVesselSettings(showing.kind === 'fleet' ? null : showing.vesselIds, areasSetUp && vesselsReady);
  const stats = useFormTemplateRunStats(showing.kind === 'fleet' ? null : showing.vesselIds, null, today, areasSetUp && vesselsReady);

  const setVessel = (code: string | null) => {
    const next = new URLSearchParams(params);
    if (code) next.set(FORMS_PARAMS.vessel, code);
    else next.delete(FORMS_PARAMS.vessel);
    setParams(next, { replace: true });
  };
  const refresh = () => void queryClient.invalidateQueries({ queryKey: formsKeys.company(companyId) });
  const withVessel = (href: string) => (showing.kind === 'vessel' && showing.vessel.code ? `${href}?${FORMS_PARAMS.vessel}=${encodeURIComponent(showing.vessel.code)}` : href);

  const header = (
    <PageHeader
      eyebrow="Fleet"
      title="Forms & Checklists"
      description="What your crews see, by where they find it on board."
      actions={
        <>
          {vesselsReady ? <ShowingSelect vessels={vessels} showing={showing} onChange={setVessel} /> : null}
          <FreshnessActions
            updatedAt={catalogue.status === 'ready' ? catalogue.updatedAt : null}
            refreshing={catalogue.status === 'ready' && catalogue.refreshing}
            onRefresh={refresh}
          />
          {canCreate ? (
            <Button asChild size="sm" className={COARSE}>
              <Link to={fleetFormsPath.create()}>
                <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                New template
              </Link>
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (fleet.status === 'error') {
    return (
      <div className="space-y-4">
        {header}
        <PageError error={fleet.error} title="Your vessels could not be loaded" onRetry={fleet.retry} />
      </div>
    );
  }
  if (catalogue.status === 'error') {
    return (
      <div className="space-y-4">
        {header}
        <PageError error={catalogue.error} title="The templates could not be loaded" onRetry={catalogue.retry} treatMissingAsOff={false} />
      </div>
    );
  }
  if (catalogue.status === 'loading' || fleet.status === 'loading') {
    return (
      <div className="space-y-4">
        {header}
        <PageLoading variant="cards" rows={9} label="Loading forms and checklists" />
      </div>
    );
  }

  const settingsReady = settings.status === 'ready';
  const index = indexSettings(settingsReady ? settings.settings : []);
  const counts = areaCounts(catalogue.templates, showing.vesselIds, index, stats.status === 'ready' ? stats.stats : null);
  const visibleCounts = areasSetUp ? counts : counts.filter((c) => c.area === null);

  return (
    <div className="space-y-4">
      {header}
      {unknownCode ? (
        <Notice testId="forms-unknown-vessel">
          No vessel with the code {unknownCode} is in your fleet, so the whole fleet is shown.
        </Notice>
      ) : null}
      {!areasSetUp ? <Notice testId="forms-areas-not-set-up">{AREAS_NOT_SET_UP}</Notice> : null}
      {settings.status === 'error' ? (
        <PageError variant="inline" error={settings.error} title="Which templates are hidden on each vessel could not be loaded" onRetry={settings.retry} treatMissingAsOff={false} />
      ) : null}
      {stats.status === 'error' ? (
        <PageError variant="inline" error={stats.error} title="Run history could not be loaded" onRetry={stats.retry} treatMissingAsOff={false} />
      ) : null}
      {catalogue.templates.length === 0 ? (
        <PageEmpty
          title="No forms or checklists yet"
          body="Build a template and publish it to the vessels that use it."
          action={
            canCreate ? (
              <Button asChild size="sm" className={COARSE}>
                <Link to={fleetFormsPath.create()}>New template</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section aria-labelledby="forms-areas-heading" className="space-y-3">
          <h2 id="forms-areas-heading" className="type-eyebrow text-muted-foreground">
            By where crews find them, {showingPhrase(showing)}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleCounts.map((c) => (
              <AreaCard
                key={c.area ?? 'unsorted'}
                counts={c}
                href={withVessel(fleetFormsPath.area(areaKeySlug(c.area)))}
                settingsKnown={areasSetUp && (settingsReady || settings.status === 'not_set_up')}
                showDrafts={canEdit}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
