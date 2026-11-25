#!/usr/bin/env node
/**
 * Writes the record-engine parity fixtures from the frozen C3 libraries
 * (Phase 2 spec §A.10–§A.12, §E; DECISIONS D-30, D-32, D-48, D-51):
 *
 *   supabase/tests/fixtures/record-transitions.json         transitionEnvelope()   (companyStep.ts)
 *   supabase/tests/fixtures/record-vessel-lock.json          vesselSignaturesLocked() (companyStep.ts)
 *   supabase/tests/fixtures/record-signature-scenarios.json  signatures.ts + the envelope (as record_sign_slot composes them)
 *   supabase/tests/fixtures/record-thread-scenarios.json     threads.ts + whoseMove.ts
 *
 *   node scripts/db/gen-record-fixtures.mjs           # (re)write the four fixtures
 *   node scripts/db/gen-record-fixtures.mjs --check   # exit 1 when one is out of date
 *
 * The SQL tests (supabase/tests/sql/p4_registry, p4_signatures, p4_threads)
 * assert that the SQL mirrors give the same answers: record_transition_decide()
 * equals transitionEnvelope() on every case (code, and the whole value with
 * the effects in TS order), record_vessel_signatures_locked() equals
 * vesselSignaturesLocked(), and replaying each scenario through the RPCs
 * gives the same outcome codes, slot states, stale flags, envelope status
 * and whose move after every step.
 *
 * Inputs and states use the TS field names; a key that is absent means the
 * TS default (`undefined`). Fixtures never hold `null` for a number
 * (version, expectedVersion, cycle): the SQL mirror reads JSON null as
 * absent. Only valid kind combinations (validateRecordKind) appear.
 *
 * Signature scenarios express eligibility only through namedProfileIds:
 * every slot names its signers, so the TS `isEligible` (named) and the SQL
 * record_slot_eligible (a named slot admits its named people only) agree.
 * The generator composes the engines the way the SQL does: after a vessel
 * signature (or re-signature) the envelope takes `vessel_sign` (complete →
 * awaiting the company, else in review), removing a vessel signature
 * steps the status back (awaiting_company_close → in_review, in_review →
 * open when no vessel signature is left), company actions apply their
 * effects to the sheet (company signature on the first open company slot,
 * superseded vessel signatures, a new cycle), and the D-51 lock is
 * vesselSignaturesLocked(envelope, sheet.cycle).
 *
 * Thread scenarios give dates as day offsets from "today" (the SQL test
 * runs on its own current_date) and compare whose move and the follow-up
 * offset after every step.
 *
 * Deterministic: seeded PRNG, sorted keys, fixed timestamps; each file
 * records `generator` and `sourceSha256` of every TS source it ran.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { REPO_ROOT, keyUuid, loadTs, seededRandom, writeFixture } from './lib/load-ts.mjs';

const GENERATOR = 'scripts/db/gen-record-fixtures.mjs';
const SOURCES = [
  'src/lib/records/companyStep.ts',
  'src/lib/records/signatures.ts',
  'src/lib/records/threads.ts',
  'src/lib/records/whoseMove.ts',
  'src/lib/records/dates.ts',
  'src/lib/records/types.ts',
];
const FIXTURES = join(REPO_ROOT, 'supabase/tests/fixtures');

const { modules, sourceSha256 } = await loadTs(SOURCES);
const CS = modules['src/lib/records/companyStep.ts'];
const SIG = modules['src/lib/records/signatures.ts'];
const TH = modules['src/lib/records/threads.ts'];
const WM = modules['src/lib/records/whoseMove.ts'];
const TYPES = modules['src/lib/records/types.ts'];

const shaOf = (files) => Object.fromEntries(files.map((f) => [f, sourceSha256[f]]));
const STATUSES = [...TYPES.ENVELOPE_STATUSES];
const ACTIONS = [...CS.ENVELOPE_ACTIONS];
const ACTORS = ['vessel', 'company'];
const CLOSED_BY = [null, 'vessel', 'company_acknowledge', 'company_sign_off', 'company_decision', 'company_close_as'];
const DELETE_RULES = [undefined, 'draft_only', 'never_after_submit', 'until_signed', 'free', 'cascade_parent'];
/** Free-text inputs are short: the engine only asks whether they are blank. */
const DUP = 'd';
const R = 'r';

// ─── record-transitions.json ──────────────────────────────────────────────

/** Every valid kind combination (validateRecordKind): companyStep × reportFirst × decisionKind × allowReopen × allowCloseAs. */
const KIND_FLAGS = [];
for (const companyStep of TYPES.COMPANY_STEPS) {
  for (const reportFirst of [false, true]) {
    for (const decisionKind of [false, true]) {
      if (reportFirst && companyStep === 'none') continue;
      if (decisionKind && companyStep !== 'sign_off') continue;
      for (const allowReopen of [false, true]) {
        for (const allowCloseAs of [false, true]) KIND_FLAGS.push({ companyStep, reportFirst, decisionKind, allowReopen, allowCloseAs });
      }
    }
  }
}
const kindNamed = (step, rf, dk, ro, ca) => KIND_FLAGS.find((k) => k.companyStep === step && k.reportFirst === rf && k.decisionKind === dk && k.allowReopen === ro && k.allowCloseAs === ca);
/** A small set that covers every feature, for the guard and closedBy sections. */
const REP_KINDS = [
  kindNamed('none', false, false, false, false),
  kindNamed('none', false, false, true, true),
  kindNamed('acknowledge', false, false, true, false),
  kindNamed('acknowledge', true, false, true, true),
  kindNamed('sign_off', false, false, false, true),
  kindNamed('sign_off', false, true, true, false),
  kindNamed('sign_off', true, true, true, true),
];

const PASSING = {
  submit: [{}],
  vessel_sign: [{ allVesselSlotsSigned: true }, { allVesselSlotsSigned: false }],
  acknowledge: [{}],
  decide: [{ decision: 'approved' }, { decision: 'approved_with_conditions', conditions: 'c' }, { decision: 'not_approved', reason: R }],
  sign_off: [{}],
  close_as: [{ closedAs: 'after_review' }, { closedAs: 'raised_in_error' }, { closedAs: 'duplicate', duplicateOf: DUP }],
  return_to_vessel: [{ reason: R }],
  reopen: [{ reason: R }],
  remove_company_signature: [{ reason: R }],
  void: [{ reason: R }],
};

/** Guard variants per action: missing inputs, open requests, stale signatures, version and slot completion. */
const BLANKS = [undefined, null, '', '   '];
function guardVariants(action) {
  const base = PASSING[action][0];
  const out = [];
  for (const b of BLANKS) {
    if ('reason' in base || action === 'decide') out.push({ ...base, ...(action === 'decide' ? { decision: 'not_approved' } : {}), reason: b });
  }
  if (action === 'decide') {
    for (const d of [undefined, null]) out.push({ decision: d });
    for (const c of BLANKS) out.push({ decision: 'approved_with_conditions', conditions: c });
  }
  if (action === 'close_as') {
    for (const c of [undefined, null]) out.push({ closedAs: c });
    for (const d of BLANKS) out.push({ closedAs: 'duplicate', duplicateOf: d });
  }
  for (const p of PASSING[action]) {
    out.push({ ...p, openRequests: 1 }, { ...p, openRequests: 2 }, { ...p, openRequests: 0 });
    out.push({ ...p, staleRequiredSignatures: true }, { ...p, staleRequiredSignatures: false });
    out.push({ ...p, openRequests: 1, staleRequiredSignatures: true });
  }
  if (action === 'vessel_sign') out.push({}, { allVesselSlotsSigned: true, staleRequiredSignatures: true, openRequests: 1 });
  return out;
}

const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
/** Kind flags that are false are left out (absent = the TS default); the random section mixes both spellings. */
const compactKind = (k) => strip({ companyStep: k.companyStep, reportFirst: k.reportFirst || undefined, decisionKind: k.decisionKind || undefined, allowReopen: k.allowReopen || undefined, allowCloseAs: k.allowCloseAs || undefined });
const SECTIONS = ['lattice', 'guards', 'history', 'random'];
const transitionCases = new Map();
const outcomeValues = [];
const outcomeIndex = new Map();
const caseKey = (state, input) => JSON.stringify([Object.entries(state).sort(), Object.entries(input).sort()]);
function addTransition(section, state, input) {
  const s = strip(state);
  const i = strip(input);
  const key = caseKey(s, i);
  if (transitionCases.has(key)) return false;
  const r = CS.transitionEnvelope(s, i);
  let expected;
  if (r.ok) {
    const v = JSON.stringify(r.value);
    if (!outcomeIndex.has(v)) {
      outcomeIndex.set(v, outcomeValues.length);
      outcomeValues.push(r.value);
    }
    expected = outcomeIndex.get(v);
  } else expected = r.error.code;
  transitionCases.set(key, { section, state: s, input: i, expected });
  return true;
}

// 1. The exhaustive lattice with passing inputs.
for (const kind of KIND_FLAGS) {
  for (const status of STATUSES) {
    for (const action of ACTIONS) {
      for (const actor of ACTORS) {
        for (const p of PASSING[action]) addTransition('lattice', { ...compactKind(kind), status }, { action, actor, ...p });
      }
    }
  }
}
// 2. Every guard variant for every action and status (the right party; void both).
const GUARD_KINDS = [REP_KINDS[1], REP_KINDS[3], REP_KINDS[4], REP_KINDS[6]];
for (const kind of GUARD_KINDS) {
  for (const status of STATUSES) {
    for (const action of ACTIONS) {
      const actors = action === 'void' ? ACTORS : [action === 'submit' || action === 'vessel_sign' ? 'vessel' : 'company'];
      for (const actor of actors) {
        for (const g of guardVariants(action)) addTransition('guards', { ...compactKind(kind), status }, { action, actor, ...g });
        // Version: conflict, match, and an expected version against a state without one.
        addTransition('guards', { ...compactKind(kind), status, version: 3 }, { action, actor, ...PASSING[action][0], expectedVersion: 2 });
        addTransition('guards', { ...compactKind(kind), status, version: 3 }, { action, actor, ...PASSING[action][0], expectedVersion: 3 });
        addTransition('guards', { ...compactKind(kind), status, version: 3 }, { action, actor, ...PASSING[action][0] });
        addTransition('guards', { ...compactKind(kind), status }, { action, actor, ...PASSING[action][0], expectedVersion: 7 });
      }
    }
  }
}
// 3. closedBy × acknowledgedCycle × cycle × companyAcknowledged × initialReportAcknowledged × deleteRule.
const CYCLES = [{}, { cycle: 1, acknowledgedCycle: 1 }, { cycle: 2, acknowledgedCycle: null }, { cycle: 2, acknowledgedCycle: 1 }, { cycle: 3, acknowledgedCycle: 3 }];
const ACKS = [{}, { companyAcknowledged: true, initialReportAcknowledged: true }];
for (const kind of [REP_KINDS[0], REP_KINDS[6]]) {
  for (const closedBy of CLOSED_BY) {
    for (const deleteRule of DELETE_RULES) {
      for (const status of STATUSES) {
        for (const actor of ACTORS) addTransition('history', { ...compactKind(kind), status, closedBy, deleteRule }, { action: 'void', actor, reason: R });
      }
    }
  }
}
for (const kind of [REP_KINDS[2], REP_KINDS[3], REP_KINDS[6]]) {
  for (const c of CYCLES) {
    for (const a of ACKS) {
      for (const closedBy of CLOSED_BY) {
        for (const status of ['closed', 'awaiting_company_close', 'open']) {
          const st = { ...compactKind(kind), status, closedBy, ...c, ...a };
          addTransition('history', st, { action: 'remove_company_signature', actor: 'company', reason: R });
          addTransition('history', st, { action: 'reopen', actor: 'company', reason: R });
        }
      }
      for (const closedBy of [null, 'company_sign_off']) {
        for (const status of ['submitted', 'acknowledged', 'awaiting_company_close', 'closed']) {
          const st = { ...compactKind(kind), status, closedBy, ...c, ...a };
          addTransition('history', st, { action: 'return_to_vessel', actor: 'company', reason: R });
          addTransition('history', st, { action: 'acknowledge', actor: 'company' });
          addTransition('history', st, { action: 'acknowledge', actor: 'company', openRequests: 1 });
          addTransition('history', st, { action: 'acknowledge', actor: 'company', staleRequiredSignatures: true });
        }
      }
    }
  }
}
// 4. Seeded random cases over the whole input space (both spellings of every default).
{
  const rnd = seededRandom(30);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const maybe = (p, v) => (rnd() < p ? v : undefined);
  let added = 0;
  let tries = 0;
  while (added < 5000 && tries < 100000) {
    tries += 1;
    const kind = pick(KIND_FLAGS);
    const cycle = maybe(0.6, pick([1, 2, 3, 4]));
    const acknowledgedCycle = maybe(0.5, pick([null, 1, 2, 3, 4].filter((a) => !a || a <= (cycle ?? 1))));
    const flag = (v) => (v ? true : pick([undefined, false]));
    const state = {
      status: pick(STATUSES),
      companyStep: kind.companyStep,
      reportFirst: flag(kind.reportFirst),
      decisionKind: flag(kind.decisionKind),
      allowReopen: flag(kind.allowReopen),
      allowCloseAs: flag(kind.allowCloseAs),
      closedBy: maybe(0.6, pick(CLOSED_BY)),
      companyAcknowledged: maybe(0.4, rnd() < 0.5),
      cycle,
      acknowledgedCycle,
      initialReportAcknowledged: maybe(0.4, rnd() < 0.5),
      version: maybe(0.4, pick([1, 2, 3])),
      deleteRule: maybe(0.6, pick(DELETE_RULES)),
    };
    const input = {
      action: pick(ACTIONS),
      actor: pick(ACTORS),
      openRequests: maybe(0.5, pick([0, 1, 3])),
      staleRequiredSignatures: maybe(0.5, rnd() < 0.4),
      allVesselSlotsSigned: maybe(0.6, rnd() < 0.7),
      reason: maybe(0.7, pick([null, '', '  ', R, R, R])),
      decision: maybe(0.4, pick(['approved', 'approved_with_conditions', 'not_approved'])),
      conditions: maybe(0.3, pick([null, '', ' ', 'c'])),
      closedAs: maybe(0.4, pick(CS.CLOSED_AS)),
      duplicateOf: maybe(0.3, pick([null, '', DUP])),
      expectedVersion: maybe(0.3, pick([1, 2, 3])),
    };
    if (addTransition('random', state, input)) added += 1;
  }
}

const transitions = SECTIONS.flatMap((section) => [...transitionCases.values()].filter((c) => c.section === section));
const sectionCounts = Object.fromEntries(SECTIONS.map((section) => [section, transitions.filter((c) => c.section === section).length]));
writeFixture(
  join(FIXTURES, 'record-transitions.json'),
  {
    version: 1,
    generator: GENERATOR,
    sourceSha256: shaOf(['src/lib/records/companyStep.ts', 'src/lib/records/types.ts']),
    description:
      'record_transition_decide(state, input) parity cases generated from transitionEnvelope() in src/lib/records/companyStep.ts (gap/08 §C; D-30, D-32, D-51). Cases are in four sections, in this order: lattice (every valid kind combination x status x action x actor with passing inputs), guards (every missing input, open requests, stale signatures, version and slot-completion variant for every action and status), history (closedBy x cycles x acknowledgements x delete rules for acknowledge / remove_company_signature / void / reopen / return_to_vessel), random (seeded, both spellings of every default). expected is either an index into `values` (the whole TS outcome value, effects in TS order: {ok:true, value: values[expected]}) or the TS error code ({ok:false, error:{code}}). Absent keys mean the TS default. Regenerate with node scripts/db/gen-record-fixtures.mjs; never edit by hand.',
    counts: { cases: transitions.length, ...sectionCounts, ok: transitions.filter((c) => typeof c.expected === 'number').length, values: outcomeValues.length },
    values: outcomeValues,
    cases: transitions.map(({ state, input, expected }) => ({ state, input, expected })),
  },
  { compactDepth: 2 },
);

// ─── record-vessel-lock.json ──────────────────────────────────────────────

const lockCases = [];
for (const status of STATUSES) {
  for (const closedBy of [undefined, ...CLOSED_BY]) {
    for (const cycle of [undefined, 1, 2, 3]) {
      for (const acknowledgedCycle of [undefined, null, 1, 2, 3]) {
        for (const sheetCycle of [1, 2, 3, 4]) {
          const state = strip({ status, closedBy, cycle, acknowledgedCycle });
          lockCases.push({ state, sheetCycle, expected: CS.vesselSignaturesLocked(state, sheetCycle) });
        }
      }
    }
  }
}
writeFixture(
  join(FIXTURES, 'record-vessel-lock.json'),
  {
    version: 1,
    generator: GENERATOR,
    sourceSha256: shaOf(['src/lib/records/companyStep.ts', 'src/lib/records/types.ts']),
    description:
      'record_vessel_signatures_locked(state, sheetCycle) parity cases generated from vesselSignaturesLocked() in src/lib/records/companyStep.ts (D-51): status x closedBy x cycle x acknowledgedCycle x sheet cycle, exhaustively. Regenerate with node scripts/db/gen-record-fixtures.mjs; never edit by hand.',
    counts: { cases: lockCases.length, locked: lockCases.filter((c) => c.expected).length },
    cases: lockCases,
  },
  { compactDepth: 2 },
);

// ─── record-signature-scenarios.json ──────────────────────────────────────

/**
 * The scenario world (the SQL test seeds the same): company SG, vessel
 * SG.v, crew SG.crew1–3 on board, SG.master (the Master, on board),
 * SG.admin1–2 (company actors: legacy DPA). Profile ids are
 * keyUuid('profile:<key>') = tests.profile_id(key).
 */
const PEOPLE = {
  'SG.crew1': { role: 'crew', name: 'Crew one' },
  'SG.crew2': { role: 'crew', name: 'Crew two' },
  'SG.crew3': { role: 'crew', name: 'Crew three' },
  'SG.master': { role: 'master', name: 'Master' },
  'SG.admin1': { role: 'admin', name: 'Admin one' },
  'SG.admin2': { role: 'admin', name: 'Admin two' },
};
const pid = (key) => keyUuid(`profile:${key}`);
const sigId = (scenario, ref) => keyUuid(`signature:${scenario}:${ref}`);
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
/** The SQL record_slot_digest(): sha256 of the sorted `key:digest` lines of the covered sections ('*' when none named); '' when none is known. */
function slotDigest(digests, covers) {
  const keys = covers && covers.length ? covers : ['*'];
  const pairs = keys.filter((k) => Object.prototype.hasOwnProperty.call(digests, k)).map((k) => `${k}:${digests[k]}`).sort();
  return pairs.length ? sha256(pairs.join('\n')) : '';
}
const actorFor = (key, { impersonating = false } = {}) => ({
  profileId: pid(key),
  name: PEOPLE[key].name,
  isEligible: (slot, profileId) => (slot.namedProfileIds ?? []).includes(profileId),
  canWrite: true,
  isMaster: PEOPLE[key].role === 'master',
  isCompanyActor: PEOPLE[key].role === 'admin',
  impersonating,
});
const partyOf = (key) => (PEOPLE[key].role === 'admin' ? 'company' : 'vessel');
const slot = (key, order, party, named, extra = {}) => ({ key, label: key.replace(/_/g, ' '), order, party, namedProfileIds: named.map(pid), ...extra });

function runSignatureScenario(def) {
  const name = def.name;
  const kind = { companyStep: 'sign_off', reportFirst: false, decisionKind: false, allowReopen: true, allowCloseAs: false, deleteRule: 'draft_only', ...def.kind };
  let sheet = SIG.createSignatureSheet(def.slots, { creatorProfileId: pid(def.creator) });
  let env = { status: 'open', ...kind, closedBy: null, companyAcknowledged: false, cycle: 1, acknowledgedCycle: null, initialReportAcknowledged: false };
  let submitted = false;
  let digests = {};
  const decisions = []; // live company decision rows, oldest first: { slotKey } (null = a slot-less row)
  const steps = [];
  let at = Date.parse('2026-11-20T08:00:00.000Z');
  const nextAt = () => new Date((at += 60_000)).toISOString();
  const digestFor = (s) => slotDigest(digests, s.coversSections);
  const vesselAll = () => SIG.partyComplete(sheet, 'vessel');
  const staleRequired = () => SIG.hasStaleRequiredSignatures(sheet, digestFor);

  const applyEnvelope = (outcome) => {
    env = { ...env, status: outcome.status, closedBy: outcome.closedBy, companyAcknowledged: outcome.companyAcknowledged, cycle: outcome.cycle, acknowledgedCycle: outcome.acknowledgedCycle, initialReportAcknowledged: outcome.initialReportAcknowledged };
    if (outcome.status === 'submitted' || outcome.status === 'awaiting_company_close') submitted = true;
  };
  const afterVesselSignature = () => {
    if (vesselAll()) {
      const done = CS.transitionEnvelope(env, { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: true, staleRequiredSignatures: staleRequired(), openRequests: 0 });
      if (done.ok) return applyEnvelope(done.value);
    }
    if (['open', 'acknowledged', 'info_requested'].includes(env.status)) {
      const review = CS.transitionEnvelope(env, { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: false });
      if (review.ok) applyEnvelope(review.value);
    }
  };
  const live = (s) => s.cycle === sheet.cycle && !s.removedAt && !s.supersededAt;

  for (const step of def.steps) {
    const rec = { op: step.op, ...strip({ actor: step.actor, impersonating: step.impersonating || undefined }) };
    let result = null;
    if (step.op === 'set_digests') {
      digests = { ...digests, ...step.digests };
      rec.digests = step.digests;
    } else if (step.op === 'sign') {
      const s = SIG.getSlot(sheet, step.slot);
      const input = {
        slotKey: step.slot,
        id: sigId(name, step.ref),
        method: step.method ?? 'verified',
        recordDigest: digestFor(s),
        at: nextAt(),
        signer: step.signer ? (step.signer.visitor ? { profileId: null, name: step.signer.visitor, kind: step.signer.kind ?? 'visitor' } : { profileId: pid(step.signer.profile), name: PEOPLE[step.signer.profile].name }) : undefined,
        reason: step.reason,
      };
      const had = sheet.signatures.length;
      result = SIG.signSlot(sheet, input, actorFor(step.actor, step));
      Object.assign(rec, strip({ slot: step.slot, ref: step.ref, method: input.method, signer: step.signer, reason: step.reason }));
      if (result.ok) {
        sheet = result.value;
        if (sheet.signatures.length > had && s.party === 'vessel') afterVesselSignature();
      }
    } else if (step.op === 'resign') {
      const s = SIG.getSlot(sheet, step.slot);
      const had = sheet.signatures.length;
      result = SIG.reSignSlot(sheet, { slotKey: step.slot, id: sigId(name, step.ref), recordDigest: digestFor(s), at: nextAt() }, actorFor(step.actor, step));
      Object.assign(rec, { slot: step.slot, ref: step.ref });
      if (result.ok) {
        sheet = result.value;
        if (sheet.signatures.length > had && s.party === 'vessel') afterVesselSignature();
      }
    } else if (step.op === 'remove') {
      const sigs = sheet.signatures.filter((x) => x.slotKey === step.slot);
      const target = sigs.find(live) ?? sigs[sigs.length - 1];
      if (!target) throw new Error(`${name}: remove on ${step.slot} without any signature row`);
      rec.slot = step.slot;
      rec.signatureId = target.id;
      rec.reason = step.reason ?? null;
      sheet = { ...sheet, vesselLocked: CS.vesselSignaturesLocked(env, sheet.cycle), submitted };
      result = SIG.removeSignature(sheet, { slotKey: step.slot, reason: step.reason, at: nextAt() }, actorFor(step.actor, step));
      if (result.ok) {
        sheet = result.value;
        const s = SIG.getSlot(sheet, step.slot);
        if (s.party === 'vessel') {
          if (env.status === 'awaiting_company_close' && !vesselAll()) env = { ...env, status: 'in_review' };
          if (env.status === 'in_review' && !sheet.signatures.some((x) => live(x) && SIG.getSlot(sheet, x.slotKey)?.party === 'vessel')) env = { ...env, status: 'open' };
        }
      }
    } else if (step.op === 'pass') {
      result = SIG.passSlotTo(sheet, { slotKey: step.slot, toProfileId: pid(step.to), at: nextAt() }, actorFor(step.actor, step));
      Object.assign(rec, { slot: step.slot, to: step.to });
      if (result.ok) sheet = result.value;
    } else if (step.op === 'cancel') {
      result = SIG.cancelPass(sheet, step.slot);
      rec.slot = step.slot;
      if (result.ok) sheet = result.value;
    } else if (step.op === 'transition') {
      const input = strip({ action: step.action, actor: partyOf(step.actor), reason: step.reason, decision: step.decision, conditions: step.conditions, openRequests: 0, staleRequiredSignatures: staleRequired(), allVesselSlotsSigned: vesselAll() });
      const r = CS.transitionEnvelope(env, input);
      Object.assign(rec, strip({ action: step.action, reason: step.reason, decision: step.decision, conditions: step.conditions }));
      result = r.ok ? { ok: true } : r;
      if (r.ok) {
        const at2 = nextAt();
        for (const effect of r.value.effects) {
          if (effect === 'company_signature') {
            const open = sheet.slots.find((s) => s.party === 'company' && ['open', 'requested'].includes(SIG.slotState(sheet, s.key)));
            if (open) {
              const row = { id: `company:${steps.length}`, slotKey: open.key, cycle: sheet.cycle, signerProfileId: pid(step.actor), signerName: PEOPLE[step.actor].name, signerKind: 'shore', method: 'verified', witnessProfileId: null, onBehalfOfOffice: null, recordDigest: digestFor(open), signedAt: at2, removedAt: null, removedBy: null, removalReason: null, supersededAt: null };
              sheet = { ...sheet, signatures: [...sheet.signatures, row], passes: Object.fromEntries(Object.entries(sheet.passes).filter(([k]) => k !== open.key)) };
              decisions.push({ id: row.id });
            } else decisions.push({ id: null });
          } else if (effect === 'remove_company_signature') {
            const last = decisions.pop();
            if (last && last.id) sheet = { ...sheet, signatures: sheet.signatures.map((x) => (x.id === last.id ? { ...x, removedAt: at2 } : x)) };
          } else if (effect === 'supersede_vessel_signatures') {
            sheet = { ...sheet, signatures: sheet.signatures.map((x) => (live(x) && SIG.getSlot(sheet, x.slotKey)?.party === 'vessel' ? { ...x, supersededAt: at2 } : x)) };
          } else if (effect === 'new_cycle') {
            sheet = SIG.startNextCycle(sheet, at2);
          }
        }
        applyEnvelope(r.value);
      }
    } else {
      throw new Error(`${name}: unknown op ${step.op}`);
    }
    if (result) rec.expected = result.ok ? { ok: true } : { ok: false, code: result.error.code };
    rec.after = {
      cycle: sheet.cycle,
      status: env.status,
      states: Object.fromEntries(sheet.slots.map((s) => [s.key, SIG.slotState(sheet, s.key)])),
      stale: Object.fromEntries(sheet.slots.filter((s) => SIG.activeSignature(sheet, s.key)).map((s) => [s.key, SIG.isSignatureStale(sheet, s.key, digestFor(s))])),
    };
    steps.push(rec);
  }
  return {
    name,
    description: def.description,
    kind,
    creator: def.creator,
    slots: def.slots,
    steps,
  };
}

/** Section digests are sha256 hex, as record_set_section_digests() requires. */
const hex = (label) => sha256(`storm-fixture:${label}`);
const D1 = { '*': hex('content-v1') };
const D2 = { '*': hex('content-v2') };
const VESSEL3 = [slot('prepared_by', 1, 'vessel', ['SG.crew1', 'SG.crew2']), slot('checked_by', 2, 'vessel', ['SG.crew2', 'SG.crew3']), slot('master', 3, 'vessel', ['SG.master'])];
const WITH_COMPANY = [...VESSEL3, slot('company_review', 4, 'company', ['SG.admin1', 'SG.admin2'])];
const SCENARIOS = [
  {
    name: 'order_and_waiting',
    description: 'Later slots wait for the earlier required slot; signing in order completes the vessel side.',
    creator: 'SG.crew1', slots: VESSEL3,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's1' },
      { op: 'sign', actor: 'SG.crew3', slot: 'checked_by', ref: 's2' },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's3' },
      { op: 'sign', actor: 'SG.crew2', slot: 'checked_by', ref: 's4' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's5' },
    ],
  },
  {
    name: 'parallel_order_group',
    description: 'Slots that share an order sign in parallel; an optional slot does not gate later slots.',
    creator: 'SG.crew1',
    slots: [slot('deck', 1, 'vessel', ['SG.crew1']), slot('engine', 1, 'vessel', ['SG.crew2']), slot('optional_note', 2, 'vessel', ['SG.crew3'], { required: false }), slot('master', 3, 'vessel', ['SG.master'])],
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew2', slot: 'engine', ref: 's1' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's2' },
      { op: 'sign', actor: 'SG.crew1', slot: 'deck', ref: 's3' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's4' },
      { op: 'sign', actor: 'SG.crew3', slot: 'optional_note', ref: 's5' },
    ],
  },
  {
    name: 'eligibility_named_only',
    description: 'Only the named people may sign; a Master is not eligible for a slot that names someone else.',
    creator: 'SG.crew1', slots: VESSEL3,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew3', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.master', slot: 'prepared_by', ref: 's2' },
      { op: 'sign', actor: 'SG.admin1', slot: 'prepared_by', ref: 's3' },
      { op: 'sign', actor: 'SG.crew2', slot: 'prepared_by', ref: 's4' },
    ],
  },
  {
    name: 'idempotent_replay_and_id_conflict',
    description: 'Re-sending the same signature id on the same slot is a no-op; reusing it elsewhere is refused.',
    creator: 'SG.crew1', slots: VESSEL3,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.crew2', slot: 'checked_by', ref: 's1' },
      { op: 'sign', actor: 'SG.crew2', slot: 'prepared_by', ref: 's2' },
      { op: 'sign', actor: 'SG.crew2', slot: 'checked_by', ref: 's3' },
    ],
  },
  {
    name: 'impersonation_refused',
    description: 'A login-as session can neither sign nor remove.',
    creator: 'SG.crew1', slots: VESSEL3,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1', impersonating: true },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's2' },
      { op: 'remove', actor: 'SG.crew1', slot: 'prepared_by', impersonating: true },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's2', impersonating: true },
    ],
  },
  {
    name: 'pass_and_cancel',
    description: 'Pass to an eligible person, refused for an ineligible one or a waiting / signed slot; cancel; signing clears the pass.',
    creator: 'SG.crew1', slots: VESSEL3,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'pass', actor: 'SG.crew1', slot: 'checked_by', to: 'SG.crew2' },
      { op: 'pass', actor: 'SG.crew1', slot: 'prepared_by', to: 'SG.crew3' },
      { op: 'pass', actor: 'SG.crew1', slot: 'prepared_by', to: 'SG.crew2' },
      { op: 'pass', actor: 'SG.crew1', slot: 'prepared_by', to: 'SG.crew1' },
      { op: 'cancel', actor: 'SG.crew1', slot: 'prepared_by' },
      { op: 'cancel', actor: 'SG.crew1', slot: 'prepared_by' },
      { op: 'pass', actor: 'SG.crew1', slot: 'prepared_by', to: 'SG.crew2' },
      { op: 'sign', actor: 'SG.crew2', slot: 'prepared_by', ref: 's1' },
      { op: 'pass', actor: 'SG.crew1', slot: 'prepared_by', to: 'SG.crew1' },
      { op: 'cancel', actor: 'SG.crew1', slot: 'checked_by' },
    ],
  },
  {
    name: 'witnessed_rules',
    description: 'Witnessed signing: allowed slots only, a signer is required, the witness is not the signer, the signer must be eligible, visitors only where allowed; the witness alone never removes a witnessed signature, the Master does (gap/08 §B).',
    creator: 'SG.crew1',
    slots: [slot('prepared_by', 1, 'vessel', ['SG.crew1', 'SG.crew2']), slot('visitor_ack', 1, 'vessel', ['SG.crew3'], { allowVisitor: true, required: false }), slot('no_witness', 1, 'vessel', ['SG.crew3'], { allowWitnessed: false, required: false }), slot('master', 2, 'vessel', ['SG.master'])],
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew3', slot: 'no_witness', ref: 's1', method: 'witnessed', signer: { profile: 'SG.crew3' } },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's2', method: 'witnessed', signer: { profile: 'SG.crew1' } },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's3', method: 'witnessed', signer: { profile: 'SG.crew3' } },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's4', method: 'witnessed', signer: { visitor: 'Surveyor' } },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's5', method: 'witnessed', signer: { profile: 'SG.crew2' } },
      { op: 'sign', actor: 'SG.crew1', slot: 'visitor_ack', ref: 's6', method: 'witnessed', signer: { visitor: 'Class surveyor' } },
      { op: 'remove', actor: 'SG.crew1', slot: 'visitor_ack' },
      { op: 'remove', actor: 'SG.master', slot: 'visitor_ack' },
      { op: 'remove', actor: 'SG.crew2', slot: 'prepared_by' },
    ],
  },
  {
    name: 'on_behalf_refused',
    description: 'D-48: on-behalf signing fails closed (method not allowed where the slot does not allow it, not eligible everywhere else).',
    creator: 'SG.crew1',
    slots: [slot('prepared_by', 1, 'vessel', ['SG.crew1']), slot('master', 2, 'vessel', ['SG.master'], { allowOnBehalf: true, onBehalfReasonRequired: true })],
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew2', slot: 'prepared_by', ref: 's1', method: 'on_behalf', reason: 'Away' },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's2' },
      { op: 'sign', actor: 'SG.crew2', slot: 'master', ref: 's3', method: 'on_behalf', reason: 'Master ashore' },
      { op: 'sign', actor: 'SG.crew2', slot: 'master', ref: 's4', method: 'on_behalf' },
    ],
  },
  {
    name: 'separation_of_duties',
    description: 'distinctFrom: the creator cannot sign a creator-distinct slot, nor one person both of two distinct slots.',
    creator: 'SG.crew1',
    slots: [slot('authority', 1, 'vessel', ['SG.crew1', 'SG.crew2'], { distinctFrom: ['creator'] }), slot('competent_person', 2, 'vessel', ['SG.crew2', 'SG.crew3'], { distinctFrom: ['authority'] }), slot('master', 3, 'vessel', ['SG.master'])],
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'authority', ref: 's1' },
      { op: 'sign', actor: 'SG.crew2', slot: 'authority', ref: 's2' },
      { op: 'sign', actor: 'SG.crew2', slot: 'competent_person', ref: 's3' },
      { op: 'sign', actor: 'SG.crew3', slot: 'competent_person', ref: 's4' },
      { op: 'sign', actor: 'SG.crew1', slot: 'authority', ref: 's5', method: 'witnessed', signer: { profile: 'SG.crew2' } },
    ],
  },
  {
    name: 'reverse_order_removal',
    description: 'Signatures are removed in reverse order, by the signer or the Master; a required removal sends later slots back to waiting and drops their passes.',
    creator: 'SG.crew1', slots: VESSEL3,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.crew2', slot: 'checked_by', ref: 's2' },
      { op: 'pass', actor: 'SG.crew1', slot: 'master', to: 'SG.master' },
      { op: 'remove', actor: 'SG.crew1', slot: 'prepared_by' },
      { op: 'remove', actor: 'SG.crew3', slot: 'checked_by' },
      { op: 'remove', actor: 'SG.master', slot: 'checked_by' },
      { op: 'remove', actor: 'SG.crew1', slot: 'checked_by' },
      { op: 'remove', actor: 'SG.crew1', slot: 'prepared_by' },
      { op: 'sign', actor: 'SG.crew2', slot: 'prepared_by', ref: 's3' },
      { op: 'sign', actor: 'SG.crew3', slot: 'checked_by', ref: 's4' },
      { op: 'remove', actor: 'SG.crew3', slot: 'checked_by' },
    ],
  },
  {
    name: 'stale_and_resign',
    description: 'A content change makes live signatures stale; re-sign by the same signer only, not when fresh, witnessed ones need a new ceremony; completion waits for fresh signatures.',
    creator: 'SG.crew1', slots: VESSEL3,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.master', slot: 'checked_by', ref: 's2', method: 'witnessed', signer: { profile: 'SG.crew3' } },
      { op: 'resign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's3' },
      { op: 'set_digests', digests: D2 },
      { op: 'resign', actor: 'SG.crew2', slot: 'prepared_by', ref: 's4' },
      { op: 'resign', actor: 'SG.crew3', slot: 'checked_by', ref: 's5' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's6' },
      { op: 'resign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's7' },
      { op: 'resign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's7' },
      { op: 'remove', actor: 'SG.master', slot: 'master' },
      { op: 'remove', actor: 'SG.crew3', slot: 'checked_by' },
      { op: 'sign', actor: 'SG.crew3', slot: 'checked_by', ref: 's8' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's9' },
    ],
  },
  {
    name: 'section_coverage',
    description: 'A slot covering one section goes stale only when that section changes.',
    creator: 'SG.crew1',
    slots: [slot('hazards', 1, 'vessel', ['SG.crew1'], { coversSections: ['hazards'] }), slot('master', 2, 'vessel', ['SG.master'])],
    steps: [
      { op: 'set_digests', digests: { '*': hex('all-1'), hazards: hex('h-1'), crew: hex('c-1') } },
      { op: 'sign', actor: 'SG.crew1', slot: 'hazards', ref: 's1' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's2' },
      { op: 'set_digests', digests: { crew: hex('c-2'), '*': hex('all-2') } },
      { op: 'set_digests', digests: { hazards: hex('h-2') } },
      { op: 'resign', actor: 'SG.crew1', slot: 'hazards', ref: 's3' },
    ],
  },
  {
    name: 'company_sign_off_and_lock',
    description: 'The vessel completes, the company acknowledges the cycle (D-51 lock: vessel signatures cannot be removed), signs off on the company slot; removing the company signature reopens the company step.',
    creator: 'SG.crew1', slots: WITH_COMPANY,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.crew2', slot: 'checked_by', ref: 's2' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's3' },
      { op: 'remove', actor: 'SG.master', slot: 'master' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's4' },
      { op: 'transition', actor: 'SG.crew1', action: 'acknowledge' },
      { op: 'transition', actor: 'SG.admin1', action: 'acknowledge' },
      { op: 'remove', actor: 'SG.master', slot: 'master' },
      { op: 'transition', actor: 'SG.admin1', action: 'acknowledge' },
      { op: 'transition', actor: 'SG.admin2', action: 'sign_off' },
      { op: 'remove', actor: 'SG.master', slot: 'master' },
      { op: 'transition', actor: 'SG.admin1', action: 'remove_company_signature', reason: 'Signed too early' },
      { op: 'transition', actor: 'SG.admin1', action: 'sign_off' },
    ],
  },
  {
    name: 'return_to_vessel_new_cycle',
    description: 'D-30: the company returns the record; vessel signatures are superseded, cycle 2 starts unlocked and unsigned, the vessel signs again, the company closes.',
    creator: 'SG.crew1', slots: WITH_COMPANY,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.crew2', slot: 'checked_by', ref: 's2' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's3' },
      { op: 'transition', actor: 'SG.admin1', action: 'acknowledge' },
      { op: 'transition', actor: 'SG.admin1', action: 'return_to_vessel' },
      { op: 'transition', actor: 'SG.admin1', action: 'return_to_vessel', reason: 'Attach the risk assessment' },
      { op: 'sign', actor: 'SG.crew2', slot: 'prepared_by', ref: 's4' },
      { op: 'remove', actor: 'SG.crew2', slot: 'prepared_by' },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's5' },
      { op: 'sign', actor: 'SG.crew3', slot: 'checked_by', ref: 's6' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's7' },
      { op: 'transition', actor: 'SG.admin2', action: 'sign_off' },
    ],
  },
  {
    name: 'decision_kind_not_approved',
    description: 'A decision kind: not approved returns it for cycle 2; approved with conditions closes it.',
    creator: 'SG.crew1', slots: WITH_COMPANY, kind: { decisionKind: true },
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.crew3', slot: 'checked_by', ref: 's2' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's3' },
      { op: 'transition', actor: 'SG.admin1', action: 'sign_off' },
      { op: 'transition', actor: 'SG.admin1', action: 'decide', decision: 'not_approved' },
      { op: 'transition', actor: 'SG.admin1', action: 'decide', decision: 'not_approved', reason: 'Gas test missing' },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's4' },
      { op: 'sign', actor: 'SG.crew3', slot: 'checked_by', ref: 's5' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's6' },
      { op: 'transition', actor: 'SG.admin1', action: 'decide', decision: 'approved_with_conditions', conditions: 'Fire watch for one hour' },
    ],
  },
  {
    name: 'stale_blocks_completion',
    description: 'A stale required signature keeps the record in review when the last vessel slot signs; re-signing completes it.',
    creator: 'SG.crew1', slots: [slot('prepared_by', 1, 'vessel', ['SG.crew1']), slot('master', 2, 'vessel', ['SG.master']), slot('company_review', 3, 'company', ['SG.admin1'])],
    kind: { companyStep: 'acknowledge' },
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'set_digests', digests: D2 },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's2' },
      { op: 'resign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's3' },
      { op: 'transition', actor: 'SG.admin1', action: 'acknowledge' },
    ],
  },
  {
    name: 'no_company_step_closes',
    description: 'company_step none: the last vessel slot closes the record (closed by the vessel, not locked).',
    creator: 'SG.crew1', slots: [slot('prepared_by', 1, 'vessel', ['SG.crew1']), slot('master', 2, 'vessel', ['SG.master'])],
    kind: { companyStep: 'none', allowReopen: false },
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's2' },
    ],
  },
  {
    name: 'company_slot_rules',
    description: 'A company slot: only its named company people, never witnessed (a company slot cannot allow it), removed by a company actor.',
    creator: 'SG.crew1', slots: [slot('prepared_by', 1, 'vessel', ['SG.crew1']), slot('company_review', 2, 'company', ['SG.admin1'])],
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.admin2', slot: 'company_review', ref: 's2' },
      { op: 'sign', actor: 'SG.admin2', slot: 'company_review', ref: 's3', method: 'witnessed', signer: { profile: 'SG.admin1' } },
      { op: 'sign', actor: 'SG.admin1', slot: 'company_review', ref: 's4' },
      { op: 'remove', actor: 'SG.crew1', slot: 'company_review' },
      { op: 'remove', actor: 'SG.admin2', slot: 'company_review' },
    ],
  },
  {
    name: 'submitted_removal_needs_reason',
    description: 'Once submitted to the company, removing a signature needs a reason (while the cycle is not acknowledged).',
    creator: 'SG.crew1', slots: WITH_COMPANY,
    steps: [
      { op: 'set_digests', digests: D1 },
      { op: 'sign', actor: 'SG.crew1', slot: 'prepared_by', ref: 's1' },
      { op: 'sign', actor: 'SG.crew2', slot: 'checked_by', ref: 's2' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's3' },
      { op: 'remove', actor: 'SG.master', slot: 'master' },
      { op: 'remove', actor: 'SG.master', slot: 'master', reason: 'Wrong date on the sheet' },
      { op: 'sign', actor: 'SG.master', slot: 'master', ref: 's4' },
    ],
  },
];

const signatureScenarios = SCENARIOS.map(runSignatureScenario);
writeFixture(
  join(FIXTURES, 'record-signature-scenarios.json'),
  {
    version: 1,
    generator: GENERATOR,
    sourceSha256: shaOf(['src/lib/records/signatures.ts', 'src/lib/records/companyStep.ts', 'src/lib/records/types.ts']),
    description:
      'Signature-sheet scenarios replayed by supabase/tests/sql/p4_signatures through record_sign_slot / record_pass_slot / record_cancel_pass / record_remove_signature / record_resign_slot / record_transition / record_set_section_digests. Expected values come from signatures.ts (signSlot, passSlotTo, cancelPass, removeSignature, reSignSlot, startNextCycle, slotState, isSignatureStale) composed with companyStep.ts as the SQL engine composes them (see the generator header). World: company SG, vessel SG.v, SG.crew1-3, SG.master (on board), SG.admin1-2 (company actors). Eligibility is by namedProfileIds only. Signature ids are keyUuid("signature:<scenario>:<ref>"), profile ids keyUuid("profile:<key>"). Regenerate with node scripts/db/gen-record-fixtures.mjs; never edit by hand.',
    world: { company: 'SG', vessel: 'SG.v', people: PEOPLE },
    counts: { scenarios: signatureScenarios.length, steps: signatureScenarios.reduce((n, s) => n + s.steps.length, 0) },
    scenarios: signatureScenarios,
  },
  { compactDepth: 4 },
);

// ─── record-thread-scenarios.json ─────────────────────────────────────────

const TODAY = '2026-11-23';
const dayPlus = (n) => {
  const d = new Date(Date.UTC(2026, 10, 23));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const offsetOf = (date) => (date === null ? null : Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${TODAY}T00:00:00Z`)) / 86_400_000));
const TH_PEOPLE = { 'SG.crew1': 'vessel', 'SG.crew2': 'vessel', 'SG.admin1': 'company', 'SG.admin2': 'company' };
const entryId = (scenario, ref) => keyUuid(`entry:${scenario}:${ref}`);

function runThreadScenario(def) {
  let thread = TH.emptyThread();
  let status = def.status ?? 'open';
  let at = Date.parse('2026-11-20T08:00:00.000Z');
  const nextAt = () => new Date((at += 60_000)).toISOString();
  const steps = [];
  for (const step of def.steps) {
    const rec = { op: step.op, ...strip({ actor: step.actor, ref: step.ref, target: step.target, body: step.body, status: step.status, dueOffset: step.dueOffset, followUpOffset: step.followUpOffset, note: step.note }) };
    const actor = step.actor ? { party: TH_PEOPLE[step.actor], profileId: pid(step.actor) } : null;
    let r = null;
    const body = step.body ?? 'Update from the bridge';
    if (step.op === 'set_status') {
      status = step.status;
    } else if (step.op === 'update') {
      r = TH.postUpdate(thread, { id: entryId(def.name, step.ref), body, at: nextAt(), followUpDue: step.followUpOffset === undefined ? null : dayPlus(step.followUpOffset) }, actor);
    } else if (step.op === 'request') {
      r = TH.postRequest(thread, { id: entryId(def.name, step.ref), body, at: nextAt(), dueOn: step.dueOffset === undefined ? '' : dayPlus(step.dueOffset) }, actor);
    } else if (step.op === 'reply') {
      r = TH.postReply(thread, { id: entryId(def.name, step.ref), requestId: entryId(def.name, step.target), body, at: nextAt() }, actor);
    } else if (step.op === 'edit') {
      r = TH.editEntry(thread, { id: entryId(def.name, step.ref), replacesId: entryId(def.name, step.target), body, at: nextAt() }, actor);
    } else if (step.op === 'done') {
      r = TH.markRequestDone(thread, { requestId: entryId(def.name, step.target), at: nextAt(), note: step.note ?? null }, actor);
    } else if (step.op === 'cancel') {
      r = TH.cancelRequest(thread, { requestId: entryId(def.name, step.target), reason: step.note ?? '', at: nextAt() }, actor);
    } else if (step.op === 'change_date') {
      r = TH.changeRequestDue(thread, { requestId: entryId(def.name, step.target), newDue: step.dueOffset === undefined ? '' : dayPlus(step.dueOffset), reason: step.note ?? '', at: nextAt() }, actor);
    } else {
      throw new Error(`${def.name}: unknown op ${step.op}`);
    }
    if (r) {
      rec.expected = r.ok ? { ok: true } : { ok: false, code: r.error.code };
      if (r.ok) thread = r.value;
    }
    rec.after = {
      whoseMove: WM.whoseMove({ status, thread }),
      followUpOffset: offsetOf(TH.followUpDue(thread, TODAY)),
      openRequests: TH.openRequests(thread).length,
      entries: thread.entries.length,
    };
    steps.push(rec);
  }
  return { name: def.name, description: def.description, status: def.status ?? 'open', steps };
}

const THREAD_SCENARIOS = [
  {
    name: 'request_reply_done',
    description: 'A company request makes it the vessel\'s move; the vessel replies (company\'s move); marking it done hands back to the status rule.',
    status: 'awaiting_company_close',
    steps: [
      { op: 'request', actor: 'SG.admin1', ref: 'r1', body: 'Send the gas test readings', dueOffset: 3 },
      { op: 'reply', actor: 'SG.crew1', ref: 'p1', target: 'r1', body: 'Readings attached' },
      { op: 'done', actor: 'SG.admin1', target: 'r1' },
    ],
  },
  {
    name: 'party_rules',
    description: 'Only the company posts requests (with a due date); only the vessel replies, and only to an open request.',
    status: 'in_review',
    steps: [
      { op: 'request', actor: 'SG.crew1', ref: 'r0', body: 'Can we close?', dueOffset: 1 },
      { op: 'request', actor: 'SG.admin1', ref: 'r1', body: 'Photos please' },
      { op: 'request', actor: 'SG.admin1', ref: 'r2', body: 'Photos please', dueOffset: 2 },
      { op: 'reply', actor: 'SG.admin1', ref: 'p0', target: 'r2', body: 'Company answering itself' },
      { op: 'update', actor: 'SG.crew2', ref: 'u1', body: 'Working on it' },
      { op: 'reply', actor: 'SG.crew1', ref: 'p1', target: 'u1', body: 'Not a request' },
      { op: 'reply', actor: 'SG.crew1', ref: 'p2', target: 'r2', body: 'Photos uploaded' },
      { op: 'cancel', actor: 'SG.admin1', target: 'r2' },
      { op: 'cancel', actor: 'SG.admin1', target: 'r2', note: 'No longer needed' },
      { op: 'reply', actor: 'SG.crew1', ref: 'p3', target: 'r2', body: 'Late reply' },
      { op: 'done', actor: 'SG.admin1', target: 'r2' },
    ],
  },
  {
    name: 'bodies',
    description: 'Empty and over-long bodies are refused; bodies are trimmed.',
    status: 'open',
    steps: [
      { op: 'update', actor: 'SG.crew1', ref: 'u0', body: '   ' },
      { op: 'update', actor: 'SG.crew1', ref: 'u1', body: 'x'.repeat(5001) },
      { op: 'update', actor: 'SG.crew1', ref: 'u2', body: `  ${'y'.repeat(5000)}  ` },
    ],
  },
  {
    name: 'change_due_and_follow_up',
    description: 'Changing a due date needs a valid new date and a reason, and a different date; the earliest open request drives the follow-up date.',
    status: 'acknowledged',
    steps: [
      { op: 'update', actor: 'SG.crew1', ref: 'u1', body: 'Spares ordered', followUpOffset: 10 },
      { op: 'request', actor: 'SG.admin1', ref: 'r1', body: 'Confirm delivery', dueOffset: 5 },
      { op: 'request', actor: 'SG.admin2', ref: 'r2', body: 'Confirm fitting', dueOffset: 8 },
      { op: 'change_date', actor: 'SG.admin1', target: 'r1', note: 'Supplier delay' },
      { op: 'change_date', actor: 'SG.admin1', target: 'r1', dueOffset: 9 },
      { op: 'change_date', actor: 'SG.admin1', target: 'r1', dueOffset: 5, note: 'Same' },
      { op: 'change_date', actor: 'SG.crew1', target: 'r1', dueOffset: 9, note: 'Vessel cannot move it' },
      { op: 'change_date', actor: 'SG.admin1', target: 'r1', dueOffset: 9, note: 'Supplier delay' },
      { op: 'done', actor: 'SG.admin2', target: 'r2' },
      { op: 'done', actor: 'SG.admin1', target: 'r1', note: 'Delivered' },
      { op: 'done', actor: 'SG.admin1', target: 'r1' },
    ],
  },
  {
    name: 'acknowledged_last_poster',
    description: 'In acknowledged, whose move goes to the side that did not post last; vessel when nobody has posted.',
    status: 'acknowledged',
    steps: [
      { op: 'update', actor: 'SG.crew1', ref: 'u1', body: 'Investigation started' },
      { op: 'update', actor: 'SG.admin1', ref: 'u2', body: 'Thanks, keep us posted' },
      { op: 'update', actor: 'SG.crew2', ref: 'u3', body: 'Root cause found' },
      { op: 'set_status', status: 'closed' },
      { op: 'set_status', status: 'acknowledged' },
    ],
  },
  {
    name: 'edits',
    description: 'Edits post a replacement: only the author, only the newest version, never a request; follow-up comes from the newest unedited update.',
    status: 'in_review',
    steps: [
      { op: 'update', actor: 'SG.crew1', ref: 'u1', body: 'Draft plan', followUpOffset: 4 },
      { op: 'edit', actor: 'SG.crew2', ref: 'e0', target: 'u1', body: 'Not mine to edit' },
      { op: 'edit', actor: 'SG.crew1', ref: 'e1', target: 'u1', body: 'Final plan' },
      { op: 'edit', actor: 'SG.crew1', ref: 'e2', target: 'u1', body: 'Edit the old version' },
      { op: 'edit', actor: 'SG.crew1', ref: 'e3', target: 'e1', body: '  ' },
      { op: 'edit', actor: 'SG.crew1', ref: 'e4', target: 'e1', body: 'Final plan, rev 2' },
      { op: 'request', actor: 'SG.admin1', ref: 'r1', body: 'Add the drawings', dueOffset: 2 },
      { op: 'edit', actor: 'SG.admin1', ref: 'e5', target: 'r1', body: 'Add the drawings and photos' },
      { op: 'update', actor: 'SG.admin1', ref: 'u2', body: 'Plan accepted', followUpOffset: -1 },
    ],
  },
  {
    name: 'status_wins_without_requests',
    description: 'Without open requests the status decides: submitted is the company\'s move, info requested the vessel\'s.',
    status: 'submitted',
    steps: [
      { op: 'update', actor: 'SG.crew1', ref: 'u1', body: 'Initial report' },
      { op: 'set_status', status: 'info_requested' },
      { op: 'update', actor: 'SG.admin1', ref: 'u2', body: 'See the questions' },
      { op: 'request', actor: 'SG.admin1', ref: 'r1', body: 'Answer the questions', dueOffset: 0 },
      { op: 'set_status', status: 'awaiting_company_close' },
      { op: 'reply', actor: 'SG.crew1', ref: 'p1', target: 'r1', body: 'Answered' },
      { op: 'request', actor: 'SG.admin2', ref: 'r2', body: 'One more', dueOffset: -2 },
      { op: 'done', actor: 'SG.admin1', target: 'r1' },
      { op: 'cancel', actor: 'SG.admin2', target: 'r2', note: 'Covered elsewhere' },
    ],
  },
];
const threadScenarios = THREAD_SCENARIOS.map(runThreadScenario);
writeFixture(
  join(FIXTURES, 'record-thread-scenarios.json'),
  {
    version: 1,
    generator: GENERATOR,
    sourceSha256: shaOf(['src/lib/records/threads.ts', 'src/lib/records/whoseMove.ts', 'src/lib/records/dates.ts', 'src/lib/records/types.ts']),
    description:
      'Status-update thread scenarios replayed by supabase/tests/sql/p4_threads through record_post_thread_entry / record_resolve_thread_request (thread status_updates). Expected codes, whose move (whoseMove()), open requests and the follow-up date (followUpDue(), as a day offset from today) after every step come from threads.ts and whoseMove.ts with today = ' + TODAY + '; the SQL test uses current_date and the same offsets. set_status steps put the envelope in a status directly (test setup). Actors: SG.crew1-2 (vessel), SG.admin1-2 (company). Entry ids are keyUuid("entry:<scenario>:<ref>"). Regenerate with node scripts/db/gen-record-fixtures.mjs; never edit by hand.',
    today: TODAY,
    counts: { scenarios: threadScenarios.length, steps: threadScenarios.reduce((n, s) => n + s.steps.length, 0) },
    scenarios: threadScenarios,
  },
  { compactDepth: 4 },
);
