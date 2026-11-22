import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTripSuggestions, type BrowseFilters } from '@/modules/itinerary/hooks/useTripSuggestions';
import AIRoutePlanner from './AIRoutePlanner';
import {
  HEAT_SWATCH_CLASS,
  POPUP_OPTIONS,
  ROUTE_STYLE,
  heatCircleStyle,
  popupHtml,
  useBasemap,
  waypointIcon,
  type HeatLevel,
} from '@/shared/components/data/mapTheme';

const DEFAULT_FILTERS: BrowseFilters = {
  search: '',
  status: 'all',
  category: 'all',
  region: 'all',
  tags: [],
  sortBy: 'newest',
};

interface SelectedDestination {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

const HeatMapTab: React.FC = () => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const destinationMarkersRef = useRef<L.Marker[]>([]);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const { useBrowseSuggestions } = useTripSuggestions();
  const { data: suggestions = [], isLoading } = useBrowseSuggestions(DEFAULT_FILTERS);

  const [selectedDestinations, setSelectedDestinations] = useState<SelectedDestination[]>([]);
  const [isPickingMode, setIsPickingMode] = useState(false);

  const clusters = useMemo(() => {
    const map = new Map<string, {
      lat: number;
      lng: number;
      name: string;
      country: string | null;
      suggestions: typeof suggestions;
    }>();

    suggestions.forEach(s => {
      const dest = s.destinations;
      if (!dest?.latitude || !dest?.longitude) return;
      const key = dest.id;
      if (!map.has(key)) {
        map.set(key, {
          lat: dest.latitude,
          lng: dest.longitude,
          name: dest.name,
          country: dest.country,
          suggestions: [],
        });
      }
      map.get(key)!.suggestions.push(s);
    });

    return Array.from(map.values());
  }, [suggestions]);

  const noLocationCount = suggestions.filter(s => !s.destinations?.latitude || !s.destinations?.longitude).length;

  // Reverse geocode a clicked point
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<{ name: string; country: string }> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`
      );
      const data = await res.json();
      const name = data.address?.city || data.address?.town || data.address?.village ||
        data.address?.county || data.address?.state || data.display_name?.split(',')[0] || 'Unknown';
      const country = data.address?.country || '';
      return { name, country };
    } catch {
      return { name: `${lat.toFixed(2)}, ${lng.toFixed(2)}`, country: '' };
    }
  }, []);

  // Handle map click to add destination
  const handleMapClick = useCallback(async (e: L.LeafletMouseEvent) => {
    const { lat, lng } = e.latlng;

    // Check if clicking near an existing suggestion cluster
    const nearbyCluster = clusters.find(c => {
      const d = Math.sqrt(Math.pow(c.lat - lat, 2) + Math.pow(c.lng - lng, 2));
      return d < 2; // ~2 degrees tolerance
    });

    let dest: SelectedDestination;
    if (nearbyCluster) {
      dest = {
        id: crypto.randomUUID(),
        name: nearbyCluster.name,
        country: nearbyCluster.country || '',
        lat: nearbyCluster.lat,
        lng: nearbyCluster.lng,
      };
    } else {
      const geo = await reverseGeocode(lat, lng);
      dest = {
        id: crypto.randomUUID(),
        name: geo.name,
        country: geo.country,
        lat,
        lng,
      };
    }

    setSelectedDestinations(prev => [...prev, dest]);
  }, [clusters, reverseGeocode]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || isLoading) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([20, 0], 2);
    }

    const map = mapRef.current;

    // Clear existing circle markers (suggestion clusters)
    map.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    clusters.forEach(cluster => {
      const avgEnthusiasm = cluster.suggestions.reduce((sum, s) => sum + s.enthusiasm_rating, 0) / cluster.suggestions.length;
      const totalVotes = cluster.suggestions.reduce((sum, s) => sum + (s.vote_count || 0), 0);
      const count = cluster.suggestions.length;

      // Scale dot size based on suggestion count — more suggestions = larger dot
      const radius = Math.min(6 + count * 3, 30);
      const opacity = Math.min(0.5 + count * 0.05, 0.9);
      const level: HeatLevel = avgEnthusiasm >= 4 ? 'high' : avgEnthusiasm >= 3 ? 'medium' : 'low';

      const marker = L.circleMarker(
        [cluster.lat, cluster.lng],
        heatCircleStyle(level, { radius, fillOpacity: opacity, weight: count >= 3 ? 3 : 2, opacity: 0.9 }),
      ).addTo(map);

      const popupContent = popupHtml({
        title: `${cluster.name}${cluster.country ? ` — ${cluster.country}` : ''}`,
        subtitle: `${count} suggestion${count !== 1 ? 's' : ''} · 👍 ${totalVotes} · ⭐ ${avgEnthusiasm.toFixed(1)}`,
        items: cluster.suggestions.map(s => `${s.description.slice(0, 60)}...`),
      });

      marker.bindPopup(popupContent, POPUP_OPTIONS);
    });

    return () => {};
  }, [clusters, isLoading]);

  // Basemap follows the theme; the map is created once the suggestions load.
  useBasemap(mapRef, !isLoading);

  // Map click handler toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isPickingMode) {
      map.on('click', handleMapClick);
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.off('click', handleMapClick);
      map.getContainer().style.cursor = '';
    }

    return () => {
      map.off('click', handleMapClick);
      map.getContainer().style.cursor = '';
    };
  }, [isPickingMode, handleMapClick]);

  // Draw destination markers and route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old destination markers
    destinationMarkersRef.current.forEach(m => map.removeLayer(m));
    destinationMarkersRef.current = [];
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (selectedDestinations.length === 0) return;

    // Add numbered draggable markers
    selectedDestinations.forEach((d, i) => {
      const marker = L.marker([d.lat, d.lng], { icon: waypointIcon(i + 1), draggable: true }).addTo(map);
      marker.bindTooltip(`${d.name}, ${d.country}`, { direction: 'top', offset: [0, -14] });

      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        const geo = await reverseGeocode(pos.lat, pos.lng);
        setSelectedDestinations(prev =>
          prev.map(dest =>
            dest.id === d.id
              ? { ...dest, lat: pos.lat, lng: pos.lng, name: geo.name, country: geo.country }
              : dest
          )
        );
      });

      destinationMarkersRef.current.push(marker);
    });

    // Draw connecting line
    if (selectedDestinations.length > 1) {
      const latlngs = selectedDestinations.map(d => [d.lat, d.lng] as [number, number]);
      routeLineRef.current = L.polyline(latlngs, ROUTE_STYLE).addTo(map);
    }
  }, [selectedDestinations, reverseGeocode]);

  // Auto-enable picking mode
  useEffect(() => {
    setIsPickingMode(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleRemoveDestination = (id: string) => {
    setSelectedDestinations(prev => prev.filter(d => d.id !== id));
  };

  const handleClearDestinations = () => {
    setSelectedDestinations([]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {clusters.length} destination{clusters.length !== 1 ? 's' : ''} with coordinates
          {noLocationCount > 0 && (
            <span className="ml-1">({noLocationCount} suggestion{noLocationCount !== 1 ? 's' : ''} without coordinates)</span>
          )}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-full inline-block ${HEAT_SWATCH_CLASS.high}`} />
            High enthusiasm
          </span>
          <span className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-full inline-block ${HEAT_SWATCH_CLASS.medium}`} />
            Medium
          </span>
          <span className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-full inline-block ${HEAT_SWATCH_CLASS.low}`} />
            Low
          </span>
        </div>
      </div>

      <div className="flex gap-3" style={{ height: '550px' }}>
        {/* Map */}
        <div className="flex-1 border rounded-lg overflow-hidden relative">
          <div ref={containerRef} className="bg-map-water" style={{ height: '100%', width: '100%' }} />
          {/* Picking mode indicator */}
          <div className="absolute top-3 left-14 z-[1000] bg-card/90 backdrop-blur border border-border rounded-md px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
            Click map to add destinations
          </div>
        </div>

        {/* AI Route Planner panel */}
        <div className="w-80 flex-shrink-0">
          <AIRoutePlanner
            destinations={selectedDestinations}
            onAddDestination={() => setIsPickingMode(true)}
            onRemoveDestination={handleRemoveDestination}
            onClearDestinations={handleClearDestinations}
          />
        </div>
      </div>
    </div>
  );
};

export default HeatMapTab;
