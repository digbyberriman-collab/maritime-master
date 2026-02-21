// Components
export { default as AIRoutePlanner } from './components/AIRoutePlanner';
export { default as BrowseSuggestionsTab } from './components/BrowseSuggestionsTab';
export { default as CreateEntryModal } from './components/CreateEntryModal';
export { default as DraggableTripBlock } from './components/DraggableTripBlock';
export { default as EntryDetailPanel } from './components/EntryDetailPanel';
export { default as GridToolbar } from './components/GridToolbar';
export { default as HeatMapTab } from './components/HeatMapTab';
export { default as ImportCSVModal } from './components/ImportCSVModal';
export { default as PlanningGrid } from './components/PlanningGrid';
export { default as SubmitSuggestionForm } from './components/SubmitSuggestionForm';
export { default as TimelineView } from './components/TimelineView';
export { default as TripBlock } from './components/TripBlock';

// Hooks
export {
  useTripTypes,
  useItineraryVessels,
  useItineraryEntries,
  useCreateEntry,
  useUpdateEntry,
  useUpdateEntryVessels,
  useDeleteEntry,
} from './hooks/useItinerary';
export { useTripSuggestions } from './hooks/useTripSuggestions';

// Types
export type {
  ItineraryStatus,
  DivingLevel,
  SuggestionStatus,
  ViewMode,
  TripType,
  ItineraryEntry,
  EntryVessel,
  Vessel,
  CreateEntryInput,
} from './types';
export { STATUS_CONFIG } from './types';

// Types from useTripSuggestions
export type {
  Destination,
  GeocodingResult,
  TripSuggestion,
  SuggestionFormData,
  BrowseFilters,
} from './hooks/useTripSuggestions';

// Constants
export {
  INTEREST_TAGS,
  DIVING_LEVELS,
  DIVING_TYPES,
  REGIONS,
  AREAS,
  TRIP_CATEGORIES,
  DURATION_OPTIONS,
  ENTHUSIASM_LABELS,
  MONTH_LABELS,
  SUGGESTION_STATUSES,
} from './constants';
