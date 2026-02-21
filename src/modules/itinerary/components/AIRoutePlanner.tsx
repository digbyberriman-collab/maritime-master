import React, { useState, useCallback } from 'react';
import { MapPin, Navigation, Sparkles, Trash2, ChevronRight, Loader2, Ship, CheckCircle2, X, Calendar, Anchor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/shared/hooks/use-toast';
import { useCreateEntry, useItineraryVessels } from '@/modules/itinerary/hooks/useItinerary';
import { supabase } from '@/integrations/supabase/client';

interface Destination {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

interface TransitInfo {
  distance_nm: number;
  transit_days: number;
  notes: string;
}

interface RouteLeg {
  order: number;
  destination: string;
  country: string;
  lat: number;
  lng: number;
  arrival_date: string;
  departure_date: string;
  stay_days: number;
  season_rating: 'excellent' | 'good' | 'fair' | 'poor';
  season_notes: string;
  transit_from_previous: TransitInfo | null;
}

interface RouteResult {
  route_summary: string;
  total_transit_nm: number;
  legs: RouteLeg[];
  repositioning_notes: string;
  weather_warnings: string;
}

interface AIRoutePlannerProps {
  onAddDestination: () => void;
  destinations: Destination[];
  onRemoveDestination: (id: string) => void;
  onClearDestinations: () => void;
}

const SEASON_COLORS: Record<string, string> = {
  excellent: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  good: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  fair: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  poor: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const AIRoutePlanner: React.FC<AIRoutePlannerProps> = ({
  onAddDestination,
  destinations,
  onRemoveDestination,
  onClearDestinations,
}) => {
  const { toast } = useToast();
  const createEntry = useCreateEntry();
  const { data: vessels = [] } = useItineraryVessels();

  const [isGenerating, setIsGenerating] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [selectedLegs, setSelectedLegs] = useState<Set<number>>(new Set());
  const [selectedVessels, setSelectedVessels] = useState<string[]>([]);
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const [isPushing, setIsPushing] = useState(false);

  const toggleLeg = (order: number) => {
    setSelectedLegs(prev => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  };

  const toggleVessel = (id: string) => {
    setSelectedVessels(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const selectAllLegs = () => {
    if (routeResult) {
      setSelectedLegs(new Set(routeResult.legs.map(l => l.order)));
    }
  };

  const handleGenerate = useCallback(async () => {
    if (destinations.length < 2) {
      toast({ title: 'Select at least 2 destinations on the map', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setRouteResult(null);
    setSelectedLegs(new Set());

    try {
      const { data, error } = await supabase.functions.invoke('ai-route-planner', {
        body: { destinations, year },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setRouteResult(data as RouteResult);
      // Auto-select all legs
      if (data?.legs) {
        setSelectedLegs(new Set((data.legs as RouteLeg[]).map(l => l.order)));
      }

      toast({ title: 'Route optimized!', description: data.route_summary?.slice(0, 80) });
    } catch (err: any) {
      toast({ title: 'Route planning failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  }, [destinations, year, toast]);

  const handlePushToPlanner = useCallback(async () => {
    if (!routeResult || selectedLegs.size === 0) return;
    if (selectedVessels.length === 0) {
      toast({ title: 'Select at least one vessel', variant: 'destructive' });
      return;
    }

    setIsPushing(true);
    try {
      const legsToCreate = routeResult.legs.filter(l => selectedLegs.has(l.order));

      for (const leg of legsToCreate) {
        await createEntry.mutateAsync({
          title: `${leg.destination}`,
          trip_type_id: null,
          location: leg.destination,
          country: leg.country,
          start_date: leg.arrival_date,
          end_date: leg.departure_date,
          status: 'draft',
          notes: `${leg.season_notes}\n\n${leg.transit_from_previous ? `Transit: ${leg.transit_from_previous.distance_nm}nm (~${leg.transit_from_previous.transit_days} days) — ${leg.transit_from_previous.notes}` : 'Starting point'}`,
          vessel_ids: selectedVessels,
        });
      }

      toast({
        title: `${legsToCreate.length} legs pushed to planner`,
        description: 'Entries created as drafts. Review them in Fleet Planning.',
      });
    } catch (err: any) {
      toast({ title: 'Error creating entries', description: err.message, variant: 'destructive' });
    } finally {
      setIsPushing(false);
    }
  }, [routeResult, selectedLegs, selectedVessels, createEntry, toast]);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Route Optimizer</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Click destinations on the map, then generate an optimized seasonal route.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Destinations list */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Destinations ({destinations.length})
              </label>
              {destinations.length > 0 && (
                <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={onClearDestinations}>
                  Clear all
                </Button>
              )}
            </div>

            {destinations.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-md">
                <MapPin className="w-4 h-4 mx-auto mb-1 opacity-40" />
                Click on the map to add destinations
              </div>
            ) : (
              <div className="space-y-1">
                {destinations.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-2 px-2 py-1 rounded bg-muted/40 text-xs">
                    <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">{d.name}, {d.country}</span>
                    <button onClick={() => onRemoveDestination(d.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Year selection */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Target Year
            </label>
            <Input
              type="number"
              value={year}
              onChange={e => setYear(parseInt(e.target.value))}
              min={new Date().getFullYear()}
              max={new Date().getFullYear() + 5}
              className="h-7 text-xs"
            />
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={destinations.length < 2 || isGenerating}
            className="w-full text-xs"
            size="sm"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Optimizing route...
              </>
            ) : (
              <>
                <Navigation className="w-3 h-3 mr-1.5" />
                Generate Optimal Route
              </>
            )}
          </Button>

          {/* Results */}
          {routeResult && (
            <>
              <Separator />

              {/* Summary */}
              <div className="space-y-1.5">
                <p className="text-xs text-foreground">{routeResult.route_summary}</p>
                <div className="flex gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Anchor className="w-3 h-3" />
                    {routeResult.total_transit_nm?.toLocaleString()} nm total
                  </span>
                  <span>{routeResult.legs.length} stops</span>
                </div>
              </div>

              {/* Weather warnings */}
              {routeResult.weather_warnings && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2">
                  <p className="text-[10px] text-amber-400">{routeResult.weather_warnings}</p>
                </div>
              )}

              {/* Legs */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Route Legs</label>
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={selectAllLegs}>
                    Select all
                  </Button>
                </div>

                {routeResult.legs.map((leg) => (
                  <div
                    key={leg.order}
                    className={`border rounded-md p-2 cursor-pointer transition-all text-xs ${
                      selectedLegs.has(leg.order)
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/30'
                    }`}
                    onClick={() => toggleLeg(leg.order)}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selectedLegs.has(leg.order)}
                        onCheckedChange={() => toggleLeg(leg.order)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium truncate">{leg.destination}</span>
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${SEASON_COLORS[leg.season_rating] || ''}`}>
                            {leg.season_rating}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-[10px] mt-0.5">
                          {leg.arrival_date} → {leg.departure_date} ({leg.stay_days}d)
                        </p>
                        <p className="text-muted-foreground text-[10px] italic mt-0.5">{leg.season_notes}</p>
                        {leg.transit_from_previous && (
                          <p className="text-[10px] text-primary/70 mt-0.5 flex items-center gap-1">
                            <ChevronRight className="w-2.5 h-2.5" />
                            {leg.transit_from_previous.distance_nm}nm · ~{leg.transit_from_previous.transit_days}d transit
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Repositioning notes */}
              {routeResult.repositioning_notes && (
                <div className="bg-muted/40 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">
                    <Ship className="w-3 h-3 inline mr-1" />
                    {routeResult.repositioning_notes}
                  </p>
                </div>
              )}

              <Separator />

              {/* Vessel selection for push */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Assign to Vessel(s)</label>
                <div className="grid grid-cols-1 gap-0.5 p-2 border border-border rounded-md max-h-24 overflow-y-auto bg-muted/30">
                  {vessels.map(v => (
                    <label key={v.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                      <Checkbox
                        checked={selectedVessels.includes(v.id)}
                        onCheckedChange={() => toggleVessel(v.id)}
                      />
                      <span className="truncate">{v.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Push to planner */}
              <Button
                onClick={handlePushToPlanner}
                disabled={selectedLegs.size === 0 || selectedVessels.length === 0 || isPushing}
                className="w-full text-xs"
                size="sm"
                variant="default"
              >
                {isPushing ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Creating entries...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 mr-1.5" />
                    Push {selectedLegs.size} leg{selectedLegs.size !== 1 ? 's' : ''} to Planner
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AIRoutePlanner;
