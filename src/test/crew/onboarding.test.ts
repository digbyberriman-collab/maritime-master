/**
 * Onboarding progress (gap/04 C18; X1-10B; src/modules/crew/lib/onboarding.ts):
 *
 * - the eight checks in STORM's order, each with its words and its fix;
 * - the parse of the server's `checks` jsonb as crew_onboarding_rows builds
 *   it (061000): unknown keys ignored, a key twice counts once, a missing
 *   or unreadable state is "not checked", never done or failed;
 * - the score, exhaustively over every combination of the eight states
 *   (3^8): passed / known checks, rounded as the server's round() does,
 *   complete only when every known check passes; the server's is_open rule
 *   agrees with the browser's for every combination and familiarisation
 *   count;
 * - where each check is fixed (the person's own signature only), the
 *   joiner's familiarisations, the row parse and its refusals, and the
 *   words (join line, outstanding list, dates).
 */
import { describe, expect, it } from 'vitest';
import {
  MY_SIGNATURE_PATH,
  ONBOARDING_CHECKS,
  ONBOARDING_CHECK_COUNT,
  ONBOARDING_CHECK_KEYS,
  ONBOARDING_CHECK_STATES,
  OnboardingShapeError,
  checkFix,
  checkLine,
  familiarisationLine,
  fixHref,
  formatDay,
  isOnboardingCheckKey,
  joinText,
  onboardingCheckDef,
  onboardingScore,
  outstandingText,
  parseOnboardingChecks,
  parseOnboardingFamiliarisation,
  parseOnboardingRow,
  parseOnboardingRows,
  personName,
  profileTabPath,
  scoreText,
  unknownText,
  type OnboardingCheckState,
} from '@/modules/crew/lib/onboarding';
import { HRIS_PATHS } from '@/modules/hris/paths';

/** The checks jsonb as crew_onboarding_rows writes it, for a list of eight states. */
function serverChecks(states: readonly OnboardingCheckState[], stcw = { ok: 4, n: 4 }) {
  return ONBOARDING_CHECK_KEYS.map((key, i) => {
    const state = states[i];
    if (key === 'signature' && state === 'unknown') return { key, state, detail: 'not_set_up' };
    if (key === 'stcw_basic') {
      if (state === 'unknown') return { key, state, detail: 'not_configured' };
      return { key, state, detail: `${stcw.ok} of ${stcw.n}` };
    }
    return { key, state };
  });
}

/** The SQL's numbers: n_pass, n_known, round(n_pass * 100 / n_known) (half away from zero), 0 when nothing is known. */
function sqlScore(states: readonly OnboardingCheckState[]) {
  const pass = states.filter((s) => s === 'pass').length;
  const known = states.filter((s) => s !== 'unknown').length;
  const percent = known === 0 ? 0 : Math.floor((pass * 100) / known + 0.5);
  return { pass, known, percent };
}

/** Every combination of the eight states. */
function* everyCombination(): Generator<OnboardingCheckState[]> {
  const total = ONBOARDING_CHECK_STATES.length ** ONBOARDING_CHECK_COUNT;
  for (let n = 0; n < total; n++) {
    const states: OnboardingCheckState[] = [];
    let x = n;
    for (let i = 0; i < ONBOARDING_CHECK_COUNT; i++) {
      states.push(ONBOARDING_CHECK_STATES[x % 3]);
      x = Math.floor(x / 3);
    }
    yield states;
  }
}

const ALL_PASS: OnboardingCheckState[] = ONBOARDING_CHECK_KEYS.map(() => 'pass');

const row = (over: Record<string, unknown> = {}) => ({
  profile_id: 'b0000000-0000-4000-8000-000000000036',
  user_id: 'a0000000-0000-4000-8000-000000000036',
  first_name: 'Demo',
  last_name: 'Purser',
  preferred_name: null,
  avatar_url: null,
  position_name: 'Purser',
  department_key: 'purser_office',
  placement_kind: 'assignment',
  join_date: '2026-11-07',
  checks: serverChecks(['pass', 'unknown', 'pass', 'fail', 'pass', 'fail', 'pass', 'pass']),
  passed: 5,
  known: 7,
  percent: 71,
  fam_required: 2,
  fam_completed: 1,
  familiarisation: [
    { record_id: 'f1', template_id: 't1', template_code: 'FAM-2026-001', template_name: 'Arrival safety (24 hours)', status: 'completed', due_date: '2026-11-08', overdue: false },
    { record_id: 'f2', template_id: 't2', template_code: 'FAM-DRA-2026-003', template_name: 'Purser office handover', status: 'in_progress', due_date: '2026-11-21', overdue: true },
  ],
  is_open: true,
  ...over,
});

describe('the eight checks', () => {
  it('are photo, signature, personal, contact, passport, medical, STCW basic and contract, in that order', () => {
    expect(ONBOARDING_CHECK_KEYS).toEqual(['photo', 'signature', 'personal', 'contact', 'passport', 'medical', 'stcw_basic', 'contract']);
    expect(ONBOARDING_CHECK_COUNT).toBe(8);
    expect(ONBOARDING_CHECKS.map((c) => c.key)).toEqual([...ONBOARDING_CHECK_KEYS]);
  });

  it('each has a label, what passes it and a fix label, all different', () => {
    for (const def of ONBOARDING_CHECKS) {
      expect(def.label.length, def.key).toBeGreaterThan(2);
      expect(def.needs.length, def.key).toBeGreaterThan(8);
      expect(def.fixLabel, def.key).toMatch(/^(Add|Set up|Complete) /);
      expect(onboardingCheckDef(def.key)).toBe(def);
    }
    expect(new Set(ONBOARDING_CHECKS.map((c) => c.label)).size).toBe(8);
    expect(new Set(ONBOARDING_CHECKS.map((c) => c.fixLabel)).size).toBe(8);
  });

  it('knows its keys', () => {
    for (const key of ONBOARDING_CHECK_KEYS) expect(isOnboardingCheckKey(key)).toBe(true);
    for (const v of ['', 'Photo', 'stcw', 'medical_fitness', null, 3, undefined]) expect(isOnboardingCheckKey(v)).toBe(false);
  });
});

describe('parseOnboardingChecks', () => {
  it('reads the server answer: unknown signature until the store exists, STCW counted, the rest pass or fail', () => {
    const checks = parseOnboardingChecks(serverChecks(['pass', 'unknown', 'fail', 'pass', 'fail', 'pass', 'fail', 'pass'], { ok: 3, n: 4 }));
    expect(checks.map((c) => [c.key, c.state])).toEqual([
      ['photo', 'pass'],
      ['signature', 'unknown'],
      ['personal', 'fail'],
      ['contact', 'pass'],
      ['passport', 'fail'],
      ['medical', 'pass'],
      ['stcw_basic', 'fail'],
      ['contract', 'pass'],
    ]);
    expect(checks[1].unknownReason).toBe('not_set_up');
    expect(checks[6].progress).toBe('3 of 4');
    expect(checks.filter((c) => c.key !== 'stcw_basic').every((c) => c.progress === null)).toBe(true);
    expect(checks.filter((c) => c.state !== 'unknown').every((c) => c.unknownReason === null)).toBe(true);
    expect(checks.map((c) => c.label)).toEqual(ONBOARDING_CHECKS.map((d) => d.label));
  });

  it('STCW basic with nothing configured is not known (never a pass)', () => {
    const checks = parseOnboardingChecks(serverChecks(ALL_PASS.map((s, i) => (i === 6 ? 'unknown' : s))));
    expect(checks[6]).toMatchObject({ key: 'stcw_basic', state: 'unknown', unknownReason: 'not_configured', progress: null });
  });

  it('always returns the eight, in STORM order, whatever order the server sent', () => {
    const shuffled = [...serverChecks(ALL_PASS)].reverse();
    expect(parseOnboardingChecks(shuffled).map((c) => c.key)).toEqual([...ONBOARDING_CHECK_KEYS]);
  });

  it('ignores a key STORM does not know, and counts a key sent twice once (the first)', () => {
    const checks = parseOnboardingChecks([
      { key: 'photo', state: 'fail' },
      { key: 'photo', state: 'pass' },
      { key: 'bank_details', state: 'fail' },
      { key: 'PHOTO', state: 'pass' },
    ]);
    expect(checks).toHaveLength(8);
    expect(checks[0].state).toBe('fail');
    expect(checks.slice(1).every((c) => c.state === 'unknown' && c.unknownReason === 'not_reported')).toBe(true);
  });

  it('reads a missing key or an unreadable state as not checked', () => {
    const checks = parseOnboardingChecks([{ key: 'passport', state: 'ok' }, { key: 'medical', state: null }, { key: 'contract' }, { key: 'photo', state: 'PASS' }]);
    for (const c of checks) {
      expect(c.state, c.key).toBe('unknown');
      expect(c.unknownReason, c.key).toBe('not_reported');
    }
  });

  it('skips items that are not objects, and reads anything but a list as nothing checked', () => {
    expect(parseOnboardingChecks([null, 'photo', 3, ['photo', 'pass'], { key: 'photo', state: 'pass' }])[0].state).toBe('pass');
    for (const v of [null, undefined, {}, 'checks', 8, { photo: 'pass' }]) {
      const checks = parseOnboardingChecks(v);
      expect(checks).toHaveLength(8);
      expect(checks.every((c) => c.state === 'unknown')).toBe(true);
    }
  });

  it('keeps a progress only when it reads "n of m" on a known check', () => {
    expect(parseOnboardingChecks([{ key: 'stcw_basic', state: 'pass', detail: ' 4 of 4 ' }])[6].progress).toBe('4 of 4');
    expect(parseOnboardingChecks([{ key: 'stcw_basic', state: 'pass', detail: 'all four' }])[6].progress).toBeNull();
    expect(parseOnboardingChecks([{ key: 'stcw_basic', state: 'unknown', detail: '4 of 4' }])[6]).toMatchObject({ progress: null, unknownReason: 'not_reported' });
    expect(parseOnboardingChecks([{ key: 'stcw_basic', state: 'fail', detail: 4 }])[6].progress).toBeNull();
  });
});

describe('onboardingScore: passed / known, over every combination of the eight states', () => {
  it('agrees with the server for all 6561 combinations', () => {
    let n = 0;
    for (const states of everyCombination()) {
      n++;
      const score = onboardingScore(parseOnboardingChecks(serverChecks(states)));
      const sql = sqlScore(states);
      expect(score.passed).toBe(sql.pass);
      expect(score.known).toBe(sql.known);
      expect(score.total).toBe(8);
      // The server answers 0 when nothing is known; the browser says it does not know.
      expect(score.percent).toBe(sql.known === 0 ? null : sql.percent);
      expect(score.complete).toBe(sql.known > 0 && sql.pass === sql.known);
      expect(score.outstanding).toEqual(ONBOARDING_CHECK_KEYS.filter((_, i) => states[i] === 'fail'));
      expect(score.unknown).toEqual(ONBOARDING_CHECK_KEYS.filter((_, i) => states[i] === 'unknown'));
      expect(score.passed + score.outstanding.length + score.unknown.length).toBe(8);
    }
    expect(n).toBe(6561);
  });

  it('rounds half a percent up, as round() does', () => {
    const score = (pass: number, fail: number) =>
      onboardingScore(parseOnboardingChecks(serverChecks(ONBOARDING_CHECK_KEYS.map((_, i) => (i < pass ? 'pass' : i < pass + fail ? 'fail' : 'unknown'))))).percent;
    expect(score(1, 7)).toBe(13); // 12.5
    expect(score(5, 3)).toBe(63); // 62.5
    expect(score(3, 5)).toBe(38); // 37.5
    expect(score(1, 2)).toBe(33);
    expect(score(2, 1)).toBe(67);
    expect(score(6, 1)).toBe(86);
    expect(score(8, 0)).toBe(100);
    expect(score(0, 8)).toBe(0);
    expect(score(0, 0)).toBeNull();
  });

  it('an unknown check never counts for or against', () => {
    const withUnknown = onboardingScore(parseOnboardingChecks(serverChecks(['pass', 'unknown', 'pass', 'pass', 'pass', 'pass', 'unknown', 'pass'])));
    expect(withUnknown).toMatchObject({ passed: 6, known: 6, percent: 100, complete: true, outstanding: [], unknown: ['signature', 'stcw_basic'] });
  });

  it('says the score in words', () => {
    expect(scoreText({ passed: 5, known: 7 })).toBe('5 of 7 checks');
    expect(scoreText({ passed: 1, known: 1 })).toBe('1 of 1 check');
    expect(scoreText({ passed: 0, known: 0 })).toBe('Not checked yet');
  });
});

describe('the words of a check', () => {
  it('says done, what is needed, or why it is not known', () => {
    const [photo, signature, , , , , stcw] = parseOnboardingChecks(serverChecks(['fail', 'unknown', 'pass', 'pass', 'pass', 'pass', 'fail', 'pass'], { ok: 2, n: 4 }));
    expect(checkLine(photo)).toBe('A profile photo');
    expect(checkLine(signature)).toBe('Checked once stored signatures are switched on.');
    expect(checkLine(stcw)).toBe('Every STCW basic safety course this vessel requires · 2 of 4 held');
    const passed = parseOnboardingChecks(serverChecks(ALL_PASS));
    expect(checkLine(passed[0])).toBe('Done');
    expect(checkLine(passed[6])).toBe('Done · 4 of 4');
    expect(unknownText('not_configured')).toBe('No STCW basic courses are required on this vessel yet.');
    expect(unknownText('not_reported')).toBe('Not checked.');
  });
});

describe('where each check is fixed', () => {
  const id = 'b0000000-0000-4000-8000-000000000036';
  const scoped = (rel: string) => `/v/dra/${rel}`;

  it('opens the profile tab, the HR page or the personal signature page for each check', () => {
    const own = Object.fromEntries(ONBOARDING_CHECK_KEYS.map((k) => [k, checkFix(k, { profileId: id, isOwn: true })]));
    expect(own.photo.target).toEqual({ kind: 'absolute', path: `${HRIS_PATHS.personalDetails}?crew=${id}` });
    expect(own.signature.target).toEqual({ kind: 'absolute', path: MY_SIGNATURE_PATH });
    expect(own.personal.target).toEqual({ kind: 'vessel', path: `crew/people/${id}/personal?edit=1` });
    expect(own.contact.target).toEqual({ kind: 'vessel', path: `crew/people/${id}/contact` });
    expect(own.passport.target).toEqual({ kind: 'vessel', path: `crew/people/${id}/documents` });
    expect(own.medical.target).toEqual({ kind: 'vessel', path: `crew/people/${id}/documents` });
    expect(own.stcw_basic.target).toEqual({ kind: 'vessel', path: `crew/people/${id}/stcw` });
    expect(own.contract.target).toEqual({ kind: 'absolute', path: `${HRIS_PATHS.contracts}?crew=${id}` });
    for (const key of ONBOARDING_CHECK_KEYS) expect(own[key].note, key).toBeNull();
  });

  it('gives no signature link for someone else, only a note; every other fix is the same', () => {
    for (const key of ONBOARDING_CHECK_KEYS) {
      const other = checkFix(key, { profileId: id, isOwn: false });
      if (key === 'signature') {
        expect(other.target).toBeNull();
        expect(other.note).toMatch(/Only the crew member/);
      } else {
        expect(other, key).toEqual(checkFix(key, { profileId: id, isOwn: true }));
      }
    }
  });

  it('resolves a vessel path with the scope and leaves an absolute one as it is', () => {
    expect(fixHref({ kind: 'vessel', path: 'crew/people/x/contact' }, scoped)).toBe('/v/dra/crew/people/x/contact');
    expect(fixHref({ kind: 'absolute', path: '/me/signature' }, scoped)).toBe('/me/signature');
  });

  it('encodes the profile id in every link', () => {
    expect(profileTabPath('a/b c', 'stcw')).toBe('crew/people/a%2Fb%20c/stcw');
    expect(checkFix('contract', { profileId: 'a&b', isOwn: false }).target).toEqual({ kind: 'absolute', path: `${HRIS_PATHS.contracts}?crew=a%26b` });
  });
});

describe('a joiner\'s familiarisations', () => {
  it('reads each record, with defaults for a missing name or status', () => {
    expect(
      parseOnboardingFamiliarisation([
        { record_id: 'r1', template_id: 't1', template_code: 'FAM-1', template_name: 'Arrival safety', status: 'awaiting_signatures', due_date: '2026-11-30T00:00:00Z', overdue: false },
        { record_id: 'r2', template_name: '', status: '', due_date: 'soon', overdue: 'yes' },
        { template_name: 'No record id' },
        null,
        'r3',
      ]),
    ).toEqual([
      { recordId: 'r1', templateId: 't1', templateCode: 'FAM-1', templateName: 'Arrival safety', status: 'awaiting_signatures', dueDate: '2026-11-30', overdue: false },
      { recordId: 'r2', templateId: null, templateCode: null, templateName: 'Familiarisation', status: 'open', dueDate: null, overdue: false },
    ]);
    expect(parseOnboardingFamiliarisation(null)).toEqual([]);
    expect(parseOnboardingFamiliarisation({ record_id: 'r1' })).toEqual([]);
  });

  it('says how many required familiarisations are completed', () => {
    expect(familiarisationLine(2, 1)).toBe('1 of 2 required familiarisations completed');
    expect(familiarisationLine(1, 1)).toBe('1 of 1 required familiarisation completed');
    expect(familiarisationLine(2, 5)).toBe('2 of 2 required familiarisations completed');
    expect(familiarisationLine(3, -1)).toBe('0 of 3 required familiarisations completed');
    expect(familiarisationLine(0, 0)).toBeNull();
  });
});

describe('parseOnboardingRow', () => {
  it('reads a joiner, works out the score from the checks and the familiarisations', () => {
    const p = parseOnboardingRow(row());
    expect(p).toMatchObject({
      profileId: 'b0000000-0000-4000-8000-000000000036',
      userId: 'a0000000-0000-4000-8000-000000000036',
      displayName: 'Demo Purser',
      positionName: 'Purser',
      departmentKey: 'purser_office',
      placementKind: 'assignment',
      joinDate: '2026-11-07',
      famRequired: 2,
      famCompleted: 1,
      isOpen: true,
    });
    expect(p.score).toMatchObject({ passed: 5, known: 7, percent: 71, outstanding: ['contact', 'medical'], unknown: ['signature'] });
    expect(p.familiarisation.map((f) => [f.recordId, f.status, f.overdue])).toEqual([
      ['f1', 'completed', false],
      ['f2', 'in_progress', true],
    ]);
  });

  it('the browser\'s open rule is the server\'s, for every combination of checks and familiarisations', () => {
    for (const states of everyCombination()) {
      const sql = sqlScore(states);
      for (const [required, completed] of [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]]) {
        const isOpen = sql.pass < sql.known || completed < required;
        const p = parseOnboardingRow(row({ checks: serverChecks(states), fam_required: required, fam_completed: completed, is_open: isOpen }));
        expect(p.isOpen).toBe(isOpen);
      }
    }
  });

  it('caps completed at required, and reads bad counts as none', () => {
    expect(parseOnboardingRow(row({ fam_required: 1, fam_completed: 3 })).famCompleted).toBe(1);
    expect(parseOnboardingRow(row({ fam_required: -2, fam_completed: 'x' }))).toMatchObject({ famRequired: 0, famCompleted: 0 });
    expect(parseOnboardingRow(row({ fam_required: 2.7, fam_completed: 2.2 }))).toMatchObject({ famRequired: 2, famCompleted: 2 });
  });

  it('reads the placement, and anything else as an assignment', () => {
    expect(parseOnboardingRow(row({ placement_kind: 'planned' })).placementKind).toBe('planned');
    expect(parseOnboardingRow(row({ placement_kind: 'pending_placement' })).placementKind).toBe('pending_placement');
    expect(parseOnboardingRow(row({ placement_kind: 'unknown' })).placementKind).toBe('assignment');
  });

  it('names the person by preferred name, and never leaves the name blank', () => {
    expect(parseOnboardingRow(row({ preferred_name: 'Pip' })).displayName).toBe('Pip Purser');
    expect(parseOnboardingRow(row({ first_name: null, last_name: null })).displayName).toBe('Unnamed crew member');
    expect(personName('  ', 'Bosun', null)).toBe('Bosun');
  });

  it('refuses a row that is not the contract', () => {
    expect(() => parseOnboardingRow(row({ profile_id: null }))).toThrow(OnboardingShapeError);
    expect(() => parseOnboardingRow(row({ profile_id: '' }))).toThrow(OnboardingShapeError);
    expect(() => parseOnboardingRow(null)).toThrow(OnboardingShapeError);
    expect(() => parseOnboardingRow([row()])).toThrow(OnboardingShapeError);
    expect(() => parseOnboardingRows({ rows: [] })).toThrow(OnboardingShapeError);
    expect(() => parseOnboardingRows([row(), 'x'])).toThrow(OnboardingShapeError);
  });

  it('reads no answer as no rows, and keeps the server\'s order', () => {
    expect(parseOnboardingRows(null)).toEqual([]);
    expect(parseOnboardingRows(undefined)).toEqual([]);
    const rows = parseOnboardingRows([row({ profile_id: 'p2' }), row({ profile_id: 'p1' })]);
    expect(rows.map((r) => r.profileId)).toEqual(['p2', 'p1']);
  });

  it('a joiner with every check passed and every familiarisation done is not open', () => {
    const p = parseOnboardingRow(row({ checks: serverChecks(ALL_PASS), fam_required: 2, fam_completed: 2 }));
    expect(p.isOpen).toBe(false);
    expect(p.score.complete).toBe(true);
  });
});

describe('words', () => {
  const today = '2026-11-27';

  it('says when a person joins or joined', () => {
    expect(joinText({ placementKind: 'assignment', joinDate: '2026-11-07' }, today)).toBe('Joined 7 Nov 2026');
    expect(joinText({ placementKind: 'assignment', joinDate: '2026-11-27' }, today)).toBe('Joined 27 Nov 2026');
    expect(joinText({ placementKind: 'assignment', joinDate: '2026-12-02' }, today)).toBe('Joins 2 Dec 2026');
    expect(joinText({ placementKind: 'assignment', joinDate: null }, today)).toBe('Join date not recorded');
    expect(joinText({ placementKind: 'planned', joinDate: '2026-12-09' }, today)).toBe('Joins 9 Dec 2026');
    expect(joinText({ placementKind: 'planned', joinDate: null }, today)).toBe('Joining date not set');
    expect(joinText({ placementKind: 'pending_placement', joinDate: '2026-11-21' }, today)).toBe('Joins once their login is linked');
    expect(joinText({ placementKind: 'pending_placement', joinDate: null }, today)).toBe('Joins once their login is linked');
    expect(joinText({ placementKind: 'pending_placement', joinDate: '2026-12-01' }, today)).toBe('Joins 1 Dec 2026');
  });

  it('lists what is outstanding, naming at most two', () => {
    expect(outstandingText([])).toBeNull();
    expect(outstandingText(['passport'])).toBe('Passport');
    expect(outstandingText(['passport', 'medical'])).toBe('Passport and Medical fitness');
    expect(outstandingText(['photo', 'passport', 'medical'])).toBe('Photo, Passport and 1 more');
    expect(outstandingText(['photo', 'passport', 'medical', 'contract', 'contact'])).toBe('Photo, Passport and 3 more');
    expect(outstandingText(['photo', 'passport', 'medical'], 3)).toBe('Photo, Passport and Medical fitness');
  });

  it('formats a day in local time, or nothing', () => {
    expect(formatDay('2026-01-05')).toBe('5 Jan 2026');
    expect(formatDay('2026-01-05T23:30:00Z')).toBe('5 Jan 2026');
    expect(formatDay(null)).toBeNull();
    expect(formatDay('soon')).toBeNull();
  });
});
