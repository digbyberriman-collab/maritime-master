/**
 * The hours-of-rest report model (src/modules/work-rest/lib/horReport.ts;
 * gap/04 C44, C41, C42; C45; D-01, D-X1-14, D-X1-23, D-249; X1-08B) and the
 * report's exports (src/modules/work-rest/reports/exports.ts; EX1, EX4):
 *
 * - the D-01 rule for the report's RPCs, the dates, the year in the URL;
 * - the strict reader of work_rest_month_stats and every month phase;
 * - the submission summary in every state, the By month order, the four
 *   KPIs (sums, months before the start, months still running) and the
 *   month each KPI opens on the board;
 * - which breaches a report may hold (every outcome x status x reported),
 *   the dialog's range and order, the form's every rule, the refusals in
 *   words, the create answer, the "shared in STORM" copy;
 * - the reports sent and the reminder log lines, the not-scheduled notice;
 * - Export all months and a breach report's PDF: logged first, then built
 *   and downloaded under the EX1 name; refused, with nothing downloaded,
 *   while the export log is missing (personal data, no legacy flag).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  events: [] as string[],
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  reply: { data: { id: '00000000-0000-4000-8000-0000000000e1' }, error: null } as { data: unknown; error: unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.events.push(`rpc:${name}`);
      h.rpcs.push({ name, args });
      return Promise.resolve(h.reply);
    },
  },
}));

import {
  AUTO_REMINDERS_NOT_SCHEDULED,
  BREACH_REPORT_LIMITS,
  REPORT_REFUSAL_TEXT,
  ReportShapeError,
  autoRemindersNotice,
  breachReportSchema,
  daysBetween,
  firstDayOf,
  hasAnyCrew,
  isDay,
  isReadableRange,
  isReportRpcMissing,
  isReportableBreach,
  lastDayOf,
  localDayOf,
  monthPhase,
  monthRows,
  parseBreachReportCreated,
  parseMonthStats,
  parseReportYear,
  periodText,
  personName,
  reminderMonth,
  reminderWho,
  reportBreachRows,
  reportKpis,
  reportRefusalText,
  reportableBreaches,
  sentByLine,
  sentReportLine,
  sharedText,
  shortDate,
  submissionSummary,
  type MonthStats,
  type ReportContext,
  type SentReport,
} from '@/modules/work-rest/lib/horReport';
import {
  BREACH_REPORT_COLUMNS,
  HOR_BREACH_REPORT_SOURCE_KEY,
  HOR_REPORT_SOURCE_KEY,
  MONTH_EXPORT_COLUMNS,
  exportAllMonths,
  exportBreachReportPdf,
} from '@/modules/work-rest/reports/exports';
import { EXPORT_COPY } from '@/lib/export';
import type { WorkRestReminderKind, WorkRestVesselBreachRow } from '@/modules/work-rest/types/db.pending';

const statsRow = (month: number, over: Partial<Record<string, number>> = {}) => ({
  period_month: month,
  crew: 4,
  days_logged: 100,
  breach_days: 0,
  unreviewed: 0,
  serious_open: 0,
  awaiting_correction: 0,
  not_submitted: 0,
  awaiting_approval: 0,
  approved: 4,
  locked: 0,
  ...over,
});

const stats = (month: number, over: Partial<MonthStats> = {}): MonthStats => ({
  month,
  crew: 4,
  daysLogged: 100,
  breachDays: 0,
  unreviewed: 0,
  seriousOpen: 0,
  awaitingCorrection: 0,
  notSubmitted: 0,
  awaitingApproval: 0,
  approved: 4,
  locked: 0,
  ...over,
});

const CTX: ReportContext = { year: 2026, today: '2026-11-26', horFrom: null };

const breach = (id: string, over: Partial<WorkRestVesselBreachRow> = {}): WorkRestVesselBreachRow => ({
  nc_id: id,
  profile_id: `p-${id}`,
  crew_user_id: `u-${id}`,
  first_name: 'Bosun',
  last_name: 'Example',
  preferred_name: null,
  position_name: 'Bosun',
  department_key: 'deck',
  department_label: 'Deck',
  submission_id: 's-1',
  month_status: 'approved',
  breach_day: '2026-11-04',
  rule_code: 'REST_24H_MIN',
  rule_description: 'Minimum rest in any 24 hours',
  severity: 'high',
  is_serious: false,
  measured_value: 8,
  threshold_value: 10,
  deficit_hours: 2,
  window_start: '2026-11-03T12:00:00Z',
  window_end: '2026-11-04T12:00:00Z',
  status: 'reviewed',
  review_outcome: 'accepted',
  review_note: 'Drill at anchor.',
  reviewed_by: 'u-master',
  reviewer_name: 'Demo Master',
  reviewed_at: '2026-11-06T09:00:00Z',
  breach_report_id: null,
  can_review: true,
  ...over,
});

// ---------------------------------------------------------------- D-01, dates, the year

describe('the report RPCs are missing only for their own function (D-01, D-239)', () => {
  it('PGRST202 is missing, whatever the message', () => {
    expect(isReportRpcMissing({ code: 'PGRST202', message: 'Could not find the function' }, 'work_rest_month_stats')).toBe(true);
  });
  it('42883 is missing only when it names the called function', () => {
    expect(isReportRpcMissing({ code: '42883', message: 'function public.work_rest_month_stats(uuid, integer) does not exist' }, 'work_rest_month_stats')).toBe(true);
    expect(isReportRpcMissing({ code: '42883', message: 'function public.crew_vessel_gate(text, uuid, text) does not exist' }, 'work_rest_month_stats')).toBe(false);
  });
  it('anything else is a real error', () => {
    for (const e of [null, undefined, 'x', { code: '42501', message: 'work_rest_month_stats' }, { code: '42P01' }, { code: 'PGRST205' }]) {
      expect(isReportRpcMissing(e, 'work_rest_month_stats')).toBe(false);
    }
  });
});

describe('dates', () => {
  it('isDay accepts only real calendar days', () => {
    expect(isDay('2026-02-28')).toBe(true);
    expect(isDay('2028-02-29')).toBe(true);
    for (const v of ['2026-02-29', '2026-13-01', '2026-1-01', '', null, 20261101, '2026-11-01T00:00:00Z']) expect(isDay(v)).toBe(false);
  });
  it('first and last days, leap years included', () => {
    expect(firstDayOf(2026, 3)).toBe('2026-03-01');
    expect(lastDayOf(2026, 2)).toBe('2026-02-28');
    expect(lastDayOf(2028, 2)).toBe('2028-02-29');
    expect(lastDayOf(2026, 12)).toBe('2026-12-31');
    expect(lastDayOf(2026, 11)).toBe('2026-11-30');
  });
  it('daysBetween counts whole days, negative when inverted', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
    expect(daysBetween('2028-01-01', '2028-12-31')).toBe(365);
    expect(daysBetween('2026-03-02', '2026-03-01')).toBe(-1);
  });
  it('periods in words', () => {
    expect(shortDate('2026-11-03')).toBe('3 Nov 2026');
    expect(periodText('2026-10-01', '2026-10-31')).toBe('1 Oct to 31 Oct 2026');
    expect(periodText('2026-12-01', '2027-01-15')).toBe('1 Dec 2026 to 15 Jan 2027');
    expect(periodText('2026-11-03', '2026-11-03')).toBe('3 Nov 2026');
  });
  it('localDayOf takes the local day of a timestamp, and keeps an unreadable one as text', () => {
    const d = new Date(2026, 10, 26, 23, 30);
    expect(localDayOf(d.toISOString())).toBe('2026-11-26');
    expect(localDayOf('not a date at all')).toBe('not a date');
  });
});

describe('?year=', () => {
  it('a year from 2000 to the current one', () => {
    expect(parseReportYear('2026', 2026)).toBe(2026);
    expect(parseReportYear('2025', 2026)).toBe(2025);
    expect(parseReportYear('2000', 2026)).toBe(2000);
  });
  it('anything else is the current year', () => {
    for (const v of [null, undefined, '', '2027', '1999', '26', 'abcd', '2026-11', ' 2025']) expect(parseReportYear(v, 2026)).toBe(2026);
  });
});

// ---------------------------------------------------------------- month statistics

describe('parseMonthStats (strict)', () => {
  it('reads the rows, oldest month first', () => {
    const rows = parseMonthStats([statsRow(11, { approved: 1, not_submitted: 3 }), statsRow(10)]);
    expect(rows.map((r) => r.month)).toEqual([10, 11]);
    expect(rows[1]).toEqual(stats(11, { approved: 1, notSubmitted: 3 }));
  });
  it('an empty year is an empty list', () => {
    expect(parseMonthStats([])).toEqual([]);
  });
  it.each([
    ['not a list', null],
    ['an object', { period_month: 1 }],
    ['a row that is not an object', [1]],
    ['month 0', [statsRow(0)]],
    ['month 13', [statsRow(13)]],
    ['a fractional month', [{ ...statsRow(1), period_month: 1.5 }]],
    ['a month twice', [statsRow(1), statsRow(1)]],
    ['a negative count', [statsRow(1, { crew: -1 })]],
    ['a fractional count', [statsRow(1, { days_logged: 2.5 })]],
    ['a missing count', [{ ...statsRow(1), locked: undefined }]],
    ['a count as text', [{ ...statsRow(1), unreviewed: '1' }]],
    ['states above the crew', [statsRow(1, { crew: 2, approved: 2, not_submitted: 1 })]],
  ])('refuses %s', (_label, value) => {
    expect(() => parseMonthStats(value)).toThrow(ReportShapeError);
  });
});

describe('monthPhase', () => {
  it('ended, current, future against today', () => {
    expect(monthPhase(10, CTX)).toBe('ended');
    expect(monthPhase(11, CTX)).toBe('current');
    expect(monthPhase(12, CTX)).toBe('future');
  });
  it('the last day of a month is still current on that day; it has ended the day after', () => {
    expect(monthPhase(11, { ...CTX, today: '2026-11-30' })).toBe('current');
    expect(monthPhase(11, { ...CTX, today: '2026-12-01' })).toBe('ended');
  });
  it('a month wholly before the Hours of Rest start date is before_start; the month of the start is not (C45)', () => {
    const ctx = { ...CTX, horFrom: '2026-03-15' };
    expect(monthPhase(2, ctx)).toBe('before_start');
    expect(monthPhase(3, ctx)).toBe('ended');
    expect(monthPhase(11, ctx)).toBe('current');
  });
  it('a past year has only ended months', () => {
    const ctx = { ...CTX, year: 2025 };
    for (let m = 1; m <= 12; m++) expect(monthPhase(m, ctx)).toBe('ended');
  });
});

describe('submissionSummary', () => {
  it('before the start: not expected', () => {
    expect(submissionSummary(stats(1, { approved: 0, notSubmitted: 4 }), 'before_start')).toMatchObject({ state: 'not_expected', tone: 'neutral', detail: '' });
  });
  it('nobody on board', () => {
    expect(submissionSummary(stats(1, { crew: 0, approved: 0 }), 'ended')).toMatchObject({ state: 'no_crew', label: 'Nobody on board' });
  });
  it('all approved (locked counts as approved)', () => {
    expect(submissionSummary(stats(1, { approved: 2, locked: 2 }), 'ended')).toMatchObject({ state: 'complete', label: 'All 4 approved', tone: 'ok', detail: '' });
    expect(submissionSummary(stats(1, { crew: 1, approved: 1 }), 'ended')).toMatchObject({ label: 'Approved' });
  });
  it('the current month is in progress, counting every submitted month', () => {
    expect(submissionSummary(stats(11, { approved: 1, awaitingApproval: 1, notSubmitted: 2 }), 'current')).toEqual({
      state: 'in_progress',
      label: 'In progress: 2 of 4 submitted',
      tone: 'info',
      detail: '1 approved · 1 awaiting approval · 2 not submitted',
    });
  });
  it('an ended month with crew months not submitted', () => {
    expect(submissionSummary(stats(10, { approved: 1, awaitingApproval: 1, notSubmitted: 2 }), 'ended')).toEqual({
      state: 'missing',
      label: '2 not submitted',
      tone: 'warn',
      detail: '1 approved · 1 awaiting approval',
    });
  });
  it('an ended month waiting only on approval', () => {
    expect(submissionSummary(stats(10, { approved: 1, awaitingApproval: 3 }), 'ended')).toEqual({ state: 'awaiting', label: '3 awaiting approval', tone: 'signal', detail: '1 approved' });
  });
});

describe('monthRows', () => {
  it('newest first, each with its label, phase and summary', () => {
    const rows = monthRows([stats(9), stats(11, { approved: 0, notSubmitted: 4 }), stats(10)], CTX);
    expect(rows.map((r) => [r.month, r.label, r.phase, r.submission.state])).toEqual([
      [11, 'November', 'current', 'in_progress'],
      [10, 'October', 'ended', 'complete'],
      [9, 'September', 'ended', 'complete'],
    ]);
  });
  it('hasAnyCrew', () => {
    expect(hasAnyCrew([])).toBe(false);
    expect(hasAnyCrew([stats(1, { crew: 0, approved: 0 })])).toBe(false);
    expect(hasAnyCrew([stats(1, { crew: 0, approved: 0 }), stats(2)])).toBe(true);
  });
});

describe('reportKpis', () => {
  const rows = [
    stats(1, { approved: 0, notSubmitted: 4 }), // before the start below
    stats(8, { unreviewed: 1, seriousOpen: 1, approved: 2, notSubmitted: 2 }),
    stats(9, { awaitingCorrection: 2, approved: 3, awaitingApproval: 1 }),
    stats(10, { unreviewed: 2, approved: 3, notSubmitted: 1 }),
    stats(11, { unreviewed: 1, approved: 0, notSubmitted: 3, awaitingApproval: 1 }),
  ];
  const ctx = { ...CTX, horFrom: '2026-03-01' };

  it('sums the breaches of every month', () => {
    const k = reportKpis(rows, ctx);
    expect(k.unreviewed).toBe(4);
    expect(k.seriousOpen).toBe(1);
    expect(k.awaitingCorrection).toBe(2);
  });
  it('Not submitted counts ended, expected months only (not the current month, not before the start)', () => {
    const k = reportKpis(rows, ctx);
    expect(k.notSubmitted).toBe(3);
    expect(k.notSubmittedMonths).toBe(2);
    expect(k.anyMonthEnded).toBe(true);
  });
  it('Awaiting approval counts every expected month, the current one included', () => {
    expect(reportKpis(rows, ctx).awaitingApproval).toBe(2);
  });
  it('without a start date the earliest months count too', () => {
    const k = reportKpis(rows, CTX);
    expect(k.notSubmitted).toBe(7);
    expect(k.notSubmittedMonths).toBe(3);
  });
  it('each KPI opens the latest month that has some', () => {
    expect(reportKpis(rows, ctx).targets).toEqual({ unreviewed: 11, seriousOpen: 8, notSubmitted: 10, awaitingApproval: 11 });
  });
  it('a month waiting only on a correction still opens the breaches', () => {
    expect(reportKpis([stats(9, { awaitingCorrection: 1 })], CTX).targets.unreviewed).toBe(9);
  });
  it('January of the current year: no month has ended, nothing to open', () => {
    const k = reportKpis([stats(1, { approved: 0, notSubmitted: 4 })], { ...CTX, today: '2026-01-12' });
    expect(k).toMatchObject({ notSubmitted: 0, notSubmittedMonths: 0, anyMonthEnded: false, awaitingApproval: 0 });
    expect(k.targets).toEqual({ unreviewed: null, seriousOpen: null, notSubmitted: null, awaitingApproval: null });
  });
  it('an empty year is all zero', () => {
    expect(reportKpis([], CTX)).toMatchObject({ unreviewed: 0, seriousOpen: 0, notSubmitted: 0, awaitingApproval: 0, anyMonthEnded: false });
  });
});

// ---------------------------------------------------------------- the breach report

describe('isReportableBreach (the server rule of work_rest_breach_report_create)', () => {
  const outcomes = [null, 'accepted', 'correction_requested', 'dismissed'] as const;
  const statuses = ['open', 'reviewed', 'justified', 'corrected', 'accepted_by_captain', 'dismissed', null] as const;
  const expected = (outcome: (typeof outcomes)[number], status: (typeof statuses)[number], reported: boolean): boolean => {
    if (reported) return false;
    if (outcome === 'accepted' || outcome === 'dismissed') return true;
    if (outcome === 'correction_requested') return false;
    return status === 'justified' || status === 'accepted_by_captain' || status === 'dismissed' || status === 'corrected';
  };
  for (const outcome of outcomes) {
    for (const status of statuses) {
      for (const reported of [false, true]) {
        it(`${outcome ?? 'no outcome'} / ${status ?? 'no status'}${reported ? ' / reported' : ''}`, () => {
          expect(isReportableBreach({ review_outcome: outcome, status, breach_report_id: reported ? 'r-1' : null })).toBe(expected(outcome, status, reported));
        });
      }
    }
  }
});

describe('reportableBreaches', () => {
  const rows = [
    breach('c', { breach_day: '2026-11-06', first_name: 'Cook' }),
    breach('a', { breach_day: '2026-11-04', first_name: 'Zed' }),
    breach('b', { breach_day: '2026-11-04', first_name: 'Ann', last_name: 'Able' }),
    breach('open', { review_outcome: null, status: 'open' }),
    breach('waiting', { review_outcome: 'correction_requested' }),
    breach('reported', { breach_report_id: 'r-1' }),
    breach('october', { breach_day: '2026-10-31' }),
    breach('noday', { breach_day: null }),
  ];
  it('keeps reviewed, unreported breaches in the period, by day then name', () => {
    expect(reportableBreaches(rows, '2026-11-01', '2026-11-30').map((r) => r.nc_id)).toEqual(['b', 'a', 'c']);
  });
  it('the period bounds are inclusive', () => {
    expect(reportableBreaches(rows, '2026-10-31', '2026-11-04').map((r) => r.nc_id)).toEqual(['october', 'b', 'a']);
  });
});

describe('breachReportSchema', () => {
  const ok = { from: '2026-11-01', to: '2026-11-30', ncIds: ['a'], recipientIds: ['r'], notes: '' };
  const issues = (v: Record<string, unknown>) => {
    const out = breachReportSchema.safeParse(v);
    return out.success ? [] : out.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };
  it('accepts a full form', () => {
    expect(issues(ok)).toEqual([]);
  });
  it('needs the dates', () => {
    expect(issues({ ...ok, from: '' })).toEqual(['from: Choose the start date.']);
    expect(issues({ ...ok, to: undefined })).toEqual(['to: Choose the end date.']);
    expect(issues({ ...ok, from: '2026-02-30' })).toEqual(['from: Enter a valid date']);
  });
  it('the end is not before the start, and the period is a year at most', () => {
    expect(issues({ ...ok, to: '2026-10-31' })).toEqual(['to: The end date is before the start date.']);
    // The server allows p_to - p_from <= 366 (a leap year's days).
    expect(issues({ ...ok, from: '2026-01-01', to: '2027-01-03' })).toEqual(['to: Choose a period of one year or less.']);
    expect(issues({ ...ok, from: '2026-01-01', to: '2027-01-02' })).toEqual([]);
  });
  it('needs breaches and recipients, within the server limits', () => {
    expect(issues({ ...ok, ncIds: [] })).toEqual(['ncIds: Choose the breaches to report.']);
    expect(issues({ ...ok, recipientIds: [] })).toEqual(['recipientIds: Choose who receives the report.']);
    expect(issues({ ...ok, ncIds: Array.from({ length: BREACH_REPORT_LIMITS.maxBreaches + 1 }, (_, i) => `n${i}`) })).toEqual(['ncIds: Report at most 500 breaches at a time.']);
    expect(issues({ ...ok, recipientIds: Array.from({ length: BREACH_REPORT_LIMITS.maxRecipients + 1 }, (_, i) => `r${i}`) })).toEqual(['recipientIds: Send a report to at most 50 people.']);
  });
  it('notes at most 2000 characters', () => {
    expect(issues({ ...ok, notes: 'x'.repeat(2000) })).toEqual([]);
    expect(issues({ ...ok, notes: 'x'.repeat(2001) })).toEqual(['notes: Keep the notes to 2000 characters.']);
  });
  it('isReadableRange: only a valid period of a year or less is read', () => {
    expect(isReadableRange('2026-01-01', '2026-12-31')).toBe(true);
    expect(isReadableRange('2026-12-31', '2026-01-01')).toBe(false);
    expect(isReadableRange('2026-01-01', '2027-06-01')).toBe(false);
    expect(isReadableRange('', '2026-01-01')).toBe(false);
  });
});

describe('the copy: shared in STORM, never emailed (D-249)', () => {
  it('sharedText', () => {
    expect(sharedText(1)).toBe('Report shared in STORM with 1 person');
    expect(sharedText(3)).toBe('Report shared in STORM with 3 people');
  });
  it('no report sentence speaks of email', () => {
    const all = [sharedText(2), sentReportLine({ ncIds: ['a'], recipientIds: ['b', 'c'] }), ...Object.values(REPORT_REFUSAL_TEXT)];
    for (const s of all) expect(s.toLowerCase()).not.toMatch(/e-?mail/);
  });
});

describe('reportRefusalText', () => {
  it("the server's DETAIL wins", () => {
    expect(reportRefusalText('breach_not_reviewed', 'Review every breach first, please.')).toBe('Review every breach first, please.');
  });
  it('a DETAIL that is a bare code is ignored for the known sentence', () => {
    expect(reportRefusalText('recipient_not_allowed', 'recipient_not_allowed')).toBe('Send breach reports to the fleet HR or the DPA of the company only.');
  });
  it('every refusal of the RPC has a sentence', () => {
    for (const code of [
      'crew_not_permitted',
      'range_required',
      'range_invalid',
      'range_too_long',
      'breaches_required',
      'too_many_breaches',
      'recipients_required',
      'too_many_recipients',
      'notes_too_long',
      'breach_not_on_vessel',
      'breach_out_of_range',
      'breach_superseded',
      'breach_not_reviewed',
      'breach_already_reported',
      'recipient_not_allowed',
    ]) {
      expect(reportRefusalText(code, null), code).toMatch(/\.$/);
    }
  });
  it('an unknown refusal without a DETAIL has none (the caller words it)', () => {
    expect(reportRefusalText('something_else', null)).toBeNull();
  });
});

describe('parseBreachReportCreated', () => {
  it('reads the answer', () => {
    expect(parseBreachReportCreated({ report_id: 'r-1', reference: 'HORBR-DRA-2026-001', nc_count: 2, recipient_count: 1 })).toEqual({
      reportId: 'r-1',
      reference: 'HORBR-DRA-2026-001',
      breachCount: 2,
      recipientCount: 1,
    });
  });
  it.each([
    ['null', null],
    ['a list', []],
    ['no id', { reference: 'R', nc_count: 1, recipient_count: 1 }],
    ['no reference', { report_id: 'r', nc_count: 1, recipient_count: 1 }],
    ['no breaches', { report_id: 'r', reference: 'R', nc_count: 0, recipient_count: 1 }],
    ['counts as text', { report_id: 'r', reference: 'R', nc_count: '1', recipient_count: 1 }],
  ])('refuses %s', (_l, v) => {
    expect(() => parseBreachReportCreated(v)).toThrow(ReportShapeError);
  });
});

// ---------------------------------------------------------------- sent reports and reminders

const REPORT: SentReport = {
  id: 'r-1',
  reference: 'HORBR-DRA-2026-001',
  periodFrom: '2026-10-01',
  periodTo: '2026-10-31',
  ncIds: ['a', 'b', 'gone'],
  recipientIds: ['u-dpa', 'u-hr'],
  notes: null,
  sentBy: 'u-master',
  sentByName: 'Demo Master',
  sentAt: new Date(2026, 10, 2, 10, 0).toISOString(),
};

describe('reports sent', () => {
  it('sentReportLine and sentByLine', () => {
    expect(sentReportLine(REPORT)).toBe('3 breaches · shared in STORM with 2 people');
    expect(sentReportLine({ ncIds: ['a'], recipientIds: ['b'] })).toBe('1 breach · shared in STORM with 1 person');
    expect(sentByLine(REPORT)).toBe('Sent 2 Nov 2026 by Demo Master');
    expect(sentByLine({ ...REPORT, sentByName: null })).toBe('Sent 2 Nov 2026');
  });
  it('reportBreachRows: the stored breaches still on record, by day, and how many are gone (D-X1-23)', () => {
    const rows = [breach('b', { breach_day: '2026-10-09' }), breach('x', { breach_day: '2026-10-01' }), breach('a', { breach_day: '2026-10-03' }), breach('a', { breach_day: '2026-10-03' })];
    const out = reportBreachRows(REPORT, rows);
    expect(out.rows.map((r) => r.nc_id)).toEqual(['a', 'b']);
    expect(out.missing).toBe(1);
  });
  it('personName prefers the preferred first name, never blank', () => {
    expect(personName({ first_name: 'Robert', last_name: 'Example', preferred_name: 'Bob' })).toBe('Bob Example');
    expect(personName({ first_name: ' ', last_name: '', preferred_name: null })).toBe('Crew member');
    expect(personName(null)).toBe('Crew member');
  });
});

describe('the reminder log (C41)', () => {
  const entry = (kind: WorkRestReminderKind, byLabel: string | null = null) => ({ kind, byLabel, periodYear: 2026, periodMonth: 10 });
  it('who sent it', () => {
    expect(reminderWho(entry('manual', 'Chief Officer'))).toBe('Reminded by Chief Officer');
    expect(reminderWho(entry('manual'))).toBe('Reminded by an approver');
    expect(reminderWho(entry('auto_month_start'))).toBe('Sent automatically: month start');
    expect(reminderWho(entry('sign_off'))).toBe('Sent automatically: sign-off day');
    expect(reminderWho(entry('pre_cutoff'))).toBe('Sent automatically: before the cut-off');
  });
  it('the month it was about', () => {
    expect(reminderMonth(entry('manual'))).toBe('October 2026');
  });
  it('the notice while the vessel never had an automatic reminder', () => {
    expect(autoRemindersNotice(false)).toBe(AUTO_REMINDERS_NOT_SCHEDULED);
    expect(AUTO_REMINDERS_NOT_SCHEDULED).toBe('Automatic reminders are not scheduled yet');
    expect(autoRemindersNotice(true)).toBeNull();
  });
});

// ---------------------------------------------------------------- the exports

const downloads: { blob: Blob; fileName: string }[] = [];
const download = (blob: Blob, fileName: string) => {
  h.events.push(`download:${fileName}`);
  downloads.push({ blob, fileName });
};
const NOW = new Date(2026, 10, 26, 9, 30);
const VESSEL = { vesselId: 'v-dra', vesselCode: 'DRA', vesselName: 'DRAAK', now: NOW, download };

beforeEach(() => {
  h.events = [];
  h.rpcs = [];
  h.reply = { data: { id: '00000000-0000-4000-8000-0000000000e1' }, error: null };
  downloads.length = 0;
});

describe('Export all months (C44, EX1, EX4)', () => {
  const rows = monthRows([stats(10), stats(11, { approved: 1, notSubmitted: 3 })], CTX);

  it('logs first (personal data, Excel, the vessel), then downloads under the EX1 name', async () => {
    const out = await exportAllMonths({ ...VESSEL, year: 2026, rows });
    expect(out).toEqual({ status: 'ok', value: { fileName: 'DRA_HoursOfRestReport_2026-01-01-to-2026-11-30_2026-11-26.xlsx', rowCount: 2, logged: true, jobId: '00000000-0000-4000-8000-0000000000e1' } });
    expect(h.events).toEqual(['rpc:log_client_export', 'download:DRA_HoursOfRestReport_2026-01-01-to-2026-11-30_2026-11-26.xlsx']);
    expect(h.rpcs[0].args).toMatchObject({
      p_kind: 'xlsx',
      p_source_key: HOR_REPORT_SOURCE_KEY,
      p_contains_personal_data: true,
      p_row_count: 2,
      p_vessel_id: 'v-dra',
      p_params: { year: 2026 },
    });
  });
  it('a past year covers the whole year', async () => {
    const out = await exportAllMonths({ ...VESSEL, year: 2025, rows: monthRows([stats(12), stats(1)], { ...CTX, year: 2025 }) });
    expect(out.status === 'ok' && out.value.fileName).toBe('DRA_HoursOfRestReport_2025-01-01-to-2025-12-31_2026-11-26.xlsx');
  });
  it('is refused, with nothing downloaded, while the export log is missing (no legacy flag)', async () => {
    h.reply = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.log_client_export' } };
    const out = await exportAllMonths({ ...VESSEL, year: 2026, rows });
    expect(out).toEqual({ status: 'refused', code: 'export_log_missing', message: EXPORT_COPY.logMissingPersonal });
    expect(downloads).toEqual([]);
  });
  it('is refused, with nothing downloaded, when the log says no access', async () => {
    h.reply = { data: null, error: { code: '42501', message: 'not permitted' } };
    const out = await exportAllMonths({ ...VESSEL, year: 2026, rows });
    expect(out.status).toBe('refused');
    expect(downloads).toEqual([]);
  });
  it('the columns, oldest month first in the file', () => {
    const asc = [...rows].sort((a, b) => a.month - b.month).map((r) => ({ ...r, year: 2026 }));
    const cells = asc.map((r) => MONTH_EXPORT_COLUMNS.map((c) => c.value(r)));
    expect(MONTH_EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      'Month',
      'Crew',
      'Days logged',
      'Breach days',
      'Unreviewed breaches',
      'Waiting on a correction',
      'Serious open',
      'Not submitted',
      'Awaiting approval',
      'Approved',
      'Locked',
      'Submission',
    ]);
    expect(cells[0]).toEqual(['October 2026', 4, 100, 0, 0, 0, 0, 0, 0, 4, 0, 'All 4 approved']);
    expect(cells[1]).toEqual(['November 2026', 4, 100, 0, 0, 0, 0, 3, 0, 1, 0, 'In progress: 1 of 4 submitted']);
  });
  it('a month before the start leaves Not submitted blank', () => {
    const [jan] = monthRows([stats(1, { approved: 0, notSubmitted: 4 })], { ...CTX, horFrom: '2026-03-01' });
    expect(MONTH_EXPORT_COLUMNS.find((c) => c.key === 'not_submitted')?.value({ ...jan, year: 2026 })).toBeNull();
  });
});

describe("a breach report's PDF (D-X1-23)", () => {
  const rows = [breach('a'), breach('b', { review_outcome: null, status: 'justified', is_serious: true, deficit_hours: null, rule_code: 'REST_PERIODS_MAX', measured_value: 3, threshold_value: 2 })];

  it('logs first (register_pdf, personal data), then downloads under the reference', async () => {
    const out = await exportBreachReportPdf({ ...VESSEL, report: REPORT, rows });
    expect(out.status === 'ok' && out.value.fileName).toBe('DRA_HoRBreachReport_HORBR-DRA-2026-001_2026-11-26.pdf');
    expect(h.events[0]).toBe('rpc:log_client_export');
    expect(h.events[1]).toMatch(/^download:/);
    expect(h.rpcs[0].args).toMatchObject({ p_kind: 'register_pdf', p_source_key: HOR_BREACH_REPORT_SOURCE_KEY, p_contains_personal_data: true, p_row_count: 2, p_params: { report_id: 'r-1' } });
  });
  it('is refused while the export log is missing', async () => {
    h.reply = { data: null, error: { code: 'PGRST202', message: 'x' } };
    expect((await exportBreachReportPdf({ ...VESSEL, report: REPORT, rows })).status).toBe('refused');
    expect(downloads).toEqual([]);
  });
  it('the columns say who, when, what and how it was reviewed', () => {
    const value = (key: string, r: WorkRestVesselBreachRow) => BREACH_REPORT_COLUMNS.find((c) => c.key === key)?.value(r);
    expect(value('crew', rows[0])).toBe('Bosun Example');
    expect(value('rule', rows[0])).toBe('Rest in 24 h');
    expect(value('measured', rows[0])).toBe('8 h rest, needs 10 h');
    expect(value('measured', rows[1])).toBe('3 rest periods, at most 2');
    expect(value('deficit', rows[0])).toBe(2);
    expect(value('outcome', rows[0])).toBe('Accepted');
    expect(value('outcome', rows[1])).toBe('Justified');
    expect(value('note', rows[0])).toBe('Drill at anchor.');
    expect(value('reviewed_by', rows[0])).toBe('Demo Master');
  });
});
