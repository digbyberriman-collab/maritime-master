/**
 * Fleet › Forms & Checklists › one area (`/fleet/forms/:area?vessel=&tab=`;
 * gap/02 FC2, FC4, FC5, FC6, W2; DECISIONS C6, D-01, D-04, D-88, D-X5-13;
 * X5 spec X5-06B).
 *
 * - Gate `fleet.operations.fleet_checklists.view`: nothing is read while
 *   it loads, denied is AccessDenied. A slug that is not an area (the
 *   enum's slugs, `technical-forms` for `technical_forms`, and `unsorted`)
 *   is the in-scope "Area not found".
 * - Header: the area, "Crew find these in …", Showing (the whole fleet or
 *   one vessel, `?vessel=<CODE>`), one freshness stamp with Refresh, and
 *   New template (create) with the area preselected.
 * - "n of m shown": published templates of the area shown on at least one
 *   vessel in view, of those offered there.
 * - Tabs (`?tab=`): Available (shown somewhere in view), Hidden (hidden on
 *   at least one vessel in view, with where and why), Drafts (editors).
 * - A row: name (to the preview), origin chip, version, kind; "on k of n
 *   vessels" (or Shown on one vessel) with the hidden count; cadence; last
 *   run with the next due day or where it is overdue
 *   (`form_template_run_stats`); Customise (admins); the menu: Preview,
 *   the next version (start it, or open its draft), Hide on this vessel /
 *   Change where hidden (vessel managers), Move to another area and
 *   Archive (admins).
 * - Order on vessels: with one vessel in view and the right to manage it,
 *   "Change order" opens the reorder list (drag, keyboard, buttons) and
 *   saves it once through `form_template_reorder`. With the whole fleet in
 *   view it says to choose a vessel.
 * - Rights are client hints that mirror the definers (D-04): fleet
 *   checklist admins act fleet-wide; `fleet_checklists.edit` in a vessel's
 *   context hides, restores and orders on that vessel. The server refuses
 *   anything else, in words.
 * - D-01: without the catalogue columns every template is Unsorted with
 *   "Areas are not set up yet" and no hide or order controls; without the
 *   settings table nothing is hidden and nothing can be ordered; a missing
 *   definer says "not set up yet" when used. Errors are PageError with
 *   Retry.
 */
import React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowRightLeft, Eye, EyeOff, FilePen, FilePlus2, ListOrdered, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveCapability } from '@/lib/permissions/adaptor';
import { useAccessSnapshot, useCan, useCapability } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useFleetVesselsShown } from '@/modules/fleet';
import PageHeader from '@/shared/components/layout/PageHeader';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { todayDateOnly } from '@/shared/lib/form';
import { errorMessage, notify } from '@/shared/lib/notify';
import { AREAS_NOT_SET_UP, COARSE, FormsNotFound, FreshnessActions, Notice, ShowingSelect } from '../components/FormsParts';
import { ReorderList, type ReorderEntry } from '../components/ReorderList';
import { ArchiveDialog, DeleteDraftDialog, MoveAreaDialog, VisibilityDialog, type VisibilityOutcome } from '../components/TemplateActionDialogs';
import { DraftRow, HiddenRow, RowHeader, TemplateRow, type RowAction, type RunState } from '../components/TemplateRows';
import { formsKeys, LEGACY_TEMPLATE_KEYS } from '../hooks/keys';
import { setTemplateVisibility, useFormTemplateMutations } from '../hooks/useFormTemplateMutations';
import { useFormTemplateCatalogue, useFormTemplateDrafts, useFormTemplateRunStats, useFormTemplateVesselSettings } from '../hooks/useFleetFormTemplates';
import { AREA_CREW_LOCATIONS } from '../lib/areaModel';
import {
  areaKeyFromSlug,
  areaKeyLabel,
  areaKeySlug,
  indexSettings,
  orderOnVessel,
  placement,
  plural,
  resolveShowing,
  runSummary,
  settingFor,
  showingPhrase,
  targetsVessel,
  type AreaKey,
  type CatalogueTemplate,
} from '../lib/catalogueModel';
import { publishBlocker } from '../lib/publishChecks';
import { formTemplateRefusal } from '../lib/templateMachine';
import type { VisibilityChange } from '../lib/templateSchema';
import { FORMS_CAPS, FORMS_PARAMS, fleetFormsPath } from '../paths';

type Tab = 'available' | 'hidden' | 'drafts';
const TABS: readonly Tab[] = ['available', 'hidden', 'drafts'];

const FleetFormsAreaPage: React.FC = () => {
  const { area: slug } = useParams<{ area: string }>();
  const access = useCapability(FORMS_CAPS.view);
  if (access.status === 'loading') return <PageLoading variant="list" label="Loading the area" />;
  if (!access.allowed) {
    return <AccessDenied detail="Forms & Checklists needs fleet checklist access. If you think you should see it, ask your account admin." />;
  }
  const area = areaKeyFromSlug(slug);
  if (area === undefined) {
    return <FormsNotFound title="Area not found" body="There is no forms area at this address. Choose an area from the overview." />;
  }
  return <AreaBody key={areaKeySlug(area)} area={area} />;
};

export default FleetFormsAreaPage;

// ─── Body ───────────────────────────────────────────────────────────────

type Overlay =
  | { kind: 'visibility'; template: CatalogueTemplate }
  | { kind: 'move'; template: CatalogueTemplate }
  | { kind: 'archive'; template: CatalogueTemplate }
  | { kind: 'delete'; template: CatalogueTemplate }
  | null;

function AreaBody({ area }: { area: AreaKey }) {
  const label = areaKeyLabel(area);
  usePageLocationOverride({ title: label, crumbs: 'page' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const [params, setParams] = useSearchParams();
  const today = todayDateOnly();

  const canCreate = useCan(FORMS_CAPS.create);
  const canEdit = useCan(FORMS_CAPS.edit);
  const canAdmin = useCan(FORMS_CAPS.admin);
  const snapshot = useAccessSnapshot();

  const fleet = useFleetVesselsShown();
  const vessels = React.useMemo(() => (fleet.status === 'ready' ? fleet.vessels : []), [fleet]);
  const { showing, unknownCode } = resolveShowing(vessels, params.get(FORMS_PARAMS.vessel));
  const single = showing.kind === 'vessel' ? showing.vessel : null;
  const canManageSingle = useCan(FORMS_CAPS.edit, { vesselId: single?.id ?? null }) || canAdmin;
  const canManage = React.useCallback(
    (vesselId: string) => canAdmin || resolveCapability(FORMS_CAPS.edit, snapshot, { vesselId }).allowed,
    [canAdmin, snapshot],
  );

  const catalogue = useFormTemplateCatalogue();
  const areasSetUp = catalogue.status === 'ready' && catalogue.areasSetUp;
  const vesselsReady = fleet.status === 'ready';
  // The settings of every vessel the reader may see (the visibility dialog lists vessels outside the one in view).
  const settings = useFormTemplateVesselSettings(null, areasSetUp && vesselsReady);
  const stats = useFormTemplateRunStats(single ? [single.id] : null, area, today, areasSetUp && vesselsReady);

  const requested = params.get(FORMS_PARAMS.tab);
  const tab: Tab = TABS.includes(requested as Tab) && (requested !== 'drafts' || canEdit) ? (requested as Tab) : 'available';
  const drafts = useFormTemplateDrafts(tab === 'drafts' && canEdit);

  const mutations = useFormTemplateMutations();
  const [overlay, setOverlay] = React.useState<Overlay>(null);
  const [reordering, setReordering] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const refresh = () => void queryClient.invalidateQueries({ queryKey: formsKeys.company(companyId) });
  const vesselName = (id: string) => vessels.find((v) => v.id === id)?.name ?? 'a vessel';
  const withVessel = (href: string) => (single?.code ? `${href}${href.includes('?') ? '&' : '?'}${FORMS_PARAMS.vessel}=${encodeURIComponent(single.code)}` : href);

  const description =
    area === null ? 'Templates with no area are on no vessel menu. Move each one to the area where crews should find it.' : `Crew find these in ${AREA_CREW_LOCATIONS[area]}.`;

  const header = (
    <PageHeader
      eyebrow={
        <Link to={withVessel(fleetFormsPath.index())} className="hover:text-foreground hover:underline">
          Forms & Checklists
        </Link>
      }
      title={label}
      description={description}
      actions={
        <>
          {vesselsReady ? <ShowingSelect vessels={vessels} showing={showing} onChange={(code) => setParam(FORMS_PARAMS.vessel, code)} /> : null}
          <FreshnessActions
            updatedAt={catalogue.status === 'ready' ? catalogue.updatedAt : null}
            refreshing={catalogue.status === 'ready' && catalogue.refreshing}
            onRefresh={refresh}
          />
          {canCreate ? (
            <Button asChild size="sm" className={COARSE}>
              <Link to={fleetFormsPath.create(area === null ? null : areaKeySlug(area))}>
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
        <PageLoading variant="list" rows={6} label={`Loading ${label}`} />
      </div>
    );
  }

  // Without the catalogue columns every template is Unsorted: an area page has nothing of its own.
  const inArea = catalogue.templates.filter((t) => t.area === area);
  const settingsReady = settings.status === 'ready';
  const settingsList = settingsReady ? settings.settings : [];
  const index = indexSettings(settingsList);
  const orderingAvailable = areasSetUp && settingsReady;
  const published = inArea.filter((t) => t.status === 'PUBLISHED');
  const placed = published.map((t) => ({ template: t, placement: placement(t, showing.vesselIds, index) }));
  const offered = placed.filter((p) => p.placement.targeted.length > 0);
  const available = (() => {
    const shown = offered.filter((p) => p.placement.shown.length > 0);
    if (!single) return shown;
    const order = orderOnVessel(catalogue.templates, area, single.id, index).map((t) => t.id);
    return [...shown].sort((a, b) => order.indexOf(a.template.id) - order.indexOf(b.template.id));
  })();
  const hidden = offered.filter((p) => p.placement.hidden.length > 0);
  const notOffered = placed.length - offered.length;
  const draftRows = inArea.filter((t) => t.status === 'DRAFT');
  const draftBlockers = new Map(
    drafts.status === 'ready'
      ? drafts.drafts.map((d) => {
          const code = publishBlocker({ templateName: d.name, formSchema: d.formSchema, vesselScope: d.vesselScope, vesselIds: d.vesselIds });
          return [d.id, code ? (formTemplateRefusal(code) ?? code) : null] as const;
        })
      : [],
  );

  const runState: RunState = stats.status === 'ready' ? 'ready' : stats.status;
  const statsList = stats.status === 'ready' ? stats.stats : [];

  // The family's open draft (the next version), by template code.
  const draftByCode = new Map(catalogue.templates.filter((t) => t.status === 'DRAFT' && t.supersedesTemplateId).map((t) => [t.code, t]));

  const run = async (id: string, work: () => Promise<void>) => {
    setBusyId(id);
    try {
      await work();
    } catch {
      // The mutation hook has said why (notify).
    } finally {
      setBusyId(null);
    }
  };
  const customise = (t: CatalogueTemplate) =>
    run(t.id, async () => {
      const copy = await mutations.customise.mutateAsync(t.id);
      navigate(fleetFormsPath.edit(copy.id));
    });
  const startVersion = (t: CatalogueTemplate) =>
    run(t.id, async () => {
      const draft = await mutations.newVersion.mutateAsync(t.id);
      navigate(fleetFormsPath.edit(draft.id));
    });
  const showAgain = (t: CatalogueTemplate, vesselId: string) =>
    run(t.id, async () => {
      await mutations.setVisibility.mutateAsync({ templateId: t.id, vesselId, visibility: 'shown' });
    });

  const vesselManagerOf = (t: CatalogueTemplate) => vessels.filter((v) => targetsVessel(t, v.id) && canManage(v.id));

  const rowActions = (t: CatalogueTemplate): RowAction[] => {
    const actions: RowAction[] = [{ key: 'preview', label: 'Preview', icon: Eye, href: fleetFormsPath.preview(t.id) }];
    if (canAdmin) {
      const draft = draftByCode.get(t.code);
      if (draft) actions.push({ key: 'draft', label: `Open the draft of v${draft.version}`, icon: FilePen, href: fleetFormsPath.edit(draft.id) });
      else if (t.origin !== 'platform') actions.push({ key: 'version', label: 'Edit as a new version', icon: FilePen, onSelect: () => void startVersion(t) });
    }
    if (orderingAvailable && vesselManagerOf(t).length) {
      if (single && canManageSingle && settingFor(index, t.id, single.id)?.visibility !== 'hidden') {
        actions.push({ key: 'hide', label: `Hide on ${single.name}…`, icon: EyeOff, onSelect: () => setOverlay({ kind: 'visibility', template: t }), separated: true });
      } else {
        actions.push({ key: 'where', label: 'Change where hidden…', icon: EyeOff, onSelect: () => setOverlay({ kind: 'visibility', template: t }), separated: true });
      }
    }
    if (canAdmin && areasSetUp) actions.push({ key: 'move', label: 'Move to another area…', icon: ArrowRightLeft, onSelect: () => setOverlay({ kind: 'move', template: t }) });
    if (canAdmin) actions.push({ key: 'archive', label: 'Archive…', icon: Archive, onSelect: () => setOverlay({ kind: 'archive', template: t }), destructive: true, separated: true });
    return actions;
  };

  const hiddenActions = (t: CatalogueTemplate): RowAction[] => {
    const actions: RowAction[] = [{ key: 'preview', label: 'Preview', icon: Eye, href: fleetFormsPath.preview(t.id) }];
    if (orderingAvailable && vesselManagerOf(t).length) {
      actions.push({ key: 'where', label: 'Change where hidden…', icon: EyeOff, onSelect: () => setOverlay({ kind: 'visibility', template: t }) });
    }
    return actions;
  };

  const draftActions = (t: CatalogueTemplate): RowAction[] =>
    canAdmin ? [{ key: 'delete', label: 'Delete draft…', icon: Trash2, destructive: true, onSelect: () => setOverlay({ kind: 'delete', template: t }) }] : [];

  const applyVisibility = async (t: CatalogueTemplate, changes: VisibilityChange[]): Promise<VisibilityOutcome> => {
    const outcome: VisibilityOutcome = { saved: [], failed: [] };
    for (const change of changes) {
      try {
        await setTemplateVisibility(companyId as string, { templateId: t.id, vesselId: change.vesselId, visibility: change.visibility, reason: change.reason });
        outcome.saved.push(change);
      } catch (error) {
        outcome.failed.push({ change, message: errorMessage(error, 'Not saved.') });
      }
    }
    void queryClient.invalidateQueries({ queryKey: formsKeys.company(companyId) });
    for (const key of LEGACY_TEMPLATE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
    if (outcome.saved.length) {
      const hiddenNow = outcome.saved.filter((c) => c.visibility === 'hidden').length;
      const shownNow = outcome.saved.length - hiddenNow;
      notify.success(`${t.name} updated`, {
        description: [hiddenNow ? `Hidden on ${plural(hiddenNow, 'vessel')}` : null, shownNow ? `shown again on ${plural(shownNow, 'vessel')}` : null].filter(Boolean).join(', '),
      });
    }
    return outcome;
  };

  const reorderEntries: ReorderEntry[] = single
    ? orderOnVessel(catalogue.templates, area, single.id, index).map((t) => ({ id: t.id, name: t.name, hidden: settingFor(index, t.id, single.id)?.visibility === 'hidden' }))
    : [];
  const saveOrder = async (ids: string[]) => {
    if (!single) return;
    try {
      await mutations.reorder.mutateAsync({ vesselId: single.id, area, templateIds: ids });
      setReordering(false);
    } catch {
      // Toasted by the hook; the list stays open with the changes.
    }
  };

  const summary = `${offered.length ? `${available.length.toLocaleString('en-GB')} of ${plural(offered.length, 'template')} shown` : 'Nothing offered'} ${showingPhrase(showing)}`;

  const availablePanel = reordering && single ? (
    <ReorderList entries={reorderEntries} vesselName={single.name} saving={mutations.reorder.isPending} onSave={(ids) => void saveOrder(ids)} onCancel={() => setReordering(false)} />
  ) : (
    <div className="space-y-3">
      {orderingAvailable ? (
        single ? (
          canManageSingle && reorderEntries.length > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="type-body-sm text-muted-foreground">{`In the order crews on ${single.name} see them.`}</p>
              <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => setReordering(true)}>
                <ListOrdered aria-hidden="true" className="h-4 w-4" />
                Change order
              </Button>
            </div>
          ) : null
        ) : canEdit || canAdmin ? (
          <Notice>To change the order crews see on a vessel, choose that vessel in Showing.</Notice>
        ) : null
      ) : null}
      {available.length === 0 ? (
        <PageEmpty
          title={offered.length ? 'Every template here is hidden' : 'Nothing here yet'}
          body={
            offered.length
              ? `They are hidden ${showingPhrase(showing)}. The Hidden tab shows where and why.`
              : area === null
                ? 'Every template has an area.'
                : `No published template of ${label} is offered ${showingPhrase(showing)}.`
          }
          action={
            canCreate && !offered.length && area !== null ? (
              <Button asChild size="sm" className={COARSE}>
                <Link to={fleetFormsPath.create(areaKeySlug(area))}>New template</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div>
          <RowHeader columns={['Template', 'Vessels', 'Cadence', 'Last run']} />
          <ul aria-label={`${label} templates`} className="flex flex-col gap-2">
            {available.map(({ template, placement: p }, i) => (
              <TemplateRow
                key={template.id}
                template={template}
                placement={p}
                vesselCount={showing.vesselIds.length}
                position={single ? i + 1 : undefined}
                run={stats.status === 'ready' ? runSummary(statsList, template.id, showing.vesselIds) : null}
                runState={runState}
                today={today}
                vesselName={vesselName}
                previewHref={fleetFormsPath.preview(template.id)}
                onCustomise={canAdmin && areasSetUp ? () => void customise(template) : undefined}
                customising={busyId === template.id}
                actions={rowActions(template)}
              />
            ))}
          </ul>
        </div>
      )}
      {notOffered ? (
        <p className="type-body-sm text-muted-foreground">{`${plural(notOffered, 'published template')} of ${label} ${notOffered === 1 ? 'is' : 'are'} not offered ${showingPhrase(showing)}.`}</p>
      ) : null}
    </div>
  );

  const hiddenPanel =
    hidden.length === 0 ? (
      <PageEmpty title="Nothing hidden" body={`Every template offered ${showingPhrase(showing)} is shown to crews.`} />
    ) : (
      <ul aria-label={`Hidden ${label} templates`} className="flex flex-col gap-2">
        {hidden.map(({ template, placement: p }) => (
          <HiddenRow
            key={template.id}
            template={template}
            hiddenOn={p.hidden.map((v) => settingFor(index, template.id, v)).filter((s): s is NonNullable<typeof s> => !!s)}
            vesselName={vesselName}
            previewHref={fleetFormsPath.preview(template.id)}
            onShow={single && canManageSingle ? () => void showAgain(template, single.id) : undefined}
            showing={busyId === template.id}
            actions={hiddenActions(template)}
          />
        ))}
      </ul>
    );

  const draftsPanel =
    drafts.status === 'error' ? (
      <PageError variant="inline" error={drafts.error} title="The drafts could not be checked" onRetry={drafts.retry} treatMissingAsOff={false} />
    ) : draftRows.length === 0 ? (
      <PageEmpty title="No drafts" body={`New templates and next versions of ${label} appear here until they are published.`} />
    ) : (
      <ul aria-label={`${label} drafts`} className="flex flex-col gap-2">
        {draftRows.map((t) => (
          <DraftRow
            key={t.id}
            template={t}
            blocker={drafts.status === 'ready' && draftBlockers.has(t.id) ? (draftBlockers.get(t.id) ?? null) : undefined}
            editHref={canEdit ? fleetFormsPath.edit(t.id) : null}
            previewHref={fleetFormsPath.preview(t.id)}
            actions={draftActions(t)}
          />
        ))}
      </ul>
    );

  const overlayTemplate = overlay?.template ?? null;

  return (
    <div className="space-y-4">
      {header}
      {unknownCode ? <Notice>{`No vessel with the code ${unknownCode} is in your fleet, so the whole fleet is shown.`}</Notice> : null}
      {!areasSetUp ? <Notice testId="forms-areas-not-set-up">{AREAS_NOT_SET_UP}</Notice> : null}
      {settings.status === 'error' ? (
        <PageError variant="inline" error={settings.error} title="Which templates are hidden on each vessel could not be loaded" onRetry={settings.retry} treatMissingAsOff={false} />
      ) : null}
      {stats.status === 'error' ? <PageError variant="inline" error={stats.error} title="Run history could not be loaded" onRetry={stats.retry} treatMissingAsOff={false} /> : null}
      <p className="type-body text-foreground" data-testid="forms-area-summary">
        {summary}
      </p>
      <Tabs value={tab} onValueChange={(v) => setParam(FORMS_PARAMS.tab, v === 'available' ? null : v)}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="available" className={COARSE}>
            {`Available (${available.length.toLocaleString('en-GB')})`}
          </TabsTrigger>
          <TabsTrigger value="hidden" className={COARSE}>
            {`Hidden (${hidden.length.toLocaleString('en-GB')})`}
          </TabsTrigger>
          {canEdit ? (
            <TabsTrigger value="drafts" className={COARSE}>
              {`Drafts (${draftRows.length.toLocaleString('en-GB')})`}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="available" className="mt-4">
          {availablePanel}
        </TabsContent>
        <TabsContent value="hidden" className="mt-4">
          {hiddenPanel}
        </TabsContent>
        {canEdit ? (
          <TabsContent value="drafts" className="mt-4">
            {draftsPanel}
          </TabsContent>
        ) : null}
      </Tabs>

      <VisibilityDialog
        open={overlay?.kind === 'visibility'}
        onOpenChange={(open) => !open && setOverlay(null)}
        template={overlay?.kind === 'visibility' ? overlayTemplate : null}
        vessels={overlayTemplate ? (single && canManageSingle && targetsVessel(overlayTemplate, single.id) ? [single] : vesselManagerOf(overlayTemplate)).map((v) => ({ id: v.id, name: v.name })) : []}
        settings={overlayTemplate ? settingsList.filter((s) => s.templateId === overlayTemplate.id) : []}
        onApply={(changes) => applyVisibility(overlayTemplate as CatalogueTemplate, changes)}
      />
      <MoveAreaDialog
        open={overlay?.kind === 'move'}
        onOpenChange={(open) => !open && setOverlay(null)}
        template={overlay?.kind === 'move' ? overlayTemplate : null}
        onMove={(to) => mutations.moveArea.mutateAsync({ templateId: (overlayTemplate as CatalogueTemplate).id, area: to })}
      />
      <ArchiveDialog
        open={overlay?.kind === 'archive'}
        onOpenChange={(open) => !open && setOverlay(null)}
        template={overlay?.kind === 'archive' ? overlayTemplate : null}
        onArchive={(reason) => mutations.archive.mutateAsync({ templateId: (overlayTemplate as CatalogueTemplate).id, reason })}
      />
      <DeleteDraftDialog
        open={overlay?.kind === 'delete'}
        onOpenChange={(open) => !open && setOverlay(null)}
        template={overlay?.kind === 'delete' ? overlayTemplate : null}
        onDelete={() => mutations.deleteDraft.mutateAsync((overlayTemplate as CatalogueTemplate).id)}
        onArchiveInstead={() => overlayTemplate && setOverlay({ kind: 'archive', template: overlayTemplate })}
      />
    </div>
  );
}
