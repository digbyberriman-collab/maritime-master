/**
 * The crew requirement engine, pure (X1-06): lib/compliance.ts against the
 * shared parity cases (fixtures/complianceCases.json, which
 * supabase/tests/sql/crew/compliance_parity.test.sql asserts against SQL
 * too), the catalogue parsed from 20261124060400's seed (types, categories,
 * STORM's satisfaction rules), and the pure rules of 20261124060600 parsed
 * from the migration (groups, the tab rule, the category -> group map), so
 * the TS mirror and the SQL engine cannot drift apart. Then the hooks
 * (hooks/useVesselCompliance.ts, hooks/useRequirementsConfig.ts) against a
 * mocked client: parsing, D-01 'not set up', denied, errors, keys, and every
 * write checked against the server's answer.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';


const mock = vi.hoisted(() => ({
  rpc: {} as Record<string, { data: unknown; error: unknown }>,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      mock.rpcCalls.push({ fn, args });
      return Promise.resolve(mock.rpc[fn] ?? { data: null, error: null });
    },
    from: () => {
      throw new Error('the compliance hooks read through RPCs only');
    },
  },
}));

import {
  COMPLIANCE_DENIED_NOTICE,
  ComplianceAnswerError,
  complianceKeys,
  fetchRequirementStatus,
  fetchVesselCompliance,
  isCompanyComplianceKey,
  parseComplianceSummaryRow,
  parseRequirementStatusRow,
  usePersonRequirementStatus,
  useVesselCompliance,
} from '@/modules/crew/hooks/useVesselCompliance';
import {
  ComplianceWriteError,
  MAX_CELLS_PER_SAVE,
  addStcwBasicSet,
  bulkRequirementRow,
  cellKey,
  complianceRefusalField,
  complianceRefusalMessage,
  createCompanyDocumentType,
  deleteRequirementRow,
  fetchRequirementsConfig,
  parseRequirementsConfig,
  saveRequirementRow,
  saveSatisfactionRule,
  saveVesselCrewSettings,
  setPassengerShip,
  setRequirementCells,
  stagedCells,
  useRequirementsConfig,
  useRequirementsConfigActions,
} from '@/modules/crew/hooks/useRequirementsConfig';
import { crewKeys } from '@/modules/crew/hooks/crewKeys';
import type {
  CrewComplianceSummaryDbRow,
  CrewPendingFunctions,
  CrewRequirementRowRow,
  CrewRequirementStatusDbRow,
  VesselCrewSettingsRow,
} from '@/modules/crew/types/db.pending';
import {
  COMPLIANCE_DOTS,
  COMPLIANCE_ISSUE_REASONS,
  COMPLIANCE_NOT_SET_UP_NOTICE,
  COMPLIANCE_STATUSES,
  GAP_REASONS,
  MAX_RULE_DEPTH,
  REQUIREMENT_GROUPS,
  REQUIREMENT_GROUP_LABEL,
  REQUIREMENT_STATES,
  SATISFIED_VIA,
  complianceDot,
  complianceStatus,
  daysUntil,
  evaluateRequirements,
  issueReason,
  missingForRole,
  requirementExplanation,
  requirementGroupForCategory,
  requirementTab,
  rowTab,
  satisfierClosure,
  summariseCompliance,
  type FamiliarisationRecordInput,
  type HeldDocumentInput,
  type RequirementRowInput,
  type RequirementStatus,
  type SatisfactionRule,
} from '@/modules/crew/lib/compliance';
import { SYSTEM_CATEGORY_TAB, itemTypeForCategory } from '@/modules/crew/lib/documentTabs';
import { statusVocabulary } from '@/shared/components/status/statusTone';
import type { CrewDocumentSatisfactionKind, CrewDocumentVerificationStatus } from '@/modules/crew/types/db.pending';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CATALOGUE = read('supabase/migrations/20261124060400_crew_document_catalogue.sql');
const MIGRATION = read('supabase/migrations/20261124060600_crew_compliance.sql');
const PARITY_SQL = read('supabase/tests/sql/crew/compliance_parity.test.sql');

const TODAY = '2026-11-22';
const plus = (days: number) => new Date(Date.UTC(2026, 10, 22 + days)).toISOString().slice(0, 10);

// ---------------------------------------------------------------- the catalogue, parsed from 060400's seed

interface TypeMeta {
  key: string;
  category: string;
  name: string;
  itemType: string;
}

function parseTypes(): Map<string, TypeMeta> {
  const start = CATALOGUE.indexOf('INSERT INTO public.crew_document_types (id, company_id, category_key, key, name');
  const end = CATALOGUE.indexOf(') AS v(', start);
  const block = CATALOGUE.slice(start, end);
  const out = new Map<string, TypeMeta>();
  const re = /^\s*\('([a-z0-9_]+)', '([a-z_]+)', '((?:[^']|'')*)',.*, '(passport|visa|crew_document|crew_qualification|medical|work_authorisation)', (?:true|false), (?:true|false), \d+\),?$/gm;
  for (const m of block.matchAll(re)) out.set(m[1], { key: m[1], category: m[2], name: m[3].replace(/''/g, "'"), itemType: m[4] });
  return out;
}

function parseSystemRules(): SatisfactionRule[] {
  const start = CATALOGUE.indexOf('INSERT INTO public.crew_document_type_satisfies (id, company_id, type_id, satisfies_type_id, kind)');
  const end = CATALOGUE.indexOf(') AS v(a, b, kind)', start);
  const block = CATALOGUE.slice(start, end);
  return [...block.matchAll(/\('([a-z0-9_]+)', '([a-z0-9_]+)', '(supersedes|component|equivalent)'\)/g)].map((m) => ({
    typeId: m[1],
    satisfiesTypeId: m[2],
    kind: m[3] as CrewDocumentSatisfactionKind,
  }));
}

const SYSTEM_TYPES = parseTypes();
const SYSTEM_RULES = parseSystemRules();

describe('the parsed catalogue', () => {
  it('holds the 206 system types and the 107 system rules of 060400', () => {
    expect(SYSTEM_TYPES.size).toBe(206);
    expect(SYSTEM_RULES).toHaveLength(107);
    expect(SYSTEM_TYPES.get('stcw_pst')).toEqual({ key: 'stcw_pst', category: 'stcw_basic', name: 'Personal survival techniques', itemType: 'crew_qualification' });
    expect(SYSTEM_TYPES.get('passport')?.itemType).toBe('passport');
    expect(SYSTEM_TYPES.get('ship_captain_medical')?.name).toBe("Ship captain's medical training");
  });
});

// ---------------------------------------------------------------- the pure rules, against the migration

describe('vocabularies', () => {
  it('the groups are the CHECK of crew_requirement_rows', () => {
    const check = /crew_requirement_rows_group_key_check CHECK \(group_key IN \(([\s\S]*?)\)\)/.exec(MIGRATION)?.[1] ?? '';
    expect([...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual([...REQUIREMENT_GROUPS]);
    for (const g of REQUIREMENT_GROUPS) expect(REQUIREMENT_GROUP_LABEL[g].length).toBeGreaterThan(0);
  });

  it('the states and statuses are the statusTone vocabularies (crew_requirement, crew_compliance)', () => {
    expect(statusVocabulary('crew_requirement').map((e) => e.status).sort()).toEqual([...REQUIREMENT_STATES].sort());
    expect(statusVocabulary('crew_compliance').map((e) => e.status).sort()).toEqual([...COMPLIANCE_STATUSES].sort());
  });

  it('every vocabulary the engine writes is the TS one', () => {
    const engine = MIGRATION.slice(MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.crew_requirement_status_for('), MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.crew_compliance_summary_for('));
    for (const s of REQUIREMENT_STATES) expect(engine).toContain(`'${s}'`);
    for (const g of GAP_REASONS) expect(engine).toContain(`'${g}'`);
    expect(SATISFIED_VIA).toContain('familiarisation');
    for (const d of COMPLIANCE_DOTS) expect(MIGRATION).toContain(`'${d}'`);
    for (const r of COMPLIANCE_ISSUE_REASONS) expect(MIGRATION).toContain(`'${r}'`);
    expect(MIGRATION).toMatch(/WHERE c\.depth < 5 AND NOT \(s\.type_id = ANY \(c\.path\)\)/);
    expect(MAX_RULE_DEPTH).toBe(5);
    expect(COMPLIANCE_NOT_SET_UP_NOTICE).toBe('Crew compliance becomes available once the crew update is applied.');
  });
});

describe('requirementGroupForCategory', () => {
  const body = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.crew_requirement_group_for_category('), MIGRATION.indexOf('FUNCTION public.crew_compliance_status_decide('));
  const sqlMap = new Map<string, string>();
  for (const m of body.matchAll(/WHEN p_category_key (?:= '([a-z_]+)'|IN \(([^)]*)\)) THEN '([a-z_]+)'/g)) {
    const keys = m[1] ? [m[1]] : [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    for (const k of keys) sqlMap.set(k, m[3]);
  }

  it('equals the SQL CASE for every seeded category, and custom otherwise', () => {
    expect(sqlMap.size).toBeGreaterThan(30);
    for (const category of Object.keys(SYSTEM_CATEGORY_TAB)) {
      expect(requirementGroupForCategory(category), category).toBe(sqlMap.get(category) ?? 'custom');
    }
    expect(requirementGroupForCategory(null)).toBe('custom');
    expect(requirementGroupForCategory('unheard_of')).toBe('custom');
  });

  it('a row of any category sits on that category\'s tab (T-185), whatever its group', () => {
    for (const [category, tab] of Object.entries(SYSTEM_CATEGORY_TAB)) {
      const group = requirementGroupForCategory(category);
      expect(rowTab({ kind: 'document', groupKey: group, options: [{ documentTypeId: 'x', sortOrder: 0, tab }] }), category).toBe(tab);
    }
  });
});

describe('requirementTab (SQL crew_requirement_tab)', () => {
  it('familiarisation first, then the option tab, then the group', () => {
    expect(requirementTab('familiarisation', 'familiarisation', 'stcw')).toBe('familiarisation');
    expect(requirementTab('document', 'medical', 'documents')).toBe('documents');
    expect(requirementTab('document', 'medical', null)).toBe('stcw');
    expect(requirementTab('document', 'documents', null)).toBe('documents');
    for (const g of ['stcw_basic', 'survival_craft', 'advanced_training', 'medical', 'security', 'stcw_passenger', 'navigation_safety']) {
      expect(requirementTab('document', g, undefined), g).toBe('stcw');
    }
    for (const g of ['coc_gmdss', 'deck_engineering', 'custom']) expect(requirementTab('document', g, null), g).toBe('qualifications');
    expect(requirementTab('document', 'custom', 'nonsense')).toBe('qualifications');
  });

  it('the SQL lists the same STCW groups', () => {
    const body = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.crew_requirement_tab('), MIGRATION.indexOf('FUNCTION public.crew_requirement_group_for_category('));
    const stcw = /WHEN p_group_key IN \(([^)]*)\) THEN 'stcw'/.exec(body)?.[1] ?? '';
    expect([...stcw.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(
      ['stcw_basic', 'survival_craft', 'advanced_training', 'medical', 'security', 'stcw_passenger', 'navigation_safety'].sort(),
    );
  });

  it('rowTab takes the first document option by sort order', () => {
    expect(rowTab({ kind: 'document', groupKey: 'custom', options: [{ documentTypeId: 'b', sortOrder: 1, tab: 'stcw' }, { documentTypeId: 'a', sortOrder: 0, tab: 'documents' }] })).toBe('documents');
    expect(rowTab({ kind: 'document', groupKey: 'stcw_basic', options: [] })).toBe('stcw');
  });
});

describe('complianceStatus and complianceDot (SQL crew_compliance_status_decide, crew_compliance_dot)', () => {
  it.each([
    [0, 0, 0, 'complete'],
    [0, 0, 2, 'expiring'],
    [0, 1, 2, 'missing'],
    [1, 1, 2, 'expired'],
    [3, 0, 0, 'expired'],
  ] as const)('expired %i, missing %i, expiring %i -> %s', (expired, missing, expiring, want) => {
    expect(complianceStatus(expired, missing, expiring)).toBe(want);
  });

  it.each([
    [0, 0, 0, 'none'],
    [0, 3, 3, 'none'],
    [2, 0, 0, 'ok'],
    [2, 0, 1, 'warn'],
    [2, 1, 1, 'danger'],
  ] as const)('required %i, bad %i, warn %i -> %s', (required, bad, warn, want) => {
    expect(complianceDot(required, bad, warn)).toBe(want);
  });
});

// ---------------------------------------------------------------- the closure

describe('satisfierClosure', () => {
  const rule = (typeId: string, satisfiesTypeId: string, kind: CrewDocumentSatisfactionKind = 'supersedes'): SatisfactionRule => ({ typeId, satisfiesTypeId, kind });

  it('an option is its own satisfier at depth 0', () => {
    const c = satisfierClosure([{ typeId: 'a', sortOrder: 0 }], []);
    expect([...c.values()]).toEqual([{ typeId: 'a', kind: 'option', depth: 0, viaOptionTypeId: 'a', optionSort: 0 }]);
  });

  it('follows chains, keeping the kind of the rule next to the option', () => {
    const c = satisfierClosure([{ typeId: 'a', sortOrder: 0 }], [rule('b', 'a', 'equivalent'), rule('c', 'b', 'supersedes')]);
    expect(c.get('c')).toMatchObject({ depth: 2, kind: 'equivalent', viaOptionTypeId: 'a' });
  });

  it('stops after five rules', () => {
    const rules = [1, 2, 3, 4, 5, 6].map((n) => rule(`t${n}`, `t${n - 1}`));
    const c = satisfierClosure([{ typeId: 't0', sortOrder: 0 }], rules);
    expect(c.get('t5')?.depth).toBe(5);
    expect(c.has('t6')).toBe(false);
    expect(satisfierClosure([{ typeId: 't0', sortOrder: 0 }], rules, 6).get('t6')?.depth).toBe(6);
  });

  it('is cycle safe and never re-reaches the option', () => {
    const c = satisfierClosure([{ typeId: 'a', sortOrder: 0 }], [rule('b', 'a', 'equivalent'), rule('a', 'b', 'equivalent'), rule('c', 'b'), rule('b', 'c')]);
    expect(c.get('a')).toMatchObject({ depth: 0, kind: 'option' });
    expect(c.get('b')).toMatchObject({ depth: 1, kind: 'equivalent' });
    expect(c.get('c')).toMatchObject({ depth: 2, kind: 'equivalent' });
    expect(c.size).toBe(3);
  });

  it('the shortest depth wins; on a tie the first option, then the kind alphabetically', () => {
    const viaTwo = satisfierClosure([{ typeId: 'a', sortOrder: 0 }, { typeId: 'b', sortOrder: 1 }], [rule('x', 'm'), rule('m', 'a'), rule('x', 'b', 'equivalent')]);
    expect(viaTwo.get('x')).toMatchObject({ depth: 1, viaOptionTypeId: 'b', kind: 'equivalent' });
    const tie = satisfierClosure([{ typeId: 'b', sortOrder: 1 }, { typeId: 'a', sortOrder: 0 }], [rule('x', 'a', 'supersedes'), rule('x', 'b', 'component')]);
    expect(tie.get('x')).toMatchObject({ depth: 1, viaOptionTypeId: 'a', kind: 'supersedes' });
    const kinds = satisfierClosure([{ typeId: 'r', sortOrder: 0 }], [rule('p', 'r', 'supersedes'), rule('q', 'r', 'component'), rule('x', 'p'), rule('x', 'q')]);
    expect(kinds.get('x')).toMatchObject({ depth: 2, kind: 'component' });
  });

  it('on STORM rules: the master covers the officer of the watch through the chief mate (X1-04 asserts the same chain in SQL)', () => {
    const c = satisfierClosure([{ typeId: 'coc_oow_deck_unlimited', sortOrder: 0 }], SYSTEM_RULES);
    expect(c.get('coc_chief_mate_unlimited')).toMatchObject({ depth: 1, kind: 'supersedes' });
    expect(c.get('coc_master_unlimited')).toMatchObject({ depth: 2, kind: 'supersedes' });
    const efa = satisfierClosure([{ typeId: 'stcw_efa', sortOrder: 0 }], SYSTEM_RULES);
    expect([...efa.keys()].sort()).toEqual(['ship_captain_medical', 'stcw_basic_safety', 'stcw_efa', 'stcw_medical_care', 'stcw_mfa']);
  });
});

// ---------------------------------------------------------------- the parity cases

interface CaseRow {
  key: string;
  group: string;
  kind?: 'document' | 'familiarisation';
  options: string[];
  sort: number;
  ticked?: boolean;
}
interface CaseDoc {
  key: string;
  type: string;
  expiry: number | null;
  noExpiry?: boolean;
  status?: CrewDocumentVerificationStatus;
  muted?: boolean;
  file?: boolean;
  deleted?: boolean;
}
interface CaseRecord {
  key: string;
  template: string;
  status: string;
  completed: number | null;
}
interface ExpectedRow {
  state: string;
  doc?: string | null;
  record?: string | null;
  type?: string | null;
  via?: string | null;
  viaOption?: string | null;
  expiry?: number | null;
  noExpiry?: boolean;
  bucket?: string | null;
  conditional?: boolean;
  muted?: boolean;
  missingDate?: boolean;
  hasFile?: boolean | null;
  gap?: string | null;
  nearest?: string | null;
  nearestRecord?: string | null;
  nearestType?: string | null;
}
interface ExpectedSummary {
  required: number;
  met: number;
  expiring: number;
  expired: number;
  missing: number;
  conditional: number;
  muted: number;
  docs: [number, number];
  stcw: [number, number];
  quals: [number, number];
  fam: [number, number];
  status: string;
  nextExpiry: number | null;
  dotDocuments: string;
  dotQualifications: string;
  issues: [string, string][];
}
interface Case {
  name: string;
  person?: { title?: string; login?: boolean };
  types?: { key: string; category: string; name: string }[];
  rules?: { type: string; satisfies: string; kind: CrewDocumentSatisfactionKind }[];
  templates?: string[];
  rows: CaseRow[];
  documents?: CaseDoc[];
  familiarisation?: CaseRecord[];
  expect: { rows: Record<string, ExpectedRow>; summary: ExpectedSummary };
}

/** Read as text: a JSON import's inferred tuple and union types do not match Case. */
const CASES: Case[] = (JSON.parse(read('src/test/crew/fixtures/complianceCases.json')) as { cases: Case[] }).cases;

/** The case's world in the mirror's terms (ids are the keys). */
function evaluateCase(c: Case) {
  const types = new Map(SYSTEM_TYPES);
  for (const t of c.types ?? []) types.set(t.key, { key: t.key, category: t.category, name: t.name, itemType: itemTypeForCategory(t.category) });
  const typeOf = (key: string) => {
    const t = types.get(key);
    if (!t) throw new Error(`${c.name}: unknown type ${key}`);
    return t;
  };
  const rows: RequirementRowInput[] = c.rows.map((r) => ({
    id: r.key,
    groupKey: r.group,
    label: r.key,
    kind: r.kind ?? 'document',
    sortOrder: r.sort,
    options: r.options.map((o, i) =>
      (r.kind ?? 'document') === 'familiarisation'
        ? { familiarizationTemplateId: o, sortOrder: i }
        : { documentTypeId: o, sortOrder: i, categoryKey: typeOf(o).category, tab: SYSTEM_CATEGORY_TAB[typeOf(o).category] ?? null },
    ),
    positionIds: r.ticked === false ? ['bosun'] : ['deckhand'],
  }));
  const documents: HeldDocumentInput[] = (c.documents ?? []).map((d) => ({
    id: d.key,
    documentTypeId: d.type,
    typeKey: d.type,
    typeName: typeOf(d.type).name,
    categoryKey: typeOf(d.type).category,
    itemType: typeOf(d.type).itemType,
    expiryDate: d.expiry === null ? null : plus(d.expiry),
    noExpiry: Boolean(d.noExpiry),
    verificationStatus: d.status ?? 'verified',
    alertsMuted: Boolean(d.muted),
    hasFile: d.file !== false,
    deleted: Boolean(d.deleted),
  }));
  const familiarisation: FamiliarisationRecordInput[] = (c.familiarisation ?? []).map((r) => ({
    id: r.key,
    templateId: r.template,
    templateName: `Template ${r.template}`,
    status: r.status,
    completedOn: r.completed === null ? null : plus(r.completed),
  }));
  const rules: SatisfactionRule[] = [...SYSTEM_RULES, ...(c.rules ?? []).map((r) => ({ typeId: r.type, satisfiesTypeId: r.satisfies, kind: r.kind }))];
  const positionId = c.person?.title === 'Basket weaver' ? null : 'deckhand';
  return evaluateRequirements({ positionId, rows, rules, documents, familiarisation, today: TODAY });
}

const offset = (day: string | null) => (day === null ? null : daysUntil(day, TODAY));

/** A status row in the fixture's terms, with the fixture's defaults filled. */
function asExpected(s: RequirementStatus): Required<ExpectedRow> {
  return {
    state: s.state,
    doc: s.satisfyingDocumentId,
    record: s.satisfyingRecordId,
    type: s.satisfyingTypeId,
    via: s.satisfiedVia,
    viaOption: s.viaOptionTypeId,
    expiry: offset(s.nextExpiry),
    noExpiry: s.noExpiry,
    bucket: s.bucket,
    conditional: s.isConditional,
    muted: s.isMuted,
    missingDate: s.missingDate,
    hasFile: s.hasFile,
    gap: s.gapReason,
    nearest: s.nearestDocumentId,
    nearestRecord: s.nearestRecordId,
    nearestType: s.nearestTypeId,
  };
}

function withDefaults(e: ExpectedRow): Required<ExpectedRow> {
  return {
    state: e.state,
    doc: e.doc ?? null,
    record: e.record ?? null,
    type: e.type ?? null,
    via: e.via ?? null,
    viaOption: e.viaOption ?? null,
    expiry: e.expiry ?? null,
    noExpiry: e.noExpiry ?? false,
    bucket: e.bucket ?? null,
    conditional: e.conditional ?? false,
    muted: e.muted ?? false,
    missingDate: e.missingDate ?? false,
    hasFile: e.hasFile ?? (e.doc ? true : null),
    gap: e.gap ?? null,
    nearest: e.nearest ?? null,
    nearestRecord: e.nearestRecord ?? null,
    nearestType: e.nearestType ?? null,
  };
}

describe('the parity cases (complianceCases.json; SQL compliance_parity asserts the same)', () => {
  it('are many, uniquely named, and cover every rule the slice names', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CASES.map((c) => c.name)).size).toBe(CASES.length);
    const all = JSON.stringify(CASES);
    for (const needle of ['"component"', '"supersedes"', '"equivalent"', 'conditionally_approved', 'rejected', '"expired"', '"muted":true', '"expiry":null', 'not_linked', 'in_progress', '"login":false']) {
      expect(all, needle).toContain(needle);
    }
    expect(PARITY_SQL).toContain('src/test/crew/fixtures/complianceCases.json');
  });

  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const statuses = evaluateCase(c);
    const got = Object.fromEntries(statuses.map((s) => [s.rowId, asExpected(s)]));
    const want = Object.fromEntries(Object.entries(c.expect.rows).map(([k, v]) => [k, withDefaults(v)]));
    expect(got).toEqual(want);

    const sum = summariseCompliance(statuses);
    const e = c.expect.summary;
    expect({
      required: sum.required,
      met: sum.met,
      expiring: sum.expiring,
      expired: sum.expired,
      missing: sum.missing,
      conditional: sum.conditional,
      muted: sum.muted,
      docs: [sum.docsRequired, sum.docsMet],
      stcw: [sum.stcwRequired, sum.stcwMet],
      quals: [sum.qualsRequired, sum.qualsMet],
      fam: [sum.famRequired, sum.famMet],
      status: sum.status,
      nextExpiry: offset(sum.nextExpiry),
      dotDocuments: sum.dotDocuments,
      dotQualifications: sum.dotQualifications,
      issues: sum.issues.map((i) => [i.rowId, i.reason]),
    }).toEqual(e);
  });
});

// ---------------------------------------------------------------- edges the cases do not need

describe('evaluateRequirements edges', () => {
  const pstRow: RequirementRowInput = {
    id: 'pst',
    groupKey: 'stcw_basic',
    label: 'Personal survival techniques',
    kind: 'document',
    sortOrder: 10,
    options: [{ documentTypeId: 'stcw_pst', sortOrder: 0, categoryKey: 'stcw_basic', tab: 'stcw' }],
    positionIds: ['deckhand'],
  };
  const doc = (over: Partial<HeldDocumentInput>): HeldDocumentInput => ({
    id: 'd',
    documentTypeId: 'stcw_pst',
    typeKey: 'stcw_pst',
    typeName: 'Personal survival techniques',
    categoryKey: 'stcw_basic',
    itemType: 'crew_qualification',
    expiryDate: plus(400),
    noExpiry: false,
    verificationStatus: 'verified',
    alertsMuted: false,
    hasFile: true,
    ...over,
  });

  it('a document without a type never counts and is never nearest', () => {
    const [s] = evaluateRequirements({ positionId: 'deckhand', rows: [pstRow], rules: [], documents: [doc({ documentTypeId: null, typeKey: null })], today: TODAY });
    expect(s).toMatchObject({ state: 'missing', gapReason: 'none', nearestDocumentId: null });
  });

  it('unverified documents count (only a rejection excludes)', () => {
    const [s] = evaluateRequirements({ positionId: 'deckhand', rows: [pstRow], rules: [], documents: [doc({ verificationStatus: 'unverified' })], today: TODAY });
    expect(s).toMatchObject({ state: 'met', verificationStatus: 'unverified', isConditional: false });
  });

  it('the window the server resolved wins over the item-type default', () => {
    const [s] = evaluateRequirements({ positionId: 'deckhand', rows: [pstRow], rules: [], documents: [doc({ expiryDate: plus(120), windowDays: 180 })], today: TODAY });
    expect(s).toMatchObject({ state: 'expiring', bucket: 'expiring', daysRemaining: 120 });
  });

  it('a row ticked for another position is not required; rows come in sort order', () => {
    const efa: RequirementRowInput = { ...pstRow, id: 'efa', sortOrder: 5, options: [{ documentTypeId: 'stcw_efa', sortOrder: 0, categoryKey: 'stcw_basic', tab: 'stcw' }] };
    const out = evaluateRequirements({ positionId: 'deckhand', rows: [pstRow, efa, { ...pstRow, id: 'other', positionIds: ['bosun'] }], rules: [], documents: [], today: TODAY });
    expect(out.map((s) => s.rowId)).toEqual(['efa', 'pst']);
  });

  it('no position: nothing required, a complete summary of 0', () => {
    expect(evaluateRequirements({ positionId: null, rows: [pstRow], rules: [], documents: [], today: TODAY })).toEqual([]);
    expect(summariseCompliance([])).toMatchObject({ required: 0, status: 'complete', dotDocuments: 'none', dotQualifications: 'none', issues: [], nextExpiry: null });
  });
});

describe('issueReason, missingForRole and requirementExplanation', () => {
  const base: RequirementStatus = {
    rowId: 'r',
    groupKey: 'stcw_basic',
    label: 'PST',
    kind: 'document',
    tab: 'stcw',
    rowSort: 10,
    state: 'met',
    satisfyingDocumentId: 'd',
    satisfyingRecordId: null,
    satisfyingTypeId: 't',
    satisfyingName: 'Basic safety training (combined certificate)',
    satisfiedVia: 'component',
    viaOptionTypeId: 'stcw_pst',
    nextExpiry: plus(40),
    noExpiry: false,
    bucket: 'valid',
    daysRemaining: 40,
    verificationStatus: 'verified',
    isConditional: false,
    isMuted: false,
    missingDate: false,
    hasFile: true,
    gapReason: null,
    nearestDocumentId: null,
    nearestRecordId: null,
    nearestTypeId: null,
    nearestName: null,
  };

  it('issueReason: first match, alerts off silences only expiring', () => {
    expect(issueReason(base)).toBeNull();
    expect(issueReason({ ...base, state: 'expiring' })).toBe('expiring');
    expect(issueReason({ ...base, state: 'expiring', isMuted: true })).toBeNull();
    expect(issueReason({ ...base, state: 'expiring', isMuted: true, isConditional: true })).toBe('conditional');
    expect(issueReason({ ...base, state: 'expired', isMuted: true })).toBe('expired');
    expect(issueReason({ ...base, state: 'missing' })).toBe('missing');
    expect(issueReason({ ...base, missingDate: true })).toBe('missing_date');
  });

  it('missingForRole: document rows missing or expired, missing first, with their option types', () => {
    const rows = [
      { ...base, rowId: 'a', rowSort: 30, state: 'expired' as const },
      { ...base, rowId: 'b', rowSort: 40, state: 'missing' as const, gapReason: 'none' as const },
      { ...base, rowId: 'c', rowSort: 10, state: 'met' as const },
      { ...base, rowId: 'f', rowSort: 5, state: 'missing' as const, kind: 'familiarisation' as const, tab: 'familiarisation' as const },
      { ...base, rowId: 'e', rowSort: 20, state: 'missing' as const, gapReason: 'rejected' as const },
    ];
    const out = missingForRole(rows, new Map([['b', ['stcw_pst', 'stcw_basic_safety']], ['e', ['eng1']]]));
    expect(out.map((m) => [m.rowId, m.state, m.optionTypeIds])).toEqual([
      ['e', 'missing', ['eng1']],
      ['b', 'missing', ['stcw_pst', 'stcw_basic_safety']],
      ['a', 'expired', []],
    ]);
  });

  it('requirementExplanation: every met cell names its document, every missing cell explains itself', () => {
    expect(requirementExplanation(base)).toBe('Covered by Basic safety training (combined certificate) (a combined certificate).');
    expect(requirementExplanation({ ...base, satisfiedVia: 'option', satisfyingName: 'PST' })).toBe('Held: PST.');
    expect(requirementExplanation({ ...base, satisfiedVia: 'supersedes', satisfyingName: 'SSO' })).toBe('Covered by SSO (a higher certificate).');
    expect(requirementExplanation({ ...base, satisfiedVia: 'equivalent', satisfyingName: 'Malta medical' })).toBe('Covered by Malta medical (an accepted equivalent).');
    expect(requirementExplanation({ ...base, state: 'expiring', isConditional: true })).toContain('Expiring soon. Conditionally approved.');
    expect(requirementExplanation({ ...base, state: 'expiring', isMuted: true })).toContain('(alerts off)');
    expect(requirementExplanation({ ...base, state: 'expired', satisfyingName: 'PST' })).toBe('Expired: PST.');
    expect(requirementExplanation({ ...base, missingDate: true })).toContain('Expiry date missing.');
    expect(requirementExplanation({ ...base, state: 'met', satisfiedVia: 'familiarisation', satisfyingName: 'Bridge 24 hours' })).toBe('Completed: Bridge 24 hours.');
    expect(requirementExplanation({ ...base, state: 'missing', gapReason: 'none' })).toBe('Missing: nothing held counts for this requirement.');
    expect(requirementExplanation({ ...base, state: 'missing', gapReason: 'rejected', nearestName: 'PST' })).toBe('Missing: PST was rejected.');
    expect(requirementExplanation({ ...base, state: 'missing', gapReason: 'not_linked', nearestName: 'BST refresher' })).toBe(
      'Missing. Nearest held: BST refresher, which does not count for this requirement.',
    );
    expect(requirementExplanation({ ...base, state: 'missing', gapReason: 'in_progress', nearestName: 'Deck induction' })).toBe('Missing: Deck induction is not completed yet.');
  });
});

// ---------------------------------------------------------------- the hooks (mocked client)

const COMPANY = 'c0000000-0000-4000-8000-000000000001';
const VESSEL = 'e0000000-0000-4000-8000-000000000001';
const PERSON_A = 'b0000000-0000-4000-8000-000000000011';
const PERSON_B = 'b0000000-0000-4000-8000-000000000012';

const statusRow = (over: Partial<CrewRequirementStatusDbRow> = {}): CrewRequirementStatusDbRow => ({
  company_id: COMPANY, vessel_id: VESSEL, profile_id: PERSON_A, user_id: 'a0000000-0000-4000-8000-000000000011',
  position_id: 'p-bosun', placement_kind: 'assignment',
  row_id: 'row-pst', group_key: 'stcw_basic', row_label: 'Personal survival techniques', row_kind: 'document', tab: 'stcw', row_sort: 10,
  state: 'met', satisfying_document_id: 'doc-1', satisfying_record_id: null, satisfying_type_id: 'type-bst', satisfying_name: 'Basic safety training',
  satisfied_via: 'component', via_option_type_id: 'type-pst', next_expiry: '2028-01-31', no_expiry: false, bucket: 'valid', days_remaining: 435,
  verification_status: 'verified', is_conditional: false, is_muted: false, missing_date: false, has_file: true,
  gap_reason: null, nearest_document_id: null, nearest_record_id: null, nearest_type_id: null, nearest_name: null,
  ...over,
});

const summaryRow = (over: Partial<CrewComplianceSummaryDbRow> = {}): CrewComplianceSummaryDbRow => ({
  company_id: COMPANY, vessel_id: VESSEL, profile_id: PERSON_A, user_id: 'a0000000-0000-4000-8000-000000000011',
  first_name: 'Demo', last_name: 'Bosun', preferred_name: null,
  position_id: 'p-bosun', position_name: 'Bosun', position_text: 'Bosun', department_key: 'deck', rank_tier: 'rating', sort_order: 40,
  placement_kind: 'assignment',
  required: 6, met: 4, expiring: 1, expired: 1, missing: 1, conditional: 1, muted: 0,
  docs_required: 2, docs_met: 1, stcw_required: 3, stcw_met: 3, quals_required: 1, quals_met: 0, fam_required: 0, fam_met: 0,
  status: 'expired', next_expiry: '2026-12-01', dot_documents: 'danger', dot_qualifications: 'warn',
  issues: [
    { row_id: 'row-eng1', label: 'ENG1', tab: 'documents', state: 'expired', reason: 'expired' },
    { row_id: 'row-gmdss', label: 'GMDSS', tab: 'qualifications', state: 'missing', reason: 'missing' },
    { row_id: 'row-efa', label: 'Elementary first aid', tab: 'stcw', state: 'expiring', reason: 'expiring' },
  ],
  ...over,
});

const pgrst202 = { code: 'PGRST202', message: 'Could not find the function public.crew_vessel_compliance(p_vessel_id) in the schema cache' };

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  mock.rpc = {};
  mock.rpcCalls = [];
});

describe('the compliance reads: parsing', () => {
  it('a status row in lib/compliance.ts terms', () => {
    const r = parseRequirementStatusRow(statusRow());
    expect(r).toMatchObject({
      profileId: PERSON_A, placementKind: 'assignment', rowId: 'row-pst', label: 'Personal survival techniques', kind: 'document', tab: 'stcw', rowSort: 10,
      state: 'met', satisfiedVia: 'component', viaOptionTypeId: 'type-pst', bucket: 'valid', daysRemaining: 435, verificationStatus: 'verified', hasFile: true,
      gapReason: null,
    });
    const missing = parseRequirementStatusRow(statusRow({ state: 'missing', satisfying_document_id: null, satisfied_via: null, bucket: null, days_remaining: null, verification_status: null, has_file: null, gap_reason: 'not_linked', nearest_name: 'BST refresher' }));
    expect(missing).toMatchObject({ state: 'missing', satisfiedVia: null, bucket: null, hasFile: null, gapReason: 'not_linked', nearestName: 'BST refresher' });
    expect(requirementExplanation(missing)).toBe('Missing. Nearest held: BST refresher, which does not count for this requirement.');
  });

  it('a word that is not the engine\'s is an error, never a guess', () => {
    expect(() => parseRequirementStatusRow(statusRow({ state: 'ok' }))).toThrow(ComplianceAnswerError);
    expect(() => parseRequirementStatusRow(statusRow({ tab: 'medical' }))).toThrow(ComplianceAnswerError);
    expect(() => parseRequirementStatusRow(statusRow({ satisfied_via: 'magic' }))).toThrow(ComplianceAnswerError);
    expect(() => parseRequirementStatusRow(statusRow({ bucket: 'soon' }))).toThrow(ComplianceAnswerError);
    expect(() => parseRequirementStatusRow(statusRow({ gap_reason: 'unknown' }))).toThrow(ComplianceAnswerError);
    expect(() => parseRequirementStatusRow(statusRow({ placement_kind: 'visitor' }))).toThrow(ComplianceAnswerError);
    expect(() => parseComplianceSummaryRow(summaryRow({ dot_documents: 'red' }))).toThrow(ComplianceAnswerError);
    expect(() => parseComplianceSummaryRow(summaryRow({ status: 'fine' }))).toThrow(ComplianceAnswerError);
    expect(() => parseComplianceSummaryRow(summaryRow({ issues: [{ row_id: 'x', label: 'X', tab: 'stcw', state: 'missing', reason: 'late' }] }))).toThrow(ComplianceAnswerError);
    expect(() => parseComplianceSummaryRow(summaryRow({ issues: { not: 'a list' } }))).toThrow(ComplianceAnswerError);
  });

  it('a summary row: counts, status, dots, issues worst first, the display name', () => {
    const s = parseComplianceSummaryRow(summaryRow());
    expect(s).toMatchObject({
      displayName: 'Bosun, Demo', positionName: 'Bosun', placementKind: 'assignment', required: 6, met: 4, docsRequired: 2, docsMet: 1,
      stcwRequired: 3, stcwMet: 3, status: 'expired', dotDocuments: 'danger', dotQualifications: 'warn', nextExpiry: '2026-12-01',
    });
    expect(s.issues.map((i) => i.reason)).toEqual(['expired', 'missing', 'expiring']);
    expect(parseComplianceSummaryRow(summaryRow({ issues: [] })).issues).toEqual([]);
  });
});

describe('the compliance reads: fetching', () => {
  it('summaries only by default; with cells both reads, grouped per person in row order', async () => {
    mock.rpc.crew_vessel_compliance = { data: [summaryRow(), summaryRow({ profile_id: PERSON_B, first_name: 'Demo', last_name: 'Deckhand', status: 'complete', issues: [] })], error: null };
    const only = await fetchVesselCompliance(VESSEL);
    expect(mock.rpcCalls.map((c) => c.fn)).toEqual(['crew_vessel_compliance']);
    expect(mock.rpcCalls[0].args).toEqual({ p_vessel_id: VESSEL });
    expect(only.people.map((p) => p.profileId)).toEqual([PERSON_A, PERSON_B]);
    expect(only.byProfile.get(PERSON_B)?.status).toBe('complete');
    expect(only.statuses).toEqual([]);

    mock.rpcCalls = [];
    mock.rpc.crew_vessel_requirement_status = {
      data: [statusRow({ row_id: 'r2', row_sort: 20 }), statusRow({ row_id: 'r1', row_sort: 10 }), statusRow({ profile_id: PERSON_B, row_id: 'r1', row_sort: 10 })],
      error: null,
    };
    const cells = await fetchVesselCompliance(VESSEL, 'cells');
    expect(mock.rpcCalls.map((c) => c.fn).sort()).toEqual(['crew_vessel_compliance', 'crew_vessel_requirement_status']);
    expect(mock.rpcCalls.find((c) => c.fn === 'crew_vessel_requirement_status')?.args).toEqual({ p_vessel_id: VESSEL, p_profile_id: null });
    expect(cells.statusByProfile.get(PERSON_A)?.map((r) => r.rowId)).toEqual(['r1', 'r2']);
    expect(cells.statusByProfile.get(PERSON_B)?.length).toBe(1);
  });

  it('one person: asks for the person, and never shows rows of someone else as theirs', async () => {
    mock.rpc.crew_vessel_requirement_status = { data: [statusRow(), statusRow({ profile_id: PERSON_B })], error: null };
    expect((await fetchRequirementStatus(VESSEL, PERSON_A)).map((r) => r.profileId)).toEqual([PERSON_A]);
    expect(mock.rpcCalls[0].args).toEqual({ p_vessel_id: VESSEL, p_profile_id: PERSON_A });
    expect((await fetchRequirementStatus(VESSEL, null)).length).toBe(2);
  });

  it('a 42501 or any other error is thrown as sent', async () => {
    const refused = { code: '42501', message: 'crew_not_permitted', details: "You can't see crew compliance on this vessel." };
    mock.rpc.crew_vessel_compliance = { data: null, error: refused };
    await expect(fetchVesselCompliance(VESSEL)).rejects.toBe(refused);
  });
});

describe('useVesselCompliance / usePersonRequirementStatus', () => {
  it('disabled, or without a vessel or company: idle, nothing sent', () => {
    const client = newClient();
    expect(renderHook(() => useVesselCompliance(VESSEL, { companyId: COMPANY, enabled: false }), { wrapper: wrapper(client) }).result.current).toEqual({ status: 'idle' });
    expect(renderHook(() => useVesselCompliance(null, { companyId: COMPANY }), { wrapper: wrapper(client) }).result.current).toEqual({ status: 'idle' });
    expect(renderHook(() => usePersonRequirementStatus(VESSEL, null, { companyId: COMPANY }), { wrapper: wrapper(client) }).result.current).toEqual({ status: 'idle' });
    expect(mock.rpcCalls).toEqual([]);
  });

  it('ready with the summaries', async () => {
    mock.rpc.crew_vessel_compliance = { data: [summaryRow()], error: null };
    const { result } = renderHook(() => useVesselCompliance(VESSEL, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('not ready');
    expect(result.current.compliance.byProfile.get(PERSON_A)?.dotDocuments).toBe('danger');
  });

  it("D-01: the RPC missing (PGRST202, a 42883 naming it, a missing relation) is 'not set up' with the notice", async () => {
    for (const error of [pgrst202, { code: '42883', message: 'function public.crew_vessel_compliance(uuid) does not exist' }, { code: '42P01', message: 'relation "public.crew_requirement_rows" does not exist' }]) {
      mock.rpc.crew_vessel_compliance = { data: null, error };
      const { result } = renderHook(() => useVesselCompliance(VESSEL, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
      await waitFor(() => expect(result.current.status).toBe('not_set_up'));
      expect(result.current).toEqual({ status: 'not_set_up', notice: COMPLIANCE_NOT_SET_UP_NOTICE });
    }
    expect(COMPLIANCE_NOT_SET_UP_NOTICE).toBe('Crew compliance becomes available once the crew update is applied.');
  });

  it('a 42883 naming another function is an error, not "not set up"', async () => {
    mock.rpc.crew_vessel_compliance = { data: null, error: { code: '42883', message: 'function public.crew_position_for(uuid, text) does not exist' } };
    const { result } = renderHook(() => useVesselCompliance(VESSEL, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
    // One retry for an unknown error (noComplianceRetry), then the error.
    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 4000 });
  });

  it("a 42501 is 'denied' with the server's sentence", async () => {
    mock.rpc.crew_vessel_compliance = { data: null, error: { code: '42501', message: 'crew_not_permitted', details: "You can't see crew compliance on this vessel." } };
    const { result } = renderHook(() => useVesselCompliance(VESSEL, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(result.current).toEqual({ status: 'denied', notice: COMPLIANCE_DENIED_NOTICE });
  });

  it('any other error: an error state with Retry, which asks again', async () => {
    mock.rpc.crew_vessel_compliance = { data: null, error: { code: 'XX000', message: 'boom' } };
    const { result } = renderHook(() => useVesselCompliance(VESSEL, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 4000 });
    expect(mock.rpcCalls.length).toBe(2);
    mock.rpc.crew_vessel_compliance = { data: [summaryRow()], error: null };
    if (result.current.status === 'error') result.current.retry();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('one person: ready with their rows', async () => {
    mock.rpc.crew_vessel_requirement_status = { data: [statusRow(), statusRow({ row_id: 'row-efa', state: 'expiring' })], error: null };
    const { result } = renderHook(() => usePersonRequirementStatus(VESSEL, PERSON_A, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('not ready');
    expect(summariseCompliance(result.current.rows)).toMatchObject({ required: 2, met: 2, expiring: 1, status: 'expiring' });
  });
});

describe('keys', () => {
  it('every compliance key carries the company and the vessel', () => {
    expect(complianceKeys.summary(COMPANY, VESSEL).slice(0, 5)).toEqual([...crewKeys.vessel(COMPANY, VESSEL)]);
    expect(complianceKeys.cells(COMPANY, VESSEL)).not.toEqual(complianceKeys.cells(COMPANY, 'other-vessel'));
    expect(complianceKeys.person(COMPANY, VESSEL, PERSON_A)).not.toEqual(complianceKeys.person('other-company', VESSEL, PERSON_A));
    expect(complianceKeys.config(COMPANY, VESSEL).slice(0, 6)).toEqual([...complianceKeys.vessel(COMPANY, VESSEL)]);
    expect(isCompanyComplianceKey(complianceKeys.summary(COMPANY, VESSEL), COMPANY)).toBe(true);
    expect(isCompanyComplianceKey(complianceKeys.config(COMPANY, 'v2'), COMPANY)).toBe(true);
    expect(isCompanyComplianceKey(complianceKeys.summary('other', VESSEL), COMPANY)).toBe(false);
    expect(isCompanyComplianceKey(crewKeys.positions(COMPANY, VESSEL), COMPANY)).toBe(false);
  });
});

// ---------------------------------------------------------------- the configuration

const configAnswer = (over: Record<string, unknown> = {}) => ({
  vessel_id: VESSEL,
  company_id: COMPANY,
  can_admin: true,
  can_admin_company: false,
  settings: { is_passenger_ship: false, crew_uploads_enabled: true, transfer_requires_fleet_approval: false, requirements_seeded_at: '2026-11-24T00:00:00Z', updated_at: '2026-11-24T00:00:00Z' },
  positions: [
    { position_id: 'p-master', key: 'master', name: 'Master', department_key: 'deck', department_label: 'Deck', department_sort: 10, rank_tier: 'senior_officer', sort_order: 10, is_listed: true },
    { position_id: 'p-bosun', key: 'bosun', name: 'Bosun', department_key: 'deck', department_label: 'Deck', department_sort: 10, rank_tier: 'rating', sort_order: 40, is_listed: false },
  ],
  rows: [
    {
      id: 'row-pst', group_key: 'stcw_basic', label: 'Personal survival techniques', kind: 'document', sort_order: 11, seed_key: 'stcw_basic.pst', tab: 'stcw',
      options: [{ id: 'o1', document_type_id: 'type-pst', familiarization_template_id: null, sort_order: 0, name: 'Personal survival techniques', code: 'PST', abbreviation: 'PST', category_key: 'stcw_basic_safety', tab: 'stcw', is_company_type: false }],
      position_ids: ['p-bosun', 'p-master'], held_by: 3,
    },
    {
      id: 'row-fam', group_key: 'familiarisation', label: 'Ship familiarisation', kind: 'familiarisation', sort_order: 900, seed_key: null, tab: 'familiarisation',
      options: [{ id: 'o2', document_type_id: null, familiarization_template_id: 'tpl-1', sort_order: 0, name: 'Deck induction', code: null, abbreviation: null, category_key: null, tab: null, is_company_type: false }],
      position_ids: [], held_by: 0,
    },
  ],
  templates: [{ id: 'tpl-1', name: 'Deck induction', is_active: true }],
  ...over,
});

describe('the requirements configuration', () => {
  it('parses the jsonb: rights, settings, positions, rows with options and ticks, templates', () => {
    const c = parseRequirementsConfig(configAnswer());
    expect(c).toMatchObject({ vesselId: VESSEL, companyId: COMPANY, canAdmin: true, canAdminCompany: false });
    expect(c.settings).toEqual({ isPassengerShip: false, crewUploadsEnabled: true, transferRequiresFleetApproval: false, requirementsSeededAt: '2026-11-24T00:00:00Z', updatedAt: '2026-11-24T00:00:00Z' });
    expect(c.positions.map((p) => [p.positionId, p.isListed])).toEqual([['p-master', true], ['p-bosun', false]]);
    expect(c.rows[0]).toMatchObject({ id: 'row-pst', groupKey: 'stcw_basic', kind: 'document', tab: 'stcw', seedKey: 'stcw_basic.pst', heldBy: 3 });
    expect(c.rows[0].options[0]).toMatchObject({ documentTypeId: 'type-pst', familiarizationTemplateId: null, tab: 'stcw', code: 'PST' });
    expect(c.rows[1].options[0]).toMatchObject({ documentTypeId: null, familiarizationTemplateId: 'tpl-1', name: 'Deck induction' });
    expect([...c.ticked].sort()).toEqual([cellKey('row-pst', 'p-bosun'), cellKey('row-pst', 'p-master')]);
    expect(c.templates).toEqual([{ id: 'tpl-1', name: 'Deck induction', isActive: true }]);
  });

  it('a vessel without settings or rows reads as defaults and empty lists', () => {
    const c = parseRequirementsConfig(configAnswer({ settings: null, rows: [], positions: [], templates: [] }));
    expect(c.settings.isPassengerShip).toBe(false);
    expect(c.rows).toEqual([]);
    expect(c.ticked.size).toBe(0);
  });

  it('anything that is not the contract is an error', () => {
    expect(() => parseRequirementsConfig(null)).toThrow(ComplianceAnswerError);
    expect(() => parseRequirementsConfig([])).toThrow(ComplianceAnswerError);
    const rows = configAnswer().rows;
    expect(() => parseRequirementsConfig(configAnswer({ rows: [{ ...rows[0], group_key: 'misc' }] }))).toThrow(ComplianceAnswerError);
    expect(() => parseRequirementsConfig(configAnswer({ rows: [{ ...rows[0], kind: 'course' }] }))).toThrow(ComplianceAnswerError);
    expect(() => parseRequirementsConfig(configAnswer({ rows: [{ ...rows[0], options: [{ id: 'x', document_type_id: 't', familiarization_template_id: 'f' }] }] }))).toThrow(ComplianceAnswerError);
    expect(() => parseRequirementsConfig(configAnswer({ rows: 'none' }))).toThrow(ComplianceAnswerError);
  });

  it('fetch: one RPC; another vessel in the answer is refused', async () => {
    mock.rpc.crew_requirements_config = { data: configAnswer(), error: null };
    expect((await fetchRequirementsConfig(VESSEL)).rows.length).toBe(2);
    expect(mock.rpcCalls).toEqual([{ fn: 'crew_requirements_config', args: { p_vessel_id: VESSEL } }]);
    mock.rpc.crew_requirements_config = { data: configAnswer({ vessel_id: 'other' }), error: null };
    await expect(fetchRequirementsConfig(VESSEL)).rejects.toBeInstanceOf(ComplianceAnswerError);
  });

  it("useRequirementsConfig: ready; D-01 'not set up'; denied; error", async () => {
    mock.rpc.crew_requirements_config = { data: configAnswer(), error: null };
    const ready = renderHook(() => useRequirementsConfig(VESSEL, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(ready.result.current.status).toBe('ready'));

    mock.rpc.crew_requirements_config = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_requirements_config' } };
    const missing = renderHook(() => useRequirementsConfig(VESSEL, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(missing.result.current).toEqual({ status: 'not_set_up', notice: COMPLIANCE_NOT_SET_UP_NOTICE }));

    mock.rpc.crew_requirements_config = { data: null, error: { code: '42501', message: 'crew_not_permitted', details: 'You can’t see this.' } };
    const denied = renderHook(() => useRequirementsConfig(VESSEL, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(denied.result.current).toEqual({ status: 'denied', notice: 'You can’t see this.' }));

    mock.rpc.crew_requirements_config = { data: null, error: { code: '08006', message: 'connection failure' } };
    const failed = renderHook(() => useRequirementsConfig(VESSEL, { companyId: COMPANY }), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(failed.result.current.status).toBe('error'), { timeout: 4000 });
  });
});

// ---------------------------------------------------------------- the configuration writes

const savedRow = (over: Partial<CrewRequirementRowRow> = {}): CrewRequirementRowRow => ({
  id: 'row-new', company_id: COMPANY, vessel_id: VESSEL, group_key: 'custom', label: 'Rescue boat', kind: 'document', sort_order: 1000, seed_key: null,
  created_by: null, updated_by: null, created_at: '2026-11-24T00:00:00Z', updated_at: '2026-11-24T00:00:00Z', ...over,
});

const settingsRow = (over: Partial<VesselCrewSettingsRow> = {}): VesselCrewSettingsRow => ({
  vessel_id: VESSEL, company_id: COMPANY, is_passenger_ship: false, crew_uploads_enabled: true, transfer_requires_fleet_approval: false,
  requirements_seeded_at: null, updated_by: null, created_at: '2026-11-24T00:00:00Z', updated_at: '2026-11-24T00:00:00Z', ...over,
});

describe('the configuration writes: each checked against the answer', () => {
  it('row save: sends the payload; the answer must be the row on the vessel (and the same row when editing)', async () => {
    mock.rpc.crew_requirement_row_save = { data: savedRow(), error: null };
    const payload = { group_key: 'custom' as const, label: ' Rescue boat ', kind: 'document' as const, options: [{ document_type_id: 'type-rb' }], position_ids: ['p-master'] };
    expect((await saveRequirementRow({ vesselId: VESSEL, rowId: null, payload })).id).toBe('row-new');
    expect(mock.rpcCalls[0]).toEqual({ fn: 'crew_requirement_row_save', args: { p_vessel_id: VESSEL, p_row_id: null, p_payload: payload } });
    await expect(saveRequirementRow({ vesselId: VESSEL, rowId: 'row-other', payload })).rejects.toBeInstanceOf(ComplianceWriteError);
    mock.rpc.crew_requirement_row_save = { data: savedRow({ vessel_id: 'other' }), error: null };
    await expect(saveRequirementRow({ vesselId: VESSEL, rowId: null, payload })).rejects.toThrow('The requirement was not saved. Try again.');
    mock.rpc.crew_requirement_row_save = { data: null, error: null };
    await expect(saveRequirementRow({ vesselId: VESSEL, rowId: null, payload })).rejects.toBeInstanceOf(ComplianceWriteError);
  });

  it('row delete: the answer must be the id', async () => {
    mock.rpc.crew_requirement_row_delete = { data: 'row-pst', error: null };
    expect(await deleteRequirementRow({ vesselId: VESSEL, rowId: 'row-pst' })).toBe('row-pst');
    mock.rpc.crew_requirement_row_delete = { data: null, error: null };
    await expect(deleteRequirementRow({ vesselId: VESSEL, rowId: 'row-pst' })).rejects.toThrow('The requirement was not removed. Try again.');
  });

  it('staged cells: only the changes are sent; the answer must be their number', async () => {
    const ticked = new Set([cellKey('r1', 'p1'), cellKey('r1', 'p2')]);
    const staged = new Map([[cellKey('r1', 'p1'), true], [cellKey('r1', 'p2'), false], [cellKey('r2', 'p1'), true], ['broken', true]]);
    const cells = stagedCells(ticked, staged);
    expect(cells).toEqual([
      { row_id: 'r1', position_id: 'p2', required: false },
      { row_id: 'r2', position_id: 'p1', required: true },
    ]);
    mock.rpc.crew_requirement_cell_set = { data: 2, error: null };
    expect(await setRequirementCells({ vesselId: VESSEL, cells })).toBe(2);
    expect(mock.rpcCalls[0]).toEqual({ fn: 'crew_requirement_cell_set', args: { p_vessel_id: VESSEL, p_cells: cells } });
    mock.rpc.crew_requirement_cell_set = { data: 1, error: null };
    await expect(setRequirementCells({ vesselId: VESSEL, cells })).rejects.toThrow('Not every change was saved. Review the matrix and try again.');
  });

  it('cells: nothing to send, or too many, is refused before any request', async () => {
    await expect(setRequirementCells({ vesselId: VESSEL, cells: [] })).rejects.toBeInstanceOf(ComplianceWriteError);
    const many = Array.from({ length: MAX_CELLS_PER_SAVE + 1 }, (_, i) => ({ row_id: 'r', position_id: `p${i}`, required: true }));
    await expect(setRequirementCells({ vesselId: VESSEL, cells: many })).rejects.toBeInstanceOf(ComplianceWriteError);
    expect(mock.rpcCalls).toEqual([]);
  });

  it('bulk: clear all must answer 0; require all a count', async () => {
    mock.rpc.crew_requirement_row_bulk = { data: 0, error: null };
    expect(await bulkRequirementRow({ vesselId: VESSEL, rowId: 'r1', action: 'clear_all' })).toBe(0);
    mock.rpc.crew_requirement_row_bulk = { data: 3, error: null };
    await expect(bulkRequirementRow({ vesselId: VESSEL, rowId: 'r1', action: 'clear_all' })).rejects.toThrow('The ticks were not cleared. Try again.');
    expect(await bulkRequirementRow({ vesselId: VESSEL, rowId: 'r1', action: 'require_all' })).toBe(3);
    mock.rpc.crew_requirement_row_bulk = { data: null, error: null };
    await expect(bulkRequirementRow({ vesselId: VESSEL, rowId: 'r1', action: 'require_all' })).rejects.toBeInstanceOf(ComplianceWriteError);
  });

  it('STCW basic set and the passenger toggle: one row, carrying the value asked for', async () => {
    mock.rpc.crew_requirements_add_stcw_basic = { data: [{ rows_added: 4, cells_added: 12 }], error: null };
    expect(await addStcwBasicSet(VESSEL)).toEqual({ rows_added: 4, cells_added: 12 });
    mock.rpc.crew_requirements_add_stcw_basic = { data: [], error: null };
    await expect(addStcwBasicSet(VESSEL)).rejects.toBeInstanceOf(ComplianceWriteError);
    mock.rpc.crew_vessel_set_passenger = { data: [{ is_passenger_ship: true, rows_added: 3, rows_removed: 0 }], error: null };
    expect((await setPassengerShip({ vesselId: VESSEL, on: true })).rows_added).toBe(3);
    await expect(setPassengerShip({ vesselId: VESSEL, on: false })).rejects.toThrow('The passenger ship setting was not saved. Try again.');
  });

  it('settings: every value asked for must come back', async () => {
    mock.rpc.crew_vessel_settings_save = { data: settingsRow({ crew_uploads_enabled: false }), error: null };
    expect((await saveVesselCrewSettings({ vesselId: VESSEL, patch: { crew_uploads_enabled: false } })).crew_uploads_enabled).toBe(false);
    await expect(saveVesselCrewSettings({ vesselId: VESSEL, patch: { crew_uploads_enabled: true } })).rejects.toThrow('The settings were not saved. Try again.');
    await expect(saveVesselCrewSettings({ vesselId: VESSEL, patch: {} })).rejects.toBeInstanceOf(ComplianceWriteError);
  });

  it('a company document type: trimmed, blanks sent as null; the answer must be the company type', async () => {
    const created = {
      id: 'type-new', company_id: COMPANY, category_key: 'other_courses', key: 'rescue_boat_refresher', name: 'Rescue boat refresher', code: null, abbreviation: null,
      stcw_reference: null, field_schema: {}, default_validity_months: 60, endorsement_interval_months: null, expiry_item_type: 'crew_qualification' as const,
      is_identity: false, is_medical_fitness: false, is_active: true, sort_order: 0, created_by: null, updated_by: null, created_at: '', updated_at: '',
    };
    mock.rpc.crew_document_type_create = { data: created, error: null };
    expect((await createCompanyDocumentType({ categoryKey: 'other_courses', name: '  Rescue boat refresher ', code: ' ', defaultValidityMonths: 60 })).id).toBe('type-new');
    expect(mock.rpcCalls[0].args).toEqual({
      p_category_key: 'other_courses', p_name: 'Rescue boat refresher', p_code: null, p_abbreviation: null, p_default_validity_months: 60, p_stcw_reference: null,
    });
    mock.rpc.crew_document_type_create = { data: { ...created, company_id: null }, error: null };
    await expect(createCompanyDocumentType({ categoryKey: 'other_courses', name: 'Rescue boat refresher' })).rejects.toBeInstanceOf(ComplianceWriteError);
  });

  it('a satisfaction rule: kind required unless removing; removing sends no kind', async () => {
    await expect(saveSatisfactionRule({ typeId: 'a', satisfiesTypeId: 'b' })).rejects.toBeInstanceOf(ComplianceWriteError);
    expect(mock.rpcCalls).toEqual([]);
    mock.rpc.crew_document_type_satisfies_save = { data: 'rule-1', error: null };
    expect(await saveSatisfactionRule({ typeId: 'a', satisfiesTypeId: 'b', kind: 'equivalent' })).toBe('rule-1');
    expect(mock.rpcCalls[0].args).toEqual({ p_type_id: 'a', p_satisfies_type_id: 'b', p_kind: 'equivalent', p_remove: false });
    expect(await saveSatisfactionRule({ typeId: 'a', satisfiesTypeId: 'b', kind: 'equivalent', remove: true })).toBe('rule-1');
    expect(mock.rpcCalls[1].args).toEqual({ p_type_id: 'a', p_satisfies_type_id: 'b', p_kind: null, p_remove: true });
    mock.rpc.crew_document_type_satisfies_save = { data: null, error: null };
    await expect(saveSatisfactionRule({ typeId: 'a', satisfiesTypeId: 'b', remove: true })).rejects.toThrow('The rule was not removed. Try again.');
  });

  it("D-01: a write to a missing RPC refuses with the notice (notApplied); a refusal is thrown as sent", async () => {
    mock.rpc.crew_requirement_row_delete = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_requirement_row_delete' } };
    const notApplied = await deleteRequirementRow({ vesselId: VESSEL, rowId: 'r' }).catch((e: unknown) => e);
    expect(notApplied).toBeInstanceOf(ComplianceWriteError);
    expect((notApplied as ComplianceWriteError).notApplied).toBe(true);
    expect(complianceRefusalMessage(notApplied)).toBe(COMPLIANCE_NOT_SET_UP_NOTICE);
    const refusal = { code: 'P0002', message: 'requirement_not_found', details: 'This requirement could not be found on the vessel.' };
    mock.rpc.crew_requirement_row_delete = { data: null, error: refusal };
    await expect(deleteRequirementRow({ vesselId: VESSEL, rowId: 'r' })).rejects.toBe(refusal);
  });
});

describe('refusals in words', () => {
  it("a DETAIL sentence as sent; a bare code through the table; 42501 as the server's sentence; never a raw code", () => {
    expect(complianceRefusalMessage({ code: '22023', message: 'label_invalid', details: 'Give the requirement a name of 1 to 120 characters.', hint: 'label' })).toBe(
      'Give the requirement a name of 1 to 120 characters.',
    );
    expect(complianceRefusalMessage({ code: '22023', message: 'kind_group_mismatch' })).toBe('Familiarisation requirements go in the Familiarisation group, and only there.');
    expect(complianceRefusalMessage({ code: 'P0002', message: 'vessel_not_found' })).toBe('This vessel could not be found.');
    expect(complianceRefusalMessage({ code: '42501', message: 'crew_not_permitted', details: 'Only a crew compliance administrator of this vessel can change its requirements.' })).toBe(
      'Only a crew compliance administrator of this vessel can change its requirements.',
    );
    expect(complianceRefusalMessage({ code: '42501', message: 'crew_not_permitted' })).not.toMatch(/^[a-z0-9_]+$/);
    expect(complianceRefusalMessage(new ComplianceWriteError('The rule was not saved. Try again.', 'x'))).toBe('The rule was not saved. Try again.');
    expect(complianceRefusalField({ code: '22023', message: 'options_required', hint: 'options' })).toBe('options');
    expect(complianceRefusalField({ code: '42501', message: 'x', hint: 'options' })).toBeNull();
  });

  it('every bare code the migration sends without a DETAIL has a sentence', () => {
    const bare = new Set<string>();
    for (const m of MIGRATION.matchAll(/ERRCODE = '(22023|P0002)', MESSAGE = '([a-z_]+)'(, DETAIL)?/g)) if (!m[3]) bare.add(m[2]);
    // Read-side or internal refusals the configuration page never sends.
    for (const k of ['vessel_required', 'vessels_required']) bare.delete(k);
    const unexplained = [...bare].filter((k) => /^[a-z0-9_]+$/.test(complianceRefusalMessage({ code: '22023', message: k })) || complianceRefusalMessage({ code: '22023', message: k }) === complianceRefusalMessage({ code: '22023', message: 'no_such_code' }));
    expect(unexplained).toEqual([]);
  });
});

describe('mutations refresh what they changed', () => {
  it('a vessel write refreshes the vessel; a company write every vessel of the company and the catalogue', async () => {
    const client = newClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRequirementsConfigActions(COMPANY, VESSEL), { wrapper: wrapper(client) });
    mock.rpc.crew_requirement_row_delete = { data: 'r1', error: null };
    await result.current.deleteRow.mutateAsync({ vesselId: VESSEL, rowId: 'r1' });
    expect(spy).toHaveBeenCalledWith({ queryKey: complianceKeys.vessel(COMPANY, VESSEL) });
    spy.mockClear();
    mock.rpc.crew_document_type_satisfies_save = { data: 'rule-1', error: null };
    await result.current.saveRule.mutateAsync({ typeId: 'a', satisfiesTypeId: 'b', kind: 'component' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['crew', 'company', COMPANY, 'documents', 'catalogue'] });
    expect(spy.mock.calls.some(([arg]) => typeof arg?.predicate === 'function')).toBe(true);
    spy.mockClear();
    mock.rpc.crew_requirement_row_delete = { data: null, error: null };
    await expect(result.current.deleteRow.mutateAsync({ vesselId: VESSEL, rowId: 'r1' })).rejects.toBeInstanceOf(ComplianceWriteError);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('the RPCs the hooks call exist', () => {
  it('in the migration (granted to authenticated) and in CrewPendingFunctions', () => {
    const called: Array<keyof CrewPendingFunctions> = [
      'crew_vessel_compliance', 'crew_vessel_requirement_status', 'crew_requirements_config', 'crew_requirement_row_save', 'crew_requirement_row_delete',
      'crew_requirement_cell_set', 'crew_requirement_row_bulk', 'crew_requirements_add_stcw_basic', 'crew_vessel_set_passenger', 'crew_vessel_settings_save',
      'crew_document_type_create', 'crew_document_type_satisfies_save', 'crew_compliance_for_vessels',
    ];
    for (const fn of called) {
      expect(MIGRATION, fn).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      expect(MIGRATION, fn).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated`));
    }
  });
});
