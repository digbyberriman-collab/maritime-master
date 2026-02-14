// Itinerary Module Types

export type ItineraryStatus = 'draft' | 'tentative' | 'confirmed' | 'postponed' | 'cancelled' | 'completed';
export type DivingLevel = 'none' | 'beginner' | 'intermediate' | 'advanced' | 'technical' | 'cave';
export type SuggestionStatus = 'new' | 'under_consideration' | 'planned' | 'declined';
export type ViewMode = 'year' | 'quarter' | 'month' | 'week' | 'day';

export interface TripType {
  id: string;
  company_id: string;
  name: string;
  colour: string;
  icon: string | null;
  display_order: number;
  is_active: boolean;
}

export interface ItineraryEntry {
  id: string;
  company_id: string;
  title: string;
  trip_type_id: string | null;
  location: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  port_id: string | null;
  start_date: string;
  end_date: string;
  status: ItineraryStatus;
  notes: string | null;
  responsible_person_id: string | null;
  is_locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  group_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  trip_type?: TripType | null;
  vessels?: EntryVessel[];
}

export interface EntryVessel {
  id: string;
  entry_id: string;
  vessel_id: string;
  detached_from_group: boolean;
  vessel?: { id: string; name: string };
}

export interface Vessel {
  id: string;
  name: string;
}

export interface CreateEntryInput {
  title: string;
  trip_type_id: string | null;
  location: string;
  country: string;
  start_date: string;
  end_date: string;
  status: ItineraryStatus;
  notes: string;
  vessel_ids: string[];
}

export const STATUS_CONFIG: Record<ItineraryStatus, {
  label: string;
  className: string;
  opacity: number;
  textClass?: string;
}> = {
  draft: {
    label: 'Draft',
    className: 'border-dashed border-2 border-muted-foreground/40 bg-muted/50',
    opacity: 1,
  },
  tentative: {
    label: 'Tentative',
    className: '',
    opacity: 0.4,
  },
  confirmed: {
    label: 'Confirmed',
    className: '',
    opacity: 1,
  },
  postponed: {
    label: 'Postponed',
    className: 'bg-amber-500/20 text-amber-400 italic',
    opacity: 1,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'line-through opacity-50',
    opacity: 0.5,
    textClass: 'line-through text-destructive',
  },
  completed: {
    label: 'Completed',
    className: 'opacity-60',
    opacity: 0.6,
  },
};
