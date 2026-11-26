/**
 * A report's filters, bound to the query string (gap/02 R1): the applied
 * values are the URL's (`readReportFilters`), the controls edit a draft, and
 * Apply writes the draft to the URL (replacing the entry, so filtering does
 * not fill the history). The report reads `applied`, so it is read once per
 * applied change. A URL change from elsewhere (Back, a shared link, Reset)
 * resets the draft to it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  defaultReportFilters,
  readReportFilters,
  reportFiltersAreDefault,
  sameReportFilters,
  writeReportFilters,
  type ReportFilterSpec,
  type ReportFilterValues,
} from '../lib/reportFilters';

export interface ReportFiltersController {
  specs: readonly ReportFilterSpec[];
  /** The values in the URL: what the report shows. */
  applied: ReportFilterValues;
  /** The values in the controls. */
  draft: ReportFilterValues;
  setDraft: (key: string, value: string) => void;
  /** Writes the draft to the URL. */
  apply: () => void;
  /** Back to every default (URL and draft). */
  reset: () => void;
  /** The draft differs from the applied values. */
  dirty: boolean;
  /** The applied values are every default. */
  isDefault: boolean;
}

export function useReportFilters(specs: readonly ReportFilterSpec[]): ReportFiltersController {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const applied = useMemo(() => readReportFilters(specs, new URLSearchParams(search)), [specs, search]);
  const [draft, setDraftState] = useState<ReportFilterValues>(applied);

  useEffect(() => {
    setDraftState(applied);
  }, [applied]);

  const setDraft = useCallback((key: string, value: string) => {
    setDraftState((current) => ({ ...current, [key]: value }));
  }, []);

  const apply = useCallback(() => {
    setParams((current) => writeReportFilters(specs, draft, current), { replace: true });
  }, [setParams, specs, draft]);

  const reset = useCallback(() => {
    const defaults = defaultReportFilters(specs);
    setDraftState(defaults);
    setParams((current) => writeReportFilters(specs, defaults, current), { replace: true });
  }, [setParams, specs]);

  return {
    specs,
    applied,
    draft,
    setDraft,
    apply,
    reset,
    dirty: !sameReportFilters(specs, draft, applied),
    isDefault: reportFiltersAreDefault(specs, applied),
  };
}
