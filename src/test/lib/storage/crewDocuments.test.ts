/**
 * Crew-document uploads (X1 PR-X1-F; gap/08 UP1; D-X1-18): the path
 * <company>/crew/<profile_id>/documents/<uuid>-<safe name> that the
 * documents-bucket gate accepts, size and type checks with plain
 * sentences, the stored path returned (never a URL), storage errors thrown
 * as they are, the MIME list equal to the bucket's (upload-policy.json and
 * 20261124000100), no legacy CrewDocumentKind that could meet the X1
 * prefix, and every legacy kind named by a branch of the crew/ gate (D-373),
 * so no HR uploader falls through to the fail-closed default.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  uploads: [] as { bucket: string; path: string; options: unknown }[],
  error: null as unknown,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, _file: unknown, options: unknown) => {
          h.uploads.push({ bucket, path, options });
          return Promise.resolve({ data: h.error ? null : { path }, error: h.error });
        },
      }),
    },
  },
}));

import {
  CREW_DOCUMENTS_BUCKET,
  CREW_DOCUMENT_KINDS,
  CREW_DOCUMENT_MAX_BYTES,
  CREW_DOCUMENT_MIME_TYPES,
  CrewDocumentFileError,
  buildCrewDocumentFilePath,
  buildCrewDocumentPath,
  crewDocumentMimeType,
  safeCrewDocumentName,
  uploadCrewDocumentFile,
  validateCrewDocumentFile,
} from '@/lib/storage/crewDocuments';

const ROOT = join(__dirname, '..', '..', '..', '..');
const COMPANY = '11111111-2222-4333-8444-555555555555';
const PROFILE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FILE_ID = '00000000-0000-4000-8000-000000000001';
/** The gate's rules (storage_crew_document_allowed): five segments, lower-case uuids, <uuid>-<safe name>. */
const GATE = /^[0-9a-f-]{36}\/crew\/[0-9a-f-]{36}\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

const fileOf = (name: string, type: string, size = 1024): File => {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

beforeEach(() => {
  h.uploads = [];
  h.error = null;
});

describe('buildCrewDocumentFilePath', () => {
  it('builds the prefix the gate accepts, keyed on the profile', () => {
    const path = buildCrewDocumentFilePath(COMPANY, PROFILE, 'Passport scan.pdf', FILE_ID);
    expect(path).toBe(`${COMPANY}/crew/${PROFILE}/documents/${FILE_ID}-Passport_scan.pdf`);
    expect(path).toMatch(GATE);
    expect(path.includes('..')).toBe(false);
  });

  it('lower-cases the ids and refuses anything that is not a uuid', () => {
    expect(buildCrewDocumentFilePath(COMPANY.toUpperCase(), ` ${PROFILE} `, 'a.pdf', FILE_ID)).toMatch(GATE);
    expect(() => buildCrewDocumentFilePath('', PROFILE, 'a.pdf')).toThrow(CrewDocumentFileError);
    expect(() => buildCrewDocumentFilePath(COMPANY, 'not-a-profile', 'a.pdf')).toThrow('Cannot upload a crew document without the crew member it belongs to.');
  });

  it('a fresh uuid per file by default', () => {
    const a = buildCrewDocumentFilePath(COMPANY, PROFILE, 'a.pdf');
    const b = buildCrewDocumentFilePath(COMPANY, PROFILE, 'a.pdf');
    expect(a).not.toBe(b);
    expect(a).toMatch(GATE);
  });

  it.each([
    ['Pässport (front).JPG', 'P_ssport_front.JPG'],
    ['../../etc/passwd', 'passwd'],
    ['.hidden', 'hidden'],
    ['a..b...c.pdf', 'a.b.c.pdf'],
    ['___', 'document'],
    ['C:\\scans\\visa.png', 'visa.png'],
    [`${'x'.repeat(300)}.pdf`, `${'x'.repeat(196)}.pdf`],
  ])('safe name: %s -> %s', (input, want) => {
    const name = safeCrewDocumentName(input);
    expect(name).toBe(want);
    expect(buildCrewDocumentFilePath(COMPANY, PROFILE, input, FILE_ID)).toMatch(GATE);
  });
});

describe('validateCrewDocumentFile (UP1)', () => {
  it('accepts every type on the list, and HEIC by extension when the browser reports none', () => {
    for (const type of CREW_DOCUMENT_MIME_TYPES) expect(validateCrewDocumentFile(fileOf('f', type))).toBeNull();
    expect(crewDocumentMimeType(fileOf('IMG_0001.HEIC', ''))).toBe('image/heic');
    expect(crewDocumentMimeType(fileOf('scan.pdf', ''))).toBe('application/pdf');
    expect(validateCrewDocumentFile(fileOf('IMG_0001.heic', ''))).toBeNull();
  });

  it('refuses another type with a sentence naming the file and the accepted kinds', () => {
    const problem = validateCrewDocumentFile(fileOf('notes.txt', 'text/plain'));
    expect(problem?.code).toBe('file_type_not_allowed');
    expect(problem?.message).toBe('"notes.txt" is not a file type STORM accepts. Upload a PDF, JPG, PNG, WebP, HEIC, GIF, Word or Excel file.');
    expect(validateCrewDocumentFile(fileOf('archive.zip', ''))?.code).toBe('file_type_not_allowed');
    expect(validateCrewDocumentFile(fileOf('x.pdf', 'application/x-msdownload'))?.code).toBe('file_type_not_allowed');
  });

  it('refuses more than 50 MB and an empty file', () => {
    expect(CREW_DOCUMENT_MAX_BYTES).toBe(52428800);
    expect(validateCrewDocumentFile(fileOf('ok.pdf', 'application/pdf', CREW_DOCUMENT_MAX_BYTES))).toBeNull();
    const big = validateCrewDocumentFile(fileOf('big.pdf', 'application/pdf', CREW_DOCUMENT_MAX_BYTES + 1));
    expect(big?.code).toBe('file_too_large');
    expect(big?.message).toBe('"big.pdf" is 50 MB. Crew documents can be up to 50 MB.');
    expect(validateCrewDocumentFile(fileOf('huge.pdf', 'application/pdf', 80 * 1024 * 1024))?.message).toBe('"huge.pdf" is 80 MB. Crew documents can be up to 50 MB.');
    expect(validateCrewDocumentFile(fileOf('empty.pdf', 'application/pdf', 0))?.code).toBe('file_empty');
  });
});

describe('uploadCrewDocumentFile', () => {
  it('uploads to the documents bucket under the crew-documents prefix and returns the path, never a URL', async () => {
    const path = await uploadCrewDocumentFile(COMPANY, PROFILE, fileOf('Medical cert.pdf', 'application/pdf'));
    expect(path).toMatch(GATE);
    expect(path).not.toMatch(/^https?:/);
    expect(h.uploads).toEqual([{ bucket: CREW_DOCUMENTS_BUCKET, path, options: { contentType: 'application/pdf', upsert: false } }]);
    expect(CREW_DOCUMENTS_BUCKET).toBe('documents');
  });

  it('sends the inferred type when the browser gives none (the bucket checks it)', async () => {
    await uploadCrewDocumentFile(COMPANY, PROFILE, fileOf('IMG_1.HEIC', ''));
    expect(h.uploads[0].options).toEqual({ contentType: 'image/heic', upsert: false });
  });

  it('refuses before uploading: no company, no profile, too large, wrong type', async () => {
    await expect(uploadCrewDocumentFile('', PROFILE, fileOf('a.pdf', 'application/pdf'))).rejects.toMatchObject({ code: 'missing_company' });
    await expect(uploadCrewDocumentFile(COMPANY, '', fileOf('a.pdf', 'application/pdf'))).rejects.toMatchObject({ code: 'missing_profile' });
    await expect(uploadCrewDocumentFile(COMPANY, PROFILE, fileOf('a.pdf', 'application/pdf', CREW_DOCUMENT_MAX_BYTES + 1))).rejects.toMatchObject({ code: 'file_too_large' });
    await expect(uploadCrewDocumentFile(COMPANY, PROFILE, fileOf('a.exe', 'application/x-msdownload'))).rejects.toBeInstanceOf(CrewDocumentFileError);
    expect(h.uploads).toEqual([]);
  });

  it('a storage error (the prefix not open yet, no access, network) is thrown as it is: no fake success', async () => {
    h.error = { name: 'StorageApiError', statusCode: '403', message: 'new row violates row-level security policy' };
    await expect(uploadCrewDocumentFile(COMPANY, PROFILE, fileOf('a.pdf', 'application/pdf'))).rejects.toBe(h.error);
  });
});

describe('the prefix and the bucket agree with the SQL', () => {
  it('no legacy CrewDocumentKind is "documents", so legacy HR paths never share the X1 folder', () => {
    expect(CREW_DOCUMENT_KINDS).not.toContain('documents');
    for (const kind of CREW_DOCUMENT_KINDS) {
      const legacy = buildCrewDocumentPath({ companyId: COMPANY, crewUserId: PROFILE, kind, fileName: 'x.pdf' });
      expect(legacy.split('/')[3]).toBe(kind);
      expect(legacy.split('/')[3]).not.toBe('documents');
    }
  });

  it('every legacy kind has a branch in the crew/ gate (D-373) and its paths have the five-segment shape the gate accepts', () => {
    const sql = readFileSync(join(ROOT, 'supabase/migrations/20261124000100_platform_storage_crew_documents.sql'), 'utf8');
    const gate = /CREATE OR REPLACE FUNCTION public\.storage_crew_document_allowed\(p_name text, p_action text\)[\s\S]*?\n\$\$;/.exec(sql)?.[0] ?? '';
    expect(gate).not.toBe('');
    const named = new Set(Array.from(gate.matchAll(/v_kind (?:IN \(([^)]*)\)|= '([^']+)')/g), (m) => m[1] ?? `'${m[2]}'`).flatMap((list) => Array.from(list.matchAll(/'([^']+)'/g), (k) => k[1])));
    for (const kind of CREW_DOCUMENT_KINDS) expect(named.has(kind), kind).toBe(true);
    const file = /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/;
    for (const kind of CREW_DOCUMENT_KINDS) {
      const parts = buildCrewDocumentPath({ companyId: COMPANY, crewUserId: PROFILE, kind, fileName: 'scan.PDF' }).split('/');
      expect(parts).toHaveLength(5);
      expect(parts[1]).toBe('crew');
      expect(parts[4]).toMatch(file);
    }
  });

  it('the MIME list equals upload-policy.json and the documents bucket in 20261124000100, in order', () => {
    const policy = JSON.parse(readFileSync(join(ROOT, 'supabase/tests/fixtures/upload-policy.json'), 'utf8')) as { mimeTypes: string[]; maxBytes: number };
    expect([...CREW_DOCUMENT_MIME_TYPES]).toEqual(policy.mimeTypes);
    expect(CREW_DOCUMENT_MAX_BYTES).toBe(policy.maxBytes);
    const sql = readFileSync(join(ROOT, 'supabase/migrations/20261124000100_platform_storage_crew_documents.sql'), 'utf8');
    const bucket = /VALUES \('documents', 'documents', false, (\d+), ARRAY\[([\s\S]*?)\]::text\[\]\)/.exec(sql);
    expect(bucket?.[1]).toBe(String(CREW_DOCUMENT_MAX_BYTES));
    expect(Array.from((bucket?.[2] ?? '').matchAll(/'([^']+)'/g), (m) => m[1])).toEqual([...CREW_DOCUMENT_MIME_TYPES]);
  });
});
