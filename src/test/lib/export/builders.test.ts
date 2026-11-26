/**
 * The export table, file names and the three builders (gap/08 EX1, EX4, EX6):
 * cells per column kind with date-only values in local time, the EX1 name
 * pattern and its sanitising, CSV (BOM, CSV injection), Excel (real dates on
 * the right calendar day, the About sheet and its personal-data notice) and
 * PDF (a PDF document).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { buildExportTable, exportCell, localDateTime, type ExportColumn } from '@/lib/export/table';
import { exportFileName, exportKindPart, exportRangePart, exportScopePart } from '@/lib/export/fileName';
import { buildCsv, buildCsvText, csvField } from '@/lib/export/csv';
import { buildXlsx, excelDate, sheetName, xlsxValue } from '@/lib/export/xlsx';
import { buildPdf } from '@/lib/export/pdf';
import { PERSONAL_DATA_NOTICE } from '@/lib/export';

const blobBytes = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
const blobText = async (blob: Blob): Promise<string> => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blobBytes(blob));

describe('exportCell: one cell per column kind', () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland';
  });
  afterEach(() => {
    process.env.TZ = previous;
  });

  it('a stored date stays the same calendar day whatever the time zone', () => {
    expect(exportCell('2026-03-01', 'date')).toBe('2026-03-01');
    expect(exportCell('2026-12-31', 'date')).toBe('2026-12-31');
  });

  it('a timestamp in a date column is the local day it happened (Auckland is ahead of UTC)', () => {
    expect(exportCell('2026-11-25T20:00:00Z', 'date')).toBe('2026-11-26');
    expect(exportCell(new Date(2026, 0, 2, 0, 30), 'date')).toBe('2026-01-02');
  });

  it('a date and time is local wall-clock time', () => {
    expect(exportCell('2026-11-25T20:05:00Z', 'datetime')).toBe('2026-11-26 09:05');
    expect(localDateTime(new Date(2026, 5, 1, 7, 3))).toBe('2026-06-01 07:03');
  });

  it('an impossible or unreadable date throws (a caller bug, never a silent blank)', () => {
    expect(() => exportCell('2026-02-30', 'date')).toThrow();
    expect(() => exportCell('soon', 'date')).toThrow();
    expect(() => exportCell('soon', 'datetime')).toThrow();
  });

  it('numbers, booleans, text and empties', () => {
    expect(exportCell(12.5, 'number')).toBe(12.5);
    expect(exportCell('7', 'number')).toBe(7);
    expect(exportCell('n/a', 'number')).toBe('n/a');
    expect(exportCell(Number.NaN, 'number')).toBeNull();
    expect(exportCell(true, 'boolean')).toBe('Yes');
    expect(exportCell(false, 'text')).toBe('No');
    expect(exportCell(null, 'text')).toBeNull();
    expect(exportCell(undefined, 'date')).toBeNull();
    expect(exportCell('', 'number')).toBeNull();
    expect(exportCell(42, 'text')).toBe('42');
  });
});

interface Row {
  name: string;
  hours: number;
  on: string;
  at: string;
  ok: boolean;
}
const COLUMNS: readonly ExportColumn<Row>[] = [
  { key: 'name', header: 'Name', value: (r) => r.name },
  { key: 'hours', header: 'Hours', value: (r) => r.hours, kind: 'number' },
  { key: 'on', header: 'Day', value: (r) => r.on, kind: 'date' },
  { key: 'at', header: 'Recorded', value: (r) => r.at, kind: 'datetime' },
  { key: 'ok', header: 'Compliant', value: (r) => r.ok, kind: 'boolean', width: 11 },
];
const ROWS: Row[] = [
  { name: 'Chief Stew', hours: 10.5, on: '2026-11-01', at: '2026-11-01T08:00:00', ok: true },
  { name: '=HYPERLINK("x")', hours: -2, on: '2026-11-02', at: '2026-11-02T18:30:00', ok: false },
];

describe('buildExportTable', () => {
  it('headers, kinds, widths and normalised rows in column order', () => {
    const table = buildExportTable(COLUMNS, ROWS);
    expect(table.headers).toEqual(['Name', 'Hours', 'Day', 'Recorded', 'Compliant']);
    expect(table.kinds).toEqual(['text', 'number', 'date', 'datetime', 'boolean']);
    expect(table.widths[4]).toBe(11);
    expect(table.rows[0]).toEqual(['Chief Stew', 10.5, '2026-11-01', '2026-11-01 08:00', 'Yes']);
  });
});

describe('exportFileName (EX1)', () => {
  const on = new Date(2026, 10, 26, 23, 59);

  it('<VESSELCODE|FLEET>_<Kind>_<range-or-date>_<yyyy-mm-dd>.<ext>', () => {
    expect(exportFileName({ vesselCode: 'dra', kind: 'Crew list', range: { on: '2026-11-20' }, ext: 'pdf', generatedOn: on })).toBe(
      'DRA_CrewList_2026-11-20_2026-11-26.pdf',
    );
    expect(exportFileName({ kind: 'hours-of-rest', range: { from: '2026-11-01', to: '2026-11-30' }, ext: 'xlsx', generatedOn: on })).toBe(
      'FLEET_HoursOfRest_2026-11-01-to-2026-11-30_2026-11-26.xlsx',
    );
    expect(exportFileName({ vesselCode: 'HYD', kind: 'Permit', range: { ref: 'HYD-PTW-2026-001' }, ext: 'pdf', generatedOn: on })).toBe(
      'HYD_Permit_HYD-PTW-2026-001_2026-11-26.pdf',
    );
    expect(exportFileName({ vesselCode: 'GAM', kind: 'Crew list', ext: 'csv', generatedOn: on })).toBe('GAM_CrewList_2026-11-26.csv');
  });

  it('sanitises every part: no path separators, spaces or odd characters', () => {
    expect(exportScopePart(' d/r.a ')).toBe('DRA');
    expect(exportScopePart('')).toBe('FLEET');
    expect(exportScopePart(null)).toBe('FLEET');
    expect(exportKindPart('../etc/passwd')).toBe('EtcPasswd');
    expect(exportKindPart('HoR month')).toBe('HoRMonth');
    expect(exportKindPart('***')).toBe('Export');
    expect(exportRangePart({ ref: 'a b/c\\d' })).toBe('a-bcd');
    expect(exportRangePart({ from: '2026-11-01', to: '2026-11-01' })).toBe('2026-11-01');
    expect(exportRangePart(null)).toBeNull();
    const name = exportFileName({ vesselCode: 'x:y', kind: 'a/b c', range: { ref: '1/2' }, ext: 'csv', generatedOn: on });
    expect(name).toMatch(/^[A-Za-z0-9_-]+\.csv$/);
  });
});

describe('CSV', () => {
  it('writes a BOM, CRLF lines, headers and every row', async () => {
    const blob = await buildCsv(buildExportTable(COLUMNS, ROWS));
    const bytes = await blobBytes(blob);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = (await blobText(blob)).replace(/^\uFEFF/, '');
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('Name,Hours,Day,Recorded,Compliant');
    expect(lines[1]).toBe('Chief Stew,10.5,2026-11-01,2026-11-01 08:00,Yes');
    expect(lines).toHaveLength(3);
  });

  it('defuses formulas in text cells (CSV injection) but keeps numbers', async () => {
    expect(csvField('=1+1', 'text')).toBe("'=1+1");
    expect(csvField('@cmd', 'text')).toBe("'@cmd");
    expect(csvField('-x', 'text')).toBe("'-x");
    expect(csvField(-2, 'number')).toBe('-2');
    expect(csvField(null, 'text')).toBe('');
    const text = await buildCsvText(buildExportTable(COLUMNS, ROWS));
    expect(text.split('\r\n')[2]).toBe(`"'=HYPERLINK(""x"")",-2,2026-11-02,2026-11-02 18:30,No`);
  });
});

describe('Excel', () => {
  it('real dates on the table day, numbers as numbers, a frozen filtered header and the About sheet', async () => {
    const table = buildExportTable(COLUMNS, ROWS);
    const blob = await buildXlsx(table, {
      title: 'Hours of rest: Nov',
      scope: 'DRA',
      generatedAt: '2026-11-26 09:30',
      personalData: true,
      notice: PERSONAL_DATA_NOTICE,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await blobBytes(blob)).buffer as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe('Hours of rest Nov');
    expect(sheet.getRow(1).values).toEqual([undefined, 'Name', 'Hours', 'Day', 'Recorded', 'Compliant']);
    expect(sheet.getCell('B2').value).toBe(10.5);
    const day = sheet.getCell('C2').value as Date;
    expect(day).toBeInstanceOf(Date);
    expect(day.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(sheet.getCell('C2').numFmt).toBe('yyyy-mm-dd');
    expect((sheet.getCell('D3').value as Date).toISOString()).toBe('2026-11-02T18:30:00.000Z');
    expect(sheet.getCell('A3').value).toBe('=HYPERLINK("x")');
    expect(sheet.getCell('A3').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });

    const about = workbook.getWorksheet('About');
    expect(about?.getCell('B1').value).toBe('Hours of rest: Nov');
    expect(about?.getCell('B4').value).toBe(2);
    expect(about?.getCell('A5').value).toBe('Personal data');
    expect(about?.getCell('B5').value).toBe(PERSONAL_DATA_NOTICE);
  });

  it('no notice row without personal data; helpers', async () => {
    const blob = await buildXlsx(buildExportTable(COLUMNS, []), { title: 'Fleet', scope: 'FLEET', generatedAt: 'x', personalData: false, notice: null });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await blobBytes(blob)).buffer as ArrayBuffer);
    expect(workbook.getWorksheet('About')?.getCell('A5').value ?? null).toBeNull();
    expect(excelDate('2026-01-31')?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(excelDate('31/01/2026')).toBeNull();
    expect(xlsxValue('2026-01-31 07:05', 'datetime')).toEqual(new Date(Date.UTC(2026, 0, 31, 7, 5)));
    expect(xlsxValue('2026-01-31', 'text')).toBe('2026-01-31');
    expect(sheetName('a'.repeat(40))).toHaveLength(31);
    expect(sheetName('[]:*?/\\')).toBe('Export');
  });
});

describe('PDF', () => {
  it('is a PDF document, landscape above six columns', async () => {
    const wide: ExportColumn<Row>[] = [...COLUMNS, { key: 'x', header: 'Extra', value: () => 'x' }, { key: 'y', header: 'More', value: () => 'y' }];
    const blob = await buildPdf(buildExportTable(wide, ROWS), { title: 'Crew list', scope: 'DRA', generatedAt: '2026-11-26 09:30', notice: PERSONAL_DATA_NOTICE });
    expect(blob.type).toBe('application/pdf');
    const head = new TextDecoder().decode((await blobBytes(blob)).slice(0, 5));
    expect(head).toBe('%PDF-');
    const text = await blobText(blob);
    expect(text).toMatch(/\/MediaBox \[0 0 841\.\d+ 595\.\d+\]/);
  });
});
