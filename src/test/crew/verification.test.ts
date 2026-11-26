/**
 * The crew document verification rules (X1-05; gap/04 C27, C28, C30, W3,
 * W4): src/modules/crew/lib/verification.ts against the SQL of
 * 20261124060500_crew_document_verification.sql.
 *
 * - the states and decisions (the SQL CHECK and the status registry);
 * - the note rule, the requirement rule (conditional counts in amber,
 *   rejected never counts), the needs-review count;
 * - the verifier rule, exhaustively on one vessel (every combination of
 *   approve, Master, fleet reach, tier and departments) and across vessels,
 *   and the personas of the SQL test with the answers it asserts;
 * - the material change of the 060400 guard and the status after an edit;
 * - the review line, dates, the conditional note;
 * - the alerts-off reason;
 * - the expiry notice stages: the SQL test's stage table, row for row, and
 *   the phrases;
 * - the verify and alerts-off forms, the refusal field.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { statusLabel, statusTone } from '@/shared/components/status/statusTone';
import type { RankTier } from '@/modules/crew/types/domain';
import {
  CREW_OFFICE_DEPARTMENT,
  DECISION_HINT,
  DECISION_LABEL,
  EXPIRY_NOTICE_CATCH_UP_DAYS,
  EXPIRY_NOTICE_STAGES,
  MUTE_REASON_MAX,
  REVERIFY_HINT,
  REVERIFY_WARNING,
  VERIFICATION_DECISIONS,
  VERIFICATION_NOTE_MAX,
  VERIFICATION_STATES,
  VERIFY_BLOCK_MESSAGE,
  buildVerifySchema,
  conditionalNote,
  dayText,
  emptyVerifyValues,
  expiryNoticeStage,
  expiryPhrase,
  isDecision,
  isMaterialChange,
  isReviewed,
  muteReasonProblem,
  muteSchema,
  needsReview,
  noteRequired,
  reviewRefusalField,
  reviewedLine,
  satisfiesRequirements,
  showsAmber,
  statusAfterEdit,
  verificationInputProblem,
  verifierDecision,
  verifierOnVessel,
  verifyRequest,
  type MaterialFields,
  type VerifierVessel,
} from '@/modules/crew/lib/verification';

const ROOT = process.cwd();
const MIGRATION = readFileSync(join(ROOT, 'supabase/migrations/20261124060500_crew_document_verification.sql'), 'utf8');
const SQL_TEST = readFileSync(join(ROOT, 'supabase/tests/sql/crew/document_verification.test.sql'), 'utf8');

// ---------------------------------------------------------------- states and decisions

describe('states and decisions', () => {
  it('the states are the SQL CHECK list, in its order', () => {
    const m = MIGRATION.match(/crew_document_versions_verification_status_check\s+CHECK \(verification_status IN \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const sql = (m?.[1] ?? '').split(',').map((v) => v.trim().replace(/'/g, ''));
    expect([...VERIFICATION_STATES]).toEqual(sql);
  });

  it('the decisions are every state but unverified, each with words and a hint', () => {
    expect([...VERIFICATION_DECISIONS]).toEqual(VERIFICATION_STATES.filter((s) => s !== 'unverified'));
    for (const d of VERIFICATION_DECISIONS) {
      expect(DECISION_LABEL[d].length).toBeGreaterThan(0);
      expect(DECISION_HINT[d].length).toBeGreaterThan(0);
    }
    expect(MIGRATION).toContain("IF v_decision NOT IN ('verified', 'conditionally_approved', 'rejected') THEN");
  });

  it('the status registry reads conditional approval in amber, rejection in danger, verified ok', () => {
    expect(statusTone('crew_document_verification', 'verified')).toBe('ok');
    expect(statusTone('crew_document_verification', 'conditionally_approved')).toBe('warn');
    expect(statusTone('crew_document_verification', 'rejected')).toBe('danger');
    expect(statusLabel('crew_document_verification', 'unverified')).toBe('Not yet verified');
  });

  it('isDecision accepts exactly the three decisions', () => {
    for (const d of VERIFICATION_DECISIONS) expect(isDecision(d)).toBe(true);
    for (const v of ['unverified', 'approved', '', null, undefined, 3, 'VERIFIED']) expect(isDecision(v)).toBe(false);
  });

  it('a note is required for a conditional approval and a rejection only', () => {
    expect(noteRequired('verified')).toBe(false);
    expect(noteRequired('conditionally_approved')).toBe(true);
    expect(noteRequired('rejected')).toBe(true);
  });

  it('verificationInputProblem: every decision with no note, a blank one, a note and one too long', () => {
    const long = 'x'.repeat(VERIFICATION_NOTE_MAX + 1);
    const cases: Array<[unknown, string | null, string | null]> = [
      ['verified', null, null],
      ['verified', '   ', null],
      ['verified', 'Checked', null],
      ['verified', long, 'note_too_long'],
      ['conditionally_approved', null, 'note_required'],
      ['conditionally_approved', '  ', 'note_required'],
      ['conditionally_approved', 'With lenses', null],
      ['conditionally_approved', long, 'note_too_long'],
      ['rejected', null, 'note_required'],
      ['rejected', '', 'note_required'],
      ['rejected', 'Unreadable', null],
      ['rejected', long, 'note_too_long'],
      ['unverified', 'x', 'decision_invalid'],
      ['bogus', 'x', 'decision_invalid'],
      [null, null, 'decision_invalid'],
    ];
    for (const [decision, note, want] of cases) expect(verificationInputProblem(decision, note), `${String(decision)} / ${String(note)}`).toBe(want);
    expect(verificationInputProblem('rejected', 'x'.repeat(VERIFICATION_NOTE_MAX))).toBeNull();
  });

  it('requirements: verified, conditional and unverified count; rejected never; only the conditional shows amber', () => {
    expect(VERIFICATION_STATES.map((s) => [s, satisfiesRequirements(s), showsAmber(s)])).toEqual([
      ['unverified', true, false],
      ['verified', true, false],
      ['conditionally_approved', true, true],
      ['rejected', false, false],
    ]);
  });

  it('needs review: an unverified document, never a legacy row', () => {
    for (const s of VERIFICATION_STATES) {
      expect(needsReview({ verificationStatus: s })).toBe(s === 'unverified');
      expect(needsReview({ verificationStatus: s, legacy: true })).toBe(false);
    }
  });
});

// ---------------------------------------------------------------- the verifier rule

const TIERS: Array<RankTier | null> = ['command', 'hod', 'officer', 'rating', 'trainee', null];
const DEPARTMENTS: Array<string | null> = ['interior', 'deck', CREW_OFFICE_DEPARTMENT, null];

/** Every vessel shape the rule can see. */
function* everyVessel(): Generator<VerifierVessel> {
  for (const holdsApprove of [true, false])
    for (const isMaster of [true, false])
      for (const callerTier of TIERS)
        for (const callerDepartment of DEPARTMENTS)
          for (const subjectDepartment of DEPARTMENTS) yield { holdsApprove, isMaster, callerTier, callerDepartment, subjectDepartment };
}

describe('the verifier rule on one vessel (exhaustive)', () => {
  it('without approve: never', () => {
    for (const v of everyVessel()) if (!v.holdsApprove) for (const fleet of [true, false]) expect(verifierOnVessel(v, fleet)).toBe('not_permitted');
  });

  it('the Master and fleet reach: every department', () => {
    for (const v of everyVessel()) {
      if (!v.holdsApprove) continue;
      expect(verifierOnVessel(v, true)).toBe('ok');
      if (v.isMaster) expect(verifierOnVessel(v, false)).toBe('ok');
    }
  });

  it('the command tier, the Purser\'s office and every tier but the HoD tier: every department', () => {
    for (const v of everyVessel()) {
      if (!v.holdsApprove || v.isMaster) continue;
      if (v.callerTier === 'command' || v.callerDepartment === CREW_OFFICE_DEPARTMENT || v.callerTier !== 'hod') {
        expect(verifierOnVessel(v, false), JSON.stringify(v)).toBe('ok');
      }
    }
  });

  it('a head of department: their own department only (an unknown department is never their own)', () => {
    for (const v of everyVessel()) {
      if (!v.holdsApprove || v.isMaster || v.callerTier !== 'hod' || v.callerDepartment === CREW_OFFICE_DEPARTMENT) continue;
      const own = v.subjectDepartment !== null && v.subjectDepartment === v.callerDepartment;
      expect(verifierOnVessel(v, false), JSON.stringify(v)).toBe(own ? 'ok' : 'out_of_department');
    }
  });
});

describe('the verifier rule across the person\'s vessels', () => {
  const ok: VerifierVessel = { holdsApprove: true, isMaster: false, callerTier: 'hod', callerDepartment: 'deck', subjectDepartment: 'deck' };
  const otherDept: VerifierVessel = { ...ok, subjectDepartment: 'interior' };
  const none: VerifierVessel = { ...ok, holdsApprove: false };

  it('an ineligible caller (inactive, another company, an external viewer): not permitted, even for their own documents', () => {
    expect(verifierDecision({ eligible: false, isOwnDocument: true, fleetReach: true, vessels: [ok] })).toBe('not_permitted');
  });

  it('never one\'s own documents, whatever the rights', () => {
    expect(verifierDecision({ eligible: true, isOwnDocument: true, fleetReach: true, vessels: [ok] })).toBe('own_document');
  });

  it('ok on any vessel wins; else another department; else not permitted', () => {
    expect(verifierDecision({ eligible: true, isOwnDocument: false, fleetReach: false, vessels: [otherDept, ok] })).toBe('ok');
    expect(verifierDecision({ eligible: true, isOwnDocument: false, fleetReach: false, vessels: [none, otherDept] })).toBe('out_of_department');
    expect(verifierDecision({ eligible: true, isOwnDocument: false, fleetReach: false, vessels: [none] })).toBe('not_permitted');
    expect(verifierDecision({ eligible: true, isOwnDocument: false, fleetReach: false, vessels: [] })).toBe('not_permitted');
    expect(verifierDecision({ eligible: true, isOwnDocument: false, fleetReach: true, vessels: [otherDept] })).toBe('ok');
  });

  it('the refusal sentences are the server\'s 42501 DETAIL', () => {
    expect(MIGRATION).toContain("DETAIL = 'You can''t verify your own documents. Someone else on board or in the office checks them.'");
    expect(MIGRATION).toContain("DETAIL = 'As a head of department you verify the documents of your own department only.'");
    expect(MIGRATION).toContain("DETAIL = 'You don''t have permission to verify this person''s documents.'");
    expect(VERIFY_BLOCK_MESSAGE.own_document).toBe("You can't verify your own documents. Someone else on board or in the office checks them.");
    expect(VERIFY_BLOCK_MESSAGE.out_of_department).toBe('As a head of department you verify the documents of your own department only.');
    expect(VERIFY_BLOCK_MESSAGE.not_permitted).toBe("You don't have permission to verify this person's documents.");
  });

  // The personas of supabase/tests/sql/crew/document_verification.test.sql on DRAAK and the answers it asserts.
  type Persona = { tier: RankTier | null; department: string | null; approve: boolean; master?: boolean; fleet?: boolean; onVessel?: boolean };
  const PEOPLE: Record<string, Persona> = {
    'A.chief_stew': { tier: 'hod', department: 'interior', approve: true },
    'A.stew': { tier: 'officer', department: 'interior', approve: false },
    'A.deckhand': { tier: 'rating', department: 'deck', approve: false },
    'A.chief_officer': { tier: 'hod', department: 'deck', approve: true },
    'A.purser': { tier: 'hod', department: 'purser_office', approve: true },
    'A.master_dra': { tier: 'command', department: 'bridge', approve: true, master: true },
    'A.fleet_manager': { tier: null, department: null, approve: true, fleet: true },
    'A.bosun': { tier: 'officer', department: 'deck', approve: true },
    'A.viewer': { tier: 'rating', department: 'deck', approve: false },
    'A.hyd_hod': { tier: 'hod', department: 'interior', approve: false },
    'A.pending': { tier: 'rating', department: 'deck', approve: false },
  };
  const SQL_CASES: Array<[string, string, string]> = [
    ['A.chief_stew', 'A.stew', 'ok'],
    ['A.chief_stew', 'A.deckhand', 'out_of_department'],
    ['A.chief_officer', 'A.deckhand', 'ok'],
    ['A.chief_officer', 'A.stew', 'out_of_department'],
    ['A.purser', 'A.stew', 'ok'],
    ['A.purser', 'A.deckhand', 'ok'],
    ['A.master_dra', 'A.stew', 'ok'],
    ['A.master_dra', 'A.deckhand', 'ok'],
    ['A.fleet_manager', 'A.deckhand', 'ok'],
    ['A.bosun', 'A.stew', 'ok'],
    ['A.master_dra', 'A.pending', 'ok'],
    ['A.viewer', 'A.stew', 'not_permitted'],
    ['A.hyd_hod', 'A.stew', 'not_permitted'],
    ['A.chief_stew', 'A.chief_stew', 'own_document'],
    ['A.master_dra', 'A.master_dra', 'own_document'],
  ];

  it('the SQL test\'s personas give the answers it asserts (and the SQL test lists each case)', () => {
    for (const [caller, subject, answer] of SQL_CASES) {
      expect(SQL_TEST, `${caller} on ${subject}`).toContain(`('${caller}', '${subject}', '${answer}')`);
      const c = PEOPLE[caller];
      const s = PEOPLE[subject];
      const got = verifierDecision({
        eligible: true,
        isOwnDocument: caller === subject,
        fleetReach: Boolean(c.fleet),
        vessels: [{ holdsApprove: c.approve, isMaster: Boolean(c.master), callerTier: c.tier, callerDepartment: c.department, subjectDepartment: s.department }],
      });
      expect(got, `${caller} on ${subject}`).toBe(answer);
    }
  });
});

// ---------------------------------------------------------------- material change

describe('material change (060400 crew_certificates_guard)', () => {
  const base: MaterialFields = {
    number: 'X1', issueDate: '2020-01-01', expiryDate: '2030-01-01', noExpiry: false, issuingCountryCode: 'GB', typeId: 't', file: 'a/crew/p/documents/f.pdf',
  };

  it('no change, blank and null alike, country case ignored: not material', () => {
    expect(isMaterialChange(base, { ...base })).toBe(false);
    expect(isMaterialChange({ ...base, number: null }, { ...base, number: '  ' })).toBe(false);
    expect(isMaterialChange(base, { ...base, issuingCountryCode: 'gb' })).toBe(false);
    expect(isMaterialChange(base, { ...base, number: ' X1 ' })).toBe(false);
  });

  it('each material field changing is material', () => {
    const changes: Array<Partial<MaterialFields>> = [
      { number: 'X2' }, { issueDate: '2021-01-01' }, { expiryDate: '2031-01-01' }, { expiryDate: null, noExpiry: true }, { noExpiry: true },
      { issuingCountryCode: 'FR' }, { issuingCountryCode: null }, { typeId: 'u' }, { file: 'new-file' }, { file: null },
    ];
    for (const c of changes) expect(isMaterialChange(base, { ...base, ...c }), JSON.stringify(c)).toBe(true);
  });

  it('the guard\'s list: the same columns are compared in SQL (trigger and guard)', () => {
    expect(MIGRATION).toContain('(NEW.certificate_number, NEW.issue_date, NEW.expiry_date, NEW.no_expiry, NEW.issuing_country_code,\n          NEW.document_type_id, NEW.file_path, NEW.file_url, NEW.certificate_type)');
  });

  it('after an edit: a material change returns any state to unverified; otherwise it stays', () => {
    for (const s of VERIFICATION_STATES) {
      expect(statusAfterEdit(s, true)).toBe('unverified');
      expect(statusAfterEdit(s, false)).toBe(s);
      expect(isReviewed(s)).toBe(s !== 'unverified');
    }
  });

  it('the warning and the hint', () => {
    expect(REVERIFY_WARNING).toBe('This document will need to be verified again.');
    expect(REVERIFY_HINT).toMatch(/sends this document back for verification/);
  });
});

// ---------------------------------------------------------------- words

describe('words', () => {
  it('reviewedLine: only once reviewed; the name trimmed; a missing name reads "a reviewer"; a bad date leaves the date out', () => {
    expect(reviewedLine({ verificationStatus: 'unverified', verifiedByName: 'A', verifiedAt: '2026-11-01T10:00:00Z' })).toBeNull();
    expect(reviewedLine({ verificationStatus: 'verified', verifiedByName: 'A', verifiedAt: null })).toBeNull();
    expect(reviewedLine({ verificationStatus: 'verified', verifiedByName: ' Demo Master ', verifiedAt: '2026-11-01T10:00:00Z' })).toBe('Reviewed by Demo Master on 1 Nov 2026');
    expect(reviewedLine({ verificationStatus: 'rejected', verifiedByName: null, verifiedAt: '2026-11-03T10:00:00Z' })).toBe('Reviewed by a reviewer on 3 Nov 2026');
    expect(reviewedLine({ verificationStatus: 'conditionally_approved', verifiedByName: '  ', verifiedAt: 'not a date' })).toBe('Reviewed by a reviewer');
  });

  it('dayText: a date-only string in words, else null', () => {
    expect(dayText('2027-03-01')).toBe('1 Mar 2027');
    expect(dayText('2027-03-01T23:30:00Z')).toBe('1 Mar 2027');
    expect(dayText(null)).toBeNull();
    expect(dayText('')).toBeNull();
    expect(dayText('nonsense')).toBeNull();
  });

  it('conditionalNote: the condition, then "Until <date>." when it ends', () => {
    expect(conditionalNote('Valid with corrective lenses', '2027-03-01')).toBe('Valid with corrective lenses. Until 1 Mar 2027.');
    expect(conditionalNote(' Valid with corrective lenses. ', '2027-03-01')).toBe('Valid with corrective lenses. Until 1 Mar 2027.');
    expect(conditionalNote('Pending a sea trial!', '2027-03-01')).toBe('Pending a sea trial! Until 1 Mar 2027.');
    expect(conditionalNote(' Valid with corrective lenses ', null)).toBe('Valid with corrective lenses');
    expect(conditionalNote('Valid with corrective lenses', 'bad')).toBe('Valid with corrective lenses');
  });

  it('muteReasonProblem: required, trimmed, at most 500 characters (the server\'s limits)', () => {
    expect(muteReasonProblem(null)).toBe('reason_required');
    expect(muteReasonProblem('   ')).toBe('reason_required');
    expect(muteReasonProblem('Renewal booked')).toBeNull();
    expect(muteReasonProblem(` ${'r'.repeat(MUTE_REASON_MAX)} `)).toBeNull();
    expect(muteReasonProblem('r'.repeat(MUTE_REASON_MAX + 1))).toBe('reason_too_long');
    expect(MIGRATION).toContain("IF length(v_reason) > 500 THEN");
  });
});

// ---------------------------------------------------------------- expiry notices

describe('expiry notice stages (SQL crew_document_expiry_stage)', () => {
  it('the SQL test\'s stage table, row for row', () => {
    const block = SQL_TEST.match(/INSERT INTO stage_case VALUES([\s\S]*?);/);
    expect(block).not.toBeNull();
    const rows = Array.from((block?.[1] ?? '').matchAll(/\((NULL|-?\d+), (NULL|-?\d+), (NULL|'[a-z0-9_]+')\)/g)).map((m) => ({
      daysLeft: m[1] === 'NULL' ? null : Number(m[1]),
      windowDays: m[2] === 'NULL' ? null : Number(m[2]),
      stage: m[3] === 'NULL' ? null : m[3].replace(/'/g, ''),
    }));
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) expect(expiryNoticeStage(r.daysLeft, r.windowDays), JSON.stringify(r)).toBe(r.stage);
  });

  it('every day of a 90-day window from 100 days out to 10 days past: entry, 30, 7, the expiry day and a week of catch-up', () => {
    const seen: Array<string | null> = [];
    for (let d = 100; d >= -10; d -= 1) {
      const stage = expiryNoticeStage(d, 90);
      if (d > 90 || d < -EXPIRY_NOTICE_CATCH_UP_DAYS) expect(stage, String(d)).toBeNull();
      if (seen[seen.length - 1] !== stage) seen.push(stage);
    }
    expect(seen).toEqual([null, 'window', 'd30', 'd7', 'expiry_day', null]);
    expect(EXPIRY_NOTICE_STAGES).toEqual(['window', 'd30', 'd7', 'expiry_day']);
    expect(MIGRATION).toContain("CONSTRAINT crew_document_expiry_notices_stage_check CHECK (stage IN ('window', 'd30', 'd7', 'expiry_day'))");
  });

  it('a short window starts at a later stage; a zero window has only the expiry day; no date or window, no stage', () => {
    expect(expiryNoticeStage(14, 14)).toBe('d30');
    expect(expiryNoticeStage(5, 5)).toBe('d7');
    expect(expiryNoticeStage(1, 0)).toBeNull();
    expect(expiryNoticeStage(0, 0)).toBe('expiry_day');
    expect(expiryNoticeStage(0, -3)).toBe('expiry_day');
    expect(expiryNoticeStage(null, 90)).toBeNull();
    expect(expiryNoticeStage(10, null)).toBeNull();
  });

  it('the phrases are the SQL test\'s', () => {
    expect([12, 1, 0, -1, -3].map(expiryPhrase)).toEqual(['expires in 12 days', 'expires tomorrow', 'expires today', 'expired yesterday', 'expired 3 days ago']);
    expect(SQL_TEST).toContain("VALUES ('expires in 12 days'), ('expires tomorrow'), ('expires today'), ('expired yesterday'), ('expired 3 days ago')");
    expect(expiryPhrase(null)).toBe('has no expiry date');
  });
});

// ---------------------------------------------------------------- forms

describe('the verify form', () => {
  const schema = buildVerifySchema('2026-11-26');
  const issues = (v: unknown) => {
    const r = schema.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  it('a decision is required', () => {
    expect(issues(emptyVerifyValues())).toEqual(['decision: Choose a decision.']);
  });

  it('verified needs no note; a condition and a rejection do', () => {
    expect(issues({ decision: 'verified', note: '', until: null })).toEqual([]);
    expect(issues({ decision: 'conditionally_approved', note: '  ', until: null })).toEqual(['note: Say what the condition is.']);
    expect(issues({ decision: 'rejected', note: '', until: null })).toEqual(['note: Say why the document is rejected.']);
    expect(issues({ decision: 'rejected', note: 'Unreadable', until: null })).toEqual([]);
  });

  it('a condition ends today or later, on a real date; the end is ignored for other decisions', () => {
    expect(issues({ decision: 'conditionally_approved', note: 'Lenses', until: '2026-11-25' })).toEqual(['until: The condition has to end today or later.']);
    expect(issues({ decision: 'conditionally_approved', note: 'Lenses', until: '2026-11-26' })).toEqual([]);
    expect(issues({ decision: 'conditionally_approved', note: 'Lenses', until: '2026-13-01' })).toEqual(['until: Check the date.']);
    expect(issues({ decision: 'verified', note: '', until: '2020-01-01' })).toEqual([]);
  });

  it('a note that leaves no room for the end date is refused before the server would', () => {
    expect(issues({ decision: 'verified', note: 'x'.repeat(VERIFICATION_NOTE_MAX - 39), until: null })).toHaveLength(1);
  });

  it('verifyRequest: the decision and the note; a conditional note carries its end; a blank remark is none', () => {
    expect(verifyRequest({ decision: 'verified', note: '  ', until: null })).toEqual({ decision: 'verified', note: null });
    expect(verifyRequest({ decision: 'verified', note: ' Checked ', until: '2027-01-01' })).toEqual({ decision: 'verified', note: 'Checked' });
    expect(verifyRequest({ decision: 'conditionally_approved', note: 'Lenses', until: '2027-03-01' })).toEqual({
      decision: 'conditionally_approved',
      note: 'Lenses. Until 1 Mar 2027.',
    });
    expect(verifyRequest({ decision: 'rejected', note: ' Unreadable ', until: null })).toEqual({ decision: 'rejected', note: 'Unreadable' });
    expect(() => verifyRequest(emptyVerifyValues())).toThrow();
  });
});

describe('the alerts-off form and refusals', () => {
  it('muteSchema: a reason, at most 500 characters once trimmed', () => {
    expect(muteSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(muteSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(muteSchema.safeParse({ reason: 'Renewal booked' }).success).toBe(true);
    expect(muteSchema.safeParse({ reason: 'r'.repeat(MUTE_REASON_MAX + 1) }).success).toBe(false);
  });

  it('reviewRefusalField: the field a 22023 HINT names', () => {
    expect(reviewRefusalField({ code: '22023', hint: 'note' })).toBe('note');
    expect(reviewRefusalField({ code: '22023', hint: 'reason' })).toBe('reason');
    expect(reviewRefusalField({ code: '22023', hint: 'decision' })).toBe('decision');
    expect(reviewRefusalField({ code: '22023', hint: 'expiry_date' })).toBe('expiry_date');
    expect(reviewRefusalField({ code: '22023', hint: 'number' })).toBeNull();
    expect(reviewRefusalField({ code: '42501' })).toBeNull();
    expect(reviewRefusalField(null)).toBeNull();
    expect(reviewRefusalField('boom')).toBeNull();
  });
});
