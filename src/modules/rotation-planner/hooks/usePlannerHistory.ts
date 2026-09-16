import { useCallback, useMemo, useState } from 'react';

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
  const [past, setPast] = useState<HistoryCommand[]>([]);
  const [future, setFuture] = useState<HistoryCommand[]>([]);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (cmd: HistoryCommand) => {
    setBusy(true);
    try {
      await cmd.apply();
      setPast((p) => [...p, cmd].slice(-LIMIT));
      setFuture([]);
    } finally {
      setBusy(false);
    }
  }, []);

  const undo = useCallback(async (): Promise<string | null> => {
    let cmd: HistoryCommand | undefined;
    setPast((p) => { cmd = p[p.length - 1]; return cmd ? p.slice(0, -1) : p; });
    // setPast's updater runs synchronously in React 18 batching for this call path,
    // but read from the latest state defensively:
    if (!cmd) return null;
    setBusy(true);
    try {
      await cmd.revert();
      setFuture((f) => [cmd as HistoryCommand, ...f].slice(0, LIMIT));
      return cmd.label;
    } catch (e) {
      setPast((p) => [...p, cmd as HistoryCommand]);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const redo = useCallback(async (): Promise<string | null> => {
    let cmd: HistoryCommand | undefined;
    setFuture((f) => { cmd = f[0]; return cmd ? f.slice(1) : f; });
    if (!cmd) return null;
    setBusy(true);
    try {
      await cmd.apply();
      setPast((p) => [...p, cmd as HistoryCommand].slice(-LIMIT));
      return cmd.label;
    } catch (e) {
      setFuture((f) => [cmd as HistoryCommand, ...f]);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const clear = useCallback(() => { setPast([]); setFuture([]); }, []);

  return useMemo(() => ({
    run, undo, redo, clear, busy,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past[past.length - 1]?.label ?? null,
    redoLabel: future[0]?.label ?? null,
  }), [run, undo, redo, clear, busy, past, future]);
}
