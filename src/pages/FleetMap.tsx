import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Map, 
  Ship, 
  Maximize2,
  Minimize2,
  RefreshCw,
  Layers,
  X
} from 'lucide-react';
import { useVesselFilter } from '@/hooks/useVesselFilter';

interface MockVessel {
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

// Mock vessel data (replace with real AIS data later)
const MOCK_VESSELS: MockVessel[] = [
  { 
    id: 'v1', 
    name: 'M/Y DRAAK', 
    mmsi: '123456789',
    lat: 43.7384, 
    lng: 7.4246,
    sog: 12.5, 
    cog: 45, 
    heading: 48,
    status: 'UNDER_WAY',
    lastUpdate: new Date().toISOString(),
    crewOnboard: 12,
    captain: 'John Smith'
  },
  { 
    id: 'v2', 
    name: 'M/Y LEVIATHAN', 
    mmsi: '987654321',
    lat: 41.9028, 
    lng: 12.4964,
    sog: 0, 
    cog: 0, 
    heading: 180,
    status: 'MOORED',
    lastUpdate: new Date().toISOString(),
    crewOnboard: 8,
    captain: 'Sarah Jones'
  },
  { 
    id: 'v3', 
    name: 'M/Y TITAN', 
    mmsi: '111222333',
    lat: 36.1408, 
    lng: -5.3536,
    sog: 8.2, 
    cog: 270, 
    heading: 265,
    status: 'UNDER_WAY',
    lastUpdate: new Date().toISOString(),
    crewOnboard: 15,
    captain: 'Mike Brown'
  }
];

// Top-down vessel SVG icon
const VesselIcon: React.FC<{ heading: number; status: string; color: string }> = ({ heading, status, color }) => (
  <svg 
    width="32" 
    height="32" 
    viewBox="0 0 32 32" 
    style={{ transform: `rotate(${heading}deg)` }}
  >
    {/* Top-down ship shape */}
    <path 
      d="M16 2 L24 28 L16 24 L8 28 Z" 
      fill={color} 
      stroke="white" 
      strokeWidth="1.5"
    />
    {/* Bridge/superstructure */}
    <rect x="13" y="12" width="6" height="8" fill="white" opacity="0.7" rx="1" />
    {/* Bow indicator */}
    <circle cx="16" cy="6" r="2" fill="white" />
    {/* Heading line */}
    {status === 'UNDER_WAY' && (
      <line x1="16" y1="2" x2="16" y2="-8" stroke={color} strokeWidth="2" strokeDasharray="2,2" />
    )}
  </svg>
);

const FleetMap: React.FC = () => {
  const { vesselFilter } = useVesselFilter();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState<MockVessel | null>(null);
  const [layers, setLayers] = useState({
    vessels: true,
    tracks: false,
    weather: false,
    ports: true
  });
  const mapRef = useRef<HTMLDivElement>(null);

  // Filter vessels based on master filter
  const displayVessels = vesselFilter 
    ? MOCK_VESSELS.filter(v => v.id === vesselFilter)
    : MOCK_VESSELS;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1500));
    setIsRefreshing(false);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mapRef.current?.requestFullscreen();
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

  const getVesselColor = (status: string) => {
    switch (status) {
      case 'UNDER_WAY': return '#22c55e';
      case 'MOORED': return '#3b82f6';
      case 'AT_ANCHOR': return '#f59e0b';
      default: return '#6b7280';
    }
  };

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
              ref={mapRef}
              className="relative h-[600px] bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5"
            >
              {/* World Map Background SVG */}
              <svg 
                className="absolute inset-0 w-full h-full opacity-30"
                viewBox="0 0 1000 500"
                preserveAspectRatio="xMidYMid slice"
              >
                {/* Simplified world map paths */}
                <path d="M150,150 Q200,100 250,150 T350,150 T450,150" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground" />
                <ellipse cx="200" cy="200" rx="80" ry="60" fill="currentColor" className="text-muted/30" />
                <ellipse cx="500" cy="180" rx="100" ry="80" fill="currentColor" className="text-muted/30" />
                <ellipse cx="800" cy="220" rx="60" ry="50" fill="currentColor" className="text-muted/30" />
                {/* Grid lines */}
                {[0, 100, 200, 300, 400, 500].map(y => (
                  <line key={`h-${y}`} x1="0" y1={y} x2="1000" y2={y} stroke="currentColor" strokeWidth="0.2" className="text-muted-foreground" />
                ))}
                {[0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map(x => (
                  <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="500" stroke="currentColor" strokeWidth="0.2" className="text-muted-foreground" />
                ))}
              </svg>

              {/* Map Controls */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
                {/* Refresh Button */}
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="bg-background"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>

                {/* Layers Control */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowLayers(!showLayers)}
                    className="bg-background"
                  >
                    <Layers className="w-4 h-4" />
                  </Button>

                  {showLayers && (
                    <div className="absolute right-0 mt-2 w-48 bg-background rounded-lg shadow-lg p-3 border">
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

                {/* Fullscreen Button */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="bg-background"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              </div>

              {/* Vessel Markers */}
              {layers.vessels && displayVessels.map((vessel) => {
                // Simplified positioning - in real implementation use proper map projection
                const left = ((vessel.lng + 180) / 360) * 100;
                const top = ((90 - vessel.lat) / 180) * 100;
                
                return (
                  <div
                    key={vessel.id}
                    className="absolute cursor-pointer transform -translate-x-1/2 -translate-y-1/2 z-10 transition-transform hover:scale-110"
                    style={{ left: `${left}%`, top: `${top}%` }}
                    onClick={() => setSelectedVessel(vessel)}
                  >
                    <VesselIcon 
                      heading={vessel.heading} 
                      status={vessel.status} 
                      color={getVesselColor(vessel.status)} 
                    />
                    {/* Vessel Label */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap">
                      <span className="text-xs font-medium bg-background/90 px-2 py-0.5 rounded shadow">
                        {vessel.name}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Vessel Detail Panel */}
              {selectedVessel && (
                <div className="absolute top-4 left-4 w-80 bg-background rounded-lg shadow-lg border z-30">
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

                    <p className="text-xs text-muted-foreground">
                      Last update: {new Date(selectedVessel.lastUpdate).toLocaleString()}
                    </p>

                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => window.location.href = `/vessels?vessel=${selectedVessel.id}`}
                    >
                      View Vessel Dashboard
                    </Button>
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="absolute bottom-4 left-4 bg-background/95 rounded-lg shadow-lg p-3 border z-20">
                <p className="text-sm font-medium mb-2">Status</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    Under Way
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full bg-blue-500" />
                    Moored
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full bg-amber-500" />
                    At Anchor
                  </div>
                </div>
              </div>

              {/* Map placeholder message */}
              <div className="absolute bottom-4 right-4 bg-background/95 rounded-lg shadow p-2 border text-xs text-muted-foreground z-20">
                <Map className="w-4 h-4 inline mr-1" />
                Interactive map integration coming soon
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
