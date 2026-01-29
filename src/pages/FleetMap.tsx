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
              className="relative h-[600px] bg-[#0c1929] overflow-hidden"
            >
              {/* World Map Background */}
              <svg 
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 2000 1000"
                preserveAspectRatio="xMidYMid slice"
              >
                {/* Ocean Background */}
                <rect width="2000" height="1000" fill="#0c1929" />
                
                {/* Grid Lines - Latitude */}
                {[-60, -40, -20, 0, 20, 40, 60].map((lat, i) => {
                  const y = 500 - (lat / 90) * 500;
                  return (
                    <g key={`lat-${lat}`}>
                      <line x1="0" y1={y} x2="2000" y2={y} stroke="#1e3a5f" strokeWidth="0.5" opacity="0.5" />
                      <text x="10" y={y - 5} fill="#3b5998" fontSize="10" opacity="0.6">{lat}°</text>
                    </g>
                  );
                })}
                
                {/* Grid Lines - Longitude */}
                {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180].map((lng) => {
                  const x = 1000 + (lng / 180) * 1000;
                  return (
                    <g key={`lng-${lng}`}>
                      <line x1={x} y1="0" x2={x} y2="1000" stroke="#1e3a5f" strokeWidth="0.5" opacity="0.5" />
                      <text x={x + 5} y="20" fill="#3b5998" fontSize="10" opacity="0.6">{lng}°</text>
                    </g>
                  );
                })}
                
                {/* North America */}
                <path 
                  d="M280,180 L320,140 L380,120 L450,100 L520,90 L580,95 L620,120 L640,160 L620,200 L580,240 L520,280 L480,320 L440,360 L400,380 L360,400 L320,380 L280,340 L240,300 L220,260 L240,220 L280,180 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                {/* Alaska */}
                <path 
                  d="M180,120 L220,100 L260,110 L280,140 L260,160 L220,160 L180,140 L180,120 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                {/* Greenland */}
                <path 
                  d="M580,80 L640,60 L700,70 L740,100 L720,140 L680,160 L620,150 L580,120 L580,80 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                
                {/* South America */}
                <path 
                  d="M420,420 L480,400 L520,420 L540,480 L520,560 L480,640 L440,720 L400,760 L380,720 L360,640 L380,560 L400,480 L420,420 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                
                {/* Europe */}
                <path 
                  d="M900,160 L960,140 L1020,150 L1060,180 L1080,220 L1060,260 L1020,280 L960,280 L920,260 L880,240 L860,200 L880,160 L900,160 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                {/* UK & Ireland */}
                <path 
                  d="M860,180 L880,170 L890,190 L880,210 L860,200 L860,180 Z M840,190 L855,185 L855,205 L840,200 L840,190 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                {/* Scandinavia */}
                <path 
                  d="M960,100 L1000,80 L1040,90 L1060,120 L1040,160 L1000,150 L960,130 L960,100 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                
                {/* Africa */}
                <path 
                  d="M900,320 L960,300 L1040,320 L1100,360 L1120,440 L1100,540 L1040,620 L980,660 L920,640 L880,580 L860,500 L860,420 L880,360 L900,320 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                {/* Madagascar */}
                <path 
                  d="M1140,540 L1160,520 L1180,540 L1180,600 L1160,620 L1140,600 L1140,540 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                
                {/* Asia */}
                <path 
                  d="M1100,140 L1200,100 L1340,80 L1480,100 L1580,140 L1620,200 L1600,280 L1540,340 L1460,360 L1380,340 L1300,320 L1220,280 L1160,240 L1120,200 L1100,140 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                {/* India */}
                <path 
                  d="M1260,340 L1300,320 L1340,340 L1360,400 L1340,460 L1300,500 L1260,480 L1240,420 L1260,340 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                {/* Southeast Asia */}
                <path 
                  d="M1420,380 L1480,360 L1540,380 L1560,440 L1520,500 L1460,520 L1400,500 L1380,440 L1420,380 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                {/* Japan */}
                <path 
                  d="M1620,200 L1660,180 L1680,220 L1660,280 L1620,300 L1600,260 L1620,200 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                
                {/* Australia */}
                <path 
                  d="M1480,580 L1580,540 L1680,560 L1720,620 L1700,700 L1620,740 L1540,720 L1480,680 L1460,620 L1480,580 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                {/* New Zealand */}
                <path 
                  d="M1780,700 L1800,680 L1820,700 L1820,760 L1800,780 L1780,760 L1780,700 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                
                {/* Indonesia */}
                <path 
                  d="M1440,540 L1480,530 L1520,540 L1540,560 L1520,580 L1480,580 L1440,570 L1440,540 Z" 
                  fill="#1a3a2f" 
                  stroke="#2d5a4a" 
                  strokeWidth="1"
                />
                
                {/* Mediterranean Sea highlight */}
                <path 
                  d="M860,280 Q920,260 980,280 Q1040,300 1100,280" 
                  fill="none" 
                  stroke="#1e4a6f" 
                  strokeWidth="8"
                  opacity="0.4"
                />
                
                {/* Major ports/locations dots */}
                <circle cx="920" cy="270" r="3" fill="#3b82f6" opacity="0.6" /> {/* Mediterranean */}
                <circle cx="1000" cy="260" r="3" fill="#3b82f6" opacity="0.6" /> {/* Greece */}
                <circle cx="840" cy="340" r="3" fill="#3b82f6" opacity="0.6" /> {/* Gibraltar */}
                <circle cx="1300" cy="400" r="3" fill="#3b82f6" opacity="0.6" /> {/* Dubai */}
                <circle cx="1520" cy="400" r="3" fill="#3b82f6" opacity="0.6" /> {/* Singapore */}
                <circle cx="400" cy="340" r="3" fill="#3b82f6" opacity="0.6" /> {/* Miami */}
                <circle cx="480" cy="480" r="3" fill="#3b82f6" opacity="0.6" /> {/* Caribbean */}
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
