// Fleet tracker: each vessel's last reported AIS fix on a Leaflet map.
// Positions come only from ais_snapshots (useLatestVesselPositions); a vessel
// that has not reported one is listed as "No position yet", never placed.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Ship,
  Maximize2,
  Minimize2,
  RefreshCw,
  Layers,
  X,
  Navigation,
  MapPinOff,
} from 'lucide-react';
import { useVesselFilter } from '@/modules/vessels/hooks/useVesselFilter';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { EmptyState, PageError } from '@/shared/components/states';
import {
  STALE_FIX_MS,
  navStateFromAis,
  useLatestVesselPositions,
  type VesselPosition,
} from '@/modules/dashboard/hooks/useLatestVesselPositions';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MAP_OVERLAYS,
  POPUP_OPTIONS,
  PORT_SWATCH_CLASS,
  VESSEL_STATE_LABEL,
  popupHtml,
  portMarkerIcon,
  useBasemap,
  useTileOverlay,
  vesselGlyphSvg,
  vesselMarkerIcon,
  type VesselNavState,
} from '@/shared/components/data/mapTheme';

interface FleetVessel {
  id: string;
  name: string;
  mmsi: string | null;
  /** The last reported fix, or null when the vessel has not reported one. */
  position: VesselPosition | null;
  /** From the fix's AIS nav status; null when unknown. */
  navState: VesselNavState | null;
}

interface Port {
  name: string;
  country: string;
  lat: number;
  lng: number;
  type: 'major' | 'marina' | 'shipyard';
  description: string;
}

const MAJOR_PORTS: Port[] = [
  { name: 'Port of Monaco', country: 'Monaco', lat: 43.7384, lng: 7.4246, type: 'marina', description: 'Premier superyacht marina in the heart of Monte Carlo' },
  { name: 'Antibes', country: 'France', lat: 43.5804, lng: 7.1251, type: 'marina', description: 'Largest superyacht port in Europe, Port Vauban' },
  { name: 'Palma de Mallorca', country: 'Spain', lat: 39.5696, lng: 2.6502, type: 'marina', description: 'Major refit hub and superyacht marina' },
  { name: 'Barcelona', country: 'Spain', lat: 41.3751, lng: 2.1768, type: 'major', description: 'OneOcean Port Vell, key Mediterranean stopover' },
  { name: 'Gibraltar', country: 'Gibraltar', lat: 36.1408, lng: -5.3536, type: 'major', description: 'Strategic bunkering and crew change port' },
  { name: 'Genoa', country: 'Italy', lat: 44.4056, lng: 8.9463, type: 'shipyard', description: 'Major shipbuilding and refit centre' },
  { name: 'La Spezia', country: 'Italy', lat: 44.1024, lng: 9.8240, type: 'shipyard', description: 'Home to several superyacht builders' },
  { name: 'Naples', country: 'Italy', lat: 40.8518, lng: 14.2681, type: 'major', description: 'Gateway to Amalfi Coast and Capri' },
  { name: 'Piraeus', country: 'Greece', lat: 37.9475, lng: 23.6370, type: 'major', description: 'Largest port in Greece, gateway to Greek islands' },
  { name: 'Istanbul', country: 'Turkey', lat: 41.0082, lng: 28.9784, type: 'major', description: 'Bosporus strait, connecting Mediterranean and Black Sea' },
  { name: 'Dubai (Port Rashid)', country: 'UAE', lat: 25.2760, lng: 55.2780, type: 'marina', description: 'D-Marin, premium superyacht berths' },
  { name: 'Singapore', country: 'Singapore', lat: 1.2655, lng: 103.8226, type: 'major', description: "World's busiest transhipment port and bunkering hub" },
  { name: 'Fort Lauderdale', country: 'USA', lat: 26.1003, lng: -80.1439, type: 'marina', description: 'Yachting capital of the world, FLIBS host' },
  { name: 'Antigua (Falmouth)', country: 'Antigua', lat: 17.0509, lng: -61.7818, type: 'marina', description: "Nelson's Dockyard, Caribbean charter hub" },
  { name: 'Rotterdam', country: 'Netherlands', lat: 51.9225, lng: 4.4792, type: 'major', description: 'Largest port in Europe by cargo tonnage' },
  { name: 'Southampton', country: 'UK', lat: 50.9097, lng: -1.4044, type: 'major', description: 'Major cruise and commercial port' },
  { name: 'Hamburg', country: 'Germany', lat: 53.5459, lng: 9.9660, type: 'shipyard', description: 'Blohm+Voss and Lürssen shipyards' },
  { name: 'Vlissingen', country: 'Netherlands', lat: 51.4427, lng: 3.5709, type: 'shipyard', description: 'Damen and Royal Huisman shipyards' },
  { name: 'Marmaris', country: 'Turkey', lat: 36.8510, lng: 28.2741, type: 'marina', description: 'Popular yacht charter base, refit facilities' },
  { name: 'Port Louis', country: 'Mauritius', lat: -20.1609, lng: 57.5012, type: 'major', description: 'Indian Ocean stopover and provisioning' },
  { name: 'Cape Town', country: 'South Africa', lat: -33.9062, lng: 18.4210, type: 'major', description: 'V&A Waterfront, Atlantic crossing stopover' },
  { name: 'Sydney', country: 'Australia', lat: -33.8568, lng: 151.2153, type: 'major', description: 'Superyacht berths at Rozelle Bay and Double Bay' },
];

const VESSEL_LEGEND: VesselNavState[] = ['under_way', 'moored', 'at_anchor'];
const PORT_LEGEND: Array<{ kind: Port['type']; label: string }> = [
  { kind: 'major', label: 'Commercial Port' },
  { kind: 'marina', label: 'Marina' },
  { kind: 'shipyard', label: 'Shipyard' },
];

const getPortTypeLabel = (type: string) => {
  switch (type) {
    case 'major': return 'Commercial Port';
    case 'marina': return 'Superyacht Marina';
    case 'shipyard': return 'Shipyard / Refit';
    default: return 'Port';
  }
};

/** `43.7384°N, 7.4246°E`; southern and western values get S and W. */
const formatLatLng = (lat: number, lng: number): string =>
  `${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lng).toFixed(4)}°${lng < 0 ? 'W' : 'E'}`;

const statusLabel = (state: VesselNavState | null) => (state ? VESSEL_STATE_LABEL[state] : 'Status unknown');

const statusBadgeVariant = (state: VesselNavState | null) => {
  switch (state) {
    case 'under_way': return 'default';
    case 'at_anchor': return 'outline';
    default: return 'secondary';
  }
};

const fixAge = (position: VesselPosition) => formatDistanceToNow(new Date(position.timestampUtc));
const updatedLabel = (position: VesselPosition) => `Updated ${fixAge(position)} ago`;
const isStale = (position: VesselPosition) => Date.now() - Date.parse(position.timestampUtc) > STALE_FIX_MS;
const reading = (value: number | null, unit: string) => (value === null ? '—' : `${Math.round(value * 10) / 10}${unit}`);

/**
 * Marker for a fix: the nav-state shape, hollow when the fix is over 6 h old
 * or the status is unknown (gap/10 §A.11), so an unknown status never reads
 * as a confident one.
 */
const markerIconFor = (vessel: FleetVessel & { position: VesselPosition }, selected: boolean) =>
  vesselMarkerIcon({
    heading: vessel.position.heading ?? vessel.position.cog,
    state: vessel.navState ?? 'moored',
    stale: vessel.navState === null || isStale(vessel.position),
    selected,
  });

const hasPosition = (vessel: FleetVessel): vessel is FleetVessel & { position: VesselPosition } => vessel.position !== null;

const FleetMap: React.FC = () => {
  const navigate = useNavigate();
  const { vesselFilter } = useVesselFilter();
  const { getVesselCodeById } = useVessel();
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [layers, setLayers] = useState({
    vessels: true,
    ports: true,
    seamarks: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const vesselMarkersRef = useRef<L.LayerGroup>(L.layerGroup());
  const portMarkersRef = useRef<L.LayerGroup>(L.layerGroup());
  const vesselMarkerByIdRef = useRef(new Map<string, { marker: L.Marker; vessel: FleetVessel & { position: VesselPosition } }>());

  const vesselsQuery = useQuery({
    queryKey: ['vessels', companyId, 'tracker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vessels')
        .select('id, name, mmsi, status')
        .eq('company_id', companyId!)
        .neq('status', 'Sold')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });
  const dbVessels = useMemo(() => vesselsQuery.data ?? [], [vesselsQuery.data]);
  const vesselIds = useMemo(() => dbVessels.map((v) => v.id), [dbVessels]);
  const positionsQuery = useLatestVesselPositions(vesselIds);
  const positions = positionsQuery.data;

  const fleet: FleetVessel[] = useMemo(
    () =>
      dbVessels.map((v) => {
        const position = positions?.get(v.id) ?? null;
        return {
          id: v.id,
          name: v.name,
          mmsi: v.mmsi ?? null,
          position,
          navState: position ? navStateFromAis(position.navStatus) : null,
        };
      }),
    [dbVessels, positions],
  );

  const displayVessels = useMemo(
    () => (vesselFilter ? fleet.filter((v) => v.id === vesselFilter) : fleet),
    [fleet, vesselFilter],
  );
  const positioned = useMemo(() => displayVessels.filter(hasPosition), [displayVessels]);
  const selectedVessel = displayVessels.find((v) => v.id === selectedVesselId) ?? null;
  const selectedCode = selectedVessel ? getVesselCodeById(selectedVessel.id) : null;
  const loadError = vesselsQuery.error ?? positionsQuery.error;
  const positionsSettled = !vesselsQuery.isLoading && !positionsQuery.isLoading;

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [38, 15],
      zoom: 4,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    vesselMarkersRef.current.addTo(map);
    portMarkersRef.current.addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Basemap follows the theme (Abyss / Daylight); seamarks are an optional overlay.
  useBasemap(mapRef, true);
  useTileOverlay(mapRef, true, MAP_OVERLAYS.seamarks, layers.seamarks);

  const selectedVesselIdRef = useRef<string | null>(null);
  selectedVesselIdRef.current = selectedVesselId;

  // Vessel markers: only vessels with a reported fix.
  useEffect(() => {
    const group = vesselMarkersRef.current;
    const byId = vesselMarkerByIdRef.current;
    group.clearLayers();
    byId.clear();

    if (!layers.vessels) return;

    positioned.forEach((vessel) => {
      const { position } = vessel;
      const marker = L.marker([position.latitude, position.longitude], {
        icon: markerIconFor(vessel, vessel.id === selectedVesselIdRef.current),
        title: vessel.name,
      });

      marker.bindPopup(
        popupHtml({
          title: vessel.name,
          subtitle: vessel.mmsi ? `MMSI: ${vessel.mmsi}` : 'MMSI not recorded',
          rows: [
            ['Status', statusLabel(vessel.navState)],
            ['SOG', reading(position.sog, ' kts')],
            ['COG', reading(position.cog, '°')],
            ['HDG', reading(position.heading, '°')],
          ],
          footer: `${formatLatLng(position.latitude, position.longitude)} · ${updatedLabel(position)}`,
        }),
        POPUP_OPTIONS,
      );

      marker.on('click', () => setSelectedVesselId(vessel.id));
      group.addLayer(marker);
      byId.set(vessel.id, { marker, vessel });
    });
  }, [positioned, layers.vessels]);

  // Selected vessel glows (A.11). Swap icons in place so an open popup stays open.
  useEffect(() => {
    vesselMarkerByIdRef.current.forEach(({ marker, vessel }, id) => {
      marker.setIcon(markerIconFor(vessel, id === selectedVesselId));
    });
  }, [selectedVesselId]);

  // Update port markers
  useEffect(() => {
    const group = portMarkersRef.current;
    group.clearLayers();

    if (!layers.ports) return;

    MAJOR_PORTS.forEach((port) => {
      const marker = L.marker([port.lat, port.lng], {
        icon: portMarkerIcon(port.type),
        title: port.name,
      });

      marker.bindPopup(
        popupHtml({
          title: port.name,
          subtitle: port.country,
          chip: getPortTypeLabel(port.type),
          body: port.description,
          footer: formatLatLng(port.lat, port.lng),
        }),
        POPUP_OPTIONS,
      );

      group.addLayer(marker);
    });
  }, [layers.ports]);

  // Fly to the selected vessel's last fix, when it has one.
  const selectedFix = selectedVessel?.position ?? null;
  const flyLat = selectedFix?.latitude;
  const flyLng = selectedFix?.longitude;
  useEffect(() => {
    if (flyLat !== undefined && flyLng !== undefined && mapRef.current) {
      mapRef.current.flyTo([flyLat, flyLng], 8, { duration: 1 });
    }
  }, [selectedVesselId, flyLat, flyLng]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([vesselsQuery.refetch(), positionsQuery.refetch()]);
    setIsRefreshing(false);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Invalidate map size on fullscreen change
  useEffect(() => {
    setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 300);
  }, [isFullscreen]);

  const noFixes = positionsSettled && !loadError && displayVessels.length > 0 && positioned.length === 0;
  // Without a fix, say why: still loading, the read failed, or none reported.
  const noFixLabel = !positionsSettled
    ? 'Loading position…'
    : positionsQuery.error
      ? 'Position could not load'
      : 'No position yet';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Fleet Map</h1>
            <p className="text-muted-foreground">Last reported AIS positions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {loadError ? (
          <PageError
            error={loadError}
            title="Vessel positions could not load"
            onRetry={handleRefresh}
            variant="inline"
          />
        ) : null}

        {/* Map Container */}
        <Card className="shadow-card overflow-hidden">
          <CardContent className="p-0">
            <div 
              ref={containerRef}
              className="relative h-[600px] overflow-hidden"
            >
              <div
                ref={mapContainerRef}
                className="h-full w-full z-0 bg-map-water"
              />

              {noFixes && (
                <div className="pointer-events-none absolute inset-x-0 top-16 z-[1000] flex justify-center px-4">
                  <div className="pointer-events-auto max-w-sm rounded-lg border bg-background/95 shadow-lg">
                    <EmptyState
                      compact
                      icon={MapPinOff}
                      headingLevel={2}
                      title="No positions reported yet"
                      body="Vessels appear on the map once their AIS feed reports a position."
                    />
                  </div>
                </div>
              )}

              {/* Map Controls Overlay */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000]">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="bg-background shadow-md"
                  aria-label="Refresh positions"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>

                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowLayers(!showLayers)}
                    className="bg-background shadow-md"
                    aria-label="Map layers"
                    aria-expanded={showLayers}
                  >
                    <Layers className="w-4 h-4" />
                  </Button>

                  {showLayers && (
                    <div className="absolute right-0 mt-2 w-48 bg-background rounded-lg shadow-lg p-3 border z-[1001]">
                      <p className="text-sm font-medium mb-2">Layers</p>
                      {Object.entries(layers).map(([key, value]) => (
                        <label key={key} className="flex items-center gap-2 text-sm py-1 cursor-pointer capitalize">
                          <Checkbox
                            checked={value}
                            onCheckedChange={() => setLayers({ ...layers, [key]: !value })}
                          />
                          {key}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="bg-background shadow-md"
                  aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              </div>

              {/* Selected Vessel Detail Panel */}
              {selectedVessel && (
                <div
                  className="absolute top-4 left-4 w-80 bg-background rounded-lg shadow-lg border z-[1000]"
                  data-testid="fleet-vessel-panel"
                >
                  <div className="p-4 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Ship className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold">{selectedVessel.name}</h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setSelectedVesselId(null)}
                        aria-label="Close vessel details"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedVessel.mmsi ? `MMSI: ${selectedVessel.mmsi}` : 'MMSI not recorded'}
                    </p>
                  </div>

                  <div className="p-4 space-y-4">
                    {selectedVessel.position ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Status</p>
                            <Badge variant={statusBadgeVariant(selectedVessel.navState)} className="mt-1">
                              {statusLabel(selectedVessel.navState)}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Speed</p>
                            <p className="text-sm font-medium">{reading(selectedVessel.position.sog, ' kts')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Course</p>
                            <p className="text-sm font-medium">{reading(selectedVessel.position.cog, '°')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Heading</p>
                            <p className="text-sm font-medium">{reading(selectedVessel.position.heading, '°')}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Navigation className="w-3 h-3" />
                          {formatLatLng(selectedVessel.position.latitude, selectedVessel.position.longitude)}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {updatedLabel(selectedVessel.position)}
                          {isStale(selectedVessel.position) ? ' · old fix' : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{noFixLabel}</p>
                    )}

                    {selectedCode ? (
                      <Button className="w-full" size="sm" onClick={() => navigate(vesselPath(selectedCode))}>
                        View Vessel Dashboard
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="absolute bottom-4 left-4 bg-background/95 rounded-lg shadow-lg p-3 border z-[1000]">
                <p className="text-sm font-medium mb-2">Legend</p>
                <div className="flex flex-col gap-1.5">
                  {VESSEL_LEGEND.map((state) => (
                    <div key={state} className="flex items-center gap-2 text-xs">
                      {/* Static, trusted SVG from mapTheme: the same glyph as the marker. */}
                      <span
                        aria-hidden="true"
                        className="storm-map-glyph h-4 w-4 [&_svg]:h-4 [&_svg]:w-4"
                        dangerouslySetInnerHTML={{ __html: vesselGlyphSvg(state, { heading: 45 }) }}
                      />
                      {VESSEL_STATE_LABEL[state]}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      aria-hidden="true"
                      className="storm-map-glyph h-4 w-4 [&_svg]:h-4 [&_svg]:w-4"
                      dangerouslySetInnerHTML={{ __html: vesselGlyphSvg('moored', { stale: true }) }}
                    />
                    Fix over 6 h old or status unknown
                  </div>
                  <div className="border-t my-1" />
                  {PORT_LEGEND.map(({ kind, label }) => (
                    <div key={kind} className="flex items-center gap-2 text-xs">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rotate-45 rounded-[2px] ${PORT_SWATCH_CLASS[kind]}`} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fleet Overview Grid */}
        {positionsSettled && !loadError && displayVessels.length === 0 ? (
          <EmptyState title="No vessels yet" body="Vessels added to the fleet are listed here with their last reported position." />
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayVessels.map((vessel) => (
            <Card
              key={vessel.id}
              className="shadow-card hover:shadow-card-hover transition-all cursor-pointer"
              onClick={() => setSelectedVesselId(vessel.id)}
              data-testid={`fleet-vessel-${vessel.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Ship className="w-5 h-5 text-primary" />
                    <h3 className="font-medium">{vessel.name}</h3>
                  </div>
                  {vessel.position ? (
                    <Badge variant={statusBadgeVariant(vessel.navState)}>{statusLabel(vessel.navState)}</Badge>
                  ) : null}
                </div>
                {vessel.position ? (
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Speed:</span> {reading(vessel.position.sog, ' kts')}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Heading:</span> {reading(vessel.position.heading, '°')}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {updatedLabel(vessel.position)}
                      {isStale(vessel.position) ? ' · old fix' : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{noFixLabel}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default FleetMap;
