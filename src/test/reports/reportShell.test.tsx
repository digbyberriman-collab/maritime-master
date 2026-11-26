/**
 * ReportShell (src/modules/reports/components/ReportShell.tsx) and the
 * report filters in the query string (lib/reportFilters.ts,
 * hooks/useReportFilters.ts); gap/02 R1, R19; D-88, D-X5-12:
 *
 * - filters round-trip through the URL: read with defaults for missing or
 *   unknown values, edited as a draft, written on Apply (Apply disabled
 *   until something changed), Reset back to the defaults, every other
 *   parameter (`?vessels=`, `?tab=`) kept;
 * - the header: back link to the hub (keeping the vessels shown), title,
 *   description, module chip, personal-data chip, one "Fleet · generated …
 *   UTC" stamp, Refresh;
 * - Switch report lists only the reports the reader may open and navigates;
 * - Export: disabled with a reason while the export access loads, when it is
 *   denied, until the data is ready and when there is nothing to export;
 *   once ready it runs the engine with the report's source key, the rows on
 *   screen and its personalData flag;
 * - ReportTable: a DataTable at 768 px and up, cards below; its loading,
 *   error and empty states.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

type Decision = { allowed: boolean; status: string; reason: string };
const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  wide: true,
  runExport: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/lib/permissions/adaptor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/permissions/adaptor')>()),
  resolveCapability: (key: string) => state.decide(key),
}));
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  runExport: (...args: unknown[]) => state.runExport(...args),
}));
vi.mock('@/shared/components/data/useMinWidth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/components/data/useMinWidth')>()),
  useMinWidth: () => state.wide,
}));

import { ReportShell, ReportTable, EXPORT_COPY, type ReportExportSpec } from '@/modules/reports/components/ReportShell';
import { useReportFilters } from '@/modules/reports/hooks/useReportFilters';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import {
  defaultReportFilters,
  readReportFilters,
  reportFilterLabel,
  reportFiltersAreDefault,
  sameReportFilters,
  writeReportFilters,
  type ReportFilterSpec,
} from '@/modules/reports/lib/reportFilters';
import { formatGeneratedStamp, formatUtcStamp } from '@/modules/reports/lib/reportStamp';

const SPECS: readonly ReportFilterSpec[] = [
  {
    key: 'show',
    label: 'Show',
    options: [
      { value: 'all', label: 'All vessels' },
      { value: 'findings', label: 'Vessels with findings' },
    ],
    defaultValue: 'all',
  },
  {
    key: 'area',
    label: 'Area',
    options: [
      { value: 'any', label: 'Any area' },
      { value: 'deck', label: 'Deck' },
    ],
    defaultValue: 'any',
  },
];

const VC = getReport('vessel-comparison', 'fleet') as ReportDefinition;
const PERSONAL: ReportDefinition = { ...VC, key: 'crew-test', title: 'Crew test', personalData: true };

type Row = { id: string; name: string };
const ROWS: Row[] = [
  { id: 'a', name: 'DRAAK' },
  { id: 'b', name: 'HYDRA' },
];
const SPEC: ReportExportSpec<Row> = { kind: 'Test report', columns: [{ key: 'name', header: 'Name', value: (r) => r.name }], rows: ROWS, params: { show: 'all' } };

function Location() {
  const loc = useLocation();
  return <output data-testid="location">{`${loc.pathname}${loc.search}`}</output>;
}

function Harness({
  definition = VC,
  exportSpec = SPEC,
  blocked = null,
  onRefresh,
}: {
  definition?: ReportDefinition;
  exportSpec?: ReportExportSpec<Row> | null;
  blocked?: string | null;
  onRefresh?: () => void;
}) {
  const filters = useReportFilters(SPECS);
  return (
    <ReportShell<Row>
      definition={definition}
      generatedAt={Date.UTC(2026, 10, 26, 14, 5)}
      onRefresh={onRefresh}
      vesselsParam="DRA,HYD"
      toolbar={<button type="button">Vessels shown</button>}
      toolbarLabel="Vessels"
      filters={filters}
      kpis={<p>KPI row</p>}
      exportSpec={exportSpec}
      exportBlockedReason={blocked}
    >
      <p data-testid="applied">{JSON.stringify(filters.applied)}</p>
    </ReportShell>
  );
}

function renderShell(url: string, props: Parameters<typeof Harness>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/fleet/reports/:reportKey" element={<Harness {...props} />} />
        <Route path="*" element={<p>Elsewhere</p>} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

const location = () => screen.getByTestId('location').textContent ?? '';

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.wide = true;
  state.runExport.mockReset();
});

async function choose(trigger: HTMLElement, option: string) {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const item = await screen.findByRole('option', { name: option });
  fireEvent.keyDown(item, { key: 'Enter' });
}

describe('report filters (pure)', () => {
  const params = (s: string) => new URLSearchParams(s);

  it('reads values from the URL, defaults for missing or unknown ones', () => {
    expect(readReportFilters(SPECS, params(''))).toEqual({ show: 'all', area: 'any' });
    expect(readReportFilters(SPECS, params('show=findings&area=deck'))).toEqual({ show: 'findings', area: 'deck' });
    expect(readReportFilters(SPECS, params('show=everything&area='))).toEqual({ show: 'all', area: 'any' });
    expect(defaultReportFilters(SPECS)).toEqual({ show: 'all', area: 'any' });
  });

  it('writes only values that differ from the default and keeps every other parameter', () => {
    const next = writeReportFilters(SPECS, { show: 'findings', area: 'any' }, params('vessels=DRA&area=deck&tab=safety'));
    expect(next.toString()).toBe('vessels=DRA&tab=safety&show=findings');
    expect(writeReportFilters(SPECS, { show: 'nonsense', area: 'deck' }, params('show=findings')).toString()).toBe('area=deck');
  });

  it('compares and labels values', () => {
    expect(sameReportFilters(SPECS, { show: 'all', area: 'any' }, { show: 'all', area: 'any' })).toBe(true);
    expect(sameReportFilters(SPECS, { show: 'all', area: 'any' }, { show: 'findings', area: 'any' })).toBe(false);
    expect(reportFiltersAreDefault(SPECS, { show: 'all', area: 'any' })).toBe(true);
    expect(reportFiltersAreDefault(SPECS, { show: 'all', area: 'deck' })).toBe(false);
    expect(reportFilterLabel(SPECS[0], 'findings')).toBe('Vessels with findings');
    expect(reportFilterLabel(SPECS[0], 'x')).toBe('x');
  });

  it('stamps in UTC, en-GB, 24 h (D-88)', () => {
    const at = Date.UTC(2026, 10, 26, 23, 5);
    expect(formatUtcStamp(at)).toBe('26 Nov 2026, 23:05 UTC');
    expect(formatGeneratedStamp('Fleet', at)).toBe('Fleet · generated 26 Nov 2026, 23:05 UTC');
  });
});

describe('ReportShell: filters in the URL', () => {
  it('opens on the URL filters, applies a draft on Apply and keeps the other parameters', async () => {
    renderShell('/fleet/reports/vessel-comparison?vessels=DRA&tab=safety&show=findings');
    expect(screen.getByTestId('applied')).toHaveTextContent('{"show":"findings","area":"any"}');
    const show = screen.getByLabelText('Show');
    expect(show).toHaveTextContent('Vessels with findings');
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    await choose(screen.getByLabelText('Area'), 'Deck');
    expect(apply).toBeEnabled();
    // The draft is not applied yet.
    expect(screen.getByTestId('applied')).toHaveTextContent('"area":"any"');
    expect(location()).not.toContain('area=deck');

    fireEvent.click(apply);
    await waitFor(() => expect(location()).toBe('/fleet/reports/vessel-comparison?vessels=DRA&tab=safety&show=findings&area=deck'));
    expect(screen.getByTestId('applied')).toHaveTextContent('{"show":"findings","area":"deck"}');
    expect(apply).toBeDisabled();
  });

  it('Reset goes back to every default and drops only the filter parameters', async () => {
    renderShell('/fleet/reports/vessel-comparison?vessels=DRA&show=findings&area=deck');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/vessel-comparison?vessels=DRA'));
    expect(screen.getByTestId('applied')).toHaveTextContent('{"show":"all","area":"any"}');
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('submitting the filter form (Enter) applies too', async () => {
    renderShell('/fleet/reports/vessel-comparison');
    await choose(screen.getByLabelText('Show'), 'Vessels with findings');
    fireEvent.submit(screen.getByRole('search', { name: 'Report filters' }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/vessel-comparison?show=findings'));
  });

  it('labels the toolbar and keeps it beside the filters', () => {
    renderShell('/fleet/reports/vessel-comparison');
    const bar = screen.getByRole('search', { name: 'Report filters' });
    expect(within(bar).getByText('Vessels')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Vessels shown' })).toBeInTheDocument();
  });
});

describe('ReportShell: header', () => {
  it('shows the back link with the vessels shown, the title, the chips and one UTC stamp', () => {
    const refresh = vi.fn();
    renderShell('/fleet/reports/vessel-comparison', { definition: PERSONAL, onRefresh: refresh });
    expect(screen.getByRole('link', { name: /All reports/ })).toHaveAttribute('href', '/fleet/reports?vessels=DRA%2CHYD');
    expect(screen.getByRole('heading', { level: 1, name: 'Crew test' })).toBeInTheDocument();
    expect(screen.getByText(VC.description)).toBeInTheDocument();
    expect(screen.getByText('Fleet', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText('Personal data')).toBeInTheDocument();
    expect(screen.getAllByTestId('report-generated')).toHaveLength(1);
    expect(screen.getByTestId('report-generated')).toHaveTextContent('Fleet · generated 26 Nov 2026, 14:05 UTC');
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('Switch report offers only the reports the reader may open, and opens the chosen one', async () => {
    state.decide = (key) => ({ allowed: key !== 'vessel.safety.capa.view', status: key === 'vessel.safety.capa.view' ? 'denied' : 'granted', reason: '' });
    renderShell('/fleet/reports/vessel-comparison');
    const trigger = screen.getByRole('combobox', { name: 'Switch report' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['Vessel comparison', 'Incident analytics', 'Drill analytics', 'Risk overview']);
    fireEvent.keyDown(screen.getByRole('option', { name: 'Drill analytics' }), { key: 'Enter' });
    await waitFor(() => expect(location()).toBe('/fleet/reports/drill-analytics'));
  });

  it('hides Switch report while the access loads', () => {
    state.decide = (key) => (key === 'fleet.operations.fleet_reports.view' || key.startsWith('vessel.') ? { allowed: false, status: 'loading', reason: '' } : { allowed: true, status: 'granted', reason: '' });
    renderShell('/fleet/reports/vessel-comparison');
    expect(screen.queryByRole('combobox', { name: 'Switch report' })).toBeNull();
  });
});

describe('ReportShell: export', () => {
  const trigger = () => screen.getByRole('button', { name: /Export/ });

  it('is disabled with a reason while the export access loads, and when it is denied', () => {
    state.decide = (key) =>
      key === 'fleet.operations.fleet_reports.export' ? { allowed: false, status: 'loading', reason: '' } : { allowed: true, status: 'granted', reason: '' };
    const view = renderShell('/fleet/reports/vessel-comparison');
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    expect(trigger()).toHaveAccessibleDescription(EXPORT_COPY.checking);
    view.unmount();
    state.decide = (key) =>
      key === 'fleet.operations.fleet_reports.export' ? { allowed: false, status: 'denied', reason: '' } : { allowed: true, status: 'granted', reason: '' };
    renderShell('/fleet/reports/vessel-comparison');
    expect(trigger()).toHaveAccessibleDescription(EXPORT_COPY.denied);
  });

  it('is disabled until the data is ready, with the report’s own reason, and when nothing is shown', () => {
    const a = renderShell('/fleet/reports/vessel-comparison', { exportSpec: null });
    expect(trigger()).toHaveAccessibleDescription(EXPORT_COPY.loading);
    a.unmount();
    const b = renderShell('/fleet/reports/vessel-comparison', { exportSpec: null, blocked: 'This report is not set up yet.' });
    expect(trigger()).toHaveAccessibleDescription('This report is not set up yet.');
    b.unmount();
    renderShell('/fleet/reports/vessel-comparison', { exportSpec: { ...SPEC, rows: [] } });
    expect(trigger()).toHaveAccessibleDescription(EXPORT_COPY.empty);
    fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: false });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(state.runExport).not.toHaveBeenCalled();
  });

  it('once ready, runs the engine with the source key, the rows on screen and personalData', async () => {
    state.runExport.mockResolvedValue({ status: 'ok', value: { fileName: 'FLEET_Test_2026-11-26.csv', rowCount: 2, logged: true, jobId: 'j1' } });
    renderShell('/fleet/reports/vessel-comparison', { definition: PERSONAL });
    expect(trigger()).not.toHaveAttribute('aria-disabled');
    fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: false });
    await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['CSV', 'Excel (.xlsx)', 'PDF']);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'CSV' }));
    });
    await waitFor(() => expect(state.runExport).toHaveBeenCalledTimes(1));
    expect(state.runExport.mock.calls[0][0]).toMatchObject({
      format: 'csv',
      kind: 'Test report',
      title: 'Crew test',
      sourceKey: 'reports.crew-test',
      personalData: true,
      rows: ROWS,
      params: { show: 'all' },
    });
  });

  it('offers no export menu for a report without exporters', () => {
    renderShell('/fleet/reports/vessel-comparison', { definition: { ...VC, exporters: [] } });
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
  });
});

describe('ReportTable', () => {
  const columns = [{ id: 'name', header: 'Name', value: (r: Row) => r.name }];
  const renderTable = (props: Partial<Parameters<typeof ReportTable<Row>>[0]> = {}) =>
    render(
      <ReportTable<Row>
        label="Things"
        noun={{ one: 'thing', other: 'things' }}
        rows={ROWS}
        columns={columns}
        getRowId={(r) => r.id}
        renderCard={(r) => <p>Card {r.name}</p>}
        {...props}
      />,
    );

  it('is a table at 768 px and up', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Things' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByText('Card DRAAK')).toBeNull();
  });

  it('folds into cards below 768 px, with its loading, error and empty states', () => {
    state.wide = false;
    const a = renderTable();
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'Things' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Card DRAAK', 'Card HYDRA']);
    a.unmount();
    const b = renderTable({ isLoading: true });
    expect(screen.getByRole('list', { name: 'Loading things' })).toHaveAttribute('aria-busy', 'true');
    b.unmount();
    const retry = vi.fn();
    const c = renderTable({ error: new Error('boom'), onRetry: retry });
    expect(screen.getByText('Things could not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(retry).toHaveBeenCalled();
    c.unmount();
    const clear = vi.fn();
    const d = renderTable({ rows: [], hasExternalFilters: true, onClearFilters: clear });
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(clear).toHaveBeenCalled();
    d.unmount();
    renderTable({ rows: [], empty: { title: 'No vessels to compare' } });
    expect(screen.getByText('No vessels to compare')).toBeInTheDocument();
  });
});
