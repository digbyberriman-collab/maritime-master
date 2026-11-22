/**
 * Look a record up by its reference while the query looks like one (C21:
 * `PTW-DRA-2026-061`). Phase 1 has no provider, so every search settles with
 * no match and the palette says so; it never shows an invented record.
 */
import { useEffect, useState } from 'react';
import { looksLikeRecordReference, searchRecordReferences } from './recordReferences';
import type { RecordReferenceMatch, RecordReferenceProvider } from './types';

export type RecordSearchState =
  | { status: 'idle' }
  | { status: 'searching'; query: string }
  | { status: 'done'; query: string; matches: readonly RecordReferenceMatch[] };

/** Keystrokes inside this window cancel the previous lookup. */
export const RECORD_SEARCH_DEBOUNCE_MS = 150;

export function useRecordSearch(query: string, providers?: readonly RecordReferenceProvider[]): RecordSearchState {
  const reference = looksLikeRecordReference(query) ? query.trim() : '';
  const [state, setState] = useState<RecordSearchState>({ status: 'idle' });

  useEffect(() => {
    if (!reference) {
      setState({ status: 'idle' });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: 'searching', query: reference });
    const timer = window.setTimeout(() => {
      searchRecordReferences(reference, controller.signal, providers)
        .then((matches) => {
          if (!controller.signal.aborted) setState({ status: 'done', query: reference, matches });
        })
        .catch(() => {
          // A failed lookup is not a result.
          if (!controller.signal.aborted) setState({ status: 'done', query: reference, matches: [] });
        });
    }, RECORD_SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [reference, providers]);

  // A state left from an earlier query never shows under a new one.
  if (!reference) return { status: 'idle' };
  if (state.status !== 'idle' && state.query === reference) return state;
  return { status: 'searching', query: reference };
}
