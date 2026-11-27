/**
 * Hours of rest (gap/02 R9, T-292, T-248; X5-10A, agreement 6;
 * src/modules/reports/reports/HoursOfRestReport.tsx, lib/crewReports.ts,
 * hooks/useCrewReports.ts):
 *
 * - pure: the period presets (last 7 / 30 / 90 days, this month, last
 *   month across a year end, 12 months within 366 days); the heat-map
 *   grain (days, weeks, months) and its cells (not covered, no entries, a
 *   value with its level and serious part); the legend gives every glyph a
 *   text (never colour alone); the Show filter; the rate;
 * - the page: one read of `fleet_report_hours_of_rest` with the period from
 *   the URL (`?period=`; the default 30 days), the vessels shown (NULL for
 *   the default); the KPI tiles, the rule in words, "Not covered"; the heat
 *   map with its legend text and cell labels; Show from the URL changes
 *   the table and what the heat map counts; Apply writes the filters to
 *   the URL; repeat breaches; not set up (D-01); the period refusal in
 *   words; totals NULL = "Not covered", never zeros; cards below 768 px.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  shown: null as unknown,
  wide: true,
  answers: {} as Record<string, Answer | (() => Answer)>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('@/integrations/supabase/client', () => {
  state.rpc = vi.fn((fn: string) => {
    const answer = state.answers[fn];
    const value = typeof answer === 'function' ? answer() : answer;
    return Promise.resolve(value ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } });
  });
  return { supabase: { rpc: state.rpc } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/lib/permissions/adaptor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/permissions/adaptor')>()),
  resolveCapability: (key: string) => state.decide(key),
}));
vi.mock('@/shared/components/data/useMinWidth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/components/data/useMinWidth')>()),
  useMinWidth: () => state.wide,
}));
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => state.shown,
  FleetVesselsFilter: () => <button type="button">Vessels shown</button>,
}));

import HoursOfRestReport from '@/modules/reports/reports/HoursOfRestReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import {
  HOR_SOURCE_TEXT,
  addDays,
  heatCell,
  heatColumns,
  heatLegend,
  horPeriodRange,
  horVesselRows,
  indexHeat,
  rateText,
} from '@/modules/reports/lib/crewReports';
import { PERIOD_TOO_LONG_MESSAGE } from '@/modules/reports/hooks/useCrewReports';
import { todayDateOnly } from '@/shared/lib/form';
import type { FleetReportHoursOfRestJson, HoursOfRestVesselRow } from '@/modules/reports/types/db.pending';

const DEF = getReport('hours-of-rest', 'fleet') as ReportDefinition;
const TODAY = todayDateOnly();

function vesselRow(id: string, name: string, code: string, overrides: Partial<HoursOfRestVesselRow> = {}): HoursOfRestVesselRow {
  return {
    vessel_id: id,
    vessel_name: name,
    vessel_code: code,
    state: 'ok',
    crew_logging: 2,
    crew_days: 8,
    breach_days: 3,
    serious_days: 1,
    unreviewed: 2,
    months_not_submitted: 1,
    rate_per_100: 37.5,
    last_entry: addDays(TODAY, -2),
    ...overrides,
  };
}

const NOT_COVERED_ROW = { crew_logging: null, crew_days: null, breach_days: null, serious_days: null, unreviewed: null, months_not_submitted: null, rate_per_100: null, last_entry: null };

const PER_VESSEL: HoursOfRestVesselRow[] = [
  vesselRow('v-gam', 'GAME CHANGER', 'GAM', { state: 'module_off', ...NOT_COVERED_ROW }),
  vesselRow('v-hyd', 'HYDRA', 'HYD', { crew_logging: 1, crew_days: 3, breach_days: 2, serious_days: 0, unreviewed: 2, months_not_submitted: 0, rate_per_100: 66.7, last_entry: addDays(TODAY, -4) }),
  vesselRow('v-dra', 'DRAAK', 'DRA'),
  vesselRow('v-dag', 'DAGON', 'DAG', { crew_logging: 0, crew_days: 0, breach_days: 0, serious_days: 0, unreviewed: 0, months_not_submitted: 0, rate_per_100: null, last_entry: null }),
];

function answer(overrides: Partial<FleetReportHoursOfRestJson> = {}): FleetReportHoursOfRestJson {
  const range = horPeriodRange('last-30', TODAY);
  return {
    vessels: 4,
    from: range.from,
    to: range.to,
    today: TODAY,
    source: 'breach_review',
    totals: { vessels_covered: 3, vessels_logging: 2, crew_days: 11, breach_days: 5, serious_days: 1, unreviewed: 4, months_not_submitted: 1, rate_per_100: 45.5 },
    per_vessel: PER_VESSEL,
    heat: [
      { vessel_id: 'v-dra', day: addDays(TODAY, -4), logged: 2, breaches: 2, serious: 1, unreviewed: 2 },
      { vessel_id: 'v-dra', day: addDays(TODAY, -3), logged: 2, breaches: 1, serious: 0, unreviewed: 0 },
      { vessel_id: 'v-dra', day: addDays(TODAY, -6), logged: 1, breaches: 0, serious: 0, unreviewed: 0 },
      { vessel_id: 'v-hyd', day: addDays(TODAY, -6), logged: 1, breaches: 1, serious: 0, unreviewed: 1 },
    ],
    emerging: {
      total: 3,
      rows: [
        { profile_id: 'p-bosun', person_name: 'Demo Bosun', position: 'Bosun', vessel_id: 'v-dra', breach_days: 2, serious_days: 1, unreviewed: 1, last_breach: addDays(TODAY, -3) },
        { profile_id: 'p-eng', person_name: 'Demo Engineer', position: 'Engineer', vessel_id: 'v-hyd', breach_days: 2, serious_days: 0, unreviewed: 2, last_breach: addDays(TODAY, -5) },
      ],
    },
    ...overrides,
  };
}

function shownReady(overrides: Record<string, unknown> = {}) {
  const vessels = PER_VESSEL.map((v) => ({ id: v.vessel_id, name: v.vessel_name, code: v.vessel_code }));
  const ids = vessels.map((v) => v.id);
  return {
    status: 'ready',
    companyId: 'co-1',
    vessels,
    shownIds: ids,
    shownVessels: vessels,
    countedIds: ids,
    isDefault: true,
    source: 'default',
    droppedCodes: [],
    fleetGroups: [],
    scope: { companyId: 'co-1', vesselIds: ids },
    setShown: vi.fn(),
    showAll: vi.fn(),
    ...overrides,
  };
}

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function renderReport(url = '/fleet/reports/hours-of-rest') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/fleet/reports/:reportKey"
            element={
              <>
                <HoursOfRestReport definition={DEF} />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const callsOf = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);
const vesselTable = () => screen.getByRole('table', { name: 'Hours of rest by vessel' });
const vesselRows = () => within(vesselTable()).getAllByRole('row').slice(1);

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.shown = null;
  state.wide = true;
  state.answers = {};
  state.rpc.mockClear();
});

describe('hours of rest (pure)', () => {
  it('turns each period preset into inclusive days, never more than 366', () => {
    expect(horPeriodRange('last-7', '2026-11-27')).toEqual({ from: '2026-11-21', to: '2026-11-27' });
    expect(horPeriodRange('last-30', '2026-11-27')).toEqual({ from: '2026-10-29', to: '2026-11-27' });
    expect(horPeriodRange('last-90', '2026-11-27')).toEqual({ from: '2026-08-30', to: '2026-11-27' });
    expect(horPeriodRange('this-month', '2026-11-27')).toEqual({ from: '2026-11-01', to: '2026-11-27' });
    expect(horPeriodRange('last-month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(horPeriodRange('last-month', '2024-03-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(horPeriodRange('last-12-months', '2026-11-27')).toEqual({ from: '2025-11-28', to: '2026-11-27' });
    expect(horPeriodRange('nonsense', '2026-11-27')).toEqual(horPeriodRange('last-30', '2026-11-27'));
  });

  it('draws days up to five weeks, weeks up to four months, months beyond', () => {
    const days = heatColumns('2026-10-29', '2026-11-27');
    expect(days.grain).toBe('day');
    expect(days.columns).toHaveLength(30);
    expect(days.columns[0]).toMatchObject({ id: '2026-10-29', label: '29', sublabel: 'Oct' });
    expect(days.columns.find((c) => c.id === '2026-11-01')).toMatchObject({ label: '1', sublabel: 'Nov' });
    const weeks = heatColumns('2026-08-30', '2026-11-27');
    expect(weeks.grain).toBe('week');
    expect(weeks.columns.at(-1)).toMatchObject({ from: '2026-11-21', to: '2026-11-27' });
    expect(weeks.columns[0].from).toBe('2026-08-30');
    const total = weeks.columns.reduce((sum, c) => sum + (Date.parse(c.to) - Date.parse(c.from)) / 86_400_000 + 1, 0);
    expect(total).toBe(90);
    const months = heatColumns('2025-11-28', '2026-11-27');
    expect(months.grain).toBe('month');
    expect(months.columns).toHaveLength(13);
    expect(months.columns[0]).toMatchObject({ from: '2025-11-28', to: '2025-11-30', label: 'Nov' });
    expect(months.columns.at(-1)).toMatchObject({ from: '2026-11-01', to: '2026-11-27' });
  });

  it('fills a cell: not covered, no entries, or the count with its level and serious part', () => {
    const index = indexHeat(answer().heat);
    const dra = PER_VESSEL[2];
    const day = (off: number) => ({ from: addDays(TODAY, -off), to: addDays(TODAY, -off) });
    expect(heatCell(index, PER_VESSEL[0], day(4), 'breaches', 'day')).toEqual({ kind: 'not_covered' });
    expect(heatCell(index, dra, day(1), 'breaches', 'day')).toEqual({ kind: 'no_entries' });
    expect(heatCell(index, dra, day(6), 'breaches', 'day')).toEqual({ kind: 'value', value: 0, serious: 0, logged: 1, level: 'none' });
    expect(heatCell(index, dra, day(4), 'breaches', 'day')).toEqual({ kind: 'value', value: 2, serious: 1, logged: 2, level: 'few' });
    expect(heatCell(index, dra, day(4), 'serious', 'day')).toMatchObject({ value: 1 });
    expect(heatCell(index, dra, { from: addDays(TODAY, -6), to: TODAY }, 'breaches', 'day')).toMatchObject({ value: 3, level: 'many' });
    expect(heatCell(index, dra, { from: addDays(TODAY, -6), to: TODAY }, 'breaches', 'week')).toMatchObject({ value: 3, level: 'few' });
  });

  it('gives every legend glyph a text, so the map never relies on colour alone', () => {
    const day = heatLegend('day', 'breaches');
    expect(day.map((i) => [i.glyph, i.label])).toEqual([
      ['·', 'No entries'],
      ['0', 'Logged, no breach'],
      ['1', '1 to 2 crew in breach a day'],
      ['3+', '3 or more crew in breach a day'],
      ['!', 'Includes a serious breach'],
      ['–', 'Not covered'],
    ]);
    expect(heatLegend('week', 'unreviewed').map((i) => i.label)).toContain('5 or more unreviewed breaches a week');
    expect(heatLegend('month', 'serious').some((i) => i.key === 'serious')).toBe(false);
  });

  it('keeps the vessels the Show filter asks for', () => {
    expect(horVesselRows(PER_VESSEL, 'all')).toHaveLength(4);
    expect(horVesselRows(PER_VESSEL, 'breaches').map((r) => r.vessel_code)).toEqual(['HYD', 'DRA']);
    expect(horVesselRows(PER_VESSEL, 'serious').map((r) => r.vessel_code)).toEqual(['DRA']);
    expect(horVesselRows(PER_VESSEL, 'unreviewed').map((r) => r.vessel_code)).toEqual(['HYD', 'DRA']);
    expect(horVesselRows(PER_VESSEL, 'not-submitted').map((r) => r.vessel_code)).toEqual(['DRA']);
    expect(horVesselRows(PER_VESSEL, 'not-logging').map((r) => r.vessel_code)).toEqual(['DAG']);
    expect(rateText(45.45)).toBe('45.5');
    expect(rateText(null)).toBeNull();
  });
});

describe('Hours of rest page', () => {
  it('reads once for the last 30 days and the default vessels (NULL)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table', { name: 'Hours of rest by vessel' });
    const range = horPeriodRange('last-30', TODAY);
    expect(callsOf('fleet_report_hours_of_rest')).toEqual([{ p_vessel_ids: null, p_from: range.from, p_to: range.to, p_today: TODAY }]);
  });

  it('reads the period in the URL', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: answer(), error: null } };
    renderReport('/fleet/reports/hours-of-rest?period=last-7');
    await screen.findByRole('table', { name: 'Hours of rest by vessel' });
    expect(callsOf('fleet_report_hours_of_rest')[0]).toMatchObject({ p_from: addDays(TODAY, -6), p_to: TODAY });
  });

  it('shows the KPI tiles, the rule in words and what is not covered', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: answer(), error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Hours of rest summary' });
    await within(summary).findByText('45.5');
    expect(within(summary).getByText('Unreviewed breaches')).toBeInTheDocument();
    expect(within(summary).getByText('5 breach days in all')).toBeInTheDocument();
    expect(within(summary).getByText('of 3 covered')).toBeInTheDocument();
    expect(within(summary).getByText(HOR_SOURCE_TEXT.breach_review)).toBeInTheDocument();
    expect(within(summary).getByText(/GAME CHANGER \(Hours of rest is switched off on this vessel\)/)).toBeInTheDocument();
  });

  it('draws the heat map with a legend in words and a label on every cell', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: answer(), error: null } };
    renderReport();
    expect(await screen.findByRole('heading', { name: 'Crew in breach by day' })).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Heat map legend' });
    for (const text of ['No entries', 'Logged, no breach', '1 to 2 crew in breach a day', '3 or more crew in breach a day', 'Includes a serious breach', 'Not covered']) {
      expect(within(legend).getByText(text)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/: 2 crew in breach, 1 serious; 2 crew-days logged$/).length).toBe(1);
    expect(screen.getAllByText(/^GAME CHANGER, .*: not covered$/).length).toBeGreaterThan(0);
  });

  it('per vessel: the numbers, "–" where not covered (never 0), and links to the vessel', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table', { name: 'Hours of rest by vessel' });
    await waitFor(() => expect(vesselRows()).toHaveLength(4));
    const gam = vesselRows()[0];
    expect(within(gam).queryByText('0')).toBeNull();
    expect(within(vesselRows()[2]).getByRole('link', { name: 'DRAAK' })).toHaveAttribute('href', '/v/dra/crew/hours-of-rest');
    expect(within(vesselRows()[2]).getByText('37.5')).toBeInTheDocument();
  });

  it('applies Show from the URL to the table and to what the heat map counts', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: answer(), error: null } };
    renderReport('/fleet/reports/hours-of-rest?show=serious');
    expect(await screen.findByRole('heading', { name: 'Crew in serious breach by day' })).toBeInTheDocument();
    await waitFor(() => expect(vesselRows()).toHaveLength(1));
    expect(within(vesselRows()[0]).getByText('DRAAK')).toBeInTheDocument();
  });

  it('writes the chosen filters to the URL on Apply', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table', { name: 'Hours of rest by vessel' });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Period' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Last 90 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/fleet/reports/hours-of-rest?period=last-90'));
    await waitFor(() => expect(callsOf('fleet_report_hours_of_rest').at(-1)).toMatchObject({ p_from: addDays(TODAY, -89), p_to: TODAY }));
  });

  it('lists repeat breaches, with how many more there are', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: answer(), error: null } };
    renderReport();
    const section = (await screen.findByRole('heading', { name: 'Repeat breaches' })).closest('section') as HTMLElement;
    expect(within(section).getByRole('link', { name: 'Demo Bosun' })).toHaveAttribute('href', '/v/dra/crew/people/p-bosun');
    expect(within(section).getByText('1 serious')).toBeInTheDocument();
    expect(within(section).getByText('and 1 more')).toBeInTheDocument();
  });

  it('no vessel covered: the tiles say "Not covered", never zeros, and no heat map', async () => {
    state.shown = shownReady();
    state.answers = {
      fleet_report_hours_of_rest: {
        data: answer({ totals: null, heat: [], emerging: { total: 0, rows: [] }, per_vessel: PER_VESSEL.map((v) => ({ ...v, state: 'no_access', ...NOT_COVERED_ROW })) }),
        error: null,
      },
    };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Hours of rest summary' });
    await waitFor(() => expect(within(summary).getAllByText('Not covered on any vessel shown').length).toBeGreaterThanOrEqual(4));
    expect(screen.queryByRole('list', { name: 'Heat map legend' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Repeat breaches' })).toBeNull();
  });

  it('says "This report is not set up yet" while the RPC is missing (D-01)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_report_hours_of_rest' } } };
    renderReport();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('a period the server refuses says so in words and is not retried', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: null, error: { code: '22023', message: 'period_too_long' } } };
    renderReport();
    expect(await screen.findByText(PERIOD_TOO_LONG_MESSAGE)).toBeInTheDocument();
    expect(callsOf('fleet_report_hours_of_rest')).toHaveLength(1);
  });

  it('folds the vessel table into cards below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_report_hours_of_rest: { data: answer(), error: null } };
    renderReport();
    const list = await screen.findByRole('list', { name: 'Hours of rest by vessel' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    expect(within(cards[0]).getByText('Not covered: Hours of rest is switched off on this vessel')).toBeInTheDocument();
    expect(within(cards[2]).getByText('Breach days')).toBeInTheDocument();
  });
});
