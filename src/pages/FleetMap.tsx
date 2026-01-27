import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { 
  Map, 
  Ship, 
  Navigation, 
  Anchor, 
  Wind, 
  Gauge,
  MapPin,
  RefreshCw,
  Maximize2,
  Layers,
  Info
} from 'lucide-react';
import { useVessels } from '@/hooks/useVessels';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface VesselPosition {
  id: string;
  name: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  status: 'underway' | 'at_anchor' | 'moored' | 'not_under_command';
  lastUpdate: string;
  destination?: string;
  eta?: string;
}

// Mock vessel positions - in production this would come from AIS API
const mockPositions: VesselPosition[] = [
  {
    id: '1',
    name: 'M/Y Draak',
    lat: 43.7384,
    lng: 7.4246,
    heading: 45,
    speed: 12.5,
    status: 'underway',
    lastUpdate: new Date().toISOString(),
    destination: 'Monaco',
    eta: '2 hours'
  },
  {
    id: '2',
    name: 'M/Y Leviathan',
    lat: 36.1408,
    lng: -5.3536,
    heading: 270,
    speed: 0,
    status: 'at_anchor',
    lastUpdate: new Date().toISOString(),
    destination: 'Gibraltar',
  },
  {
    id: '3',
    name: 'M/Y Titan',
    lat: 25.7617,
    lng: -80.1918,
    heading: 180,
    speed: 8.2,
    status: 'underway',
    lastUpdate: new Date().toISOString(),
    destination: 'Miami',
    eta: '30 mins'
  },
];

const FleetMap: React.FC = () => {
  const { vessels, isLoading } = useVessels();
  const [selectedVessel, setSelectedVessel] = useState<VesselPosition | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'underway':
        return 'bg-success text-success-foreground';
      case 'at_anchor':
        return 'bg-warning text-warning-foreground';
      case 'moored':
        return 'bg-primary text-primary-foreground';
      case 'not_under_command':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'underway':
        return 'Underway';
      case 'at_anchor':
        return 'At Anchor';
      case 'moored':
        return 'Moored';
      case 'not_under_command':
        return 'NUC';
      default:
        return 'Unknown';
    }
  };

  const handleVesselClick = (vessel: VesselPosition) => {
    setSelectedVessel(vessel);
    setIsDrawerOpen(true);
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
            <Button variant="outline" size="sm">
              <Layers className="w-4 h-4 mr-2" />
              Layers
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Maximize2 className="w-4 h-4 mr-2" />
              Fullscreen
            </Button>
          </div>
        </div>

        {/* Map Container */}
        <Card className="shadow-card overflow-hidden">
          <CardContent className="p-0 relative">
            {/* Placeholder for map - will integrate with Mapbox/Leaflet */}
            <div className="h-[600px] bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 relative flex items-center justify-center">
              {/* World map SVG placeholder */}
              <div className="absolute inset-0 opacity-20">
                <svg viewBox="0 0 1000 500" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                  <path
                    d="M100,200 Q200,100 300,200 T500,200 T700,200 T900,200"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-primary"
                  />
                  {/* Simplified continents */}
                  <ellipse cx="200" cy="200" rx="80" ry="60" fill="currentColor" className="text-muted" opacity="0.3" />
                  <ellipse cx="500" cy="180" rx="100" ry="80" fill="currentColor" className="text-muted" opacity="0.3" />
                  <ellipse cx="800" cy="220" rx="60" ry="50" fill="currentColor" className="text-muted" opacity="0.3" />
                </svg>
              </div>

              {/* Vessel markers */}
              {mockPositions.map((vessel, index) => (
                <Tooltip key={vessel.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleVesselClick(vessel)}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10 group"
                      style={{
                        left: `${20 + index * 30}%`,
                        top: `${30 + index * 15}%`,
                      }}
                    >
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center
                        ${vessel.status === 'underway' ? 'bg-success' : 'bg-warning'}
                        text-white shadow-lg transition-transform group-hover:scale-110
                        animate-pulse-soft
                      `}>
                        <Ship className="w-5 h-5" style={{ transform: `rotate(${vessel.heading}deg)` }} />
                      </div>
                      <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium bg-background/90 px-2 py-0.5 rounded shadow">
                        {vessel.name}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-semibold">{vessel.name}</p>
                      <p className="text-xs">Speed: {vessel.speed} kts</p>
                      <p className="text-xs">Heading: {vessel.heading}°</p>
                      {vessel.destination && <p className="text-xs">Dest: {vessel.destination}</p>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}

              {/* Map info overlay */}
              <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur-sm rounded-lg p-4 shadow-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="w-4 h-4" />
                  <span>AIS integration coming soon</span>
                </div>
              </div>

              {/* Legend */}
              <div className="absolute top-4 right-4 bg-card/95 backdrop-blur-sm rounded-lg p-4 shadow-lg">
                <h4 className="text-sm font-medium mb-2">Vessel Status</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full bg-success" />
                    <span>Underway</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full bg-warning" />
                    <span>At Anchor</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full bg-primary" />
                    <span>Moored</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full bg-destructive" />
                    <span>Not Under Command</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fleet Overview Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mockPositions.map((vessel) => (
            <Card 
              key={vessel.id} 
              className="shadow-card hover:shadow-card-hover transition-all cursor-pointer"
              onClick={() => handleVesselClick(vessel)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">{vessel.name}</CardTitle>
                  <Badge className={getStatusColor(vessel.status)}>
                    {getStatusLabel(vessel.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-muted-foreground" />
                    <span>{vessel.speed} kts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-muted-foreground" />
                    <span>{vessel.heading}°</span>
                  </div>
                  <div className="flex items-center gap-2 col-span-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {vessel.lat.toFixed(4)}°N, {vessel.lng.toFixed(4)}°E
                    </span>
                  </div>
                </div>
                {vessel.destination && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Destination:</span>
                      <span className="font-medium">{vessel.destination}</span>
                    </div>
                    {vessel.eta && (
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-muted-foreground">ETA:</span>
                        <span className="font-medium">{vessel.eta}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Vessel Detail Drawer */}
        <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <SheetContent className="w-[400px] sm:w-[540px]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <Ship className="w-6 h-6" />
                {selectedVessel?.name}
              </SheetTitle>
              <SheetDescription>
                Vessel details and current status
              </SheetDescription>
            </SheetHeader>

            {selectedVessel && (
              <div className="mt-6 space-y-6">
                {/* Status Badge */}
                <Badge className={`${getStatusColor(selectedVessel.status)} text-sm px-3 py-1`}>
                  {getStatusLabel(selectedVessel.status)}
                </Badge>

                <Separator />

                {/* Navigation Data */}
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Navigation className="w-4 h-4" />
                    Navigation
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Speed</p>
                      <p className="text-lg font-semibold">{selectedVessel.speed} kts</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Heading</p>
                      <p className="text-lg font-semibold">{selectedVessel.heading}°</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 col-span-2">
                      <p className="text-xs text-muted-foreground">Position</p>
                      <p className="text-lg font-semibold">
                        {selectedVessel.lat.toFixed(4)}°N, {selectedVessel.lng.toFixed(4)}°E
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Voyage Info */}
                {selectedVessel.destination && (
                  <div className="space-y-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Anchor className="w-4 h-4" />
                      Voyage
                    </h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Destination</span>
                        <span className="font-medium">{selectedVessel.destination}</span>
                      </div>
                      {selectedVessel.eta && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">ETA</span>
                          <span className="font-medium">{selectedVessel.eta}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Quick Actions */}
                <div className="space-y-2">
                  <Button className="w-full" onClick={() => setIsDrawerOpen(false)}>
                    View Full Profile
                  </Button>
                  <Button variant="outline" className="w-full">
                    View Crew
                  </Button>
                  <Button variant="outline" className="w-full">
                    View Certificates
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
};

export default FleetMap;
