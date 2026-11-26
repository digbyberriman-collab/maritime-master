/**
 * Fleet groups on mini maps (gap/02 D2, §4.1; DECISIONS D-38; X5 spec
 * X5-02B): one card per `fleet_groups` row that has a vessel shown, plus
 * "Ungrouped" for vessels in no group (titled "Vessels" when the company
 * has no group at all). Each card plots the latest reported AIS fix of its
 * vessels and lists them with their status, and offers "Open full tracker"
 * (`/fleet/tracker?group=<id>`).
 *
 * Positions are reported fixes only (D-38): a vessel without one is listed
 * as "No position yet" and gets no marker; a fix older than 6 h, or one
 * whose AIS status is unknown, is a hollow marker and the list says how old
 * it is. Nothing is estimated or hashed from an id (the old region cards
 * did that).
 *
 * The maps follow the theme (`useBasemap`, mapTheme tokens) and are static
 * previews: no drag, zoom or scroll capture, so the page scrolls over them
 * on a phone. The vessel list under each map carries the same facts as
 * text. Group names are read with the shell's query (same key and columns
 * as `useFleetGroups`), keyed by the company. A failed read says so with
 * Retry; `ais_snapshots` not in the database yet reads as "No position
 * yet" (D-01, in the positions hook).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatDistanceToNowStrict } from 'date-fns';
import { Map as MapIcon, Navigation } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { PageError, PageLoading } from '@/shared/components/states';
import {
  VESSEL_STATE_LABEL,
  labelMarkerIcon,
  useBasemap,
  vesselMarkerIcon,
  type VesselNavState,
} from '@/shared/components/data/mapTheme';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { ShownVessel } from '@/modules/fleet';
import {
  STALE_FIX_MS,
  navStateFromAis,
  useLatestVesselPositions,
  type VesselPosition,
} from '../../hooks/useLatestVesselPositions';

/** The tracker, which opens on one group with `?group=`. */
export const FLEET_TRACKER_PATH = '/fleet/tracker';
/** `?group=` for the vessels in no group. */
const UNGROUPED = 'ungrouped';

interface FleetGroupRow {
  id: string;
  name: string;
}

/** The company's fleet groups: the shell's query (`['fleet-groups', companyId]`, id + name by name). */
function useCompanyFleetGroups(companyId: string) {
  return useQuery({
    queryKey: ['fleet-groups', companyId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FleetGroupRow[]> => {
      const { data, error } = await supabase
        .from('fleet_groups')
        .select('id, name')
        .eq('company_id', companyId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((g): g is FleetGroupRow => typeof g.id === 'string' && typeof g.name === 'string');
    },
  });
}

interface GroupVessel {
  vessel: ShownVessel;
  position: VesselPosition | null;
  navState: VesselNavState | null;
  stale: boolean;
}

interface MapGroup {
  key: string;
  /** `?group=` of the tracker. */
  trackerGroup: string;
  title: string;
  vessels: GroupVessel[];
}

/** Named groups with a vessel shown (by name), then the vessels in no known group. */
function buildGroups(
  vessels: readonly ShownVessel[],
  groups: readonly FleetGroupRow[],
  positions: ReadonlyMap<string, VesselPosition>,
  now: number,
): MapGroup[] {
  const toGroupVessel = (vessel: ShownVessel): GroupVessel => {
    const position = positions.get(vessel.id) ?? null;
    const navState = position ? navStateFromAis(position.navStatus) : null;
    const stale = position ? navState === null || now - Date.parse(position.timestampUtc) > STALE_FIX_MS : false;
    return { vessel, position, navState, stale };
  };
  const known = new Set(groups.map((g) => g.id));
  const out: MapGroup[] = [];
  for (const group of groups) {
    const members = vessels.filter((v) => v.fleetGroupId === group.id);
    if (members.length) out.push({ key: group.id, trackerGroup: group.id, title: group.name, vessels: members.map(toGroupVessel) });
  }
  const rest = vessels.filter((v) => !v.fleetGroupId || !known.has(v.fleetGroupId));
  if (rest.length) {
    out.push({ key: UNGROUPED, trackerGroup: UNGROUPED, title: out.length ? 'Ungrouped' : 'Vessels', vessels: rest.map(toGroupVessel) });
  }
  return out;
}

/** "Moored · 25 min ago", "Last fix 9 h ago", "No position yet". */
function statusText(v: GroupVessel): { text: string; tone: 'muted' | 'warn' | 'normal' } {
  if (!v.position) return { text: 'No position yet', tone: 'muted' };
  const age = formatDistanceToNowStrict(new Date(v.position.timestampUtc), { addSuffix: true });
  if (v.stale && v.navState) return { text: `${VESSEL_STATE_LABEL[v.navState]} · last fix ${age}`, tone: 'warn' };
  if (v.stale) return { text: `Status unknown · ${age}`, tone: 'warn' };
  return { text: `${VESSEL_STATE_LABEL[v.navState as VesselNavState]} · ${age}`, tone: 'normal' };
}

// ─── Mini map ───────────────────────────────────────────────────────────

const WORLD_CENTER: L.LatLngExpression = [25, 10];

/** A static themed preview of a group's fixes. */
function MiniMap({ group }: { group: MapGroup }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = L.map(containerRef.current, {
      center: WORLD_CENTER,
      zoom: 1,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    mapRef.current = map;
    setReady(true);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useBasemap(mapRef, ready, { attribution: false });

  const fixes = React.useMemo(
    () => group.vessels.filter((v): v is GroupVessel & { position: VesselPosition } => v.position !== null),
    [group.vessels],
  );

  // Markers, and the view fitted to them (refitted when the card is resized).
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    const layer = L.layerGroup().addTo(map);
    for (const v of fixes) {
      const at: L.LatLngExpression = [v.position.latitude, v.position.longitude];
      L.marker(at, {
        icon: vesselMarkerIcon({ heading: v.position.heading ?? v.position.cog, state: v.navState ?? 'moored', stale: v.stale }),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
      L.marker(at, { icon: labelMarkerIcon(v.vessel.name, [-14, 10]), interactive: false, keyboard: false }).addTo(layer);
    }
    const fit = () => {
      map.invalidateSize();
      const size = map.getSize();
      if (fixes.length === 0 || size.x === 0 || size.y === 0) {
        map.setView(WORLD_CENTER, 1);
      } else if (fixes.length === 1) {
        map.setView([fixes[0].position.latitude, fixes[0].position.longitude], 5);
      } else {
        map.fitBounds(L.latLngBounds(fixes.map((v) => [v.position.latitude, v.position.longitude] as L.LatLngTuple)), {
          padding: [28, 28],
          maxZoom: 6,
        });
      }
    };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => fit());
    if (observer && containerRef.current) observer.observe(containerRef.current);
    return () => {
      observer?.disconnect();
      layer.remove();
    };
  }, [fixes, ready]);

  const placed = fixes.length;
  const label = `Map of ${group.title}: ${placed} of ${group.vessels.length} ${group.vessels.length === 1 ? 'vessel' : 'vessels'} with a reported position`;
  return (
    <div className="relative overflow-hidden rounded-md border border-border">
      <div ref={containerRef} role="img" aria-label={label} className="h-44 w-full bg-map-water md:h-52" />
      {placed === 0 ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-2 z-[400] mx-auto w-fit rounded-sm bg-card/90 px-2 py-1 type-caption text-muted-foreground">
          No position yet
        </p>
      ) : null}
    </div>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────

function GroupCard({ group }: { group: MapGroup }) {
  const headingId = React.useId();
  const href = `${FLEET_TRACKER_PATH}?group=${encodeURIComponent(group.trackerGroup)}`;
  const count = group.vessels.length;
  return (
    <Card role="region" aria-labelledby={headingId} className="flex min-w-0 flex-col">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-1 space-y-0 pb-3">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="flex min-w-0 items-center gap-2 type-subtitle text-foreground">
            <MapIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{group.title}</span>
          </h3>
          <p className="type-caption mt-0.5 pl-6 text-muted-foreground">
            {count.toLocaleString('en-GB')} {count === 1 ? 'vessel' : 'vessels'}
          </p>
        </div>
        <Link
          to={href}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-sm px-1 type-caption font-medium text-primary underline-offset-2 hover:underline focus-ring [@media(pointer:coarse)]:min-h-11"
          aria-label={`Open the full tracker for ${group.title}`}
        >
          <Navigation aria-hidden="true" className="h-3.5 w-3.5" />
          Open full tracker
        </Link>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <MiniMap group={group} />
        <ul className="divide-y divide-border" aria-label={`${group.title} vessels`}>
          {group.vessels.map((v) => {
            const status = statusText(v);
            return (
              <li key={v.vessel.id} className="flex min-h-9 items-center justify-between gap-3 py-1.5">
                {v.vessel.code ? (
                  <Link
                    to={vesselPath(v.vessel.code, '')}
                    className="-mx-1 inline-flex min-h-8 min-w-0 items-center rounded-sm px-1 text-sm font-medium text-foreground hover:underline focus-ring [@media(pointer:coarse)]:min-h-11"
                  >
                    <span className="truncate">{v.vessel.name}</span>
                  </Link>
                ) : (
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{v.vessel.name}</span>
                )}
                <span
                  className={cn(
                    'shrink-0 text-right text-xs tabular-nums',
                    status.tone === 'warn' ? 'text-warning' : 'text-muted-foreground',
                  )}
                  data-position-status={v.position ? (v.stale ? 'stale' : 'fresh') : 'none'}
                >
                  {status.text}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export interface FleetGroupMapsProps {
  companyId: string;
  /** The vessels shown (the "Vessels shown" filter), with their fleet group. */
  vessels: readonly ShownVessel[];
}

/** The mini maps section (h2 "Fleet groups"). */
export function FleetGroupMaps({ companyId, vessels }: FleetGroupMapsProps) {
  const groupsQuery = useCompanyFleetGroups(companyId);
  const ids = React.useMemo(() => vessels.map((v) => v.id), [vessels]);
  const positionsQuery = useLatestVesselPositions(ids);
  const headingId = React.useId();

  let body: React.ReactNode;
  if (groupsQuery.isError || positionsQuery.isError) {
    const failed = groupsQuery.isError ? groupsQuery : positionsQuery;
    body = (
      <PageError
        variant="inline"
        title={groupsQuery.isError ? 'The fleet groups could not load' : 'The vessel positions could not load'}
        error={failed.error}
        onRetry={() => void failed.refetch()}
        headingLevel={3}
        treatMissingAsOff={false}
      />
    );
  } else if (!groupsQuery.data || (ids.length > 0 && !positionsQuery.data)) {
    body = <PageLoading variant="cards" rows={2} label="Loading the fleet groups" />;
  } else {
    const groups = buildGroups(vessels, groupsQuery.data, positionsQuery.data ?? new Map(), Date.now());
    body = (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="fleet-group-maps">
        {groups.map((group) => (
          <GroupCard key={group.key} group={group} />
        ))}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3">
      <div>
        <h2 id={headingId} className="type-title text-foreground">
          Fleet groups
        </h2>
        <p className="text-sm text-muted-foreground">Latest reported position of each vessel shown. Hollow markers are more than 6 hours old.</p>
      </div>
      {body}
    </section>
  );
}

export default FleetGroupMaps;
