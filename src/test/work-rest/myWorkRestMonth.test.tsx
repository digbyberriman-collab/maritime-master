/**
 * Hours of rest, the person's month (X1-07B; gap/04 C37-C39, W6; T-143;
 * D-X1-20, D-X1-21, D-01):
 *
 * - DayTimeline: keyboard entry (arrows move the cursor, Page Up / Down an
 *   hour, Space switches rest and work, Shift carries it along), drag to
 *   paint, the periods list and Add period, read-only when disabled;
 * - RestNeededChip and FillDaysDialog on their own;
 * - MyWorkRestMonth: opens on the month view, the URL keeps the view and the
 *   day (old ?year=&month= links too), the day editor, Fill, Save, the
 *   per-vessel month for a person on two vessels, the gate for another
 *   person's month, the D-01 fallback for the HoD step, errors with Retry;
 * - the profile's Hours of rest tab: its gate, a person with no login.
 */
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DailyRecord, WorkRestBlock } from '@/modules/work-rest/types';

type Row = Record<string, unknown>;
type Failure = { code: string; message: string };

const DRAAK = { id: 'v-dra', company_id: 'c-1', name: 'DRAAK', imo_number: null, flag_state: null };
const HYDRA = { id: 'v-hyd', company_id: 'c-1', name: 'HYDRA', imo_number: null, flag_state: null };
const ME = 'u-bosun';

const h = vi.hoisted(() => ({
  caps: new Set<string>(),
  capsLoading: false,
  tables: {} as Record<string, Row[]>,
  failures: {} as Record<string, Failure | undefined>,
  selects: [] as Array<{ table: string; columns: string }>,
  records: [] as DailyRecord[],
  status: 'draft',
  dirty: false,
  hookError: null as unknown,
  monthOpened: [] as Array<{ vesselId: string; year: number; month: number }>,
  setDayBlocks: vi.fn(),
  save: vi.fn(),
  refresh: vi.fn(),
  signOff: [] as Array<Record<string, unknown>>,
  selectedVesselId: 'v-dra' as string | null,
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let single = false;
    let columns = '';
    const run = () => {
      h.selects.push({ table, columns });
      const failure = h.failures[table];
      if (failure && (!failure.message.includes('column') || columns.includes('hod_step'))) return { data: null, error: failure };
      const rows = (h.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      return { data: single ? rows[0] ?? null : rows, error: null };
    };
    const b = {
      select: (c = '') => {
        columns = c;
        return b;
      },
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v);
        return b;
      },
      gte: (k: string, v: string) => {
        filters.push((r) => String(r[k]) >= v);
        return b;
      },
      lte: (k: string, v: string) => {
        filters.push((r) => String(r[k]) <= v);
        return b;
      },
      in: () => b,
      is: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => {
        single = true;
        return b;
      },
      single: () => {
        single = true;
        return b;
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return b;
  };
  return { supabase: { from, rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCan: (key: string) => !h.capsLoading && h.caps.has(key),
  useCapability: (key: string) =>
    h.capsLoading
      ? { allowed: false, status: 'loading', reason: 'test' }
      : { allowed: h.caps.has(key), status: h.caps.has(key) ? 'granted' : 'denied', reason: 'test' },
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: ME }, profile: { id: 'p-bosun', user_id: ME, company_id: 'c-1', role: 'crew' }, loading: false }),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({
    vessels: [DRAAK, HYDRA],
    selectedVessel: [DRAAK, HYDRA].find((v) => v.id === h.selectedVesselId) ?? null,
    getVesselCodeById: (id: string | null) => (id === 'v-dra' ? 'DRA' : id === 'v-hyd' ? 'HYD' : null),
  }),
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});
vi.mock('@/modules/work-rest/hooks/useMonthlyWorkRest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/work-rest/hooks/useMonthlyWorkRest')>();
  const { calculateCompliance } = await import('@/modules/work-rest/lib/complianceEngine');
  const { DEFAULT_RULE_SET } = await import('@/modules/work-rest/types');
  const inMonth = (year: number, month: number) => {
    const { from, to } = actual.monthRange(year, month);
    return h.records.filter((r) => r.record_date >= from && r.record_date <= to);
  };
  const submission = (o: { crewId: string; vesselId: string; year: number; month: number }) => ({
    id: 'sub-1',
    crew_id: o.crewId,
    vessel_id: o.vesselId,
    period_year: o.year,
    period_month: o.month,
    status: h.status,
  });
  return {
    ...actual,
    loadMonthlyWorkRest: async (o: { crewId: string; vesselId: string; year: number; month: number }) => ({
      submission: submission(o),
      ruleSet: DEFAULT_RULE_SET,
      records: inMonth(o.year, o.month),
      context: [],
      nonConformities: [],
      signatures: [],
    }),
    useMonthlyWorkRest: (o: { crewId: string; vesselId: string; year: number; month: number }) => {
      h.monthOpened.push({ vesselId: o.vesselId, year: o.year, month: o.month });
      const base = { setDayBlocks: h.setDayBlocks, save: h.save, refresh: h.refresh, ruleSet: DEFAULT_RULE_SET, nonConformities: [], signatures: [], savePath: 'unknown' };
      if (h.hookError) {
        const compliance = calculateCompliance([], DEFAULT_RULE_SET);
        return { ...base, submission: null, records: [], compliance, loading: false, saving: false, error: h.hookError, isLocked: false, isOpen: false, isDirty: false };
      }
      const records = inMonth(o.year, o.month);
      const range = actual.monthRange(o.year, o.month);
      return {
        ...base,
        submission: submission(o),
        records,
        compliance: calculateCompliance(records, DEFAULT_RULE_SET, { defaultUnmarkedAsRest: true, range }),
        loading: false,
        saving: false,
        error: null,
        isLocked: h.status === 'locked',
        isOpen: h.status === 'draft' || h.status === 'reopened',
        isDirty: h.dirty,
      };
    },
  };
});
vi.mock('@/modules/work-rest/components/SignOffPanel', () => ({
  SignOffPanel: (props: Record<string, unknown>) => {
    h.signOff.push(props);
    return <section aria-label="Sign-off stub" />;
  },
}));
vi.mock('@/modules/work-rest/components/NonConformityList', () => ({ NonConformityList: () => null }));
vi.mock('@/modules/work-rest/components/AuditLogPanel', () => ({ AuditLogPanel: () => null }));

import MyWorkRestMonth from '@/modules/work-rest/pages/MyWorkRestMonth';
import HoursOfRestTab, { NO_LOGIN_HOURS } from '@/modules/crew/components/profile/HoursOfRestTab';
import { DayTimeline } from '@/modules/work-rest/components/DayTimeline';
import { RestNeededChip } from '@/modules/work-rest/components/RestNeededChip';
import { FillDaysDialog, type FillDay } from '@/modules/work-rest/components/FillDaysDialog';
import { DEFAULT_RULE_SET } from '@/modules/work-rest/types';
import { WorkRestRefusal } from '@/modules/work-rest/services/workRestService';
import { CREW_CAPS } from '@/modules/crew/paths';
import type { CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const work = (from: number, to: number): WorkRestBlock => ({ block_type: 'work', start_minute: from, end_minute: to });
const day = (date: string, blocks: WorkRestBlock[] = [work(7 * 60, 18 * 60)]): DailyRecord => ({ crew_id: ME, vessel_id: 'v-dra', record_date: date, blocks });
const assignment = (vessel: string, join: string, leave: string | null = null, department = 'Deck') => ({
  id: `a-${vessel}-${join}`,
  user_id: ME,
  vessel_id: vessel,
  department,
  position: 'Bosun',
  join_date: join,
  start_date: null,
  leave_date: leave,
  end_date: null,
  is_current: leave === null,
});

const Where: React.FC = () => {
  const l = useLocation();
  return <output aria-label="location">{`${l.pathname}${l.search}`}</output>;
};

function renderPage(url = '/me/hours-of-rest', route = '/me/hours-of-rest') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={route} element={<MyWorkRestMonth />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const location = () => screen.getByLabelText('location').textContent ?? '';
/** The first element matching `selector`, once it is there. */
async function findEl(selector: string): Promise<HTMLElement> {
  let el: HTMLElement | null = null;
  await waitFor(() => {
    el = document.querySelector(selector);
    expect(el).not.toBeNull();
  });
  return el as unknown as HTMLElement;
}

// jsdom has no PointerEvent: a MouseEvent that carries the pointer id (the drag reads clientX).
if (typeof window.PointerEvent === 'undefined') {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
}
const cell = (date: string) => document.querySelector(`[data-day="${date}"]`) as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T12:00:00'));
  h.caps = new Set([CREW_CAPS.horCreate, CREW_CAPS.horViewOwn]);
  h.capsLoading = false;
  h.failures = {};
  h.selects = [];
  h.status = 'draft';
  h.dirty = false;
  h.hookError = null;
  h.monthOpened = [];
  h.signOff = [];
  h.selectedVesselId = 'v-dra';
  h.setDayBlocks.mockReset();
  h.save.mockReset();
  h.refresh.mockReset();
  Object.values(h.notify).forEach((fn) => fn.mockReset());
  h.records = [];
  for (let d = 1; d <= 18; d++) {
    if (d === 10 || d === 11) continue;
    h.records.push(day(`2026-11-${String(d).padStart(2, '0')}`, d === 15 ? [work(6 * 60, 22 * 60)] : undefined));
  }
  h.tables = {
    profiles: [{ id: 'p-bosun', user_id: ME, first_name: 'Demo', last_name: 'Bosun', preferred_name: null, position: 'Bosun', rank: null, department: 'Deck' }],
    crew_assignments: [assignment('v-dra', '2026-01-01')],
    crew_leave_entries: [
      { crew_id: ME, date: '2026-11-10', status_code: 'L' },
      { crew_id: ME, date: '2026-11-11', status_code: 'L' },
    ],
    vessel_work_rest_settings: [],
    vessel_module_settings: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------- DayTimeline

const Stateful: React.FC<{ initial?: WorkRestBlock[]; disabled?: boolean; onChange?: (b: WorkRestBlock[]) => void; periods?: boolean }> = ({
  initial = [],
  disabled,
  onChange,
  periods,
}) => {
  const [blocks, setBlocks] = useState<WorkRestBlock[]>(initial);
  return (
    <DayTimeline
      date="2026-11-20"
      label="Friday 20 November"
      blocks={blocks}
      disabled={disabled}
      showPeriods={periods}
      showHelp
      onChange={(next) => {
        setBlocks(next);
        onChange?.(next);
      }}
    />
  );
};

describe('DayTimeline: keyboard entry (C37)', () => {
  it('is a focusable slider over the quarter hours, described by the keyboard help', () => {
    render(<Stateful />);
    const slider = screen.getByRole('slider', { name: 'Work and rest, Friday 20 November' });
    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuenow', String(8 * 60));
    expect(slider).toHaveAttribute('aria-valuetext', '08:00 to 08:15, rest');
    expect(slider.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(/arrow keys move 15 minutes/)).toBeInTheDocument();
    // Focus is visible: the ring classes and the cursor once focused.
    expect(slider.className).toContain('focus-visible:ring-2');
    act(() => slider.focus());
    expect(document.querySelector('[data-timeline-cursor]')).not.toBeNull();
  });

  it('arrows move 15 minutes, Page Up / Down an hour, Home and End the ends of the day', () => {
    render(<Stateful />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '495');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '465');
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(slider).toHaveAttribute('aria-valuenow', '525');
    fireEvent.keyDown(slider, { key: 'PageDown' });
    fireEvent.keyDown(slider, { key: 'PageDown' });
    expect(slider).toHaveAttribute('aria-valuenow', '405');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '1425');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '1425');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('Space switches the quarter hour under the cursor between rest and work', () => {
    const onChange = vi.fn();
    render(<Stateful onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ block_type: 'work', start_minute: 480, end_minute: 495 })]);
    expect(slider).toHaveAttribute('aria-valuetext', '08:00 to 08:15, work');
    fireEvent.keyDown(slider, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(slider).toHaveAttribute('aria-valuetext', '08:00 to 08:15, rest');
  });

  it('Shift with an arrow carries the cursor’s work or rest along', () => {
    const onChange = vi.fn();
    render(<Stateful onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: ' ' });
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ start_minute: 480, end_minute: 540 })]);
    // On a rest quarter hour, Shift carries rest: it cuts the work period.
    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'PageUp', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ start_minute: 495, end_minute: 540 })]);
  });

  it('read-only when disabled: the cursor moves, nothing changes, and the reason is shown', () => {
    const onChange = vi.fn();
    render(
      <DayTimeline date="2026-11-20" label="Friday 20 November" blocks={[work(480, 600)]} onChange={onChange} disabled disabledReason="The month is submitted." />,
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(slider, { key: ' ' });
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute('aria-valuenow', '495');
    expect(screen.getByText('The month is submitted.')).toBeInTheDocument();
  });

  it('dragging paints: from rest it marks work, from work it marks rest', () => {
    const onChange = vi.fn();
    render(<Stateful onChange={onChange} />);
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () => ({ left: 0, width: 960, top: 0, height: 56, right: 960, bottom: 56, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(slider, { clientX: 320, button: 0, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 400, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 400, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ start_minute: 480, end_minute: 615 })]);
    fireEvent.pointerDown(slider, { clientX: 360, button: 0, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 360, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ start_minute: 480, end_minute: 540 }),
      expect.objectContaining({ start_minute: 555, end_minute: 615 }),
    ]);
  });

  it('lists the periods in turn and adds work or rest periods (Add period)', async () => {
    const onChange = vi.fn();
    render(<Stateful initial={[work(6 * 60, 12 * 60)]} onChange={onChange} periods />);
    const list = document.querySelector('[data-period-list] ul') as HTMLElement;
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent?.slice(0, 11))).toEqual(['00:00–06:00', '06:00–12:00', '12:00–24:00']);
    const form = screen.getByRole('form', { name: 'Add period' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'From' }), { target: { value: '13:00' } });
    fireEvent.change(within(form).getByRole('textbox', { name: 'To' }), { target: { value: '25:00' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add period' }));
    expect(await within(form).findByText('Use HH:MM, 00:00 to 24:00')).toBeInTheDocument();
    fireEvent.change(within(form).getByRole('textbox', { name: 'To' }), { target: { value: '17:30' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add period' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ start_minute: 360, end_minute: 720 }), expect.objectContaining({ start_minute: 780, end_minute: 1050 })]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark 06:00 to 12:00 as rest' }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ start_minute: 780, end_minute: 1050 })]);
  });
});

// ---------------------------------------------------------------- RestNeededChip

describe('RestNeededChip (rest still needed today)', () => {
  it('says the 24 h shortfall, met, or that today has no entry yet', () => {
    const { rerender } = render(<RestNeededChip records={[day('2026-11-20', [work(6 * 60, 21 * 60)])]} today="2026-11-20" ruleSet={DEFAULT_RULE_SET} />);
    expect(screen.getByRole('status')).toHaveTextContent('Rest still needed today: 1 h');
    rerender(<RestNeededChip records={[day('2026-11-20')]} today="2026-11-20" ruleSet={DEFAULT_RULE_SET} />);
    expect(screen.getByRole('status')).toHaveTextContent('Rest needs met today');
    rerender(<RestNeededChip records={[]} today="2026-11-20" ruleSet={DEFAULT_RULE_SET} />);
    expect(screen.getByRole('status')).toHaveTextContent('Rest still needed today: enter today first');
  });

  it('the 7-day shortfall decides when it is the larger', () => {
    const week = Array.from({ length: 7 }, (_, i) => day(`2026-11-${String(14 + i).padStart(2, '0')}`, [work(6 * 60, 19 * 60 + 30)]));
    render(<RestNeededChip records={week} today="2026-11-20" ruleSet={DEFAULT_RULE_SET} />);
    // 7 x 10.5 h = 73.5 h of rest: 3 h 30 m short of 77 h; the 24 h figure is met.
    expect(screen.getByRole('status')).toHaveTextContent('Rest still needed today: 3 h 30 m');
    expect(screen.getByRole('status')).toHaveTextContent('77 h in 7 days');
  });
});

// ---------------------------------------------------------------- FillDaysDialog

describe('FillDaysDialog', () => {
  const days: FillDay[] = [
    { date: '2026-11-16', label: 'Mon 16 Nov', entered: true, editable: true },
    { date: '2026-11-17', label: 'Tue 17 Nov', entered: false, editable: true },
    { date: '2026-11-18', label: 'Wed 18 Nov', entered: true, editable: true },
    { date: '2026-11-19', label: 'Thu 19 Nov', entered: false, editable: true },
    { date: '2026-11-20', label: 'Fri 20 Nov', entered: false, editable: false },
  ];
  const blocksOn = (date: string) => (date === '2026-11-16' ? [work(480, 1020)] : date === '2026-11-18' ? [work(0, 240)] : null);

  it('copies the day before the first day onto the open days with no entry', async () => {
    const onFill = vi.fn();
    render(<FillDaysDialog open onOpenChange={() => undefined} days={days} blocksOn={blocksOn} defaultFrom="2026-11-17" defaultTo="2026-11-19" onFill={onFill} />);
    const preview = document.querySelector('[data-fill-preview]') as HTMLElement;
    expect(preview).toHaveTextContent('Fills 2 days with 08:00–17:00 (Mon 16 Nov).');
    fireEvent.click(screen.getByRole('button', { name: 'Fill days' }));
    await waitFor(() => expect(onFill).toHaveBeenCalledTimes(1));
    expect(onFill.mock.calls[0][0]).toEqual(['2026-11-17', '2026-11-19']);
    expect(onFill.mock.calls[0][1]).toEqual([work(480, 1020)]);
  });

  it('refuses a day before with no entry, and offers STORM watch patterns', async () => {
    const onFill = vi.fn();
    render(<FillDaysDialog open onOpenChange={() => undefined} days={days} blocksOn={blocksOn} defaultFrom="2026-11-18" defaultTo="2026-11-19" onFill={onFill} />);
    expect(document.querySelector('[data-fill-preview]')).toHaveTextContent('Tue 17 Nov has no entry to copy.');
    fireEvent.click(screen.getByRole('button', { name: 'Fill days' }));
    expect(await screen.findByText('The day before has no entry to copy')).toBeInTheDocument();
    expect(onFill).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'A watch pattern' }));
    expect(document.querySelector('[data-fill-preview]')).toHaveTextContent('Fills 1 day with 08:00–12:00, 13:00–17:00');
    fireEvent.click(screen.getByRole('button', { name: 'Fill days' }));
    await waitFor(() => expect(onFill).toHaveBeenCalledTimes(1));
    expect(onFill.mock.calls[0][0]).toEqual(['2026-11-19']);
  });
});

// ---------------------------------------------------------------- the page

describe('MyWorkRestMonth (/me/hours-of-rest)', () => {
  it('opens on the month view (T-143) with the day states and the figures', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hours of rest' })).toBeInTheDocument();
    expect(screen.getByText('November 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Month', pressed: true })).toBeInTheDocument();
    expect(cell('2026-11-02')).toHaveAttribute('data-state', 'entered');
    expect(cell('2026-11-02').getAttribute('aria-label')).toBe('Monday 2 November: Entered, rest 13 h');
    expect(cell('2026-11-15')).toHaveAttribute('data-breach', 'true');
    expect(cell('2026-11-10')).toHaveAttribute('data-state', 'leave');
    expect(cell('2026-11-19')).toHaveAttribute('data-state', 'not_entered');
    expect(cell('2026-11-21').getAttribute('aria-label')).toContain('Not expected, Still to come.');
    expect(screen.getByText('16 of 18')).toBeInTheDocument();
    expect(screen.getByText('2 expected days have no entry')).toBeInTheDocument();
    expect(h.monthOpened.at(-1)).toEqual({ vesselId: 'v-dra', year: 2026, month: 11 });
  });

  it('a day opens the day editor, the URL keeps it, and Week shows that week', async () => {
    renderPage();
    fireEvent.click(await findEl('[data-day="2026-11-05"]'));
    await waitFor(() => expect(location()).toBe('/me/hours-of-rest?month=2026-11&day=2026-11-05'));
    const editor = document.querySelector('[data-day-editor="2026-11-05"]') as HTMLElement;
    expect(within(editor).getByRole('heading', { name: 'Thursday 5 November' })).toBeInTheDocument();
    expect(within(editor).getByRole('slider', { name: 'Work and rest, Thursday 5 November' })).not.toHaveAttribute('aria-disabled');
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => expect(new URLSearchParams(location().split('?')[1]).get('view')).toBe('week'));
    expect(new URLSearchParams(location().split('?')[1]).get('day')).toBe('2026-11-05');
    expect(document.querySelectorAll('[data-week-day]')).toHaveLength(7);
    expect(screen.getByRole('heading', { name: 'Week of Mon 2 Nov' })).toBeInTheDocument();
  });

  it('a day edited on screen goes to the month (setDayBlocks) until Save', async () => {
    renderPage('/me/hours-of-rest?month=2026-11&day=2026-11-19');
    const slider = await screen.findByRole('slider', { name: 'Work and rest, Thursday 19 November' });
    fireEvent.keyDown(slider, { key: ' ' });
    expect(h.setDayBlocks).toHaveBeenCalledWith('2026-11-19', [expect.objectContaining({ start_minute: 480, end_minute: 495 })]);
  });

  it('opens the old ?year=&month= links on their month', async () => {
    renderPage('/me/hours-of-rest?year=2026&month=10');
    expect(await screen.findByText('October 2026')).toBeInTheDocument();
    expect(h.monthOpened.at(-1)).toEqual({ vesselId: 'v-dra', year: 2026, month: 10 });
  });

  it('Fill copies a day onto the open days with no entry, leave days left out', async () => {
    h.caps.add(CREW_CAPS.horCreate);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Fill days' }));
    const dialog = await screen.findByRole('dialog');
    // From the first open day with no entry (the 19th) to today; the 10th and 11th are leave.
    expect(within(dialog).getByText('Fills 2 days with 07:00–18:00 (Wed 18 Nov).')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fill days' }));
    await waitFor(() => expect(h.setDayBlocks).toHaveBeenCalledTimes(2));
    expect(h.setDayBlocks.mock.calls.map((c) => c[0])).toEqual(['2026-11-19', '2026-11-20']);
    expect(h.notify.success).toHaveBeenCalledWith('2 days filled from Wed 18 Nov', { description: 'Save to keep them.' });
  });

  it('Save sends the changed days; a refusal shows the server sentence', async () => {
    h.dirty = true;
    h.save.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new WorkRestRefusal('22023', 'month_closed', 'This month is submitted. Reopen it before changing a day.', null));
    renderPage();
    const bar = await findEl('[data-hor-save-bar]');
    fireEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalled());
    fireEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.notify.error).toHaveBeenCalledTimes(1));
    const [error, options] = h.notify.error.mock.calls[0];
    expect((error as Error).message).toBe('This month is submitted. Reopen it before changing a day.');
    expect(options).toEqual({ title: 'Not all days were saved' });
  });

  it('a closed month is read-only, and says why', async () => {
    h.status = 'submitted';
    renderPage('/me/hours-of-rest?month=2026-11&day=2026-11-05');
    const slider = await screen.findByRole('slider', { name: 'Work and rest, Thursday 5 November' });
    expect(slider).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('The month is submitted. It must be reopened before a day changes.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fill days' })).toBeNull();
  });

  it('passes the sign-off its facts: the vessel HoD step, the department rule and the missing days', async () => {
    h.tables.vessel_work_rest_settings = [{ vessel_id: 'v-dra', hod_step: 'required', timezone: 'Europe/Malta' }];
    renderPage();
    await waitFor(() => expect(h.signOff.length).toBeGreaterThan(0));
    expect(h.signOff.at(-1)).toMatchObject({ vesselId: 'v-dra', crewUserId: ME, isOwn: true, hodStep: 'required', inMonth: true, stillAboard: true, missingDays: 2, unsavedDays: 0 });
  });

  it('D-01: without the hod_step column the HoD step is the engine default (nudge)', async () => {
    h.failures.vessel_work_rest_settings = { code: '42703', message: 'column vessel_work_rest_settings.hod_step does not exist' };
    renderPage();
    await waitFor(() => expect(h.signOff.length).toBeGreaterThan(0));
    expect(h.signOff.at(-1)).toMatchObject({ hodStep: 'nudge' });
    expect(h.selects.filter((s) => s.table === 'vessel_work_rest_settings').map((s) => s.columns)).toEqual(['hod_step, timezone', 'timezone']);
  });

  it('a person on two vessels in the month picks the vessel; each vessel keeps its own month (D-X1-20)', async () => {
    h.tables.crew_assignments = [assignment('v-dra', '2026-06-01', '2026-11-12'), assignment('v-hyd', '2026-11-13')];
    renderPage();
    const choice = await findEl('[data-hor-vessel-choice]');
    expect(within(choice).getByText('You were on 2 vessels in November 2026. Each vessel keeps its own month.')).toBeInTheDocument();
    expect(within(choice).getByRole('button', { name: 'DRAAK', pressed: true })).toBeInTheDocument();
    expect(h.monthOpened.at(-1)?.vesselId).toBe('v-dra');
    fireEvent.click(within(choice).getByRole('button', { name: 'HYDRA' }));
    await waitFor(() => expect(location()).toContain('vessel=hyd'));
    await waitFor(() => expect(h.monthOpened.at(-1)?.vesselId).toBe('v-hyd'));
  });

  it('with no assignment and no vessel selected there is nothing to log against', async () => {
    h.tables.crew_assignments = [];
    h.selectedVesselId = null;
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No vessel to log hours against' })).toBeInTheDocument();
    expect(h.monthOpened).toEqual([]);
  });

  it('closes when the vessel’s Crew module is off (D-X1-21) and never opens the month', async () => {
    h.tables.vessel_module_settings = [{ vessel_id: 'v-dra', module_key: 'crew', enabled: false, enabled_from: null, label_override: null }];
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hours of rest is off for DRAAK' })).toBeInTheDocument();
    expect(h.monthOpened).toEqual([]);
  });

  it('an error loading the month: the error with Retry; a permission refusal: AccessDenied', async () => {
    h.hookError = { code: '57014', message: 'canceling statement due to statement timeout' };
    const { unmount } = renderPage();
    const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 });
    expect(screen.getByRole('heading', { name: 'This month could not load' })).toBeInTheDocument();
    fireEvent.click(retry);
    expect(h.refresh).toHaveBeenCalled();
    unmount();
    h.hookError = { code: '42501', message: 'permission denied' };
    renderPage();
    expect(await screen.findByRole('heading', { name: "You can't see this month" })).toBeInTheDocument();
  });

  it('an error reading the person: the error with Retry, nothing else', async () => {
    h.failures.crew_assignments = { code: '57014', message: 'canceling statement due to statement timeout' };
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Your hours of rest could not load' }, { timeout: 4000 })).toBeInTheDocument();
    expect(h.monthOpened).toEqual([]);
  });

  it("another person's month (legacy /crew/work-rest/:crewId): nothing is read while the gate loads; denied is AccessDenied", async () => {
    h.capsLoading = true;
    const { unmount } = renderPage('/crew/work-rest/u-other', '/crew/work-rest/:crewId');
    await waitFor(() => expect(screen.getAllByRole('status').length).toBeGreaterThan(0));
    expect(h.selects.some((s) => s.table === 'profiles' || s.table === 'crew_assignments')).toBe(false);
    unmount();
    h.capsLoading = false;
    h.caps.delete(CREW_CAPS.horView);
    renderPage('/crew/work-rest/u-other', '/crew/work-rest/:crewId');
    expect(await screen.findByRole('heading', { name: "You can't see this month" })).toBeInTheDocument();
    expect(h.selects.some((s) => s.table === 'profiles')).toBe(false);
  });
});

// ---------------------------------------------------------------- the profile tab

const summary = (over: Partial<CrewProfileSummary> = {}): CrewProfileSummary =>
  ({
    profileId: 'p-crew',
    userId: 'u-crew',
    firstName: 'Demo',
    lastName: 'Deckhand',
    preferredName: null,
    displayName: 'Demo Deckhand',
    positionName: 'Deckhand',
    positionText: 'Deckhand',
    departmentLabel: 'Deck',
    isOwn: false,
    tabs: null,
    source: 'server',
    ...over,
  }) as CrewProfileSummary;

function renderTab(profile: CrewProfileSummary) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/v/dra/crew/people/p-crew/hours-of-rest?month=2026-11']}>
        <HoursOfRestTab profile={profile} vessel={{ id: 'v-dra', companyId: 'c-1', name: 'DRAAK' }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HoursOfRestTab (crew/people/:profileId/hours-of-rest)', () => {
  it('nothing is read while the gate loads; without hours of rest view it is AccessDenied', async () => {
    h.capsLoading = true;
    const { unmount } = renderTab(summary());
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(h.monthOpened).toEqual([]);
    unmount();
    h.capsLoading = false;
    renderTab(summary());
    expect(await screen.findByRole('heading', { level: 2, name: "You can't see these hours of rest" })).toBeInTheDocument();
    expect(h.monthOpened).toEqual([]);
  });

  it('with hours of rest view: the crew member’s month on the route vessel, as a tab body (h2)', async () => {
    h.caps.add(CREW_CAPS.horView);
    h.tables.crew_assignments = [{ ...assignment('v-dra', '2026-01-01'), user_id: 'u-crew' }];
    renderTab(summary());
    expect(await screen.findByRole('heading', { level: 2, name: 'Hours of rest' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    await waitFor(() => expect(h.monthOpened.at(-1)).toEqual({ vesselId: 'v-dra', year: 2026, month: 11 }));
    expect(h.signOff.at(-1)).toMatchObject({ crewUserId: 'u-crew', crewName: 'Demo Deckhand', isOwn: false });
  });

  it('the person’s own profile opens without the capability (view_own)', async () => {
    h.tables.crew_assignments = [assignment('v-dra', '2026-01-01')];
    renderTab(summary({ isOwn: true, userId: ME }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Hours of rest' })).toBeInTheDocument();
  });

  it('a person with no login has no hours yet, and nothing is read', async () => {
    h.caps.add(CREW_CAPS.horView);
    renderTab(summary({ userId: null }));
    expect(await screen.findByText(NO_LOGIN_HOURS)).toBeInTheDocument();
    expect(h.monthOpened).toEqual([]);
  });
});
