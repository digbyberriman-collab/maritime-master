import { create } from 'zustand';
import type { RowSelectionState } from '@tanstack/react-table';

interface CrewSelectionState {
  rowSelection: RowSelectionState;
  setRowSelection: (s: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => void;
  clear: () => void;
}

export const useCrewSelection = create<CrewSelectionState>((set) => ({
  rowSelection: {},
  setRowSelection: (s) => set((state) => ({
    rowSelection: typeof s === 'function' ? s(state.rowSelection) : s,
  })),
  clear: () => set({ rowSelection: {} }),
}));

export const useSelectedCrewIds = (): string[] => {
  const sel = useCrewSelection((s) => s.rowSelection);
  return Object.entries(sel)
    .filter(([, v]) => v)
    .map(([k]) => k);
};
