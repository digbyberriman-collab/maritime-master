/**
 * The vessel home (`/v/:vesselCode`; gap/02 D1–D10 for one vessel, gap/10
 * W4, S4; DECISIONS D-01, D-04, D-82, D-86, D-88; X5 spec X5-02B). Every
 * part of it is about this one vessel:
 *
 * - PageHeader: "Vessel", the vessel's name as the page's h1 with its IMO
 *   number as the reference chip, flag and class underneath; one freshness
 *   stamp from the indicators' read, Refresh, and the Quick actions menu
 *   (filtered by the vessel's modules and the caller's capabilities).
 * - Indicators: Document alerts, Hours of rest, Safety and Technical from
 *   `fleet_dashboard_kpis([vesselId])` on KpiTile. A tile whose module is
 *   off for the vessel is not shown. While the module settings load its
 *   tile is a skeleton; if they fail it is an error with Retry, never "all
 *   on" (D-86). A tile the caller cannot read is hidden (server gates).
 * - The "To acknowledge" slot (X5-05A mounts the pending fleet documents
 *   card there).
 * - Needs attention: the dashboard panels for this vessel (documents and
 *   certificates, safety and compliance, renewals and surveys), lists of an
 *   off module left out.
 * - Active alerts (this vessel's only), emergency contacts and the vessel
 *   profile.
 *
 * The old fleet view inside this page (`?view=fleet`, its Vessel / Fleet
 * toggle and fleet filter) is gone: the fleet overview is /fleet/dashboard
 * (D-82). The store-fed widgets that answered for every vessel of a fleet
 * user (snapshots, activity, incidents, module cards) are no longer on the
 * vessel's home.
 *
 * D-01: the dashboard RPCs not in the database yet → the tiles say "Not set
 * up yet" and the lists show their not-set-up state; any other failure is
 * an error with Retry; never zeros on error.
 *
 * Outside the vessel scope (the legacy /vessels/dashboard while a fleet
 * user has "All vessels" selected) there is no vessel to show: the page
 * says so and points to the fleet dashboard.
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Award, Clock, FileText, Gauge, MapPin, RefreshCw, ShieldAlert, Ship, Wrench, type LucideIcon } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import type { Tone } from '@/components/ui/tones';
import { cn } from '@/lib/utils';
import { useCan } from '@/lib/permissions/useCan';
import { KpiTile, type KpiTileState } from '@/shared/components/data/KpiTile';
import { EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVesselScope } from '@/app/router/scopes';
import { useVessel, type Vessel } from '@/modules/vessels/contexts/VesselContext';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings, type ModuleSettingsResolver } from '@/modules/vessels/lib/moduleSettings';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import VesselProfileCard from '@/modules/vessels/components/VesselProfileCard';
import { EmergencyContactsWidget } from '@/modules/emergency/components/EmergencyContactsWidget';
import { AlertsTriagePanel } from '@/modules/red-room/components/AlertsTriagePanel';
import { QuickActionsMenu } from '@/modules/dashboard/components/QuickActionsMenu';
import { ExpiryPanels, type PanelScope } from '@/modules/dashboard/components/fleet/ExpiryPanels';
import { SafetyPanels } from '@/modules/dashboard/components/fleet/SafetyPanels';
import { InsuranceSurveysPanel } from '@/modules/dashboard/components/fleet/InsuranceSurveysPanel';
import {
  dashboardKeys,
  useFleetDashboardKpis,
  useFleetDashboardPanels,
  type FleetDashboardScope,
  type FleetDashboardState,
} from '@/modules/dashboard/hooks/useFleetDashboard';
import {
  FLEET_DASHBOARD_VIEW,
  FLEET_KPI_LABELS,
  NOT_SET_UP_REASON,
  fleetKpiParts,
  fleetKpiTone,
  formatFreshnessUtc,
} from '@/modules/dashboard/lib/fleetKpiRules';
import type { FleetDashboardKpisJson, FleetDashboardPanelsJson } from '@/modules/dashboard/types/db.pending';
import { getWidgetsForRole } from '@/modules/dashboard/types';

// ─── Indicators ─────────────────────────────────────────────────────────

type VesselTileKey = 'documents' | 'hours_of_rest' | 'safety' | 'technical';

interface VesselTileDef {
  key: VesselTileKey;
  icon: LucideIcon;
  /** `vessel_module_settings` keys that must all be on for the tile to show (W4). */
  modules: readonly string[];
  /** The vessel page the number opens, or null. */
  rel: string | null;
  zeroLabel: string;
}

const VESSEL_TILES: readonly VesselTileDef[] = [
  { key: 'documents', icon: FileText, modules: [], rel: 'certificates', zeroLabel: 'All documents in date' },
  { key: 'hours_of_rest', icon: Clock, modules: ['crew', 'crew_hor'], rel: 'crew/hours-of-rest', zeroLabel: 'No breaches in 30 days' },
  { key: 'safety', icon: ShieldAlert, modules: ['safety'], rel: null, zeroLabel: 'Nothing open or overdue' },
  { key: 'technical', icon: Wrench, modules: ['technical'], rel: 'technical', zeroLabel: 'Nothing overdue' },
];

/** One tile as KpiTile shows it; null = not shown at all. */
interface VesselTileView {
  key: VesselTileKey;
  label: string;
  icon: LucideIcon;
  state?: KpiTileState;
  value?: number;
  sub?: string;
  tone?: Tone;
  href?: string;
  zeroLabel?: string;
  notEnabledReason?: string;
  errorMessage?: string;
  onRetry?: () => void;
}

const SETTINGS_ERROR = "This vessel's modules could not load";

/** From 1024 px the tiles share the row: four across, or as many as are shown. */
const TILE_COLUMNS: Readonly<Record<number, string>> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

function vesselTileView(
  def: VesselTileDef,
  kpis: FleetDashboardState<FleetDashboardKpisJson>,
  modules: ModuleSettingsResolver,
  retrySettings: () => void,
  code: string | null,
): VesselTileView | null {
  const base = { key: def.key, label: FLEET_KPI_LABELS[def.key], icon: def.icon };
  // The vessel's modules first: an off module hides the tile; unknown settings never read as "on" (D-86).
  if (def.modules.length > 0) {
    if (modules.status === 'loading') return { ...base, state: 'loading' };
    if (modules.status === 'error') return { ...base, state: 'error', errorMessage: SETTINGS_ERROR, onRetry: retrySettings };
    if (!def.modules.every((m) => modules.isModuleOn(m))) return null;
  }
  switch (kpis.state) {
    case 'ready': {
      const tiles = kpis.data.tiles;
      const tile = tiles[def.key];
      if (tile.state === 'no_access' || tile.state === 'module_off') return null;
      // "n vessels logging" is the fleet's sub-text; on one vessel it says nothing.
      const parts = fleetKpiParts(def.key, tiles).filter((p) => !p.endsWith(' logging'));
      const tone = fleetKpiTone(def.key, tiles);
      const watch = tile.value === 0 && tone === 'warn';
      return {
        ...base,
        state: watch ? 'ready' : undefined,
        value: tile.value,
        sub: parts.length ? parts.join(' · ') : undefined,
        tone,
        href: def.rel && code ? vesselPath(code, def.rel) : undefined,
        zeroLabel: def.zeroLabel,
      };
    }
    case 'not_set_up':
      return { ...base, state: 'not-enabled', notEnabledReason: NOT_SET_UP_REASON };
    case 'error':
      return { ...base, state: 'error', onRetry: kpis.retry };
    default:
      return { ...base, state: 'loading' };
  }
}

// ─── Slot for X5-05A ────────────────────────────────────────────────────

/**
 * The "To acknowledge" slot: X5-05A mounts the vessel's pending fleet
 * documents card (`PendingFleetDocumentsCard`) here, between the indicators
 * and the lists. Until then it renders nothing (no placeholder).
 */
function ToAcknowledgeSlot(_props: { vesselId: string }) {
  return null;
}

// ─── Needs attention ────────────────────────────────────────────────────

function anyListShown(data: FleetDashboardPanelsJson, scope: PanelScope): boolean {
  const shown = ExpiryPanels.listShown;
  const expiry = data.expiry.state === 'ok' ? 'ok' : 'no_access';
  return (
    shown('vessel_certificates', expiry, scope) ||
    shown('crew_documents', expiry, scope) ||
    shown('crew_qualifications', expiry, scope) ||
    shown('corrective_actions', data.corrective_actions.state, scope) ||
    shown('overdue_drills', data.overdue_drills.state, scope) ||
    shown('hess', data.hess.state, scope) ||
    shown('insurance', data.insurance.state, scope) ||
    shown('surveys', data.surveys.state, scope)
  );
}

function VesselLists({
  panels,
  modules,
  retrySettings,
  scope,
}: {
  panels: FleetDashboardState<FleetDashboardPanelsJson>;
  modules: ModuleSettingsResolver;
  retrySettings: () => void;
  scope: PanelScope;
}) {
  // The lists follow the vessel's modules: unknown settings show none (D-86).
  if (modules.status === 'error') {
    return (
      <PageError
        variant="inline"
        title={SETTINGS_ERROR}
        error={new Error('The lists follow the modules switched on for this vessel. Try again.')}
        onRetry={retrySettings}
        headingLevel={3}
        treatMissingAsOff={false}
      />
    );
  }
  if (modules.status === 'loading') return <PageLoading variant="cards" rows={3} label="Loading this vessel's lists" />;
  switch (panels.state) {
    case 'ready': {
      const data = panels.data;
      if (!anyListShown(data, scope)) {
        return (
          <EmptyState
            kind="no-access"
            title="No lists for your role"
            body="Your role does not include the records these lists are built from."
            headingLevel={3}
            bordered
            compact
          />
        );
      }
      return (
        <div className="space-y-6" data-testid="vessel-home-lists">
          <ExpiryPanels expiry={data.expiry} {...scope} />
          <SafetyPanels correctiveActions={data.corrective_actions} drills={data.overdue_drills} hess={data.hess} today={data.today} {...scope} />
          <InsuranceSurveysPanel insurance={data.insurance} surveys={data.surveys} {...scope} />
        </div>
      );
    }
    case 'not_set_up':
      return (
        <PageEmpty
          icon={Gauge}
          title="These lists are not set up yet"
          body="Expiring certificates and crew documents, open actions, overdue drills and coming surveys for this vessel appear here once the dashboard is set up for your account."
          headingLevel={3}
          bordered
          compact
        />
      );
    case 'error':
      return (
        <PageError
          variant="inline"
          title="This vessel's lists could not load"
          error={panels.error}
          onRetry={panels.retry}
          headingLevel={3}
          treatMissingAsOff={false}
        />
      );
    default:
      return <PageLoading variant="cards" rows={3} label="Loading this vessel's lists" />;
  }
}

// ─── The home ───────────────────────────────────────────────────────────

function VesselHome({ vessel, code }: { vessel: Vessel; code: string | null }) {
  const { profile } = useAuth();
  const companyId = vessel.company_id;
  const settings = useVesselModuleSettings(vessel.id);
  const modules = useMemo(() => resolveModuleSettings(settings.state, localIsoDate()), [settings.state]);
  const retrySettings = settings.retry;

  const scope = useMemo<FleetDashboardScope>(() => ({ companyId, vesselIds: [vessel.id], fleetWide: false }), [companyId, vessel.id]);
  const kpis = useFleetDashboardKpis(scope);
  const panels = useFleetDashboardPanels(scope);

  const queryClient = useQueryClient();
  const refreshing = useIsFetching({ queryKey: dashboardKeys.company(companyId) }) > 0 || settings.fetching;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.company(companyId) });
    retrySettings();
  };

  const tiles = VESSEL_TILES.map((def) => vesselTileView(def, kpis, modules, retrySettings, code)).filter(
    (t): t is VesselTileView => t !== null,
  );
  const showAlerts = getWidgetsForRole(profile?.role).includes('alerts');
  const panelScope = useMemo<PanelScope>(
    () => ({
      scope: 'vessel',
      isModuleOn: modules.isModuleOn,
      viewAllHref: (list) => {
        if (!code) return null;
        switch (list) {
          case 'vessel_certificates':
            return vesselPath(code, 'certificates');
          case 'crew_documents':
          case 'crew_qualifications':
            return vesselPath(code, 'crew/compliance/status');
          case 'overdue_drills':
            return vesselPath(code, 'safety/drills');
          default:
            return null;
        }
      },
    }),
    [code, modules.isModuleOn],
  );

  const particulars = [
    vessel.flag_state ? { icon: MapPin, text: vessel.flag_state, label: 'Flag state' } : null,
    vessel.classification_society ? { icon: Award, text: vessel.classification_society, label: 'Class society' } : null,
  ].filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vessel"
        title={vessel.name}
        reference={vessel.imo_number ? `IMO ${vessel.imo_number}` : undefined}
        description={
          particulars.length > 0 ? (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {particulars.map(({ icon: Icon, text, label }) => (
                <span key={label} className="inline-flex items-center gap-1">
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="sr-only">{label}: </span>
                  {text}
                </span>
              ))}
            </span>
          ) : undefined
        }
        actions={
          <>
            {kpis.state === 'ready' ? (
              <span className="type-caption tabular-nums text-muted-foreground" data-testid="vessel-home-updated">
                {formatFreshnessUtc(kpis.updatedAt)}
              </span>
            ) : null}
            <Button type="button" variant="outline" size="sm" className="[@media(pointer:coarse)]:min-h-11" onClick={refresh} disabled={refreshing}>
              <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} />
              Refresh
            </Button>
            {code ? <QuickActionsMenu vesselId={vessel.id} vesselCode={code} isModuleOn={modules.isModuleOn} /> : null}
          </>
        }
      />

      {tiles.length > 0 ? (
        <section aria-label="Vessel indicators" className={cn('grid grid-cols-2 gap-4', TILE_COLUMNS[tiles.length])}>
          {tiles.map((tile) => (
            <KpiTile
              key={tile.key}
              label={tile.label}
              icon={tile.icon}
              value={tile.value}
              sub={tile.sub}
              tone={tile.tone}
              href={tile.href}
              state={tile.state}
              zeroLabel={tile.zeroLabel}
              notEnabledReason={tile.notEnabledReason}
              errorMessage={tile.errorMessage}
              onRetry={tile.onRetry}
            />
          ))}
        </section>
      ) : null}

      <ToAcknowledgeSlot vesselId={vessel.id} />

      <section aria-labelledby="vessel-home-lists" className="space-y-3">
        <h2 id="vessel-home-lists" className="type-title text-foreground">
          Needs attention
        </h2>
        <VesselLists panels={panels} modules={modules} retrySettings={retrySettings} scope={panelScope} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {showAlerts ? <AlertsTriagePanel companyId={companyId} vesselId={vessel.id} /> : null}
        <EmergencyContactsWidget vesselId={vessel.id} />
      </div>

      <VesselProfileCard vesselId={vessel.id} />
    </div>
  );
}

/** Outside a vessel's scope with no single vessel selected. */
function NoVesselChosen() {
  const canOpenFleet = useCan(FLEET_DASHBOARD_VIEW);
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Vessel" title="Vessel home" />
      <EmptyState
        icon={Ship}
        title="Choose a vessel"
        body="Pick a vessel in the switcher at the top to open its home. The overview of every vessel is on the fleet dashboard."
        headingLevel={2}
        bordered
        action={
          canOpenFleet ? (
            <Button asChild variant="outline" size="sm" className="[@media(pointer:coarse)]:min-h-11">
              <Link to="/fleet/dashboard">Open the fleet dashboard</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

const VesselDashboard: React.FC = () => {
  const vesselScope = useVesselScope();
  const { selectedVessel, isAllVessels, getVesselCodeById } = useVessel();
  // The vessel scope's vessel; on the legacy URL, the selected vessel unless "All vessels" is chosen.
  const vessel = vesselScope?.vessel ?? (!isAllVessels ? selectedVessel : null);
  const code = vesselScope?.code ?? (vessel ? getVesselCodeById(vessel.id) : null);
  return <DashboardLayout>{vessel ? <VesselHome key={vessel.id} vessel={vessel} code={code} /> : <NoVesselChosen />}</DashboardLayout>;
};

export default VesselDashboard;
