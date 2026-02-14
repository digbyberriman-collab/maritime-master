import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTripSuggestions, type BrowseFilters } from '@/hooks/useTripSuggestions';

const DEFAULT_FILTERS: BrowseFilters = {
  search: '',
  status: 'all',
  category: 'all',
  region: 'all',
  tags: [],
  sortBy: 'newest',
};

const HeatMapTab: React.FC = () => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { useBrowseSuggestions } = useTripSuggestions();
  const { data: suggestions = [], isLoading } = useBrowseSuggestions(DEFAULT_FILTERS);

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

  useEffect(() => {
    if (!containerRef.current || isLoading) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([20, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear existing markers
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

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

      <div className="border rounded-lg overflow-hidden" style={{ height: '550px' }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  );
};

export default HeatMapTab;
