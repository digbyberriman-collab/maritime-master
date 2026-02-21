import React, { useState, useMemo, useCallback } from 'react';
import { MapPin, Star, ChevronDown, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useTripSuggestions, type SuggestionFormData, type GeocodingResult } from '@/modules/itinerary/hooks/useTripSuggestions';
import {
  INTEREST_TAGS,
  DIVING_LEVELS,
  DIVING_TYPES,
  REGIONS,
  AREAS,
  TRIP_CATEGORIES,
  DURATION_OPTIONS,
  ENTHUSIASM_LABELS,
  MONTH_LABELS,
} from '@/modules/itinerary/constants';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const SubmitSuggestionForm: React.FC = () => {
  const navigate = useNavigate();
  const { submitSuggestion, useGeocodingSearch, destinations } = useTripSuggestions();
  const { vessels } = useVessels();

  // Destination state
  const [destSearch, setDestSearch] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<any>(null);
  const [isNewDestination, setIsNewDestination] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newDest, setNewDest] = useState({ name: '', country: '', region: '', area: '', latitude: undefined as number | undefined, longitude: undefined as number | undefined });

  // Form state
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [showCustomTag, setShowCustomTag] = useState(false);
  const [divingLevel, setDivingLevel] = useState('');
  const [divingTypes, setDivingTypes] = useState<string[]>([]);
  const [marineSpecies, setMarineSpecies] = useState('');
  const [bestMonths, setBestMonths] = useState<number[]>([]);
  const [eventDates, setEventDates] = useState<Array<{ name: string; start_date: string; end_date: string }>>([]);
  const [tripCategory, setTripCategory] = useState('maritime');
  const [selectedVessels, setSelectedVessels] = useState<string[]>([]);
  const [allVessels, setAllVessels] = useState(false);
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [nearestBunker, setNearestBunker] = useState('');
  const [ownerVisited, setOwnerVisited] = useState('');
  const [ownerVisitedWhen, setOwnerVisitedWhen] = useState('');
  const [enthusiasmRating, setEnthusiasmRating] = useState(3);

  const { data: searchResults = [], isLoading: searchLoading } = useTripSuggestions().useGeocodingSearch(destSearch);

  const showDivingSection = selectedTags.includes('diving') || selectedTags.includes('marine_life');
  const showEventDates = selectedTags.includes('event');

  const handleTagToggle = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  };

  const handleMonthToggle = (month: number) => {
    setBestMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month].sort((a, b) => a - b)
    );
  };

  const handleDivingTypeToggle = (type: string) => {
    setDivingTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleVesselToggle = (vesselId: string) => {
    setSelectedVessels(prev =>
      prev.includes(vesselId) ? prev.filter(v => v !== vesselId) : [...prev, vesselId]
    );
  };

  const handleSelectDestination = (result: GeocodingResult) => {
    setSelectedDestination(result);
    setDestSearch(result.name);
    setIsNewDestination(true);
    setNewDest({
      name: result.name,
      country: result.country,
      region: result.region,
      area: result.area,
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setShowDropdown(false);
  };

  const handleAddNewDestination = () => {
    setIsNewDestination(true);
    setNewDest({ ...newDest, name: destSearch });
    setSelectedDestination(null);
    setShowDropdown(false);
  };

  const addEventDate = () => {
    setEventDates(prev => [...prev, { name: '', start_date: '', end_date: '' }]);
  };

  const removeEventDate = (index: number) => {
    setEventDates(prev => prev.filter((_, i) => i !== index));
  };

  const updateEventDate = (index: number, field: string, value: string) => {
    setEventDates(prev => prev.map((ed, i) => i === index ? { ...ed, [field]: value } : ed));
  };

  const monthRangeText = useMemo(() => {
    if (bestMonths.length === 0) return '';
    if (bestMonths.length === 12) return 'Year-round';
    const names = bestMonths.map(m => MONTH_LABELS[m - 1]);
    if (bestMonths.length <= 3) return names.join(', ');
    return `${names[0]} to ${names[names.length - 1]}`;
  }, [bestMonths]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formData: SuggestionFormData = {
      destination_id: undefined,
      new_destination: isNewDestination ? newDest : undefined,
      description,
      tags: selectedTags,
      trip_category: tripCategory,
      diving_level: showDivingSection ? divingLevel : undefined,
      diving_types: showDivingSection ? divingTypes : undefined,
      marine_species: showDivingSection ? marineSpecies : undefined,
      best_months: bestMonths.length > 0 ? bestMonths : undefined,
      event_dates: eventDates.length > 0 ? eventDates : undefined,
      suitable_vessels: allVessels ? vessels?.map(v => v.id) : selectedVessels.length > 0 ? selectedVessels : undefined,
      estimated_duration: estimatedDuration || undefined,
      nearest_bunker_text: nearestBunker || undefined,
      owner_visited: ownerVisited || undefined,
      owner_visited_when: ownerVisited === 'yes' ? ownerVisitedWhen : undefined,
      enthusiasm_rating: enthusiasmRating,
    };

    submitSuggestion.mutate(formData, {
      onSuccess: () => {
        navigate('/itinerary/suggestions');
      },
    });
  };

  const isValid = description.length >= 20 && (selectedDestination || (isNewDestination && newDest.name));

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Suggest a Trip</h1>
        <p className="text-muted-foreground mt-1">
          Share a destination or experience you think the fleet should explore. All suggestions are reviewed by the planning team.
        </p>
      </div>

      {/* Section 1: Where */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Where
        </h2>

        {/* Destination autocomplete */}
        <div className="space-y-2">
          <Label>Destination <span className="text-destructive">*</span></Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Start typing a destination..."
              value={destSearch}
              onChange={(e) => {
                setDestSearch(e.target.value);
                setShowDropdown(true);
                if (selectedDestination) {
                  setSelectedDestination(null);
                }
              }}
              onFocus={() => destSearch.length >= 2 && setShowDropdown(true)}
              className="pl-9"
            />
            {showDropdown && destSearch.length >= 2 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[240px] overflow-y-auto">
                {searchLoading && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Searching worldwide...</div>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No results found. Try a different search.</div>
                )}
                {searchResults.map((result, idx) => (
                  <button
                    key={`${result.osm_id}-${idx}`}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                    onClick={() => handleSelectDestination(result)}
                  >
                    <span className="font-medium">{result.name}</span>
                    <span className="text-muted-foreground text-xs block truncate">{result.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected destination info (auto-filled from geocoding) */}
        {selectedDestination && isNewDestination && (
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              📍 Location Details (auto-filled, editable)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Country</Label>
                <Input
                  value={newDest.country}
                  onChange={(e) => setNewDest({ ...newDest, country: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Region</Label>
                <Select value={newDest.region} onValueChange={(v) => setNewDest({ ...newDest, region: v })}>
                  <SelectTrigger><SelectValue placeholder="Region" /></SelectTrigger>
                  <SelectContent>
                    {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Area / Ocean</Label>
                <Select value={newDest.area} onValueChange={(v) => setNewDest({ ...newDest, area: v })}>
                  <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
                  <SelectContent>
                    {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Coordinates</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {newDest.latitude?.toFixed(4)}, {newDest.longitude?.toFixed(4)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Nearest Bunkering Port */}
        <div>
          <Label>Nearest Bunkering Port</Label>
          <Input
            placeholder="Nearest port for fuel?"
            value={nearestBunker}
            onChange={(e) => setNearestBunker(e.target.value)}
          />
        </div>
      </div>

      <Separator />

      {/* Section 2: Why */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Why</h2>

        <div className="space-y-2">
          <Label>What's the Draw? <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Textarea
              placeholder="Why should we go here? What makes it special?"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
              rows={4}
              className={cn(description.length > 0 && description.length < 20 && 'border-destructive')}
            />
            <span className="absolute bottom-2 right-2 text-xs text-muted-foreground">
              {description.length}/2000
            </span>
          </div>
          {description.length > 0 && description.length < 20 && (
            <p className="text-xs text-destructive">Minimum 20 characters required</p>
          )}
        </div>

        {/* Interest Tags */}
        <div className="space-y-2">
          <Label>Interest / Feature Tags</Label>
          <div className="flex flex-wrap gap-2">
            {INTEREST_TAGS.map(tag => (
              <Badge
                key={tag.id}
                variant={selectedTags.includes(tag.id) ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer select-none transition-colors',
                  selectedTags.includes(tag.id) && 'bg-primary text-primary-foreground'
                )}
                onClick={() => handleTagToggle(tag.id)}
              >
                {tag.icon} {tag.label}
              </Badge>
            ))}
            <Badge
              variant={showCustomTag ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              onClick={() => setShowCustomTag(!showCustomTag)}
            >
              ➕ Custom
            </Badge>
          </div>
          {showCustomTag && (
            <div className="flex gap-2">
              <Input
                placeholder="Custom tag name..."
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                className="max-w-[200px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (customTagInput.trim()) {
                    setSelectedTags(prev => [...prev, customTagInput.trim()]);
                    setCustomTagInput('');
                    setShowCustomTag(false);
                  }
                }}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Diving Section (conditional) */}
      {showDivingSection && (
        <>
          <Separator />
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">🤿 Diving Information</h2>

            <div>
              <Label>Diving Level Required</Label>
              <Select value={divingLevel} onValueChange={setDivingLevel}>
                <SelectTrigger><SelectValue placeholder="Select level..." /></SelectTrigger>
                <SelectContent>
                  {DIVING_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Diving Type</Label>
              <div className="flex flex-wrap gap-2">
                {DIVING_TYPES.map(type => (
                  <Badge
                    key={type}
                    variant={divingTypes.includes(type) ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => handleDivingTypeToggle(type)}
                  >
                    {type}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label>Key Marine Species</Label>
              <Input
                placeholder="What can you see here? (e.g., hammerheads, mantas, whale sharks)"
                value={marineSpecies}
                onChange={(e) => setMarineSpecies(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Section 3: When */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">When</h2>

        <div className="space-y-2">
          <Label>Best Time of Year</Label>
          <div className="flex flex-wrap gap-1.5">
            {MONTH_LABELS.map((label, idx) => {
              const month = idx + 1;
              return (
                <button
                  key={month}
                  type="button"
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                    bestMonths.includes(month)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-muted'
                  )}
                  onClick={() => handleMonthToggle(month)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {monthRangeText && (
            <p className="text-sm text-muted-foreground">{monthRangeText}</p>
          )}
        </div>

        {/* Event Dates (conditional) */}
        {showEventDates && (
          <div className="space-y-3">
            <Label>Specific Event Dates</Label>
            {eventDates.map((ed, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                <Input placeholder="Event name" value={ed.name} onChange={(e) => updateEventDate(idx, 'name', e.target.value)} />
                <Input type="date" value={ed.start_date} onChange={(e) => updateEventDate(idx, 'start_date', e.target.value)} />
                <Input type="date" value={ed.end_date} onChange={(e) => updateEventDate(idx, 'end_date', e.target.value)} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeEventDate(idx)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addEventDate}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Event Date
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Section 4: Logistics */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Logistics</h2>

        {/* Trip Category */}
        <div className="space-y-2">
          <Label>Trip Category <span className="text-destructive">*</span></Label>
          <div className="space-y-2">
            {TRIP_CATEGORIES.map(cat => (
              <label key={cat.value} className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="trip_category"
                  value={cat.value}
                  checked={tripCategory === cat.value}
                  onChange={() => setTripCategory(cat.value)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">{cat.label}</p>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Suitable Vessels */}
        <div className="space-y-2">
          <Label>Suitable Vessel(s)</Label>
          <div className="space-y-1">
            <label className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
              <Checkbox
                checked={allVessels}
                onCheckedChange={(checked) => {
                  setAllVessels(!!checked);
                  if (checked) setSelectedVessels([]);
                }}
              />
              <span className="text-sm font-medium">All Vessels</span>
            </label>
            {!allVessels && vessels?.map(v => (
              <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
                <Checkbox
                  checked={selectedVessels.includes(v.id)}
                  onCheckedChange={() => handleVesselToggle(v.id)}
                />
                <span className="text-sm">{v.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <Label>Estimated Duration</Label>
          <Select value={estimatedDuration} onValueChange={setEstimatedDuration}>
            <SelectTrigger><SelectValue placeholder="Select duration..." /></SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Owner Visited */}
        <div className="space-y-2">
          <Label>Has the Owner Been Here Before?</Label>
          <div className="flex gap-4">
            {['yes', 'no', 'unknown'].map(v => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="owner_visited" value={v} checked={ownerVisited === v} onChange={() => setOwnerVisited(v)} />
                <span className="text-sm capitalize">{v}</span>
              </label>
            ))}
          </div>
          {ownerVisited === 'yes' && (
            <Input
              placeholder="When approximately?"
              value={ownerVisitedWhen}
              onChange={(e) => setOwnerVisitedWhen(e.target.value)}
            />
          )}
        </div>
      </div>

      <Separator />

      {/* Section 6: Enthusiasm */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">How Much Do You Want This? <span className="text-destructive">*</span></h2>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              type="button"
              onClick={() => setEnthusiasmRating(star)}
              className="p-1 transition-transform hover:scale-110"
            >
              <Star
                className={cn(
                  'w-8 h-8 transition-colors',
                  star <= enthusiasmRating
                    ? 'fill-warning text-warning'
                    : 'text-muted-foreground/30'
                )}
              />
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{ENTHUSIASM_LABELS[enthusiasmRating]}</p>
      </div>

      <Separator />

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!isValid || submitSuggestion.isPending}
      >
        {submitSuggestion.isPending ? 'Submitting...' : 'Submit Suggestion'}
      </Button>
    </form>
  );
};

export default SubmitSuggestionForm;
