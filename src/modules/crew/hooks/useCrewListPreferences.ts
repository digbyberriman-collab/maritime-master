import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ColumnSizingState, SortingState, VisibilityState } from '@tanstack/react-table';

export type CrewDisplayMode = 'table' | 'card' | 'compact' | 'muster';

export type CrewQuickFilter =
  | 'onboard'
  | 'on_leave'
  | 'cert_expiring'
  | 'medical_expiring'
  | 'no_assignment'
  | 'contract_ending';

export interface CrewAdvancedFilters {
  ranks: string[];
  departments: string[];
  vessels: string[];
  nationalities: string[];
  accountStatuses: string[];
  certStatuses: string[];
  medicalStatuses: string[];
  contractEndFrom?: string;
  contractEndTo?: string;
}

const emptyAdvancedFilters: CrewAdvancedFilters = {
  ranks: [],
  departments: [],
  vessels: [],
  nationalities: [],
  accountStatuses: [],
  certStatuses: [],
  medicalStatuses: [],
};

export interface CrewListPreferencesState {
  displayMode: CrewDisplayMode;
  columnVisibility: VisibilityState;
  columnOrder: string[];
  columnSizing: ColumnSizingState;
  sorting: SortingState;
  activeQuickFilters: CrewQuickFilter[];
  advancedFilters: CrewAdvancedFilters;
  recentSearches: string[];
  setDisplayMode: (mode: CrewDisplayMode) => void;
  setColumnVisibility: (v: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => void;
  setColumnOrder: (order: string[]) => void;
  setColumnSizing: (s: ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState)) => void;
  setSorting: (s: SortingState | ((prev: SortingState) => SortingState)) => void;
  toggleQuickFilter: (f: CrewQuickFilter) => void;
  clearQuickFilters: () => void;
  setAdvancedFilters: (f: Partial<CrewAdvancedFilters>) => void;
  clearAdvancedFilters: () => void;
  pushRecentSearch: (q: string) => void;
  resetAll: () => void;
}

const defaultState = {
  displayMode: 'table' as CrewDisplayMode,
  columnVisibility: {} as VisibilityState,
  columnOrder: [] as string[],
  columnSizing: {} as ColumnSizingState,
  sorting: [] as SortingState,
  activeQuickFilters: [] as CrewQuickFilter[],
  advancedFilters: emptyAdvancedFilters,
  recentSearches: [] as string[],
};

const STORAGE_KEY_PREFIX = 'mm.crewList.prefs.v1';

export const useCrewListPreferences = create<CrewListPreferencesState>()(
  persist(
    (set) => ({
      ...defaultState,
      setDisplayMode: (displayMode) => set({ displayMode }),
      setColumnVisibility: (v) => set((s) => ({
        columnVisibility: typeof v === 'function' ? v(s.columnVisibility) : v,
      })),
      setColumnOrder: (columnOrder) => set({ columnOrder }),
      setColumnSizing: (s2) => set((s) => ({
        columnSizing: typeof s2 === 'function' ? s2(s.columnSizing) : s2,
      })),
      setSorting: (s2) => set((s) => ({
        sorting: typeof s2 === 'function' ? s2(s.sorting) : s2,
      })),
      toggleQuickFilter: (f) => set((s) => ({
        activeQuickFilters: s.activeQuickFilters.includes(f)
          ? s.activeQuickFilters.filter((x) => x !== f)
          : [...s.activeQuickFilters, f],
      })),
      clearQuickFilters: () => set({ activeQuickFilters: [] }),
      setAdvancedFilters: (f) => set((s) => ({
        advancedFilters: { ...s.advancedFilters, ...f },
      })),
      clearAdvancedFilters: () => set({ advancedFilters: emptyAdvancedFilters }),
      pushRecentSearch: (q) => set((s) => {
        const trimmed = q.trim();
        if (!trimmed) return {};
        const next = [trimmed, ...s.recentSearches.filter((r) => r !== trimmed)].slice(0, 8);
        return { recentSearches: next };
      }),
      resetAll: () => set(defaultState),
    }),
    {
      name: STORAGE_KEY_PREFIX,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        displayMode: state.displayMode,
        columnVisibility: state.columnVisibility,
        columnOrder: state.columnOrder,
        columnSizing: state.columnSizing,
        sorting: state.sorting,
        activeQuickFilters: state.activeQuickFilters,
        advancedFilters: state.advancedFilters,
        recentSearches: state.recentSearches,
      }),
    }
  )
);

// Strip unknown column ids on hydration. Call from list page mount with the
// live set of known column ids to keep TanStack Table state in sync with the
// current column definitions across releases.
export const reconcileColumnIds = (knownIds: string[]) => {
  const { columnVisibility, columnOrder, columnSizing, setColumnVisibility, setColumnOrder, setColumnSizing } =
    useCrewListPreferences.getState();
  const known = new Set(knownIds);

  const nextVisibility: VisibilityState = {};
  for (const id of Object.keys(columnVisibility)) {
    if (known.has(id)) nextVisibility[id] = columnVisibility[id]!;
  }
  if (Object.keys(nextVisibility).length !== Object.keys(columnVisibility).length) {
    setColumnVisibility(nextVisibility);
  }

  const nextOrder = columnOrder.filter((id) => known.has(id));
  if (nextOrder.length !== columnOrder.length) setColumnOrder(nextOrder);

  const nextSizing: ColumnSizingState = {};
  for (const id of Object.keys(columnSizing)) {
    if (known.has(id)) nextSizing[id] = columnSizing[id]!;
  }
  if (Object.keys(nextSizing).length !== Object.keys(columnSizing).length) {
    setColumnSizing(nextSizing);
  }
};
