/**
 * The rotation planner's XLSX import and its crew staging (X1-13; gap/04
 * headline 9; DECISIONS D-181, D-X1-17):
 *
 * - the staging payload: the stable key (crew ID, name slug, a hash for a
 *   name no key can carry, the 200-character cap), the whitelisted fields,
 *   blanks as null;
 * - the server's answer read strictly, every outcome in words, the summary;
 * - the errors: the RPC missing (D-01, the notice), a refusal with the
 *   server's sentence, any other error as it came; the sync's errors;
 * - runCrewImport: batches of 500 with their offsets, the first batch
 *   failing throws, a later one stops and says where, the sync runs only
 *   when something was staged and its failure is reported, not thrown;
 * - the dialog: the source form's checks, the review counts, the import
 *   report section by section from the database's answers (a partial
 *   insert reads "Partly"), the refused crew listed with the sentence,
 *   staging missing reads the notice while the rest still imports, a
 *   failed import log start keeps the review with the message, no casts.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ImportPreview, ParsedCrewRow } from '@/modules/rotation-planner/lib/xlsxImporter';

const COMPANY = 'c-1';
const VESSEL = '0b8f6a52-5b3e-4bb1-9d5c-3a2c1e7f9a10';

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  inserts: [] as Array<{ table: string; rows: unknown }>,
  updates: [] as Array<{ table: string; patch: unknown; id: unknown }>,
  insertResult: {} as Record<string, (rows: unknown[]) => Result>,
  updateResult: null as Result | null,
  preview: null as ImportPreview | null,
  parseError: null as Error | null,
  profile: { id: 'p-master', company_id: 'c-1' } as { id: string; company_id: string | null } | null,
  notify: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => ({
    insert: (rows: unknown) => {
      h.inserts.push({ table, rows });
      const list = Array.isArray(rows) ? rows : [rows];
      const answer = (): Result => (h.insertResult[table] ? h.insertResult[table](list) : { data: list.map((_, i) => ({ id: `${table}-${i}`, lane_label: (list[i] as { lane_label?: string }).lane_label })), error: null });
      const selected = {
        single: () => {
          const r = answer();
          return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error });
        },
        then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(answer()).then(resolve, reject),
      };
      return { select: () => selected };
    },
    update: (patch: unknown) => ({
      eq: (_col: string, id: unknown) => {
        h.updates.push({ table, patch, id });
        return { select: () => Promise.resolve(h.updateResult ?? { data: [{ id }], error: null }) };
      },
    }),
  });
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-master' }, profile: h.profile }) }));
vi.mock('@/modules/rotation-planner/lib/xlsxImporter', () => ({
  parsePlannerWorkbook: vi.fn(async () => {
    if (h.parseError) throw h.parseError;
    return h.preview;
  }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, success: h.notify.success, warning: h.notify.warning, error: h.notify.error } };
});

import {
  CREW_IMPORT_STAGE_MAX_ROWS,
  CrewImportStageRefusalError,
  CrewImportStageShapeError,
  CrewImportStageUnavailableError,
  STAGING_UNAVAILABLE_NOTICE,
  crewIdOf,
  crewStagingKey,
  crewStagingRows,
  fnv1a,
  parseStageRows,
  parseSyncAnswer,
  runCrewImport,
  stageErrorOf,
  stageReasonText,
  summariseStage,
  syncErrorText,
  batchStatus,
  crewSections,
  importSourceSchema,
  insertSection,
  matchCrewUser,
} from '@/modules/rotation-planner/hooks/useCrewImportStage';
import ImportDialog from '@/modules/rotation-planner/components/ImportDialog';

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  h.rpc.mockReset();
  h.inserts = [];
  h.updates = [];
  h.insertResult = {};
  h.updateResult = null;
  h.parseError = null;
  h.profile = { id: 'p-master', company_id: COMPANY };
  h.notify.success.mockReset();
  h.notify.warning.mockReset();
  h.notify.error.mockReset();
});

const crewRow = (over: Partial<ParsedCrewRow> = {}): ParsedCrewRow => ({ fullName: 'Deck Hand', firstName: 'Deck', lastName: 'Hand', ...over });

const stagedRow = (i: number, reason = 'created', key: string | null = `k${i}`) => ({ row_index: i, staging_key: key, outcome: 'staged', reason, field: null });
const refusedRow = (i: number, reason: string, field: string | null = null, key: string | null = `k${i}`) => ({ row_index: i, staging_key: key, outcome: 'refused', reason, field });

// ---------------------------------------------------------------- the payload

describe('the staging payload', () => {
  it('keys a row by the crew ID when the sheet has one', () => {
    expect(crewStagingKey(VESSEL, crewRow({ externalId: '1042' }))).toBe(`frp-${VESSEL}-1042`);
    expect(crewStagingKey(VESSEL, crewRow({ externalId: ' A 12/b ' }))).toBe(`frp-${VESSEL}-A-12-b`);
  });

  it('else by the lower-case name with dashes, the key the planner import has always written', () => {
    expect(crewStagingKey(VESSEL, crewRow({ fullName: 'Deck  Hand' }))).toBe(`frp-${VESSEL}-deck-hand`);
    expect(crewStagingKey(VESSEL, crewRow({ externalId: '  ', fullName: 'Chief Officer' }))).toBe(`frp-${VESSEL}-chief-officer`);
  });

  it('a name with nothing a key can hold gets a stable hash of the name and birth date, never a shared key', () => {
    const a = crewStagingKey(VESSEL, { fullName: '李伟', dateOfBirth: '1990-01-01' });
    const b = crewStagingKey(VESSEL, { fullName: '王芳', dateOfBirth: '1990-01-01' });
    const c = crewStagingKey(VESSEL, { fullName: '李伟', dateOfBirth: '1991-01-01' });
    expect(a).toMatch(new RegExp(`^frp-${VESSEL}-h[0-9a-f]{8}$`));
    expect(new Set([a, b, c]).size).toBe(3);
    expect(crewStagingKey(VESSEL, { fullName: '李伟', dateOfBirth: '1990-01-01' })).toBe(a);
  });

  it('keys follow the server rule: at most 200 characters, a letter or digit first, only key characters', () => {
    const key = crewStagingKey(VESSEL, crewRow({ fullName: 'x'.repeat(400) }));
    expect(key).toHaveLength(200);
    for (const row of [crewRow({ externalId: '#!?' }), crewRow({ fullName: 'Ana-María O’Neil' }), crewRow({ externalId: 'rec.1:2_3' })]) {
      expect(crewStagingKey(VESSEL, row)).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
    }
  });

  it('fnv1a is the 32-bit FNV-1a hash in 8 hex digits', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });

  it('the crew ID is sent as a number only when it is a whole number of up to 12 digits', () => {
    expect(crewIdOf('42')).toBe(42);
    expect(crewIdOf(' 007 ')).toBe(7);
    expect(crewIdOf('12a')).toBeNull();
    expect(crewIdOf('1.5')).toBeNull();
    expect(crewIdOf('1234567890123')).toBeNull();
    expect(crewIdOf(undefined)).toBeNull();
  });

  it('sends only the fields the server reads, blanks as null, the import vessel by name', () => {
    const [row] = crewStagingRows(VESSEL, 'M/Y DRAAK', [crewRow({
      externalId: '7', middleName: ' ', email: ' deck.hand@example.test ', phone: '', dateOfBirth: '1990-05-01',
      nationality: 'Maltese', jobTitle: 'Deckhand', repatriationPort: 'Valletta', passportNumber: 'X1', homeAddress: 'Somewhere', gender: 'x',
    })]);
    expect(row).toEqual({
      airtable_id: `frp-${VESSEL}-7`, crew_id: 7, vessel: 'M/Y DRAAK', first_name: 'Deck', middle_name: null, last_name: 'Hand',
      full_legal_name: 'Deck Hand', personal_email: 'deck.hand@example.test', cellular_phone: null, date_of_birth: '1990-05-01',
      nationality: 'Maltese', role: 'Deckhand', repatriation: 'Valletta',
    });
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['company_id', 'status', 'is_archived']));
  });
});

// ---------------------------------------------------------------- the answer

describe('the server answer', () => {
  it('reads one outcome per row, shifted by the batch offset', () => {
    expect(parseStageRows([stagedRow(0), refusedRow(1, 'name_missing')], 500)).toEqual([
      { rowIndex: 500, stagingKey: 'k0', outcome: 'staged', reason: 'created', field: null },
      { rowIndex: 501, stagingKey: 'k1', outcome: 'refused', reason: 'name_missing', field: null },
    ]);
  });

  it.each([
    ['not a list', { rows: [] }],
    ['a row that is not an object', ['x']],
    ['no row number', [{ ...stagedRow(0), row_index: '0' }]],
    ['a negative row number', [{ ...stagedRow(0), row_index: -1 }]],
    ['an unknown outcome', [{ ...stagedRow(0), outcome: 'maybe' }]],
    ['a reason that is not text', [{ ...stagedRow(0), reason: 3 }]],
  ])('refuses %s', (_name, data) => {
    expect(() => parseStageRows(data)).toThrow(CrewImportStageShapeError);
  });

  it('words every outcome', () => {
    const cases: Array<[string, string | null, string, RegExp]> = [
      ['staged', null, 'created', /^Added to the staging list\.$/],
      ['staged', null, 'updated', /^Updated in the staging list\.$/],
      ['refused', null, 'not_an_object', /could not be read/],
      ['refused', 'airtable_id', 'key_missing', /no staging key/],
      ['refused', 'airtable_id', 'key_invalid', /characters it cannot hold/],
      ['refused', 'airtable_id', 'duplicate_in_batch', /earlier in this file/],
      ['refused', 'first_name', 'invalid_value', /^The first name could not be read\.$/],
      ['refused', 'first_name', 'field_too_long', /first name is longer than allowed \(200/],
      ['refused', 'personal_email', 'field_too_long', /email is longer than allowed \(320/],
      ['refused', 'personal_email', 'invalid_email', /^The email is not an email address\.$/],
      ['refused', 'crew_id', 'invalid_crew_id', /whole number/],
      ['refused', 'date_of_birth', 'invalid_date_of_birth', /valid past date/],
      ['refused', null, 'name_missing', /no first, last or full name/],
      ['refused', 'airtable_id', 'key_in_use', /your company cannot change/],
      ['refused', null, 'archived', /archived/],
      ['refused', null, 'something_new', /^Not staged \(something_new\)\.$/],
    ];
    for (const [outcome, field, reason, text] of cases) {
      expect(stageReasonText({ outcome: outcome as 'staged' | 'refused', field, reason })).toMatch(text);
    }
  });

  it('summarises the outcomes', () => {
    expect(summariseStage(parseStageRows([stagedRow(0), stagedRow(1, 'updated'), refusedRow(2, 'archived'), stagedRow(3)]))).toEqual({
      total: 4, staged: 3, created: 2, updated: 1, refused: 1,
    });
  });

  it('reads the sync answer strictly', () => {
    expect(parseSyncAnswer({ inserted: 2, updated: 1, skipped: 0 })).toEqual({ inserted: 2, updated: 1, skipped: 0 });
    expect(parseSyncAnswer({ inserted: 2, updated: 0 })).toEqual({ inserted: 2, updated: 0, skipped: 0 });
    expect(() => parseSyncAnswer({ inserted: '2', updated: 0 })).toThrow(CrewImportStageShapeError);
    expect(() => parseSyncAnswer(null)).toThrow(CrewImportStageShapeError);
  });
});

// ---------------------------------------------------------------- errors

describe('errors', () => {
  it('D-01: the RPC missing reads the notice', () => {
    expect(stageErrorOf({ code: 'PGRST202', message: 'Could not find the function public.crew_import_stage' })).toBeInstanceOf(CrewImportStageUnavailableError);
    expect(stageErrorOf({ code: '42883', message: 'function public.crew_import_stage(uuid, jsonb) does not exist' })).toBeInstanceOf(CrewImportStageUnavailableError);
    expect(new CrewImportStageUnavailableError().message).toBe('Staging becomes available once the crew update is applied.');
    expect(STAGING_UNAVAILABLE_NOTICE).toBe('Staging becomes available once the crew update is applied.');
  });

  it('a missing function other than the staging one is a real error', () => {
    const other = { code: '42883', message: 'function public.frp_can_edit(uuid) does not exist' };
    expect(stageErrorOf(other)).toBe(other);
  });

  it('a refusal carries the server sentence, else a sentence for its word', () => {
    const withDetail = stageErrorOf({ code: '42501', message: 'company_mismatch', details: 'You can only stage crew for your own company.' });
    expect(withDetail).toBeInstanceOf(CrewImportStageRefusalError);
    expect((withDetail as CrewImportStageRefusalError).message).toBe('You can only stage crew for your own company.');
    expect((withDetail as CrewImportStageRefusalError).refusal).toBe('company_mismatch');
    expect((stageErrorOf({ code: '22023', message: 'too_many_rows' }) as Error).message).toBe('Stage at most 500 crew at a time.');
    expect((stageErrorOf({ code: '42501', message: 'something' }) as Error).message).toBe('Staging crew needs edit access to the rotation planner.');
  });

  it('any other error is passed on as it came', () => {
    const network = new Error('Failed to fetch');
    expect(stageErrorOf(network)).toBe(network);
  });

  it('words the sync errors', () => {
    expect(syncErrorText({ code: '42501', message: 'Insufficient permissions to sync crew' })).toMatch(/Master, purser or fleet manager/);
    expect(syncErrorText({ code: '42501', message: 'profile_access_columns_locked', details: 'A pending vessel placement is written by create-crew-member only.' }))
      .toBe('A pending vessel placement is written by create-crew-member only.');
    expect(syncErrorText({ code: '42501', message: 'x' })).toMatch(/not allowed/);
    expect(syncErrorText(new Error('Failed to fetch'))).toMatch(/reach the server/);
  });
});

// ---------------------------------------------------------------- runCrewImport

const payload = (n: number) => Array.from({ length: n }, (_, i) => ({ airtable_id: `k${i}`, first_name: 'X' }));

describe('runCrewImport', () => {
  it('needs a company and sends nothing without one', async () => {
    await expect(runCrewImport(null, payload(1))).rejects.toBeInstanceOf(CrewImportStageRefusalError);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('stages in batches of 500 with their offsets, then syncs once', async () => {
    h.rpc.mockImplementation(async (fn: string, args: { p_rows?: unknown[] }) => {
      if (fn === 'crew_import_stage') return { data: (args.p_rows ?? []).map((_, i) => stagedRow(i)), error: null };
      return { data: { inserted: 1001, updated: 0, skipped: 0 }, error: null };
    });
    const r = await runCrewImport(COMPANY, payload(1001));
    const calls = h.rpc.mock.calls.filter((c) => c[0] === 'crew_import_stage');
    expect(calls.map((c) => (c[1] as { p_rows: unknown[] }).p_rows.length)).toEqual([500, 500, 1]);
    expect(calls.every((c) => (c[1] as { p_company_id: string }).p_company_id === COMPANY)).toBe(true);
    expect(CREW_IMPORT_STAGE_MAX_ROWS).toBe(500);
    expect(r.stage.outcomes.map((o) => o.rowIndex)).toEqual(Array.from({ length: 1001 }, (_, i) => i));
    expect(r.stage.stoppedAt).toBeNull();
    expect(r.sync).toEqual({ status: 'done', inserted: 1001, updated: 0, skipped: 0 });
    expect(h.rpc).toHaveBeenLastCalledWith('sync_crew_import_to_profiles', { p_company_id: COMPANY });
  });

  it('D-01: the first batch missing throws the notice and syncs nothing', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_import_stage' } });
    await expect(runCrewImport(COMPANY, payload(2))).rejects.toThrow(STAGING_UNAVAILABLE_NOTICE);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it('a later batch failing stops there, keeps what was staged and says where', async () => {
    let n = 0;
    h.rpc.mockImplementation(async (fn: string, args: { p_rows?: unknown[] }) => {
      if (fn === 'sync_crew_import_to_profiles') return { data: { inserted: 500, updated: 0, skipped: 0 }, error: null };
      n += 1;
      if (n === 2) return { data: null, error: { code: '22023', message: 'too_many_rows', details: 'Stage at most 500 crew at a time.' } };
      return { data: (args.p_rows ?? []).map((_, i) => stagedRow(i)), error: null };
    });
    const r = await runCrewImport(COMPANY, payload(700));
    expect(r.stage.outcomes).toHaveLength(500);
    expect(r.stage.stoppedAt).toEqual({ rowIndex: 500, message: 'Stage at most 500 crew at a time.' });
    expect(r.sync.status).toBe('done');
  });

  it('nothing staged: the sync does not run', async () => {
    h.rpc.mockResolvedValue({ data: [refusedRow(0, 'name_missing')], error: null });
    const r = await runCrewImport(COMPANY, payload(1));
    expect(r.sync).toEqual({ status: 'not_run' });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it('a sync refusal is reported with its sentence, the staging result kept', async () => {
    h.rpc.mockImplementation(async (fn: string) => (fn === 'crew_import_stage'
      ? { data: [stagedRow(0)], error: null }
      : { data: null, error: { code: '42501', message: 'Insufficient permissions to sync crew' } }));
    const r = await runCrewImport(COMPANY, payload(1));
    expect(r.stage.outcomes).toHaveLength(1);
    expect(r.sync).toEqual({ status: 'failed', message: 'Adding staged crew to the crew list needs a Master, purser or fleet manager role.' });
  });

  it('an answer with fewer outcomes than rows is unreadable, never partly trusted', async () => {
    h.rpc.mockResolvedValue({ data: [stagedRow(0)], error: null });
    await expect(runCrewImport(COMPANY, payload(2))).rejects.toBeInstanceOf(CrewImportStageShapeError);
  });
});

// ---------------------------------------------------------------- report helpers

describe('the report helpers', () => {
  it('insertSection reads the rows the database returned', () => {
    expect(insertSection('rotations', 'Rotation blocks', 0, null)).toMatchObject({ status: 'skipped' });
    expect(insertSection('rotations', 'Rotation blocks', 2, { data: [{}, {}], error: null })).toMatchObject({ status: 'done', detail: '2 saved.' });
    expect(insertSection('rotations', 'Rotation blocks', 3, { data: [{}], error: null })).toMatchObject({ status: 'partial', detail: '1 of 3 saved.' });
    expect(insertSection('rotations', 'Rotation blocks', 3, { data: [], error: null })).toMatchObject({ status: 'failed', detail: '0 of 3 saved.' });
    expect(insertSection('rotations', 'Rotation blocks', 3, { data: null, error: { message: 'permission denied for table frp_rotation_assignments' } }))
      .toMatchObject({ status: 'failed' });
  });

  it('crewSections: missing staging reads the notice; staged and refused counts; the crew list result', () => {
    expect(crewSections(null, null, 0)).toEqual([expect.objectContaining({ key: 'crew', status: 'skipped' })]);
    expect(crewSections(null, new CrewImportStageUnavailableError(), 3)).toEqual([
      { key: 'crew', label: 'Crew staging', status: 'unavailable', detail: STAGING_UNAVAILABLE_NOTICE },
    ]);
    const result = {
      stage: { outcomes: parseStageRows([stagedRow(0), stagedRow(1, 'updated'), refusedRow(2, 'key_in_use', 'airtable_id')]), stoppedAt: null },
      sync: { status: 'done' as const, inserted: 1, updated: 1, skipped: 0 },
    };
    expect(crewSections(result, null, 3)).toEqual([
      { key: 'crew', label: 'Crew staging', status: 'partial', detail: '2 of 3 staged · 1 new, 1 updated · 1 refused.' },
      { key: 'crew_list', label: 'Crew list', status: 'done', detail: '1 person added, 1 updated.' },
    ]);
    expect(crewSections({ ...result, sync: { status: 'failed', message: 'No.' } }, null, 3)[1]).toMatchObject({ status: 'failed', detail: 'No.' });
  });

  it('batchStatus: complete, partial or failed from the sections that had work', () => {
    const s = (status: 'done' | 'partial' | 'failed' | 'skipped' | 'unavailable') => ({ key: 'rotations' as const, label: 'x', status, detail: '' });
    expect(batchStatus([s('done'), s('skipped')])).toBe('complete');
    expect(batchStatus([s('done'), s('unavailable')])).toBe('partial');
    expect(batchStatus([s('failed'), s('unavailable'), s('skipped')])).toBe('failed');
    expect(batchStatus([s('done'), s('partial')])).toBe('partial');
  });

  it('matchCrewUser: the full name, else a last name only one person has', () => {
    const crew = [
      { user_id: 'u1', first_name: 'Ana', last_name: 'Hand', rank: null, department: null },
      { user_id: 'u2', first_name: 'Ben', last_name: 'Hand', rank: null, department: null },
      { user_id: 'u3', first_name: 'Cy', last_name: 'Mate', rank: null, department: null },
    ];
    expect(matchCrewUser(crew, ' ana hand ')).toBe('u1');
    expect(matchCrewUser(crew, 'Hand')).toBeNull();
    expect(matchCrewUser(crew, 'mate')).toBe('u3');
    expect(matchCrewUser(crew, '')).toBeNull();
  });

  it('the source schema needs a vessel and an .xlsx / .xls file of at most 20 MB', () => {
    const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);
    expect(importSourceSchema.safeParse({ vesselId: VESSEL, file: file('planner.xlsx') }).success).toBe(true);
    expect(importSourceSchema.safeParse({ vesselId: '', file: file('planner.xlsx') }).success).toBe(false);
    expect(importSourceSchema.safeParse({ vesselId: VESSEL, file: undefined }).success).toBe(false);
    expect(importSourceSchema.safeParse({ vesselId: VESSEL, file: file('planner.csv') }).success).toBe(false);
    const big = file('planner.xlsx');
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    expect(importSourceSchema.safeParse({ vesselId: VESSEL, file: big }).success).toBe(false);
  });
});

// ---------------------------------------------------------------- the dialog

const PREVIEW: ImportPreview = {
  rotations: [
    { vesselGuess: 'DRAAK', laneLabel: 'Deck 1', department: 'Deck', positionTitle: 'Deckhand', crewName: 'Deck Hand', start: '2026-12-01', end: '2026-12-31', rotationType: 'onboard' },
    { vesselGuess: 'DRAAK', laneLabel: 'Deck 1', department: 'Deck', positionTitle: 'Deckhand', crewName: 'Relief Hand', start: '2027-01-01', end: '2027-01-31', rotationType: 'onboard' },
  ],
  locations: [{ vesselGuess: 'DRAAK', location: 'Antibes', status: 'confirmed', start: '2026-12-01', end: '2026-12-10' }],
  travel: [],
  crew: [crewRow({ externalId: '1' }), crewRow({ externalId: '2', fullName: 'No Name Row', firstName: undefined, lastName: undefined }), crewRow({ externalId: '3', fullName: 'Relief Hand', firstName: 'Relief' })],
  warnings: ['Parsed 2 rotation blocks from Timeline'],
};

function renderDialog() {
  const onClose = vi.fn();
  const onComplete = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ImportDialog open onClose={onClose} onComplete={onComplete} vessels={[{ id: VESSEL, name: 'M/Y DRAAK' }]} crew={[]} lanes={[]} />
    </QueryClientProvider>,
  );
  return { onClose, onComplete };
}

async function readFile() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Vessel' }));
  fireEvent.click(await screen.findByRole('option', { name: 'M/Y DRAAK' }));
  fireEvent.change(screen.getByLabelText('Planner workbook'), { target: { files: [new File(['x'], 'planner.xlsx')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
  await screen.findByText('planner.xlsx');
}

const stageAnswer = () => {
  h.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'crew_import_stage') return { data: [stagedRow(0), refusedRow(1, 'name_missing'), stagedRow(2, 'updated')], error: null };
    return { data: { inserted: 1, updated: 1, skipped: 0 }, error: null };
  });
};

describe('the dialog', () => {
  beforeEach(() => {
    h.preview = PREVIEW;
  });

  it('checks the source form before reading anything', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
    expect(await screen.findByText('Choose the vessel this planner belongs to.')).toBeInTheDocument();
    expect(screen.getByText('Choose an XLSX file.')).toBeInTheDocument();
  });

  it('a file that cannot be read says so on the file field', async () => {
    h.parseError = new Error('Corrupt workbook');
    renderDialog();
    fireEvent.click(screen.getByRole('combobox', { name: 'Vessel' }));
    fireEvent.click(await screen.findByRole('option', { name: 'M/Y DRAAK' }));
    fireEvent.change(screen.getByLabelText('Planner workbook'), { target: { files: [new File(['x'], 'planner.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
    expect(await screen.findByText('The file could not be read: Corrupt workbook')).toBeInTheDocument();
  });

  it('reviews the counts and the notes before importing', async () => {
    renderDialog();
    await readFile();
    const counts = document.querySelector('[data-import-counts]') as HTMLElement;
    expect(within(counts).getByText('Rotation blocks').nextSibling).toHaveTextContent('2');
    expect(within(counts).getByText('Crew records').nextSibling).toHaveTextContent('3');
    expect(screen.getByText(/3 crew records are staged for your company only/)).toBeInTheDocument();
    expect(screen.getByText('Parsed 2 rotation blocks from Timeline')).toBeInTheDocument();
    expect(h.inserts).toEqual([]);
  });

  it('imports and reports each section from the database answers, with the refused crew named', async () => {
    stageAnswer();
    const { onComplete } = renderDialog();
    await readFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await screen.findByRole('list', { name: 'Import result' });

    const section = (key: string) => document.querySelector(`[data-import-section="${key}"]`) as HTMLElement;
    expect(section('lanes')).toHaveAttribute('data-status', 'done');
    expect(section('rotations')).toHaveAttribute('data-status', 'done');
    expect(section('rotations')).toHaveTextContent('2 saved.');
    expect(section('locations')).toHaveTextContent('1 saved.');
    expect(section('travel')).toHaveAttribute('data-status', 'skipped');
    expect(section('crew')).toHaveAttribute('data-status', 'partial');
    expect(section('crew')).toHaveTextContent('2 of 3 staged · 1 new, 1 updated · 1 refused.');
    expect(section('crew_list')).toHaveTextContent('1 person added, 1 updated.');
    const refused = document.querySelector('[data-import-refused]') as HTMLElement;
    expect(within(refused).getByText('No Name Row')).toBeInTheDocument();
    expect(within(refused).getByText('The row has no first, last or full name.')).toBeInTheDocument();

    const stageCall = h.rpc.mock.calls.find((c) => c[0] === 'crew_import_stage');
    expect(stageCall?.[1]).toMatchObject({ p_company_id: COMPANY });
    expect((stageCall?.[1] as { p_rows: Array<{ airtable_id: string; vessel: string }> }).p_rows.map((r) => r.airtable_id))
      .toEqual([`frp-${VESSEL}-1`, `frp-${VESSEL}-2`, `frp-${VESSEL}-3`]);
    expect(h.inserts.map((i) => i.table)).toEqual(['frp_import_batches', 'frp_planner_lanes', 'frp_rotation_assignments', 'frp_vessel_locations']);
    expect(h.inserts.some((i) => i.table === 'crew_import')).toBe(false);
    expect(h.updates).toEqual([expect.objectContaining({ table: 'frp_import_batches', id: 'frp_import_batches-0', patch: expect.objectContaining({ status: 'partial' }) })]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(h.notify.warning).toHaveBeenCalledWith('Import partly complete', expect.anything());
  });

  it('D-01: staging missing reads the notice; the rest of the import still runs', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_import_stage' } });
    renderDialog();
    await readFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await screen.findByRole('list', { name: 'Import result' });
    const crew = document.querySelector('[data-import-section="crew"]') as HTMLElement;
    expect(crew).toHaveAttribute('data-status', 'unavailable');
    expect(crew).toHaveTextContent('Staging becomes available once the crew update is applied.');
    expect(within(crew).getByText('Not available')).toBeInTheDocument();
    expect(document.querySelector('[data-import-section="rotations"]')).toHaveAttribute('data-status', 'done');
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it('a partial insert reads "Partly", never as saved', async () => {
    stageAnswer();
    h.insertResult.frp_rotation_assignments = (rows) => ({ data: rows.slice(0, 1).map((_, i) => ({ id: `r${i}` })), error: null });
    renderDialog();
    await readFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await screen.findByRole('list', { name: 'Import result' });
    const rot = document.querySelector('[data-import-section="rotations"]') as HTMLElement;
    expect(rot).toHaveAttribute('data-status', 'partial');
    expect(rot).toHaveTextContent('1 of 2 saved.');
    expect(within(rot).getByText('Partly')).toBeInTheDocument();
  });

  it('a failed insert shows the database message', async () => {
    stageAnswer();
    h.insertResult.frp_vessel_locations = () => ({ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "frp_vessel_locations"' } });
    renderDialog();
    await readFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await screen.findByRole('list', { name: 'Import result' });
    expect(document.querySelector('[data-import-section="locations"]')).toHaveAttribute('data-status', 'failed');
  });

  it('the import log failing to start keeps the review with the reason and writes nothing else', async () => {
    h.insertResult.frp_import_batches = () => ({ data: null, error: { code: '42501', message: 'permission denied for table frp_import_batches' } });
    renderDialog();
    await readFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/The import could not start/);
    expect(h.inserts.map((i) => i.table)).toEqual(['frp_import_batches']);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
  });

  it('without a company nothing is imported', async () => {
    h.profile = { id: 'p-master', company_id: null };
    renderDialog();
    await readFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your profile is not linked to a company, so nothing can be imported.');
    expect(h.inserts).toEqual([]);
  });

  it('a complete import says so', async () => {
    h.preview = { ...PREVIEW, crew: [crewRow({ externalId: '1' })] };
    h.rpc.mockImplementation(async (fn: string) => (fn === 'crew_import_stage'
      ? { data: [stagedRow(0)], error: null }
      : { data: { inserted: 1, updated: 0, skipped: 0 }, error: null }));
    renderDialog();
    await readFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await screen.findByRole('list', { name: 'Import result' });
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Import complete'));
    expect(h.updates[0]?.patch).toMatchObject({ status: 'complete' });
    expect(document.querySelector('[data-import-refused]')).toBeNull();
  });
});

describe('the cast ratchet', () => {
  it('the dialog and the staging hook cast no client call', () => {
    for (const file of ['src/modules/rotation-planner/components/ImportDialog.tsx', 'src/modules/rotation-planner/hooks/useCrewImportStage.ts']) {
      const text = readFileSync(join(process.cwd(), file), 'utf8');
      expect(text).not.toMatch(/as any\b/);
      expect(text).not.toMatch(/\bas never\b/);
    }
  });
});
