/**
 * The export engine (gap/08 EX1, EX4; X5 PR-13; platform-prep PP4).
 *
 *   const result = await runExport({
 *     format: 'xlsx', kind: 'Crew list', sourceKey: 'crew.crew_list',
 *     personalData: true, vesselId, vesselCode, columns, rows,
 *   });
 *   if (result.status === 'refused') notify.error(result.message);
 *
 * Every client export goes through here, in this order:
 * 1. log it with `log_client_export` (`logClientExport`, the records
 *    services) before anything is built: format `csv` → kind `csv`, `xlsx`
 *    → `xlsx`, `pdf` → `register_pdf` (the kinds 20261123020400 accepts),
 *    with the source key, the filters (`params`), the row count, the
 *    personal-data flag and the vessel when the export is vessel-scoped;
 * 2. apply the one rule for a missing log (platform-prep plan §1, contract 9):
 *    - the log RPC is not in the database (D-01) and the export holds
 *      personal data: refused, "Exports that contain personal data are
 *      unavailable until the export log is set up" (D-X5-12);
 *    - missing and no personal data: the export proceeds, unlogged;
 *    - missing, with `legacyUnlogged` on an export that works today
 *      (`LEGACY_UNLOGGED_EXPORTS`): it proceeds unlogged, its documented
 *      D-01 fallback;
 *    - any other log failure (no access, acting as another user, a network
 *      error): refused. Nothing is built and nothing is downloaded;
 * 3. build the file (CSV through papaparse, Excel through exceljs, PDF
 *    through jspdf + jspdf-autotable on the STORM template). Each builder is
 *    imported on demand, so no export library is in the entry chunk;
 * 4. hand it to the browser under the EX1 name (`./fileName`).
 *
 * The answer is a `ServiceResult`: `ok` with the file name once the download
 * has been handed to the browser, or `refused` with a stable code and a
 * sentence for `notify()` (`notifyExportResult`). It never throws and never
 * reports success for a file it did not make.
 */
import type { Json } from '@/integrations/supabase/types';
import { logClientExport } from '@/lib/records/services/exports';
import type { ExportKind } from '@/lib/records/services/db.pending';
import type { ServiceResult } from '@/lib/records/services/results';
import { notify } from '@/shared/lib/notify';
import { downloadBlob } from './download';
import { exportFileName, exportScopePart, type ExportExtension, type ExportRange } from './fileName';
import { isLegacyUnloggedExport } from './legacy';
import { buildExportTable, localDateTime, type ExportColumn, type ExportTable } from './table';

export type ExportFormat = ExportExtension;

export const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'xlsx', 'pdf'];

export const EXPORT_FORMAT_LABELS: Readonly<Record<ExportFormat, string>> = {
  csv: 'CSV',
  xlsx: 'Excel (.xlsx)',
  pdf: 'PDF',
};

/** The `export_jobs.kind` each format is logged as (CHECK in 20261123020400). */
export const EXPORT_LOG_KIND: Readonly<Record<ExportFormat, ExportKind>> = {
  csv: 'csv',
  xlsx: 'xlsx',
  pdf: 'register_pdf',
};

/** The source-key rule of `log_client_export` (export_scope_check). */
export const SOURCE_KEY_PATTERN = /^[a-z][a-z0-9_.:-]{0,120}$/;

export const PERSONAL_DATA_NOTICE =
  'This file contains personal data. Keep it only as long as you need it and share it only with people entitled to see it.';

export const EXPORT_COPY = {
  logMissingPersonal: 'Exports that contain personal data are unavailable until the export log is set up',
  logFailed: 'STORM could not record this export, so the file was not made. Try again.',
  accessDenied: 'You cannot export this: it needs access to this vessel, or to the Fleet view for a fleet export.',
  impersonating: 'Exports cannot be made while you are acting as another user.',
  invalid: 'This export is not set up correctly, so the file was not made.',
  legacyUnlisted: 'This export is not set up correctly, so the file was not made.',
  noColumns: 'This export has no columns, so the file was not made.',
  buildFailed: 'STORM could not make the file. Nothing was downloaded. Try again.',
} as const;

export type ExportRefusalCode =
  | 'export_log_missing'
  | 'export_log_failed'
  | 'export_access_denied'
  | 'impersonating'
  | 'export_invalid'
  | 'legacy_unlogged_unlisted'
  | 'no_columns'
  | 'export_build_failed';

export interface ExportOutcome {
  fileName: string;
  rowCount: number;
  /** False only when the export ran unlogged because the log is not set up yet (D-01). */
  logged: boolean;
  /** The `export_jobs` row, when logged. */
  jobId: string | null;
}

export type ExportResult =
  | { status: 'ok'; value: ExportOutcome }
  | { status: 'refused'; code: ExportRefusalCode; message: string };

export interface RunExportOptions<Row> {
  format: ExportFormat;
  /** The file-name kind and the document title, e.g. `Crew list`. */
  kind: string;
  /** `<module>.<report>`, e.g. `crew.crew_list` (the log's source key). */
  sourceKey: string;
  /** True for anything about people: crew, medical, HR, hours of rest (EX4). */
  personalData: boolean;
  /** The vessel of a vessel-scoped export; omit for a fleet export. */
  vesselId?: string | null;
  /** That vessel's code, for the file name (`DRA_…`); omit for `FLEET_…`. */
  vesselCode?: string | null;
  columns: readonly ExportColumn<Row>[];
  rows: readonly Row[];
  /** An export that works today and may run unlogged while the log is missing (`LEGACY_UNLOGGED_EXPORTS`). */
  legacyUnlogged?: boolean;
  /** The title inside the file; default `kind`. */
  title?: string;
  /** The reference, day or range the file name carries. */
  range?: ExportRange | null;
  /** The filters, logged with the export (ids and codes only; never personal data). */
  params?: Json;
  /** The clock (tests). */
  now?: Date;
  /** The download step (tests). */
  download?: (blob: Blob, fileName: string) => void;
}

const refused = (code: ExportRefusalCode, message: string): ExportResult => ({ status: 'refused', code, message });

type LogAnswer = { logged: true; jobId: string } | { logged: false } | ExportResult;

/** What the log said, mapped onto contract 9. */
async function logFirst<Row>(options: RunExportOptions<Row>): Promise<LogAnswer> {
  let result: ServiceResult<{ id: string }>;
  try {
    result = await logClientExport({
      kind: EXPORT_LOG_KIND[options.format],
      sourceKey: options.sourceKey,
      params: options.params ?? {},
      containsPersonalData: options.personalData,
      rowCount: options.rows.length,
      vesselId: options.vesselId ?? undefined,
    });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === '42501') return refused('export_access_denied', EXPORT_COPY.accessDenied);
    return refused('export_log_failed', EXPORT_COPY.logFailed);
  }
  if (result.status === 'ok') return { logged: true, jobId: result.value.id };
  if (result.status === 'refused') {
    if (result.code === 'impersonating') return refused('impersonating', EXPORT_COPY.impersonating);
    return refused('export_invalid', EXPORT_COPY.invalid);
  }
  // The log is not in the database yet (D-01).
  if (!options.personalData || options.legacyUnlogged) return { logged: false };
  return refused('export_log_missing', EXPORT_COPY.logMissingPersonal);
}

async function buildFile(format: ExportFormat, table: ExportTable, meta: { title: string; scope: string; generatedAt: string; personalData: boolean }): Promise<Blob> {
  const notice = meta.personalData ? PERSONAL_DATA_NOTICE : null;
  if (format === 'csv') return (await import('./csv')).buildCsv(table);
  if (format === 'xlsx') return (await import('./xlsx')).buildXlsx(table, { ...meta, notice });
  return (await import('./pdf')).buildPdf(table, { ...meta, notice });
}

export async function runExport<Row>(options: RunExportOptions<Row>): Promise<ExportResult> {
  if (!EXPORT_FORMATS.includes(options.format) || !SOURCE_KEY_PATTERN.test(options.sourceKey) || !options.kind.trim()) {
    return refused('export_invalid', EXPORT_COPY.invalid);
  }
  if (options.legacyUnlogged && !isLegacyUnloggedExport(options.sourceKey)) {
    return refused('legacy_unlogged_unlisted', EXPORT_COPY.legacyUnlisted);
  }
  if (!options.columns.length) return refused('no_columns', EXPORT_COPY.noColumns);

  const log = await logFirst(options);
  if ('status' in log) return log;

  const now = options.now ?? new Date();
  let fileName: string;
  try {
    fileName = exportFileName({ vesselCode: options.vesselCode, kind: options.kind, range: options.range, ext: options.format, generatedOn: now });
    const table = buildExportTable(options.columns, options.rows);
    const blob = await buildFile(options.format, table, {
      title: options.title?.trim() || options.kind.trim(),
      scope: exportScopePart(options.vesselCode),
      generatedAt: localDateTime(now),
      personalData: options.personalData,
    });
    (options.download ?? downloadBlob)(blob, fileName);
  } catch {
    return refused('export_build_failed', EXPORT_COPY.buildFailed);
  }
  return {
    status: 'ok',
    value: { fileName, rowCount: options.rows.length, logged: log.logged, jobId: log.logged ? log.jobId : null },
  };
}

/** The toast for an export's answer: the file name on success, the refusal sentence otherwise. */
export function notifyExportResult(result: ExportResult): void {
  if (result.status === 'ok') notify.success('Export downloaded', { description: result.value.fileName });
  else notify.error(result.message, { title: 'Export not made' });
}

export { exportFileName, type ExportRange } from './fileName';
export { buildExportTable, type ExportColumn, type ExportColumnKind, type ExportValue } from './table';
export { LEGACY_UNLOGGED_EXPORTS, isLegacyUnloggedExport } from './legacy';
