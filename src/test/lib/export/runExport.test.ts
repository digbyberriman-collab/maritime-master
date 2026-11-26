/**
 * The export engine (gap/08 EX1, EX4; platform-prep plan §1 contract 9;
 * D-X5-12, D-01): every branch of the log rule, the log call itself, the
 * build and download step, the answers, and the legacy-unlogged list.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Reply = { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  reply: { data: null, error: null } as { data: unknown; error: unknown },
  throws: null as unknown,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.rpcs.push({ name, args });
      if (h.throws) return Promise.reject(h.throws);
      return Promise.resolve(h.reply as Reply);
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: h.toastError, info: vi.fn(), warning: vi.fn(), dismiss: vi.fn(), promise: vi.fn() } }));

import {
  EXPORT_COPY,
  EXPORT_LOG_KIND,
  LEGACY_UNLOGGED_EXPORTS,
  isLegacyUnloggedExport,
  notifyExportResult,
  runExport,
  type ExportColumn,
  type ExportFormat,
  type RunExportOptions,
} from '@/lib/export';

const ROOT = join(__dirname, '..', '..', '..', '..');

interface Person {
  name: string;
  joined: string;
}
const COLUMNS: readonly ExportColumn<Person>[] = [
  { key: 'name', header: 'Name', value: (p) => p.name },
  { key: 'joined', header: 'Joined', value: (p) => p.joined, kind: 'date' },
];
const ROWS: Person[] = [
  { name: 'Deckhand', joined: '2026-03-01' },
  { name: 'Bosun', joined: '2025-12-31' },
];
const NOW = new Date(2026, 10, 26, 9, 30);
const JOB = { id: '00000000-0000-4000-8000-000000000001' };
const MISSING = { code: 'PGRST202', message: 'Could not find the function public.log_client_export' };

let downloads: { blob: Blob; fileName: string }[] = [];
const options = (patch: Partial<RunExportOptions<Person>> = {}): RunExportOptions<Person> => ({
  format: 'csv',
  kind: 'Crew list',
  sourceKey: 'crew.crew_list',
  personalData: true,
  vesselId: '00000000-0000-4000-8000-0000000000d1',
  vesselCode: 'dra',
  columns: COLUMNS,
  rows: ROWS,
  now: NOW,
  download: (blob, fileName) => downloads.push({ blob, fileName }),
  ...patch,
});

beforeEach(() => {
  h.rpcs = [];
  h.reply = { data: JOB, error: null };
  h.throws = null;
  downloads = [];
});
afterEach(() => {
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe('runExport: the log comes first (EX4)', () => {
  it('logs with the format kind, source key, filters, row count, personal-data flag and vessel, then downloads', async () => {
    const result = await runExport(options({ params: { status: 'active' } }));
    expect(h.rpcs).toEqual([
      {
        name: 'log_client_export',
        args: {
          p_kind: 'csv',
          p_source_key: 'crew.crew_list',
          p_params: { status: 'active' },
          p_contains_personal_data: true,
          p_row_count: 2,
          p_vessel_id: '00000000-0000-4000-8000-0000000000d1',
        },
      },
    ]);
    expect(result).toEqual({ status: 'ok', value: { fileName: 'DRA_CrewList_2026-11-26.csv', rowCount: 2, logged: true, jobId: JOB.id } });
    expect(downloads.map((d) => d.fileName)).toEqual(['DRA_CrewList_2026-11-26.csv']);
  });

  it('logs each format as a kind 20261123020400 accepts (pdf is a register PDF)', async () => {
    expect(EXPORT_LOG_KIND).toEqual({ csv: 'csv', xlsx: 'xlsx', pdf: 'register_pdf' });
    const sql = readFileSync(join(ROOT, 'supabase/migrations/20261123020400_platform_export_jobs.sql'), 'utf8');
    const check = /export_jobs_kind_check CHECK \(kind IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    for (const kind of Object.values(EXPORT_LOG_KIND)) expect(check).toContain(`'${kind}'`);
  });

  it('a fleet export sends no vessel and is named FLEET_…', async () => {
    const result = await runExport(options({ vesselId: null, vesselCode: null, personalData: false, sourceKey: 'reports.vessel_comparison', kind: 'Vessel comparison' }));
    expect(h.rpcs[0].args.p_vessel_id).toBeUndefined();
    expect(h.rpcs[0].args.p_params).toEqual({});
    expect(result.status === 'ok' && result.value.fileName).toBe('FLEET_VesselComparison_2026-11-26.csv');
  });

  it('nothing is built or downloaded before the log answers, and nothing after a refusal', async () => {
    h.reply = { data: null, error: { code: '22023', message: 'impersonating' } };
    const result = await runExport(options());
    expect(result).toEqual({ status: 'refused', code: 'impersonating', message: EXPORT_COPY.impersonating });
    expect(downloads).toEqual([]);
  });
});

describe('runExport: contract 9 while the log is missing (D-01, D-X5-12)', () => {
  it('missing log + personal data: refused with the agreed sentence, nothing downloaded', async () => {
    h.reply = { data: null, error: MISSING };
    const result = await runExport(options());
    expect(result).toEqual({
      status: 'refused',
      code: 'export_log_missing',
      message: 'Exports that contain personal data are unavailable until the export log is set up',
    });
    expect(downloads).toEqual([]);
  });

  it('missing log + no personal data: proceeds, unlogged', async () => {
    h.reply = { data: null, error: MISSING };
    const result = await runExport(options({ personalData: false }));
    expect(result).toEqual({ status: 'ok', value: { fileName: 'DRA_CrewList_2026-11-26.csv', rowCount: 2, logged: false, jobId: null } });
    expect(downloads).toHaveLength(1);
  });

  it('missing log + legacyUnlogged on an export that works today: proceeds unlogged (its D-01 fallback)', async () => {
    h.reply = { data: null, error: { code: '42883', message: 'function public.log_client_export(text) does not exist' } };
    const result = await runExport(options({ legacyUnlogged: true }));
    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.value.logged).toBe(false);
    expect(downloads).toHaveLength(1);
  });

  it('legacyUnlogged on a live log is logged like any other export', async () => {
    const result = await runExport(options({ legacyUnlogged: true }));
    expect(result.status === 'ok' && result.value).toMatchObject({ logged: true, jobId: JOB.id });
    expect(h.rpcs).toHaveLength(1);
  });

  it('legacyUnlogged on an export that is not listed: refused before anything is logged', async () => {
    const result = await runExport(options({ legacyUnlogged: true, sourceKey: 'crew.new_report' }));
    expect(result).toEqual({ status: 'refused', code: 'legacy_unlogged_unlisted', message: EXPORT_COPY.legacyUnlisted });
    expect(h.rpcs).toEqual([]);
    expect(downloads).toEqual([]);
  });
});

describe('runExport: any other log failure refuses (no fake success)', () => {
  it('no access (42501, thrown by the service) is refused with the access sentence', async () => {
    h.reply = { data: null, error: { code: '42501', message: 'export_access_denied' } };
    const result = await runExport(options());
    expect(result).toEqual({ status: 'refused', code: 'export_access_denied', message: EXPORT_COPY.accessDenied });
    expect(downloads).toEqual([]);
  });

  it('acting as another user (22023 impersonating) is refused', async () => {
    h.reply = { data: null, error: { code: '22023', message: 'impersonating' } };
    expect(await runExport(options({ personalData: false }))).toMatchObject({ status: 'refused', code: 'impersonating' });
  });

  it('another business refusal (22023 source_key_invalid, params_too_large) is refused as invalid', async () => {
    h.reply = { data: null, error: { code: '22023', message: 'params_too_large' } };
    expect(await runExport(options())).toEqual({ status: 'refused', code: 'export_invalid', message: EXPORT_COPY.invalid });
  });

  it('a network failure or a 5xx is refused, even for an export without personal data or a legacy one', async () => {
    h.throws = new TypeError('Failed to fetch');
    expect(await runExport(options({ personalData: false }))).toEqual({ status: 'refused', code: 'export_log_failed', message: EXPORT_COPY.logFailed });
    h.throws = null;
    h.reply = { data: null, error: { code: '500', message: 'internal error' } };
    expect(await runExport(options({ legacyUnlogged: true }))).toMatchObject({ status: 'refused', code: 'export_log_failed' });
    expect(downloads).toEqual([]);
  });
});

describe('runExport: input and build', () => {
  it('refuses a source key the log would refuse, an unknown format, an empty kind and no columns, before logging', async () => {
    expect(await runExport(options({ sourceKey: 'Crew List' }))).toMatchObject({ status: 'refused', code: 'export_invalid' });
    expect(await runExport(options({ format: 'zip' as ExportFormat }))).toMatchObject({ status: 'refused', code: 'export_invalid' });
    expect(await runExport(options({ kind: '  ' }))).toMatchObject({ status: 'refused', code: 'export_invalid' });
    expect(await runExport(options({ columns: [] }))).toEqual({ status: 'refused', code: 'no_columns', message: EXPORT_COPY.noColumns });
    expect(h.rpcs).toEqual([]);
  });

  it('a build failure is refused and nothing is downloaded', async () => {
    const result = await runExport(
      options({ columns: [{ key: 'bad', header: 'Bad', kind: 'date', value: () => 'not a date' }] }),
    );
    expect(result).toEqual({ status: 'refused', code: 'export_build_failed', message: EXPORT_COPY.buildFailed });
    expect(downloads).toEqual([]);
  });

  it('an unreadable range date is refused, not thrown', async () => {
    const result = await runExport(options({ range: { on: 'someday' } }));
    expect(result).toEqual({ status: 'refused', code: 'export_build_failed', message: EXPORT_COPY.buildFailed });
    expect(downloads).toEqual([]);
  });

  it('a download that throws is refused, not reported as a success', async () => {
    const result = await runExport(
      options({
        download: () => {
          throw new Error('blocked');
        },
      }),
    );
    expect(result).toMatchObject({ status: 'refused', code: 'export_build_failed' });
  });

  it.each(['csv', 'xlsx', 'pdf'] as const)('builds a %s file of the right type under the EX1 name', async (format) => {
    const result = await runExport(options({ format, range: { from: '2026-11-01', to: '2026-11-30' } }));
    expect(result.status).toBe('ok');
    expect(downloads[0].fileName).toBe(`DRA_CrewList_2026-11-01-to-2026-11-30_2026-11-26.${format}`);
    expect(downloads[0].blob.size).toBeGreaterThan(0);
    expect(downloads[0].blob.type).toBe(
      { csv: 'text/csv;charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' }[format],
    );
  });
});

describe('notifyExportResult', () => {
  it('a success names the file; a refusal shows its sentence; never both', () => {
    notifyExportResult({ status: 'ok', value: { fileName: 'DRA_CrewList_2026-11-26.csv', rowCount: 2, logged: true, jobId: JOB.id } });
    expect(h.toastSuccess).toHaveBeenCalledWith('Export downloaded', { description: 'DRA_CrewList_2026-11-26.csv' });
    notifyExportResult({ status: 'refused', code: 'export_log_missing', message: EXPORT_COPY.logMissingPersonal });
    expect(h.toastError).toHaveBeenCalledWith('Export not made', { description: EXPORT_COPY.logMissingPersonal });
    expect(h.toastSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('LEGACY_UNLOGGED_EXPORTS (contract 9): exports that work today', () => {
  it('is exactly this list (it only shrinks, once the export log is live)', () => {
    expect(LEGACY_UNLOGGED_EXPORTS.map((e) => e.sourceKey)).toEqual([
      'crew.crew_list',
      'crew.crew_roster',
      'crew.audit_log',
      'crew.leave_planner',
      'crew.leave_requests',
      'crew.leave_balances',
      'work_rest.hor_month',
      'work_rest.hor_department',
      'training.training_matrix',
      'development.courses_register',
      'rotation_planner.rotation_plan',
      'hris.employment_history',
    ]);
  });

  it('every entry is a valid source key, unique, and names a file that exists', () => {
    const keys = LEGACY_UNLOGGED_EXPORTS.map((e) => e.sourceKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of LEGACY_UNLOGGED_EXPORTS) {
      expect(entry.sourceKey).toMatch(/^[a-z][a-z0-9_.:-]{0,120}$/);
      expect(isLegacyUnloggedExport(entry.sourceKey)).toBe(true);
      // Once a stream moves the export onto the engine its old file may go: then remove the entry.
      expect(existsSync(join(ROOT, entry.today)), entry.today).toBe(true);
    }
    expect(isLegacyUnloggedExport('crew.something_new')).toBe(false);
  });
});

describe('the export libraries load on demand only', () => {
  const read = (file: string) => readFileSync(join(ROOT, 'src/lib/export', file), 'utf8');
  const staticImport = (source: string, lib: string) => new RegExp(`^import\\s[^;]*from\\s+['"]${lib}['"]`, 'm').test(source);

  it('no engine module imports papaparse, exceljs, jspdf, jspdf-autotable or the PDF template statically', () => {
    for (const file of ['index.ts', 'table.ts', 'fileName.ts', 'legacy.ts', 'download.ts', 'csv.ts', 'xlsx.ts', 'pdf.ts']) {
      const source = read(file);
      for (const lib of ['papaparse', 'exceljs', 'jspdf', 'jspdf-autotable', '@/lib/pdf/pdfTemplate', '@/lib/pdf']) {
        expect(staticImport(source, lib), `${file} imports ${lib}`).toBe(false);
      }
    }
  });

  it('index.ts reaches the builders through dynamic imports only', () => {
    const source = read('index.ts');
    for (const builder of ['csv', 'xlsx', 'pdf']) {
      expect(staticImport(source, `./${builder}`), builder).toBe(false);
      expect(source).toContain(`import('./${builder}')`);
    }
  });
});
