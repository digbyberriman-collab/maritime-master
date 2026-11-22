import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { labelMarkerIcon, useBasemap } from '@/shared/components/data/mapTheme';
import { FleetRegion, vesselCoord } from './regionUtils';

interface RegionMapCardProps {
  region: FleetRegion;
  vessels: { id: string; name: string }[];
}

const RegionMapCard: React.FC<RegionMapCardProps> = ({ region, vessels }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: region.center,
      zoom: region.zoom,
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [region]);

  // Basemap follows the theme; the map is rebuilt per region.
  useBasemap(mapRef, region, { attribution: false });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    vessels.forEach((v) => {
      const [lat, lng] = vesselCoord(v.id, region);
      L.marker([lat, lng], { icon: labelMarkerIcon(v.name), interactive: false, keyboard: false }).addTo(layer);
    });
    return () => {
      layer.remove();
    };
  }, [vessels, region]);

  return (
    <div className="rounded-lg border bg-card overflow-hidden shadow-card">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{region.label}</span>
          <span className="text-xs text-muted-foreground">{vessels.length}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {vessels.length} {vessels.length === 1 ? 'vessel' : 'vessels'}
        </span>
      </div>
      <div className="relative">
        <div ref={containerRef} className="h-64 w-full bg-map-water" />
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-3 right-3 z-[400] gap-1 shadow-md"
          onClick={() => navigate('/fleet-map')}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Full Fleet Tracker
        </Button>
      </div>
    </div>
  );
};

export default RegionMapCard;