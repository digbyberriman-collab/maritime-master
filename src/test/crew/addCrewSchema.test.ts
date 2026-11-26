/**
 * Add crew member's model (X1-03B; gap/04 C14, C15, C55, W1): the field
 * rules, the derived status, the leave allowance, the role a position
 * implies (D-189 allow-list), the two save payloads, the duplicate rules
 * and the honest outcome of every create answer with every terms answer.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  ADD_CREW_PATH,
  ADD_CREW_ROLES,
  DEFAULT_LEAVE_DAYS,
  EMAIL_OPTIONAL,
  NO_EMAIL_HELP,
  ONBOARDING_MISSING_SENTENCE,
  ONBOARDING_TERM_KEYS,
  accessSetPreview,
  addCrewDefaults,
  addCrewPath,
  addCrewResult,
  addCrewSchema,
  defaultRoleForPosition,
  deriveJoinStatus,
  duplicateKey,
  duplicatesBlockSave,
  employmentNotSavedLine,
  leaveDaysPerMonthText,
  makeAddCrewSchema,
  parseLeaveDays,
  parseRatioPart,
  rehireResult,
  toCreateCrewInput,
  toOnboardingTerms,
  type AddCrewValues,
  type OnboardingOutcome,
} from '@/modules/crew/lib/addCrewSchema';
import { CREW_MEMBER_ROLES, NOT_STORED_NOTE, type CreateCrewOutcome, type EdgeFailure } from '@/modules/auth/services/adminActions';
import { CREW_ROUTES } from '@/modules/crew/routes';
import { ACCESS_SET_LABEL } from '@/modules/crew/types/domain';

const valid = (over: Partial<AddCrewValues> = {}): AddCrewValues =>
  addCrewDefaults({
    firstName: '  Demo ',
    lastName: ' Deckhand ',
    email: ' Deckhand.New@Example.test ',
    positionId: 'pos-deckhand',
    departmentKey: 'deck',
    startDate: '2026-12-01',
    ...over,
  });

/** The first message per field, as the form shows it (zodResolver keeps the first error). */
const issues = (values: AddCrewValues, schema = addCrewSchema) => {
  const r = schema.safeParse(values);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[i.path.join('.')] ??= i.message;
  return out;
};

describe('the route', () => {
  it('is crew/new on the vessel, declared once in routes.tsx behind crew profile creation', () => {
    expect(ADD_CREW_PATH).toBe('crew/new');
    const route = CREW_ROUTES.find((r) => r.path === ADD_CREW_PATH);
    expect(route && 'guard' in route ? route.guard : null).toEqual({ kind: 'capability', capability: 'vessel.crew.crew_profiles.create' });
    expect(addCrewPath()).toBe('crew/new');
    expect(addCrewPath({ rehire: 'b0000000-0000-4000-8000-000000000015' })).toBe('crew/new?rehire=b0000000-0000-4000-8000-000000000015');
    expect(addCrewPath({ rehire: 'a b' })).toBe('crew/new?rehire=a%20b');
  });
});

describe('defaults', () => {
  it('invites by default (D-189), 30 days a year (W1), the crew role, nothing else filled', () => {
    const d = addCrewDefaults();
    expect(d.sendInvite).toBe(true);
    expect(d.leaveMethod).toBe('days_per_year');
    expect(d.leaveDaysPerYear).toBe(String(DEFAULT_LEAVE_DAYS));
    expect(d.role).toBe('crew');
    expect(d.firstName).toBe('');
    expect(addCrewDefaults({ firstName: 'Kept' }).firstName).toBe('Kept');
  });
});

describe('the schema (W1 field rules)', () => {
  it('accepts a complete new crew member and trims the names', () => {
    const r = addCrewSchema.safeParse(valid());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.firstName).toBe('Demo');
      expect(r.data.lastName).toBe('Deckhand');
    }
  });

  it('names: 1 to 50 characters after trimming', () => {
    expect(issues(valid({ firstName: '   ' }))).toMatchObject({ firstName: 'Enter the first name' });
    expect(issues(valid({ lastName: '' }))).toMatchObject({ lastName: 'Enter the last name' });
    expect(issues(valid({ firstName: 'x'.repeat(51) }))).toMatchObject({ firstName: 'Keep the first name to 50 characters' });
    expect(issues(valid({ firstName: ` ${'x'.repeat(50)} ` }))).toEqual({});
  });

  it('email: required and valid until PR-X1-H; optional mode accepts a blank but not a bad address', () => {
    expect(EMAIL_OPTIONAL).toBe(false);
    expect(issues(valid({ email: '' }))).toMatchObject({ email: 'Enter an email address' });
    expect(issues(valid({ email: 'not-an-email' }))).toMatchObject({ email: 'Enter a valid email address' });
    const optional = makeAddCrewSchema({ emailOptional: true });
    expect(issues(valid({ email: '' }), optional)).toEqual({});
    expect(issues(valid({ email: 'nope' }), optional)).toMatchObject({ email: 'Enter a valid email address' });
    expect(NO_EMAIL_HELP).toMatch(/cannot sign in/);
  });

  it('position: from the catalogue when it is set up, else a typed title (D-01); department required when the list exists', () => {
    expect(issues(valid({ positionId: '' }))).toMatchObject({ positionId: 'Choose a position' });
    expect(issues(valid({ departmentKey: '' }))).toMatchObject({ departmentKey: 'Choose a department' });
    const notSetUp = makeAddCrewSchema({ positionsFromCatalogue: false, departmentsAvailable: false });
    expect(issues(valid({ positionId: '', departmentKey: '', positionTitle: '' }), notSetUp)).toEqual({ positionTitle: 'Enter the position' });
    expect(issues(valid({ positionId: '', departmentKey: '', positionTitle: 'Deckhand' }), notSetUp)).toEqual({});
    expect(issues(valid({ positionTitle: 'x'.repeat(81) }), notSetUp)).toMatchObject({ positionTitle: 'Keep the position to 80 characters' });
  });

  it('dates: start required; joining and review on or after the start; real dates only', () => {
    expect(issues(valid({ startDate: '' }))).toMatchObject({ startDate: 'Enter the start date' });
    expect(issues(valid({ startDate: '2026-02-30' }))).toMatchObject({ startDate: 'Enter a valid date' });
    expect(issues(valid({ joiningDate: '2026-11-30' }))).toMatchObject({ joiningDate: 'The joining date cannot be before the start date' });
    expect(issues(valid({ joiningDate: '2026-12-01', reviewDate: '2027-06-01' }))).toEqual({});
    expect(issues(valid({ reviewDate: '2026-01-01' }))).toMatchObject({ reviewDate: 'The review date cannot be before the start date' });
    expect(issues(valid({ reviewDate: 'soon' }))).toMatchObject({ reviewDate: 'Enter a valid date' });
  });

  it('leave allowance: days 0 to 365 with two decimals, both ratio parts whole from 1, nothing for none', () => {
    expect(issues(valid({ leaveDaysPerYear: '' }))).toHaveProperty('leaveDaysPerYear');
    expect(issues(valid({ leaveDaysPerYear: '366' }))).toHaveProperty('leaveDaysPerYear');
    expect(issues(valid({ leaveDaysPerYear: '30.125' }))).toHaveProperty('leaveDaysPerYear');
    expect(issues(valid({ leaveDaysPerYear: '-1' }))).toHaveProperty('leaveDaysPerYear');
    expect(issues(valid({ leaveDaysPerYear: '0' }))).toEqual({});
    expect(issues(valid({ leaveDaysPerYear: '22.5' }))).toEqual({});
    expect(issues(valid({ leaveMethod: 'ratio', leaveRatioOn: '', leaveRatioOff: '1' }))).toEqual({ leaveRatioOn: 'Enter a whole number from 1' });
    expect(issues(valid({ leaveMethod: 'ratio', leaveRatioOn: '2', leaveRatioOff: '0' }))).toEqual({ leaveRatioOff: 'Enter a whole number from 1' });
    expect(issues(valid({ leaveMethod: 'ratio', leaveRatioOn: '2', leaveRatioOff: '1', leaveDaysPerYear: 'junk' }))).toEqual({});
    expect(issues(valid({ leaveMethod: 'none', leaveDaysPerYear: 'junk' }))).toEqual({});
  });

  it('role: only the D-189 allow-list (the edge function\'s CREW_ROLES)', () => {
    expect([...ADD_CREW_ROLES]).toEqual([...CREW_MEMBER_ROLES]);
    expect(issues(valid({ role: 'dpa' as AddCrewValues['role'] }))).toHaveProperty('role');
  });
});

describe('derived status, leave text, role, access-set preview', () => {
  const today = '2026-11-26';
  it.each([
    ['2026-11-01', '', 'on_board'],
    ['2026-11-26', '', 'on_board'],
    ['2026-11-27', '', 'pending'],
    ['2026-11-01', '2026-11-26', 'on_board'],
    ['2026-11-01', '2026-12-10', 'pending'],
    ['', '', null],
    ['2026-13-01', '', null],
  ] as const)('start %s, joining %s → %s', (start, joining, status) => {
    expect(deriveJoinStatus(start, joining, today)).toBe(status);
  });

  it('days a year to days a month (W1 hint "= 2.50 days/month")', () => {
    expect(leaveDaysPerMonthText('30')).toBe('= 2.50 days/month');
    expect(leaveDaysPerMonthText('25')).toBe('= 2.08 days/month');
    expect(leaveDaysPerMonthText('0')).toBe('= 0.00 days/month');
    expect(leaveDaysPerMonthText('abc')).toBeNull();
    expect(parseLeaveDays(' 30.5 ')).toBe(30.5);
    expect(parseLeaveDays('1e2')).toBeNull();
    expect(parseRatioPart('2')).toBe(2);
    expect(parseRatioPart('1.5')).toBeNull();
    expect(parseRatioPart('0')).toBeNull();
  });

  it.each([
    ['master', 'master'],
    ['chief_officer', 'chief_officer'],
    ['chief_engineer', 'chief_engineer'],
    ['staff_captain', 'crew'],
    ['bosun', 'crew'],
    [' MASTER ', 'master'],
    [null, 'crew'],
  ] as const)('position %s defaults the role to %s', (key, role) => {
    expect(defaultRoleForPosition(key)).toBe(role);
  });

  it('previews the position\'s default access set by its label', () => {
    expect(accessSetPreview('hod', ACCESS_SET_LABEL)).toBe('Head of department');
    expect(accessSetPreview(null, ACCESS_SET_LABEL)).toBe('No default access set');
  });
});

describe('payloads', () => {
  it('create-crew-member: trimmed names, lower-case email, vessel, role, the canonical position name, the joining (else start) date', () => {
    expect(toCreateCrewInput(valid({ joiningDate: '2026-12-10', role: 'master', sendInvite: false }), { vesselId: 'v-dra', positionName: 'Deckhand' })).toEqual({
      email: 'deckhand.new@example.test',
      firstName: 'Demo',
      lastName: 'Deckhand',
      role: 'master',
      vesselId: 'v-dra',
      position: 'Deckhand',
      joinDate: '2026-12-10',
      sendInvite: false,
    });
    const typed = toCreateCrewInput(valid({ positionTitle: ' Relief Bosun ' }), { vesselId: 'v-dra', positionName: null });
    expect(typed.position).toBe('Relief Bosun');
    expect(typed.joinDate).toBe('2026-12-01');
    expect(typed).not.toHaveProperty('password');
  });

  it('crew_onboarding_save: only keys the server knows, only filled ones, the leave shape its CHECK wants', () => {
    const terms = toOnboardingTerms(
      valid({ joiningDate: '2026-12-05', reviewDate: '2027-03-01', contractTypeKey: 'rotational', placeOfEmbarkation: ' Antibes ' }),
      { positionsFromCatalogue: true, departmentsAvailable: true },
    );
    expect(terms).toEqual({
      start_date: '2026-12-01',
      position_id: 'pos-deckhand',
      department_key: 'deck',
      date_joining_vessel: '2026-12-05',
      review_date: '2027-03-01',
      contract_type_key: 'rotational',
      place_of_embarkation: 'Antibes',
      leave_method: 'days_per_year',
      leave_days_per_year: 30,
    });
    expect(Object.keys(terms).every((k) => (ONBOARDING_TERM_KEYS as readonly string[]).includes(k))).toBe(true);

    expect(toOnboardingTerms(valid({ leaveMethod: 'ratio', leaveRatioOn: '2', leaveRatioOff: '1' }), { positionsFromCatalogue: true, departmentsAvailable: true })).toMatchObject({
      leave_method: 'ratio',
      leave_ratio_on: 2,
      leave_ratio_off: 1,
    });
    const none = toOnboardingTerms(valid({ leaveMethod: 'none' }), { positionsFromCatalogue: true, departmentsAvailable: true });
    expect(none.leave_method).toBe('none');
    expect(none).not.toHaveProperty('leave_days_per_year');
    expect(none).not.toHaveProperty('leave_ratio_on');
    // D-01: a typed title and no department list send neither id.
    const typed = toOnboardingTerms(valid({ positionId: '', departmentKey: '' }), { positionsFromCatalogue: false, departmentsAvailable: false });
    expect(typed).not.toHaveProperty('position_id');
    expect(typed).not.toHaveProperty('department_key');
  });
});

describe('the duplicate check', () => {
  it('runs again only when the email or a name changes (case and spaces ignored)', () => {
    const a = duplicateKey(valid());
    expect(duplicateKey(valid({ firstName: 'demo', email: 'DECKHAND.NEW@example.test' }))).toBe(a);
    expect(duplicateKey(valid({ lastName: 'Deckhand  Two' }))).not.toBe(a);
  });

  it('the same email blocks; the same name blocks until confirmed; no match never blocks', () => {
    expect(duplicatesBlockSave([], false)).toBe(false);
    expect(duplicatesBlockSave([{ matchKind: 'email' }], true)).toBe(true);
    expect(duplicatesBlockSave([{ matchKind: 'name' }], false)).toBe(true);
    expect(duplicatesBlockSave([{ matchKind: 'name_dob' }, { matchKind: 'name' }], true)).toBe(false);
  });
});

// ---------------------------------------------------------------- outcomes

const failure = (over: Partial<EdgeFailure>): EdgeFailure => ({
  status: 400,
  code: 'invalid_request',
  reason: null,
  message: 'Something in the request is not right.',
  retryAfterSeconds: null,
  details: {},
  ...over,
});

const SAVED: OnboardingOutcome = { status: 'saved' };
const MISSING: OnboardingOutcome = { status: 'missing' };
const REFUSED: OnboardingOutcome = { status: 'failed', message: 'This person is not on this vessel’s crew.' };

describe('the outcome (non-negotiable 9)', () => {
  it('created and invited, terms saved: "Added and invited"', () => {
    const r = addCrewResult({ kind: 'created', profileId: 'p-new', invited: 'sent', stored: true, assignment: 'pending_login' }, SAVED);
    expect(r).toMatchObject({ kind: 'added', tone: 'success', title: 'Added and invited', profileId: 'p-new', invited: true, employmentSaved: true });
    if (r.kind === 'added') {
      expect(r.lines[0]).toBe('Their employment details are saved.');
      expect(r.lines).toContain('STORM emailed them an invitation.');
      expect(r.lines.join(' ')).toMatch(/Pending login/);
    }
  });

  it('an unstored send says delivery is not tracked', () => {
    const r = addCrewResult({ kind: 'created', profileId: 'p-new', invited: 'sent', stored: false }, SAVED);
    expect(r.kind === 'added' && r.lines.join(' ')).toContain(NOT_STORED_NOTE);
  });

  it('created without an invitation: "Added, not invited"', () => {
    const r = addCrewResult({ kind: 'created', profileId: 'p-new', invited: 'not_sent', stored: true }, SAVED);
    expect(r).toMatchObject({ kind: 'added', tone: 'success', title: 'Added, not invited', invited: false });
  });

  it('terms store missing (D-01): "Added. The employment details were not saved: …. Open the profile to add them."', () => {
    const r = addCrewResult({ kind: 'created', profileId: 'p-new', invited: 'sent', stored: true }, MISSING);
    expect(r).toMatchObject({ kind: 'added', tone: 'warning', title: 'Added', employmentSaved: false, profileId: 'p-new' });
    if (r.kind === 'added') {
      expect(r.lines[0]).toBe(`The employment details were not saved: ${ONBOARDING_MISSING_SENTENCE}. Open the profile to add them.`);
      expect(r.lines).toContain('STORM emailed them an invitation.');
    }
  });

  it('terms refused: the server\'s sentence inside the same template', () => {
    expect(employmentNotSavedLine(REFUSED)).toBe('The employment details were not saved: this person is not on this vessel’s crew. Open the profile to add them.');
    const r = addCrewResult({ kind: 'created', profileId: 'p-new', invited: 'not_sent', stored: true }, REFUSED);
    expect(r).toMatchObject({ kind: 'added', tone: 'warning', title: 'Added', employmentSaved: false });
  });

  it('the invitation email failed: added, not invited, with the reason and where to resend', () => {
    const r = addCrewResult({ kind: 'created_invite_failed', profileId: 'p-new', emailError: 'not_configured', inviteCode: null, assignmentFailed: false }, SAVED);
    expect(r).toMatchObject({ kind: 'added', tone: 'warning', title: 'Added, not invited', invited: false });
    expect(r.kind === 'added' && r.lines.join(' ')).toMatch(/could not be sent: Email sending is not set up for STORM yet.*Users & Access/);
  });

  it('the vessel assignment failed after the invitation: said, with what to do', () => {
    const r = addCrewResult({ kind: 'created_assignment_failed', profileId: 'p-new', invited: 'sent' }, SAVED);
    expect(r).toMatchObject({ kind: 'added', tone: 'warning', title: 'Added and invited' });
    expect(r.kind === 'added' && r.lines.join(' ')).toMatch(/vessel assignment could not be saved/);
  });

  it('a partial answer without the new id cannot save the terms and says so', () => {
    const r = addCrewResult({ kind: 'created_invite_failed', profileId: null, emailError: null, inviteCode: 'internal_error', assignmentFailed: false }, null);
    expect(r).toMatchObject({ kind: 'added', tone: 'warning', employmentSaved: false, profileId: '' });
    expect(r.kind === 'added' && r.lines[0]).toMatch(/employment details were not saved/);
  });

  it('unconfirmed (a 2xx STORM cannot read): never "added"', () => {
    const r = addCrewResult({ kind: 'unconfirmed' }, null);
    expect(r).toMatchObject({ kind: 'unconfirmed', tone: 'warning' });
  });

  it('refused: not added, at the field the function named, with a retry only when trying again can help', () => {
    const conflict = addCrewResult({ kind: 'failed', failure: failure({ status: 409, code: 'conflict', message: 'This email address cannot be used for a new crew member.' }) }, null);
    expect(conflict).toMatchObject({ kind: 'not_added', field: 'email', retry: false, message: 'This email address cannot be used for a new crew member.' });
    const placeholder = addCrewResult({ kind: 'failed', failure: failure({ reason: 'placeholder_email' }) }, null);
    expect(placeholder).toMatchObject({ kind: 'not_added', field: 'email' });
    const named = addCrewResult({ kind: 'failed', failure: failure({ details: { field: 'lastName' } }) }, null);
    expect(named).toMatchObject({ field: 'lastName' });
    const forbidden = addCrewResult({ kind: 'failed', failure: failure({ status: 403, code: 'forbidden', message: "You don't have permission to do that." }) }, null);
    expect(forbidden).toMatchObject({ kind: 'not_added', field: null, retry: false });
    const network = addCrewResult({ kind: 'failed', failure: failure({ status: null, code: 'network' }) }, null);
    expect(network).toMatchObject({ kind: 'not_added', retry: true });
  });

  it('every create answer maps to exactly one outcome kind', () => {
    const answers: CreateCrewOutcome[] = [
      { kind: 'created', profileId: 'p', invited: 'sent', stored: true },
      { kind: 'created', profileId: 'p', invited: 'not_sent', stored: true },
      { kind: 'created_invite_failed', profileId: 'p', emailError: null, inviteCode: 'x', assignmentFailed: true },
      { kind: 'created_assignment_failed', profileId: 'p', invited: null },
      { kind: 'unconfirmed' },
      { kind: 'failed', failure: failure({}) },
    ];
    expect(answers.map((a) => addCrewResult(a, a.kind.startsWith('created') ? SAVED : null).kind)).toEqual(['added', 'added', 'added', 'added', 'unconfirmed', 'not_added']);
  });
});

describe('a re-hire saves the terms only', () => {
  it('saved, missing and refused', () => {
    expect(rehireResult(SAVED, 'p-old')).toMatchObject({ kind: 'added', tone: 'success', title: 'Employment saved', profileId: 'p-old' });
    expect(rehireResult(MISSING, 'p-old')).toMatchObject({ kind: 'not_added', retry: false });
    expect(rehireResult(REFUSED, 'p-old')).toMatchObject({ kind: 'not_added', retry: true, message: 'This person is not on this vessel’s crew.' });
  });
});
