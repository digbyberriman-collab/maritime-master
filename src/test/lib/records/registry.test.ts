import { describe, expect, it } from 'vitest';
import {
  DuplicateRecordKindError,
  RecordKindError,
  createRecordKindRegistry,
  envelopeStateForKind,
  recordKinds,
  signatureSheetForKind,
  validateRecordKind,
  type RecordKindDefinition,
} from '@/lib/records/registry';
import { slotState } from '@/lib/records/signatures';
import { transitionEnvelope } from '@/lib/records/companyStep';
import { formatReference, parseReference } from '@/lib/records/reference';

const CORRECTIVE_ACTION: RecordKindDefinition = {
  key: 'safety.corrective_action',
  moduleKey: 'safety',
  owningDoc: 'gap/05',
  label: 'Corrective action',
  refPrefix: 'CA',
  scope: 'vessel',
  routePattern: '/v/:vesselCode/safety/corrective-actions/:id',
  capabilityPath: 'vessel.safety.capa',
  enveloped: true,
  companyStep: 'sign_off',
  allowReopen: true,
  editAfterSign: 'allow_with_flag',
  deleteRule: 'draft_only',
  slotTemplate: [
    { key: 'hod', label: 'Head of Department', order: 1, party: 'vessel' },
    { key: 'master', label: 'Master', order: 2, party: 'vessel' },
    { key: 'company', label: 'Company', order: 3, party: 'company' },
  ],
  snapshotOn: ['submitted', 'decision', 'closed', 'reopened'],
  retentionYears: 7,
};

const AUDIT: RecordKindDefinition = {
  key: 'safety.audit',
  moduleKey: 'safety',
  label: 'Audit',
  refPrefix: 'AUD',
  scope: 'fleet',
  routePattern: '/fleet/safety/audits/:id',
  enveloped: false,
  companyStep: 'none',
  editAfterSign: 'lock',
  deleteRule: 'until_signed',
  slotTemplate: [],
};

describe('register / get', () => {
  it('registers, looks up by key, module and reference prefix', () => {
    const reg = createRecordKindRegistry();
    const kind = reg.register(CORRECTIVE_ACTION);
    reg.register(AUDIT);
    expect(reg.get('safety.corrective_action')).toBe(kind);
    expect(reg.require('safety.audit').label).toBe('Audit');
    expect(reg.has('safety.audit')).toBe(true);
    expect(reg.has('safety.nothing')).toBe(false);
    expect(reg.get('safety.nothing')).toBeUndefined();
    expect(() => reg.require('safety.nothing')).toThrow(RecordKindError);
    expect(reg.list().map((k) => k.key)).toEqual(['safety.corrective_action', 'safety.audit']);
    expect(reg.byModule('safety')).toHaveLength(2);
    expect(reg.byModule('crew')).toEqual([]);
    expect(reg.byRefPrefix('ca')?.key).toBe('safety.corrective_action');
  });

  it('finds the kind behind a parsed reference', () => {
    const reg = createRecordKindRegistry();
    reg.register(CORRECTIVE_ACTION);
    const ref = formatReference({ type: CORRECTIVE_ACTION.refPrefix, vesselCode: 'DRA', date: '2026-11-22', seq: 14 });
    const parsed = parseReference(ref);
    expect(parsed?.kind === 'record' && reg.byRefPrefix(parsed.type)?.label).toBe('Corrective action');
  });

  it('stored kinds are frozen copies', () => {
    const reg = createRecordKindRegistry();
    const def = { ...CORRECTIVE_ACTION, slotTemplate: CORRECTIVE_ACTION.slotTemplate.map((s) => ({ ...s })) };
    const kind = reg.register(def);
    (def as { label: string }).label = 'Changed later';
    expect(reg.get(def.key)?.label).toBe('Corrective action');
    expect(Object.isFrozen(kind)).toBe(true);
    expect(Object.isFrozen(kind.slotTemplate)).toBe(true);
    expect(() => {
      (kind as { label: string }).label = 'x';
    }).toThrow();
  });
});

describe('duplicate guard', () => {
  it('an identical re-registration is a no-op (hot reload, double import)', () => {
    const reg = createRecordKindRegistry();
    const first = reg.register(CORRECTIVE_ACTION);
    const again = reg.register(JSON.parse(JSON.stringify(CORRECTIVE_ACTION)));
    expect(again).toBe(first);
    expect(reg.list()).toHaveLength(1);
  });

  it('a different definition under the same key throws', () => {
    const reg = createRecordKindRegistry();
    reg.register(CORRECTIVE_ACTION);
    expect(() => reg.register({ ...CORRECTIVE_ACTION, label: 'CAPA' })).toThrow(DuplicateRecordKindError);
  });

  it('two kinds cannot share a reference prefix', () => {
    const reg = createRecordKindRegistry();
    reg.register(CORRECTIVE_ACTION);
    expect(() => reg.register({ ...AUDIT, key: 'technical.change_action', moduleKey: 'technical', refPrefix: 'CA' })).toThrow(/already used by "safety.corrective_action"/);
  });

  it('the app-wide registry exists and starts empty in tests', () => {
    expect(recordKinds.list()).toEqual([]);
  });
});

describe('validation', () => {
  const bad = (patch: Partial<RecordKindDefinition>) => () => validateRecordKind({ ...CORRECTIVE_ACTION, ...patch });

  it.each<[string, Partial<RecordKindDefinition>, RegExp]>([
    ['key shape', { key: 'CorrectiveAction' }, /key must be/],
    ['key with three segments', { key: 'safety.ca.extra' }, /key must be/],
    ['module mismatch', { moduleKey: 'crew' }, /moduleKey must be "safety"/],
    ['blank label', { label: ' ' }, /label is required/],
    ['lower-case prefix', { refPrefix: 'ca' }, /refPrefix/],
    ['long prefix', { refPrefix: 'CORRECTIVE' }, /refPrefix/],
    ['scope', { scope: 'global' as never }, /scope/],
    ['company step', { companyStep: 'approve' as never }, /companyStep/],
    ['edit policy', { editAfterSign: 'whatever' as never }, /editAfterSign/],
    ['delete rule', { deleteRule: 'never' as never }, /deleteRule/],
    ['company step without envelope', { enveloped: false }, /needs the record envelope/],
    ['report-first without company', { companyStep: 'none', reportFirst: true, slotTemplate: [] }, /report-first/],
    ['decision without sign-off', { companyStep: 'acknowledge', decisionKind: true }, /decision kinds/],
    ['company slot without company step', { companyStep: 'none' }, /company signature slots/],
    ['bad slot template', { slotTemplate: [{ key: 'a', label: 'A', order: 0, party: 'vessel' }] }, /order/],
    ['vessel route outside /v/:vesselCode', { routePattern: '/safety/corrective-actions/:id' }, /\/v\/:vesselCode/],
    ['relative route', { routePattern: 'safety/x' }, /start with/],
    ['capability path', { capabilityPath: 'vessel.safety' }, /capabilityPath/],
    ['status', { statuses: ['open', 'archived' as never] }, /unknown status/],
    ['snapshot reason', { snapshotOn: ['saved' as never] }, /snapshot reason/],
    ['retention', { retentionYears: 0 }, /retentionYears/],
  ])('rejects %s', (_label, patch, message) => {
    expect(bad(patch)).toThrow(RecordKindError);
    expect(bad(patch)).toThrow(message);
  });

  it('accepts the fixtures', () => {
    expect(() => validateRecordKind(CORRECTIVE_ACTION)).not.toThrow();
    expect(() => validateRecordKind(AUDIT)).not.toThrow();
  });

  it('register validates before storing', () => {
    const reg = createRecordKindRegistry();
    expect(() => reg.register({ ...CORRECTIVE_ACTION, refPrefix: 'bad' })).toThrow(RecordKindError);
    expect(reg.list()).toEqual([]);
  });
});

describe('bridges to the engines', () => {
  it('a kind gives a fresh signature sheet and an envelope state', () => {
    const reg = createRecordKindRegistry();
    const kind = reg.register(CORRECTIVE_ACTION);
    const sheet = signatureSheetForKind(kind, { creatorProfileId: 'p-1' });
    expect(sheet.slots.map((s) => [s.key, slotState(sheet, s.key)])).toEqual([
      ['hod', 'open'],
      ['master', 'waiting'],
      ['company', 'waiting'],
    ]);
    const state = envelopeStateForKind(kind, { status: 'awaiting_company_close', version: 3 });
    expect(state).toEqual({
      status: 'awaiting_company_close',
      companyStep: 'sign_off',
      reportFirst: false,
      decisionKind: false,
      allowReopen: true,
      allowCloseAs: false,
      closedBy: null,
      companyAcknowledged: false,
      version: 3,
      deleteRule: 'draft_only',
    });
    expect(transitionEnvelope(state, { action: 'sign_off', actor: 'company', expectedVersion: 3 })).toMatchObject({ ok: true, value: { status: 'closed' } });
    expect(transitionEnvelope(state, { action: 'sign_off', actor: 'vessel' })).toMatchObject({ ok: false });
  });

  it('the envelope state carries the delete rule, so void follows the kind (D-32)', () => {
    const reg = createRecordKindRegistry();
    const incident = reg.register({
      ...CORRECTIVE_ACTION,
      key: 'safety.incident',
      label: 'Incident',
      refPrefix: 'INC',
      routePattern: '/v/:vesselCode/safety/incidents/:id',
      reportFirst: true,
      allowCloseAs: true,
      deleteRule: 'never_after_submit',
    });
    const submitted = envelopeStateForKind(incident, { status: 'submitted' });
    expect(submitted.deleteRule).toBe('never_after_submit');
    expect(transitionEnvelope(submitted, { action: 'void', actor: 'vessel', reason: 'oops' })).toMatchObject({ ok: false, error: { code: 'wrong_party' } });
    expect(transitionEnvelope(submitted, { action: 'void', actor: 'company', reason: 'Raised on the wrong vessel' })).toMatchObject({ ok: true, value: { status: 'void' } });
  });
});
