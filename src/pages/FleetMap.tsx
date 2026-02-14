// Fleet Map - Interactive vessel tracking with Leaflet
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
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
  Anchor,
  Navigation
} from 'lucide-react';
import { useVesselFilter } from '@/hooks/useVesselFilter';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapVessel {
  id: string;
  name: string;
  mmsi: string;
  lat: number;
  lng: number;
  sog: number;
  cog: number;
  heading: number;
  status: 'UNDER_WAY' | 'MOORED' | 'AT_ANCHOR';
  lastUpdate: string;
  crewOnboard: number;
  captain: string;
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

// Create vessel icon as a Leaflet divIcon
const createVesselIcon = (heading: number, status: string) => {
  const color = status === 'UNDER_WAY' ? '#22c55e' : status === 'MOORED' ? '#3b82f6' : '#f59e0b';
  const svg = `<svg width="32" height="32" viewBox="0 0 32 32" style="transform:rotate(${heading}deg)">
    <path d="M16 2 L24 28 L16 24 L8 28 Z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <rect x="13" y="12" width="6" height="8" fill="white" opacity="0.7" rx="1"/>
    <circle cx="16" cy="6" r="2" fill="white"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: 'vessel-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Create port icon
const createPortIcon = (type: string) => {
  const colors: Record<string, string> = { major: '#3b82f6', marina: '#8b5cf6', shipyard: '#f59e0b' };
  const color = colors[type] || '#3b82f6';
  const svg = `<svg width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="6" fill="${color}" stroke="white" stroke-width="2" opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: 'port-marker',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
};

// Generate a pseudo-random but stable position from vessel id
const hashToCoord = (id: string, range: number, offset: number): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return offset + (Math.abs(hash) % (range * 100)) / 100;
};

const getPortTypeLabel = (type: string) => {
  switch (type) {
    case 'major': return 'Commercial Port';
    case 'marina': return 'Superyacht Marina';
    case 'shipyard': return 'Shipyard / Refit';
    default: return 'Port';
  }
};

const FleetMap: React.FC = () => {
  const { vesselFilter } = useVesselFilter();
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState<MapVessel | null>(null);
  const [layers, setLayers] = useState({
    vessels: true,
    tracks: false,
    weather: false,
    ports: true
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const vesselMarkersRef = useRef<L.LayerGroup>(L.layerGroup());
  const portMarkersRef = useRef<L.LayerGroup>(L.layerGroup());

  // Fetch real vessels from database
  const { data: dbVessels = [], refetch } = useQuery({
    queryKey: ['vessels', companyId],
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

  // Map DB vessels to map vessels with placeholder positions
  const mapVessels: MapVessel[] = useMemo(() => {
    return dbVessels.map((v) => {
      const statuses: MapVessel['status'][] = ['UNDER_WAY', 'MOORED', 'AT_ANCHOR'];
      const statusIndex = Math.abs(v.id.charCodeAt(0)) % 3;
      return {
        id: v.id,
        name: v.name,
        mmsi: v.mmsi || 'N/A',
        lat: hashToCoord(v.id, 20, 30),
        lng: hashToCoord(v.id + 'lng', 40, -10),
        sog: Math.round(hashToCoord(v.id + 'sog', 15, 0) * 10) / 10,
        cog: Math.round(hashToCoord(v.id + 'cog', 360, 0)),
        heading: Math.round(hashToCoord(v.id + 'hdg', 360, 0)),
        status: statuses[statusIndex],
        lastUpdate: new Date().toISOString(),
        crewOnboard: Math.round(hashToCoord(v.id + 'crew', 20, 5)),
        captain: '—',
      };
    });
  }, [dbVessels]);

  const displayVessels = vesselFilter 
    ? mapVessels.filter(v => v.id === vesselFilter)
    : mapVessels;

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [38, 15],
      zoom: 4,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map);

    vesselMarkersRef.current.addTo(map);
    portMarkersRef.current.addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update vessel markers
  useEffect(() => {
    const group = vesselMarkersRef.current;
    group.clearLayers();

    if (!layers.vessels) return;

    displayVessels.forEach((vessel) => {
      const marker = L.marker([vessel.lat, vessel.lng], {
        icon: createVesselIcon(vessel.heading, vessel.status),
      });

      marker.bindPopup(`
        <div style="min-width:200px">
          <p style="font-weight:600;font-size:14px;margin:0 0 4px">${vessel.name}</p>
          <p style="font-size:12px;color:#888;margin:0 0 8px">MMSI: ${vessel.mmsi}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px">
            <span>Status: ${vessel.status.replace('_', ' ')}</span>
            <span>SOG: ${vessel.sog} kts</span>
            <span>COG: ${vessel.cog}°</span>
            <span>HDG: ${vessel.heading}°</span>
          </div>
        </div>
      `);

      marker.on('click', () => setSelectedVessel(vessel));
      group.addLayer(marker);
    });
  }, [displayVessels, layers.vessels]);

  // Update port markers
  useEffect(() => {
    const group = portMarkersRef.current;
    group.clearLayers();

    if (!layers.ports) return;

    MAJOR_PORTS.forEach((port) => {
      const marker = L.marker([port.lat, port.lng], {
        icon: createPortIcon(port.type),
      });

      marker.bindPopup(`
        <div style="min-width:220px">
          <p style="font-weight:600;font-size:14px;margin:0 0 4px">${port.name}</p>
          <p style="font-size:12px;color:#888;margin:0">${port.country}</p>
          <span style="display:inline-block;font-size:10px;font-weight:500;padding:2px 6px;border-radius:4px;background:#f1f5f9;margin:4px 0">
            ${getPortTypeLabel(port.type)}
          </span>
          <p style="font-size:12px;margin:8px 0 4px">${port.description}</p>
          <p style="font-size:10px;color:#888;margin:0">${port.lat.toFixed(4)}°N, ${port.lng.toFixed(4)}°E</p>
        </div>
      `);

      group.addLayer(marker);
    });
  }, [layers.ports]);

  // Fly to selected vessel
  useEffect(() => {
    if (selectedVessel && mapRef.current) {
      mapRef.current.flyTo([selectedVessel.lat, selectedVessel.lng], 8, { duration: 1 });
    }
  }, [selectedVessel]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
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

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'UNDER_WAY': return 'default';
      case 'MOORED': return 'secondary';
      case 'AT_ANCHOR': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Fleet Map</h1>
            <p className="text-muted-foreground">Real-time vessel tracking and AIS data</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Map Container */}
        <Card className="shadow-card overflow-hidden">
          <CardContent className="p-0">
            <div 
              ref={containerRef}
              className="relative h-[600px] overflow-hidden"
            >
              <div
                ref={mapContainerRef}
                className="h-full w-full z-0"
                style={{ background: '#0c1929' }}
              />

              {/* Map Controls Overlay */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000]">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="bg-background shadow-md"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>

                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowLayers(!showLayers)}
                    className="bg-background shadow-md"
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
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              </div>

              {/* Selected Vessel Detail Panel */}
              {selectedVessel && (
                <div className="absolute top-4 left-4 w-80 bg-background rounded-lg shadow-lg border z-[1000]">
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
                        onClick={() => setSelectedVessel(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">MMSI: {selectedVessel.mmsi}</p>
                  </div>

                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <Badge variant={getStatusBadgeVariant(selectedVessel.status)} className="mt-1">
                          {selectedVessel.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Speed</p>
                        <p className="text-sm font-medium">{selectedVessel.sog} kts</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Course</p>
                        <p className="text-sm font-medium">{selectedVessel.cog}°</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Heading</p>
                        <p className="text-sm font-medium">{selectedVessel.heading}°</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Crew Onboard</p>
                        <p className="text-sm font-medium">{selectedVessel.crewOnboard}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Captain</p>
                        <p className="text-sm font-medium">{selectedVessel.captain}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Navigation className="w-3 h-3" />
                      {selectedVessel.lat.toFixed(4)}°N, {selectedVessel.lng.toFixed(4)}°E
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Last update: {new Date(selectedVessel.lastUpdate).toLocaleString()}
                    </p>

                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => window.location.href = `/vessels/dashboard?vessel=${selectedVessel.id}`}
                    >
                      View Vessel Dashboard
                    </Button>
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="absolute bottom-4 left-4 bg-background/95 rounded-lg shadow-lg p-3 border z-[1000]">
                <p className="text-sm font-medium mb-2">Legend</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                    Under Way
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                    Moored
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                    At Anchor
                  </div>
                  <div className="border-t my-1" />
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3b82f6', opacity: 0.9 }} />
                    Commercial Port
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#8b5cf6', opacity: 0.9 }} />
                    Marina
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f59e0b', opacity: 0.9 }} />
                    Shipyard
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fleet Overview Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayVessels.map((vessel) => (
            <Card 
              key={vessel.id} 
              className="shadow-card hover:shadow-card-hover transition-all cursor-pointer"
              onClick={() => setSelectedVessel(vessel)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Ship className="w-5 h-5 text-primary" />
                    <h3 className="font-medium">{vessel.name}</h3>
                  </div>
                  <Badge variant={getStatusBadgeVariant(vessel.status)}>
                    {vessel.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Speed:</span> {vessel.sog} kts
                  </div>
                  <div>
                    <span className="text-muted-foreground">Heading:</span> {vessel.heading}°
                  </div>
                  <div>
                    <span className="text-muted-foreground">Crew:</span> {vessel.crewOnboard}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Captain:</span> {vessel.captain}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default FleetMap;
