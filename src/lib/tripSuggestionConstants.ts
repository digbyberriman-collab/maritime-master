// Interest/Feature Tags
export const INTEREST_TAGS = [
  { id: 'diving', label: 'Diving', icon: '🤿' },
  { id: 'marine_life', label: 'Marine Life', icon: '🐋' },
  { id: 'nature', label: 'Nature / Landscape', icon: '🏔️' },
  { id: 'safari', label: 'Safari / Wildlife', icon: '🦁' },
  { id: 'history', label: 'History / Culture', icon: '🏛️' },
  { id: 'food', label: 'Food & Drink', icon: '🍽️' },
  { id: 'water_sports', label: 'Water Sports', icon: '🏄' },
  { id: 'adventure', label: 'Adventure / Extreme', icon: '🎿' },
  { id: 'science', label: 'Science / Research', icon: '🔬' },
  { id: 'event', label: 'Event / Spectacle', icon: '🎉' },
  { id: 'relaxation', label: 'Relaxation', icon: '🏖️' },
  { id: 'aerial', label: 'Aerial / Heli', icon: '🚁' },
  { id: 'geology', label: 'Geology / Volcanic', icon: '🌋' },
  { id: 'surfing', label: 'Surfing', icon: '🌊' },
] as const;

export const DIVING_LEVELS = [
  { value: 'not_applicable', label: 'Not Applicable' },
  { value: 'beginner', label: 'Beginner (Open Water)' },
  { value: 'intermediate', label: 'Intermediate (Advanced Open Water)' },
  { value: 'advanced', label: 'Advanced (Deep/Nitrox)' },
  { value: 'technical', label: 'Technical (Trimix/Rebreather)' },
  { value: 'cave', label: 'Cave Diving Cert Required' },
] as const;

export const DIVING_TYPES = [
  'Reef', 'Wreck', 'Wall', 'Drift', 'Cave/Cavern', 'Cenote',
  'Pelagic', 'Muck', 'Night', 'Ice', 'Free Diving', 'Snorkelling Only',
] as const;

export const REGIONS = [
  'North America', 'South America', 'Central America', 'Caribbean',
  'Europe', 'Northern Europe', 'Mediterranean',
  'Africa', 'Middle East',
  'South Asia', 'Southeast Asia', 'East Asia',
  'Oceania', 'Pacific Islands',
  'Arctic', 'Antarctic',
] as const;

export const AREAS = [
  'Pacific East', 'Pacific West', 'Atlantic East', 'Atlantic West',
  'Indian Ocean', 'Mediterranean Sea', 'Gulf of Mexico', 'Caribbean Sea',
  'Red Sea', 'Arctic Ocean', 'Southern Ocean', 'Land',
] as const;

export const TRIP_CATEGORIES = [
  { value: 'maritime', label: 'Maritime', description: 'Vessel goes there (standard)' },
  { value: 'land_based', label: 'Land-Based', description: 'Fly-in experience (safari, dog sledding, etc.)' },
  { value: 'combined', label: 'Combined', description: 'Vessel goes to nearby port + land excursion' },
] as const;

export const DURATION_OPTIONS = [
  '1-2 days', '3-5 days', '1 week', '2 weeks', '3+ weeks',
] as const;

export const ENTHUSIASM_LABELS: Record<number, string> = {
  1: 'Just an idea',
  2: 'Would be nice',
  3: "I'd really like this",
  4: 'Please make this happen',
  5: 'This is a must-do',
};

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const SUGGESTION_STATUSES = [
  { value: 'new', label: 'New', color: 'bg-info text-info-foreground' },
  { value: 'under_consideration', label: 'Under Consideration', color: 'bg-warning text-warning-foreground' },
  { value: 'planned', label: 'Planned', color: 'bg-success text-success-foreground' },
  { value: 'declined', label: 'Declined', color: 'bg-destructive text-destructive-foreground' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-success text-success-foreground' },
  { value: 'completed', label: 'Completed', color: 'bg-muted text-muted-foreground' },
] as const;
