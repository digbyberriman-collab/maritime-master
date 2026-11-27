/**
 * The employment model (X1-11B; gap/04 C57, C59, W8; lib/employment.ts):
 * sub-tabs, the end reasons and their words, the End employment schema
 * (every server refusal mirrored with the server's sentence), the strict
 * reader of crew_end_employment's answer and its outcome in words,
 * durations, the vessel history rows and counters, the re-hire block and
 * prefill reader, the contract's probation and notice periods, and the
 * terms edit form (schema, defaults, changes, payload, hints).
 */
import { describe, expect, it, vi } from 'vitest';

// lib/employment reads the leave rules of lib/addCrewSchema, whose Add crew
// outcomes import the admin-actions wrapper (and so the client).
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import {
  END_EMPLOYMENT_SENTENCES,
  END_REASONS,
  END_REASON_VALUES,
  EMPLOYMENT_SUBTABS,
  addDaysTo,
  addMonthsTo,
  calendarSpan,
  contractNoticeOf,
  contractOutcomeFor,
  daysBetweenDates,
  endEmploymentArgs,
  endEmploymentDefaults,
  endEmploymentFieldFor,
  endEmploymentOutcome,
  endReasonLabel,
  formatDuration,
  historyCounters,
  historyPersonName,
  horMonthStateText,
  isEmploymentEndReason,
  makeEndEmploymentSchema,
  makeTermsSchema,
  noticeText,
  parseEndEmploymentResult,
  parseRehirePrefill,
  parseWholeInRange,
  probationText,
  rehireBlock,
  resolveEmploymentSubTab,
  termsChanges,
  termsDefaults,
  termsFieldFor,
  toContractNoticePatch,
  toEmploymentHistoryRow,
  toTermsPayload,
  type EndEmploymentValues,
  type TermsFormValues,
} from '@/modules/crew/lib/employment';
import type { CrewEmploymentHistoryRpcRow } from '@/modules/crew/types/db.pending';

const TODAY = '2026-11-27';

describe('sub-tabs', () => {
  it('lists the four sub-tabs in order', () => {
    expect(EMPLOYMENT_SUBTABS).toEqual(['details', 'transfers', 'appraisals', 'familiarisation']);
  });
  it.each([
    ['details', 'details'],
    ['transfers', 'transfers'],
    ['appraisals', 'appraisals'],
    ['familiarisation', 'familiarisation'],
    ['familiarization', 'details'],
    ['', 'details'],
    [null, 'details'],
    [undefined, 'details'],
    ['Transfers', 'details'],
  ])('resolveEmploymentSubTab(%j) = %s', (input, expected) => {
    expect(resolveEmploymentSubTab(input)).toBe(expected);
  });
});

describe('end reasons (W8)', () => {
  it('has the eight W8 reasons in W8 order', () => {
    expect(END_REASON_VALUES).toEqual([
      'contract_end',
      'resignation',
      'dismissal',
      'medical',
      'end_of_temporary_contract',
      'transfer_to_another_employer',
      'retirement',
      'other',
    ]);
    expect(END_REASONS.map((r) => r.label)).toEqual([
      'Contract end',
      'Resignation',
      'Dismissal',
      'Medical',
      'End of temporary contract',
      'Transfer to another employer',
      'Retirement',
      'Other',
    ]);
  });
  it('the transfer reason is not one a person chooses', () => {
    expect(isEmploymentEndReason('transfer')).toBe(false);
    expect(isEmploymentEndReason('contract_end')).toBe(true);
    expect(isEmploymentEndReason(null)).toBe(false);
  });
  it.each([
    ['contract_end', 'Contract end'],
    ['transfer', 'Transfer to another vessel'],
    ['end_of_contract', 'End of contract'],
    ['promotion', 'Promotion'],
    ['LEAVE-OF_absence', 'Leave of absence'],
    [null, null],
    ['   ', null],
  ])('endReasonLabel(%j) = %j', (input, expected) => {
    expect(endReasonLabel(input)).toBe(expected);
  });
  it('a contract end expires the contract; anything else terminates it (as the server)', () => {
    for (const r of END_REASON_VALUES) {
      expect(contractOutcomeFor(r)).toBe(r === 'contract_end' || r === 'end_of_temporary_contract' ? 'expired' : 'terminated');
    }
    for (const option of END_REASONS) {
      expect(option.hint).toContain(contractOutcomeFor(option.value) === 'expired' ? 'expired' : 'terminated');
    }
  });
});

describe('dates and durations', () => {
  it('daysBetweenDates counts as the server (leave minus join)', () => {
    expect(daysBetweenDates('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysBetweenDates('2026-01-01', '2026-12-31')).toBe(364);
    expect(daysBetweenDates('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetweenDates('2026-03-29', '2026-03-30')).toBe(1); // a DST change in Europe is still one day
    expect(daysBetweenDates('2026-02-01', '2026-01-01')).toBe(-31);
    expect(daysBetweenDates(null, '2026-01-01')).toBeNull();
    expect(daysBetweenDates('2026-13-01', '2026-01-01')).toBeNull();
    expect(daysBetweenDates('2026-01-01T10:00:00Z', '2026-01-03')).toBe(2);
  });
  it('addDaysTo and addMonthsTo (month end clamped)', () => {
    expect(addDaysTo('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysTo('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonthsTo('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsTo('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsTo('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsTo('2026-11-15', 24)).toBe('2028-11-15');
    expect(addMonthsTo('2026-03-31', -1)).toBe('2026-02-28');
  });
  it('calendarSpan counts years, months then days', () => {
    expect(calendarSpan('2026-01-10', '2026-03-09')).toEqual({ years: 0, months: 1, days: 27 });
    expect(calendarSpan('2026-01-10', '2026-03-10')).toEqual({ years: 0, months: 2, days: 0 });
    expect(calendarSpan('2022-01-10', '2024-02-28')).toEqual({ years: 2, months: 1, days: 18 });
    // Month ends: 31 Jan plus a month is 28 Feb, so the span is one month.
    expect(calendarSpan('2026-01-31', '2026-02-28')).toEqual({ years: 0, months: 1, days: 0 });
    expect(calendarSpan('2026-01-31', '2026-02-27')).toEqual({ years: 0, months: 0, days: 27 });
    expect(calendarSpan('2026-05-05', '2026-05-05')).toEqual({ years: 0, months: 0, days: 0 });
    expect(calendarSpan('2026-05-06', '2026-05-05')).toBeNull();
    expect(calendarSpan(null, '2026-05-05')).toBeNull();
  });
  it.each([
    ['2022-01-10', '2024-02-28', '2 yr 1 mo', '2 years 1 month'],
    ['2025-01-10', '2026-01-10', '1 yr', '1 year'],
    ['2026-01-10', '2026-05-22', '4 mo 12 d', '4 months 12 days'],
    ['2026-01-10', '2026-02-10', '1 mo', '1 month'],
    ['2026-01-10', '2026-02-02', '23 days', '23 days'],
    ['2026-01-10', '2026-01-11', '1 day', '1 day'],
    ['2026-01-10', '2026-01-10', '0 days', '0 days'],
  ])('formatDuration(%s, %s) = %s', (from, to, short, long) => {
    expect(formatDuration(from, to)).toEqual({ short, long });
  });
  it('formatDuration is null for reversed or missing dates', () => {
    expect(formatDuration('2026-02-10', '2026-01-10')).toBeNull();
    expect(formatDuration(null, null)).toBeNull();
  });
});

describe('End employment: the form mirrors crew_end_employment', () => {
  const schema = makeEndEmploymentSchema({ today: TODAY, joinDate: '2026-03-01' });
  const check = (values: Partial<EndEmploymentValues>) => {
    const r = schema.safeParse({ ...endEmploymentDefaults(TODAY), reason: 'contract_end', ...values });
    if (r.success) return {};
    return Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it('defaults to today with no reason', () => {
    expect(endEmploymentDefaults(TODAY)).toEqual({ endDate: TODAY, reason: '', notes: '' });
  });
  it('accepts every W8 reason with a valid date', () => {
    for (const reason of END_REASON_VALUES) {
      expect(check({ reason, notes: reason === 'other' ? 'Moved ashore' : '' }), reason).toEqual({});
    }
  });
  it('a reason is required, in the server’s words', () => {
    expect(check({ reason: '' })).toEqual({ reason: END_EMPLOYMENT_SENTENCES.reason });
    expect(check({ reason: 'transfer' })).toEqual({ reason: END_EMPLOYMENT_SENTENCES.reason });
    expect(check({ reason: 'sacked' })).toEqual({ reason: END_EMPLOYMENT_SENTENCES.reason });
  });
  it('Other needs a note; blank spaces are not a note', () => {
    expect(check({ reason: 'other', notes: '   ' })).toEqual({ notes: END_EMPLOYMENT_SENTENCES.notesRequired });
    expect(check({ reason: 'other', notes: 'Left for shore work' })).toEqual({});
  });
  it('notes are kept under 2,000 characters (trimmed)', () => {
    expect(check({ notes: 'x'.repeat(2000) })).toEqual({});
    expect(check({ notes: `  ${'x'.repeat(2000)}  ` })).toEqual({});
    expect(check({ notes: 'x'.repeat(2001) })).toEqual({ notes: END_EMPLOYMENT_SENTENCES.notesTooLong });
  });
  it('the end date is required and a real date', () => {
    expect(check({ endDate: '' })).toEqual({ endDate: END_EMPLOYMENT_SENTENCES.dateRequired });
    expect(check({ endDate: '2026-02-30' })).toEqual({ endDate: END_EMPLOYMENT_SENTENCES.dateInvalid });
    expect(check({ endDate: '27/11/2026' })).toEqual({ endDate: END_EMPLOYMENT_SENTENCES.dateInvalid });
  });
  it('the end date is within a year of today, either way', () => {
    expect(check({ endDate: addDaysTo(TODAY, 365) })).toEqual({});
    expect(check({ endDate: addDaysTo(TODAY, 366) })).toEqual({ endDate: END_EMPLOYMENT_SENTENCES.dateWindow });
    const noJoin = makeEndEmploymentSchema({ today: TODAY, joinDate: null });
    expect(noJoin.safeParse({ endDate: addDaysTo(TODAY, -365), reason: 'retirement', notes: '' }).success).toBe(true);
    expect(noJoin.safeParse({ endDate: addDaysTo(TODAY, -366), reason: 'retirement', notes: '' }).success).toBe(false);
  });
  it('the end date is not before the person joined the vessel', () => {
    expect(check({ endDate: '2026-02-28' })).toEqual({ endDate: END_EMPLOYMENT_SENTENCES.beforeJoin });
    expect(check({ endDate: '2026-03-01' })).toEqual({});
  });
  it('several problems at once are all named', () => {
    expect(check({ endDate: '', reason: 'other', notes: '' })).toEqual({
      endDate: END_EMPLOYMENT_SENTENCES.dateRequired,
      notes: END_EMPLOYMENT_SENTENCES.notesRequired,
    });
  });
  it('builds the RPC arguments, a blank note sent as null', () => {
    expect(endEmploymentArgs({ endDate: ' 2026-11-30 ', reason: 'resignation', notes: '  ' }, 'p1', 'v1')).toEqual({
      p_profile_id: 'p1',
      p_vessel_id: 'v1',
      p_end_date: '2026-11-30',
      p_reason: 'resignation',
      p_notes: null,
    });
    expect(endEmploymentArgs({ endDate: '2026-11-30', reason: 'other', notes: ' Shore job ' }, 'p1', 'v1').p_notes).toBe('Shore job');
    expect(() => endEmploymentArgs({ endDate: '2026-11-30', reason: '', notes: '' }, 'p1', 'v1')).toThrow();
  });
  it.each([
    ['end_date', 'endDate'],
    ['reason', 'reason'],
    ['notes', 'notes'],
    [null, null],
    ['position_id', null],
  ])('a server HINT %j lands on %j', (hint, field) => {
    expect(endEmploymentFieldFor(hint)).toBe(field);
  });
});

describe('End employment: the answer, read strictly', () => {
  const answer = {
    assignment_id: 'a1',
    end_date: '2026-11-30',
    reason: 'resignation',
    terms_ended: 1,
    contract: { id: 'c1', status: 'terminated' },
    periods_removed: 2,
    periods_trimmed: 1,
    final_hor_month: { year: 2026, month: 11, submission_status: 'draft' },
  };

  it('reads a full answer', () => {
    expect(parseEndEmploymentResult(answer)).toEqual({
      assignmentId: 'a1',
      endDate: '2026-11-30',
      reason: 'resignation',
      termsEnded: 1,
      contract: { id: 'c1', status: 'terminated' },
      periodsRemoved: 2,
      periodsTrimmed: 1,
      finalHorMonth: { year: 2026, month: 11, submissionStatus: 'draft' },
    });
  });
  it('reads no contract and no hours-of-rest month (a person without a login)', () => {
    expect(parseEndEmploymentResult({ ...answer, contract: null, final_hor_month: null })).toMatchObject({ contract: null, finalHorMonth: null });
  });
  it.each([
    ['not an object', null],
    ['an array', [answer]],
    ['no assignment', { ...answer, assignment_id: null }],
    ['a bad date', { ...answer, end_date: 'soon' }],
    ['an unknown reason', { ...answer, reason: 'transfer' }],
    ['a negative count', { ...answer, periods_removed: -1 }],
    ['a fractional count', { ...answer, terms_ended: 0.5 }],
    ['a contract without status', { ...answer, contract: { id: 'c1' } }],
    ['a contract with an odd status', { ...answer, contract: { id: 'c1', status: 'active' } }],
    ['a month out of range', { ...answer, final_hor_month: { year: 2026, month: 13, submission_status: 'draft' } }],
    ['a month without status', { ...answer, final_hor_month: { year: 2026, month: 11 } }],
  ])('%s is unreadable', (_label, value) => {
    expect(parseEndEmploymentResult(value)).toBeNull();
  });

  it('says what happened, effect by effect', () => {
    const result = parseEndEmploymentResult(answer);
    if (!result) throw new Error('unreadable');
    expect(endEmploymentOutcome(result, { person: 'Demo Bosun', vessel: 'DRAAK' })).toEqual([
      'Demo Bosun leaves DRAAK on 30 Nov 2026: Resignation.',
      'The active contract is marked terminated.',
      'The employment terms on this vessel end on that day.',
      '2 planner periods after that day were removed, and 1 period now ends on it.',
      'Hours of rest for November 2026 are their final month: not submitted yet.',
      'Fleet HR is told in STORM. Their documents and history stay on their profile.',
    ]);
  });
  it('says so when there was nothing to close', () => {
    const result = parseEndEmploymentResult({ ...answer, reason: 'contract_end', contract: null, terms_ended: 0, periods_removed: 0, periods_trimmed: 0, final_hor_month: null });
    if (!result) throw new Error('unreadable');
    const lines = endEmploymentOutcome(result, { person: 'Demo Bosun', vessel: 'DRAAK' });
    expect(lines).toContain('There was no active contract to close.');
    expect(lines).toContain('The planner had nothing after that day.');
    expect(lines).toContain('They have no login, so there is no hours of rest month to close.');
    expect(lines.some((l) => l.includes('terms'))).toBe(false);
  });
  it('one removed period and one trimmed period read in the singular', () => {
    const result = parseEndEmploymentResult({ ...answer, contract: { id: 'c1', status: 'expired' }, periods_removed: 1, periods_trimmed: 0 });
    if (!result) throw new Error('unreadable');
    const lines = endEmploymentOutcome(result, { person: 'P', vessel: 'V' });
    expect(lines).toContain('The active contract is marked expired.');
    expect(lines).toContain('1 planner period after that day was removed.');
  });
  it.each([
    ['none', 'nothing recorded yet'],
    ['draft', 'not submitted yet'],
    ['reopened', 'not submitted yet'],
    ['submitted', 'submitted, waiting for sign-off'],
    ['crew_signed', 'submitted, waiting for sign-off'],
    ['hod_signed', 'signed by the head of department, waiting for approval'],
    ['approved', 'approved'],
    ['captain_reviewed', 'approved'],
    ['locked', 'locked'],
    ['something_new', 'something new'],
  ])('the final month state %s reads "%s"', (status, words) => {
    expect(horMonthStateText(status)).toBe(words);
  });
});

describe('the vessel history', () => {
  const rpc = (over: Partial<CrewEmploymentHistoryRpcRow> = {}): CrewEmploymentHistoryRpcRow => ({
    assignment_id: 'a1',
    profile_id: 'p1',
    user_id: 'u1',
    first_name: 'Demo',
    last_name: 'Bosun',
    preferred_name: null,
    position_text: 'Bosun',
    position_id: 'pos-bosun',
    position_name: 'Bosun',
    department_key: 'deck',
    department_label: 'Deck',
    join_date: '2024-03-01',
    leave_date: '2026-02-28',
    duration_days: 729,
    end_reason: 'contract_end',
    end_notes: null,
    current_vessel_id: null,
    current_vessel_name: null,
    ...over,
  });

  it('maps a row, preferring the catalogue position over the title', () => {
    expect(toEmploymentHistoryRow(rpc({ position_name: 'Boatswain', position_text: 'bosun' }))).toMatchObject({
      assignmentId: 'a1',
      profileId: 'p1',
      name: 'Demo Bosun',
      position: 'Boatswain',
      departmentLabel: 'Deck',
      durationDays: 729,
      endReason: 'contract_end',
    });
  });
  it('falls back to the title, works out a missing duration and blanks empty text', () => {
    const row = toEmploymentHistoryRow(rpc({ position_name: null, position_text: 'Lead deckhand', duration_days: null, end_reason: '  ', end_notes: '' }));
    expect(row.position).toBe('Lead deckhand');
    expect(row.durationDays).toBe(729);
    expect(row.endReason).toBeNull();
    expect(row.endNotes).toBeNull();
  });
  it('names a person by their preferred name, else first name', () => {
    expect(historyPersonName('Alexandra', 'Stew', 'Alex')).toBe('Alex Stew');
    expect(historyPersonName('Alexandra', 'Stew', '  ')).toBe('Alexandra Stew');
    expect(historyPersonName(null, null)).toBe('Unnamed crew member');
  });
  it('counts past crew once per person and every record', () => {
    expect(historyCounters([{ profileId: 'p1' }, { profileId: 'p2' }, { profileId: 'p1' }])).toEqual({ pastCrew: 2, records: 3 });
    expect(historyCounters([])).toEqual({ pastCrew: 0, records: 0 });
  });
  it('blocks a re-hire for someone on a crew today, with the reason', () => {
    expect(rehireBlock({ currentVesselId: null, currentVesselName: null }, 'v1')).toBeNull();
    expect(rehireBlock({ currentVesselId: 'v1', currentVesselName: 'DRAAK' }, 'v1')).toBe('Back on this vessel’s crew already.');
    expect(rehireBlock({ currentVesselId: 'v2', currentVesselName: 'GAMMA' }, 'v1')).toBe('On GAMMA’s crew now. Transfer them instead.');
    expect(rehireBlock({ currentVesselId: 'v2', currentVesselName: null }, 'v1')).toBe('On another vessel’s crew now. Transfer them instead.');
  });
});

describe('the re-hire prefill (crew_rehire_prefill)', () => {
  const answer = {
    profile_id: 'p1',
    first_name: 'Demo',
    last_name: 'Bosun',
    preferred_name: null,
    email: 'bosun@example.test',
    has_login: true,
    current: null,
    last_assignment: { assignment_id: 'a1', vessel_id: 'v1', vessel_name: 'DRAAK', position_text: 'Bosun', join_date: '2024-03-01', leave_date: '2026-02-28', end_reason: 'contract_end' },
    terms: {
      position_id: 'pos-bosun',
      department_key: 'deck',
      contract_type_key: 'rotational',
      leave_method: 'ratio',
      leave_days_per_year: null,
      leave_ratio_on: 2,
      leave_ratio_off: 2,
      place_of_embarkation: 'Palma',
      start_date: '2024-03-01',
      end_date: '2026-02-28',
      end_reason: 'contract_end',
    },
  };

  it('reads it in Add crew’s shape', () => {
    expect(parseRehirePrefill(answer)).toEqual({
      profileId: 'p1',
      displayName: 'Demo Bosun',
      hasLogin: true,
      current: null,
      lastAssignment: { vesselId: 'v1', vesselName: 'DRAAK', position: 'Bosun', joinDate: '2024-03-01', leaveDate: '2026-02-28', endReason: 'contract_end' },
      values: {
        firstName: 'Demo',
        lastName: 'Bosun',
        email: 'bosun@example.test',
        positionId: 'pos-bosun',
        departmentKey: 'deck',
        contractTypeKey: 'rotational',
        placeOfEmbarkation: 'Palma',
        leaveMethod: 'ratio',
        leaveDaysPerYear: '',
        leaveRatioOn: '2',
        leaveRatioOff: '2',
      },
    });
  });
  it('leaves out an email the caller may not see, and terms that are not there', () => {
    const r = parseRehirePrefill({ ...answer, email: null, terms: null, last_assignment: null });
    expect(r?.values).toEqual({ firstName: 'Demo', lastName: 'Bosun' });
    expect(r?.lastAssignment).toBeNull();
  });
  it('names the current vessel of someone on a crew today', () => {
    expect(parseRehirePrefill({ ...answer, current: { vessel_id: 'v2', vessel_name: 'GAMMA' } })?.current).toEqual({ vesselId: 'v2', vesselName: 'GAMMA' });
  });
  it('ignores an unknown leave method', () => {
    expect(parseRehirePrefill({ ...answer, terms: { ...answer.terms, leave_method: 'bank' } })?.values.leaveMethod).toBeUndefined();
  });
  it('is null when it cannot be read', () => {
    expect(parseRehirePrefill(null)).toBeNull();
    expect(parseRehirePrefill([answer])).toBeNull();
    expect(parseRehirePrefill({ ...answer, profile_id: '' })).toBeNull();
  });
});

describe('the contract’s probation and notice periods', () => {
  it('reads the 061100 columns when they are there', () => {
    expect(contractNoticeOf({ probation_months: 3, notice_during_probation_days: 7, notice_after_probation_days: 30, notice_period_days: 30 })).toEqual({
      known: true,
      probationMonths: 3,
      noticeDuringProbationDays: 7,
      noticeAfterProbationDays: 30,
    });
    expect(contractNoticeOf({ probation_months: null, notice_during_probation_days: null, notice_after_probation_days: null })).toEqual({
      known: true,
      probationMonths: null,
      noticeDuringProbationDays: null,
      noticeAfterProbationDays: null,
    });
  });
  it('D-01: without the columns the legacy notice stands in for the notice after probation', () => {
    expect(contractNoticeOf({ notice_period_days: 28 })).toEqual({ known: false, probationMonths: null, noticeDuringProbationDays: null, noticeAfterProbationDays: 28 });
    expect(contractNoticeOf(null).known).toBe(false);
  });
  it('words the periods', () => {
    expect(probationText(3)).toBe('3 months');
    expect(probationText(1)).toBe('1 month');
    expect(probationText(0)).toBe('No probation');
    expect(probationText(null)).toBeNull();
    expect(noticeText(30)).toBe('30 days');
    expect(noticeText(1)).toBe('1 day');
    expect(noticeText(0)).toBe('No notice');
    expect(noticeText(null)).toBeNull();
  });
  it.each([
    ['', 0, 24, null],
    [' 3 ', 0, 24, 3],
    ['0', 0, 24, 0],
    ['24', 0, 24, 24],
    ['25', 0, 24, 'invalid'],
    ['-1', 0, 24, 'invalid'],
    ['2.5', 0, 24, 'invalid'],
    ['three', 0, 24, 'invalid'],
  ])('parseWholeInRange(%j, %i, %i) = %j', (input, min, max, expected) => {
    expect(parseWholeInRange(input, min, max)).toBe(expected);
  });
  it('the patch keeps the legacy readers’ columns in step', () => {
    expect(toContractNoticePatch({ probationMonths: '3', noticeDuringProbationDays: '7', noticeAfterProbationDays: '30' }, { start_date: '2026-01-31' })).toEqual({
      probation_months: 3,
      notice_during_probation_days: 7,
      notice_after_probation_days: 30,
      notice_period_days: 30,
      probation_end_date: '2026-04-30',
    });
    expect(toContractNoticePatch({ probationMonths: '0', noticeDuringProbationDays: '', noticeAfterProbationDays: '' }, { start_date: '2026-01-31' })).toEqual({
      probation_months: 0,
      notice_during_probation_days: null,
      notice_after_probation_days: null,
      notice_period_days: null,
      probation_end_date: null,
    });
    expect(() => toContractNoticePatch({ probationMonths: '30', noticeDuringProbationDays: '', noticeAfterProbationDays: '' }, { start_date: '2026-01-31' })).toThrow();
  });
});

describe('the terms edit form (crew_onboarding_save’s terms path)', () => {
  const stored = {
    start_date: '2026-03-01',
    position_id: 'pos-bosun',
    department_key: 'deck',
    contract_type_key: 'rotational',
    date_joining_vessel: '2026-03-05',
    review_date: '2026-09-01',
    leave_method: 'days_per_year' as const,
    leave_days_per_year: 30,
    leave_ratio_on: null,
    leave_ratio_off: null,
    place_of_embarkation: 'Palma',
  };
  const notice = { known: true, probationMonths: 3, noticeDuringProbationDays: 7, noticeAfterProbationDays: 30 };
  const all = { editTerms: true, editContract: true, positionsFromCatalogue: true, departmentsAvailable: true };
  const issues = (values: Partial<TermsFormValues>, options = all) => {
    const r = makeTermsSchema(options).safeParse({ ...termsDefaults(stored, notice, null), ...values });
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it('starts from the stored terms and the contract’s periods', () => {
    expect(termsDefaults(stored, notice, null)).toEqual({
      startDate: '2026-03-01',
      positionId: 'pos-bosun',
      departmentKey: 'deck',
      contractTypeKey: 'rotational',
      joiningDate: '2026-03-05',
      reviewDate: '2026-09-01',
      leaveMethod: 'days_per_year',
      leaveDaysPerYear: '30',
      leaveRatioOn: '',
      leaveRatioOff: '',
      placeOfEmbarkation: 'Palma',
      probationMonths: '3',
      noticeDuringProbationDays: '7',
      noticeAfterProbationDays: '30',
    });
  });
  it('a new record starts on the given day with 30 days a year', () => {
    expect(termsDefaults(null, contractNoticeOf(null), '2026-04-01T00:00:00Z')).toMatchObject({ startDate: '2026-04-01', leaveMethod: 'days_per_year', leaveDaysPerYear: '30' });
  });
  it('the stored values pass', () => {
    expect(issues({})).toEqual({});
  });
  it('mirrors the server’s refusals', () => {
    expect(issues({ positionId: '' })).toEqual({ positionId: 'Choose a position' });
    expect(issues({ departmentKey: '' })).toEqual({ departmentKey: 'Choose a department' });
    expect(issues({ joiningDate: '2026-02-01' })).toEqual({ joiningDate: 'The date joining the vessel cannot be before the start date' });
    expect(issues({ reviewDate: '2026-02-01' })).toEqual({ reviewDate: 'The review date cannot be before the start date' });
    expect(issues({ leaveDaysPerYear: '400' })).toEqual({ leaveDaysPerYear: 'Enter 0 to 365 days, with up to two decimals' });
    expect(issues({ leaveMethod: 'ratio', leaveRatioOn: '', leaveRatioOff: '2' })).toEqual({ leaveRatioOn: 'Enter a whole number from 1' });
    expect(issues({ leaveMethod: 'ratio', leaveRatioOn: '2', leaveRatioOff: '0' })).toEqual({ leaveRatioOff: 'Enter a whole number from 1' });
    expect(issues({ placeOfEmbarkation: 'x'.repeat(121) })).toEqual({ placeOfEmbarkation: 'Keep the place of embarkation to 120 characters' });
    expect(issues({ probationMonths: '25' })).toEqual({ probationMonths: 'Enter 0 to 24 months' });
    expect(issues({ noticeDuringProbationDays: '366', noticeAfterProbationDays: 'x' })).toEqual({
      noticeDuringProbationDays: 'Enter 0 to 365 days',
      noticeAfterProbationDays: 'Enter 0 to 365 days',
    });
    expect(issues({ startDate: '' })).toEqual({ startDate: 'Enter the start date' });
  });
  it('only checks the parts the viewer saves', () => {
    expect(issues({ positionId: '', probationMonths: '99' }, { ...all, editTerms: false })).toEqual({ probationMonths: 'Enter 0 to 24 months' });
    expect(issues({ positionId: '', probationMonths: '99' }, { ...all, editContract: false })).toEqual({ positionId: 'Choose a position' });
  });
  it('without the position list a position is not required (D-01)', () => {
    expect(issues({ positionId: '' }, { ...all, positionsFromCatalogue: false })).toEqual({});
  });
  it('says which part changed', () => {
    const initial = termsDefaults(stored, notice, null);
    expect(termsChanges(initial, initial)).toEqual({ terms: false, contract: false });
    expect(termsChanges({ ...initial, reviewDate: '2026-10-01' }, initial)).toEqual({ terms: true, contract: false });
    expect(termsChanges({ ...initial, noticeAfterProbationDays: '60' }, initial)).toEqual({ terms: false, contract: true });
    expect(termsChanges({ ...initial, placeOfEmbarkation: ' Palma ' }, initial)).toEqual({ terms: false, contract: false });
  });
  it('sends every key the save takes (a save of the same start date replaces the row)', () => {
    const values = termsDefaults(stored, notice, null);
    expect(toTermsPayload(values, { positionsFromCatalogue: true, departmentsAvailable: true })).toEqual({
      start_date: '2026-03-01',
      position_id: 'pos-bosun',
      department_key: 'deck',
      date_joining_vessel: '2026-03-05',
      review_date: '2026-09-01',
      contract_type_key: 'rotational',
      place_of_embarkation: 'Palma',
      leave_method: 'days_per_year',
      leave_days_per_year: 30,
    });
    expect(toTermsPayload({ ...values, leaveMethod: 'ratio', leaveRatioOn: '3', leaveRatioOff: '3' }, { positionsFromCatalogue: false, departmentsAvailable: false })).toEqual({
      start_date: '2026-03-01',
      date_joining_vessel: '2026-03-05',
      review_date: '2026-09-01',
      contract_type_key: 'rotational',
      place_of_embarkation: 'Palma',
      leave_method: 'ratio',
      leave_ratio_on: 3,
      leave_ratio_off: 3,
    });
    expect(toTermsPayload({ ...values, leaveMethod: 'none', reviewDate: '' }, { positionsFromCatalogue: true, departmentsAvailable: true })).not.toHaveProperty('review_date');
  });
  it.each([
    ['start_date', 'startDate'],
    ['position_id', 'positionId'],
    ['department_key', 'departmentKey'],
    ['date_joining_vessel', 'joiningDate'],
    ['review_date', 'reviewDate'],
    ['contract_type_key', 'contractTypeKey'],
    ['leave_method', 'leaveMethod'],
    ['something', null],
    [null, null],
  ])('a terms HINT %j lands on %j', (hint, field) => {
    expect(termsFieldFor(hint)).toBe(field);
  });
});
