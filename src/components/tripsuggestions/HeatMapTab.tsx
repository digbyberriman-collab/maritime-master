import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTripSuggestions, type BrowseFilters } from '@/hooks/useTripSuggestions';
import AIRoutePlanner from './AIRoutePlanner';

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
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
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

      const radius = count >= 5 ? 18 : count >= 3 ? 14 : count >= 2 ? 11 : 8;
      const color = avgEnthusiasm >= 4 ? '#22c55e' : avgEnthusiasm >= 3 ? '#f59e0b' : '#3b82f6';

      const marker = L.circleMarker([cluster.lat, cluster.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.7,
        color,
        weight: 2,
        opacity: 0.9,
      }).addTo(map);

      const popupContent = `
        <div style="min-width:200px">
          <strong>${cluster.name}</strong>${cluster.country ? ` — ${cluster.country}` : ''}
          <div style="font-size:12px;color:#666;margin-top:4px">
            ${count} suggestion${count !== 1 ? 's' : ''} · 
            👍 ${totalVotes} · 
            ⭐ ${avgEnthusiasm.toFixed(1)}
          </div>
          <div style="margin-top:8px;max-height:120px;overflow-y:auto;font-size:11px">
            ${cluster.suggestions.map(s => 
              `<div style="margin-bottom:4px;padding:2px 0;border-bottom:1px solid #eee">${s.description.slice(0, 60)}...</div>`
            ).join('')}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
    });

    return () => {};
  }, [clusters, isLoading]);

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

    // Add numbered markers
    selectedDestinations.forEach((d, i) => {
      const icon = L.divIcon({
        className: 'ai-route-marker',
        html: `<div style="
          width:24px;height:24px;border-radius:50%;
          background:hsl(var(--primary));color:hsl(var(--primary-foreground));
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:700;
          border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);
        ">${i + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker([d.lat, d.lng], { icon }).addTo(map);
      marker.bindTooltip(`${d.name}, ${d.country}`, { direction: 'top', offset: [0, -14] });
      destinationMarkersRef.current.push(marker);
    });

    // Draw connecting line
    if (selectedDestinations.length > 1) {
      const latlngs = selectedDestinations.map(d => [d.lat, d.lng] as [number, number]);
      routeLineRef.current = L.polyline(latlngs, {
        color: 'hsl(var(--primary))',
        weight: 2,
        dashArray: '6 4',
        opacity: 0.6,
      }).addTo(map);
    }
  }, [selectedDestinations]);

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
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#22c55e' }} />
            High enthusiasm
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#f59e0b' }} />
            Medium
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#3b82f6' }} />
            Low
          </span>
        </div>
      </div>

      <div className="flex gap-3" style={{ height: '550px' }}>
        {/* Map */}
        <div className="flex-1 border rounded-lg overflow-hidden relative">
          <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
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
