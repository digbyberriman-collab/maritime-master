/**
 * Report filters in the query string (gap/02 R1; MASTER-PROMPT §4). Pure.
 *
 * A report declares its filters once (`ReportFilterSpec`: a key, a label,
 * the allowed values and a default). The URL holds only the values that
 * differ from their defaults, so a report opened without parameters is the
 * default view and a shared link opens the same filters. Values the spec
 * does not allow (a hand-edited or stale link) read as the default, never as
 * an error. Every other parameter (the "Vessels shown" `?vessels=`, a
 * report's own view parameters) is kept untouched.
 *
 * The shell edits a draft and writes it on Apply (ReportShell), so a report
 * is read once per applied change, not once per click.
 */

export interface ReportFilterOption {
  value: string;
  label: string;
}

export interface ReportFilterSpec {
  /** The query-string key (kebab or snake case, unique within the report). */
  key: string;
  label: string;
  options: readonly ReportFilterOption[];
  /** Must be one of `options`. */
  defaultValue: string;
}

export type ReportFilterValues = Readonly<Record<string, string>>;

const allowed = (spec: ReportFilterSpec, value: string | null | undefined): value is string =>
  typeof value === 'string' && spec.options.some((o) => o.value === value);

/** The defaults of every filter. */
export function defaultReportFilters(specs: readonly ReportFilterSpec[]): ReportFilterValues {
  return Object.fromEntries(specs.map((s) => [s.key, s.defaultValue]));
}

/** The filter values a URL carries; a missing or unknown value is the default. */
export function readReportFilters(specs: readonly ReportFilterSpec[], params: URLSearchParams): ReportFilterValues {
  return Object.fromEntries(specs.map((s) => {
    const value = params.get(s.key);
    return [s.key, allowed(s, value) ? value : s.defaultValue];
  }));
}

/**
 * The URL parameters with these filter values: a default value (or one the
 * spec does not allow) is removed, any other is set; parameters that are not
 * filters are kept as they are. Returns a new object.
 */
export function writeReportFilters(
  specs: readonly ReportFilterSpec[],
  values: ReportFilterValues,
  params: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const spec of specs) {
    const value = values[spec.key];
    if (!allowed(spec, value) || value === spec.defaultValue) next.delete(spec.key);
    else next.set(spec.key, value);
  }
  return next;
}

/** Whether two sets of values are the same for these filters. */
export function sameReportFilters(specs: readonly ReportFilterSpec[], a: ReportFilterValues, b: ReportFilterValues): boolean {
  return specs.every((s) => a[s.key] === b[s.key]);
}

/** Whether every filter is at its default. */
export function reportFiltersAreDefault(specs: readonly ReportFilterSpec[], values: ReportFilterValues): boolean {
  return specs.every((s) => values[s.key] === s.defaultValue);
}

/** The label of a filter's value (for summaries and the export's About sheet). */
export function reportFilterLabel(spec: ReportFilterSpec, value: string): string {
  return spec.options.find((o) => o.value === value)?.label ?? value;
}
