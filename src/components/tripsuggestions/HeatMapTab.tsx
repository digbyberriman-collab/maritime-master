import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Badge } from '@/components/ui/badge';
import { useTripSuggestions, type BrowseFilters } from '@/hooks/useTripSuggestions';
import { SUGGESTION_STATUSES, INTEREST_TAGS } from '@/lib/tripSuggestionConstants';
import { cn } from '@/lib/utils';
import { ThumbsUp, Star } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const DEFAULT_FILTERS: BrowseFilters = {
  search: '',
  status: 'all',
  category: 'all',
  region: 'all',
  tags: [],
  sortBy: 'newest',
};

const HeatMapTab: React.FC = () => {
  const { useBrowseSuggestions } = useTripSuggestions();
  const { data: suggestions = [], isLoading } = useBrowseSuggestions(DEFAULT_FILTERS);

  // Group suggestions by destination (lat/lng)
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

  const getRadius = (count: number) => {
    if (count >= 5) return 18;
    if (count >= 3) return 14;
    if (count >= 2) return 11;
    return 8;
  };

  const getColor = (avgEnthusiasm: number) => {
    if (avgEnthusiasm >= 4) return 'hsl(var(--success))';
    if (avgEnthusiasm >= 3) return 'hsl(var(--warning))';
    return 'hsl(var(--info))';
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
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: 'hsl(var(--success))' }} />
            High enthusiasm
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: 'hsl(var(--warning))' }} />
            Medium
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: 'hsl(var(--info))' }} />
            Low
          </span>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden" style={{ height: '550px' }}>
        <MapContainer
          center={[20, 0]}
          zoom={2}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {clusters.map((cluster) => {
            const totalVotes = cluster.suggestions.reduce((sum, s) => sum + (s.vote_count || 0), 0);
            const avgEnthusiasm = cluster.suggestions.reduce((sum, s) => sum + s.enthusiasm_rating, 0) / cluster.suggestions.length;

            return (
              <CircleMarker
                key={`${cluster.lat}-${cluster.lng}`}
                center={[cluster.lat, cluster.lng]}
                radius={getRadius(cluster.suggestions.length)}
                pathOptions={{
                  fillColor: getColor(avgEnthusiasm),
                  fillOpacity: 0.7,
                  color: getColor(avgEnthusiasm),
                  weight: 2,
                  opacity: 0.9,
                }}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <h3 className="font-semibold text-sm">
                      {cluster.name}
                      {cluster.country && <span className="text-muted-foreground font-normal"> — {cluster.country}</span>}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{cluster.suggestions.length} suggestion{cluster.suggestions.length !== 1 ? 's' : ''}</span>
                      <span className="flex items-center gap-0.5">
                        <ThumbsUp className="w-3 h-3" /> {totalVotes}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Star className="w-3 h-3" /> {avgEnthusiasm.toFixed(1)}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 max-h-[150px] overflow-y-auto">
                      {cluster.suggestions.map(s => {
                        const statusConfig = SUGGESTION_STATUSES.find(st => st.value === s.status);
                        return (
                          <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate flex-1">{s.description.slice(0, 50)}...</span>
                            {statusConfig && (
                              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', statusConfig.color)}>
                                {statusConfig.label}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};

export default HeatMapTab;
