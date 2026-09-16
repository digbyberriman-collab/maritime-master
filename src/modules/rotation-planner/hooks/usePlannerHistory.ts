import { useCallback, useMemo, useRef, useState } from 'react';

export interface HistoryCommand {
  label: string;
  /** Applies the change. Called on the first run and again on redo. */
  apply: () => Promise<void>;
  /** Reverts the change. */
  revert: () => Promise<void>;
}

const LIMIT = 60;

/**
 * Command-stack undo/redo for the planner. Every mutation is pushed as a
 * command carrying its own inverse, so undo works across creates, edits,
 * deletes, moves and pastes — including multi-block operations.
 */
export function usePlannerHistory() {
  const past = useRef<HistoryCommand[]>([]);
  const future = useRef<HistoryCommand[]>([]);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const touch = useCallback(() => bump((n) => n + 1), []);

  const run = useCallback(async (cmd: HistoryCommand) => {
    setBusy(true);
    try {
      await cmd.apply();
      past.current = [...past.current, cmd].slice(-LIMIT);
      future.current = [];
      touch();
    } finally {
      setBusy(false);
    }
  }, [touch]);

  const undo = useCallback(async (): Promise<string | null> => {
    const cmd = past.current[past.current.length - 1];
    if (!cmd) return null;
    setBusy(true);
    try {
      await cmd.revert();
      past.current = past.current.slice(0, -1);
      future.current = [cmd, ...future.current].slice(0, LIMIT);
      touch();
      return cmd.label;
    } finally {
      setBusy(false);
    }
  }, [touch]);

  const redo = useCallback(async (): Promise<string | null> => {
    const cmd = future.current[0];
    if (!cmd) return null;
    setBusy(true);
    try {
      await cmd.apply();
      future.current = future.current.slice(1);
      past.current = [...past.current, cmd].slice(-LIMIT);
      touch();
      return cmd.label;
    } finally {
      setBusy(false);
    }
  }, [touch]);

  const clear = useCallback(() => {
    past.current = [];
    future.current = [];
    touch();
  }, [touch]);

  return useMemo(() => ({
    run, undo, redo, clear, busy,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undoLabel: past.current[past.current.length - 1]?.label ?? null,
    redoLabel: future.current[0]?.label ?? null,
  }), [run, undo, redo, clear, busy]);
}
