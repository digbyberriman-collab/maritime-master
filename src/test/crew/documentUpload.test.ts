/**
 * Crew document files (X1-04B; gap/04 C25; gap/08 UP1; D-X1-18):
 *
 * - the check before anything is sent: empty, over 50 MB, a type outside the
 *   UP1 list (HEIC without a browser type passes by its extension), each with
 *   its sentence; previews; sizes; names trimmed to what the server keeps;
 * - storage refusals in words (403 / row-level security, 413, 415, other);
 * - saveDocumentWithFile: no file saves the row only; a refused check or
 *   upload never saves the row; a failed save removes the uploaded object and
 *   rethrows the save's own error; a failed removal is reported, the save
 *   error still wins;
 * - the default path goes through PR-X1-F's uploadCrewDocumentFile to
 *   <company>/crew/<profile_id>/documents/<uuid>-<safe name> (the database
 *   stores the path, never a URL) and removeCrewDocument;
 * - D-01: the helper missing from the build reads as not ready.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  uploads: [] as Array<{ bucket: string; path: string; options: unknown }>,
  removes: [] as Array<{ bucket: string; paths: string[] }>,
  uploadError: null as unknown,
  removeError: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, _file: unknown, options: unknown) => {
          h.uploads.push({ bucket, path, options });
          return Promise.resolve({ data: h.uploadError ? null : { path }, error: h.uploadError });
        },
        remove: (paths: string[]) => {
          h.removes.push({ bucket, paths });
          return Promise.resolve({ data: null, error: h.removeError });
        },
      }),
    },
  },
}));

import { CrewDocumentFileError, CREW_DOCUMENT_MAX_BYTES } from '@/lib/storage/crewDocuments';
import {
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_FILE_HINT,
  DOCUMENT_FILE_NAME_MAX,
  DocumentUploadError,
  UPLOADS_UNAVAILABLE_NOTICE,
  crewDocumentUploadsReady,
  documentFileName,
  documentFileProblem,
  documentPreviewKind,
  documentUploadMessage,
  fileSizeText,
  saveDocumentWithFile,
} from '@/modules/crew/lib/documentUpload';

const COMPANY = 'c0000000-0000-4000-8000-000000000001';
const PROFILE = 'b0000000-0000-4000-8000-000000000015';
const MB = 1024 * 1024;

const fileOf = (name: string, type: string, size?: number): File => {
  const f = new File(['%PDF-1.4 test'], name, { type });
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeEach(() => {
  h.uploads = [];
  h.removes = [];
  h.uploadError = null;
  h.removeError = null;
});

describe('the check before upload (UP1)', () => {
  it('accepts every UP1 type, by its type or, without one, by its extension', () => {
    for (const [name, type] of [
      ['passport.pdf', 'application/pdf'],
      ['scan.jpg', 'image/jpeg'],
      ['scan.png', 'image/png'],
      ['scan.webp', 'image/webp'],
      ['scan.gif', 'image/gif'],
      ['scan.heic', 'image/heic'],
      ['letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['log.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['phone.HEIC', ''],
      ['old.doc', ''],
    ] as const) {
      expect(documentFileProblem(fileOf(name, type)), name).toBeNull();
    }
  });

  it('refuses an empty file, a file over 50 MB and a type outside the list, each in a sentence', () => {
    expect(documentFileProblem(fileOf('empty.pdf', 'application/pdf', 0))).toBe('"empty.pdf" is empty. Choose the file again.');
    expect(documentFileProblem(fileOf('big.pdf', 'application/pdf', 60 * MB))).toBe('"big.pdf" is 60 MB. Crew documents can be up to 50 MB.');
    expect(documentFileProblem(fileOf('edge.pdf', 'application/pdf', CREW_DOCUMENT_MAX_BYTES))).toBeNull();
    expect(documentFileProblem(fileOf('edge.pdf', 'application/pdf', CREW_DOCUMENT_MAX_BYTES + 1))).toMatch(/can be up to 50 MB/);
    expect(documentFileProblem(fileOf('notes.txt', 'text/plain'))).toBe(
      '"notes.txt" is not a file type STORM accepts. Upload a PDF, JPG, PNG, WebP, HEIC, GIF, Word or Excel file.',
    );
    expect(documentFileProblem(fileOf('tool.exe', ''))).toMatch(/is not a file type STORM accepts/);
    // A known extension with a wrong browser type is refused: the type wins.
    expect(documentFileProblem(fileOf('fake.pdf', 'application/x-msdownload'))).toMatch(/is not a file type STORM accepts/);
  });

  it('tells the file field what it takes', () => {
    expect(DOCUMENT_FILE_HINT).toBe('PDF, JPG, PNG, WebP, HEIC, GIF, Word or Excel, up to 50 MB.');
    for (const ext of ['.pdf', '.heic', '.docx', '.xlsx', 'image/png', 'application/pdf']) expect(DOCUMENT_FILE_ACCEPT.split(',')).toContain(ext);
  });

  it('previews what the browser draws: images and PDFs; HEIC, Word and Excel by name only', () => {
    expect(documentPreviewKind('application/pdf')).toBe('pdf');
    for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'IMAGE/PNG']) expect(documentPreviewKind(m), m).toBe('image');
    for (const m of ['image/heic', 'image/heif', 'application/msword', 'application/vnd.ms-excel', '', null, undefined]) {
      expect(documentPreviewKind(m), String(m)).toBe('none');
    }
  });

  it('writes sizes for people, and keeps file names within what the server stores', () => {
    expect(fileSizeText(512)).toBe('512 B');
    expect(fileSizeText(182_000)).toBe('178 KB');
    expect(fileSizeText(100)).toBe('100 B');
    expect(fileSizeText(1500)).toBe('1 KB');
    expect(fileSizeText(3.4 * MB)).toBe('3.4 MB');
    expect(fileSizeText(null)).toBeNull();
    expect(fileSizeText(-1)).toBeNull();
    expect(documentFileName('  passport.pdf ')).toBe('passport.pdf');
    expect(documentFileName('   ')).toBe('document');
    expect(documentFileName(`${'a'.repeat(300)}.pdf`)).toHaveLength(DOCUMENT_FILE_NAME_MAX);
  });
});

describe('storage refusals in words', () => {
  it('keeps the helper\'s own sentences', () => {
    expect(documentUploadMessage(new CrewDocumentFileError('file_too_large', 'Too big.'))).toBe('Too big.');
  });

  it('a 403 or a row-level policy: not this person\'s documents to store', () => {
    expect(documentUploadMessage({ statusCode: '403', message: 'new row violates row-level security policy' })).toBe(
      'The file was not stored. You may not store documents for this person.',
    );
    expect(documentUploadMessage({ message: 'new row violates row-level security policy for table "objects"' })).toMatch(/You may not store documents/);
    expect(documentUploadMessage({ status: 401 })).toMatch(/You may not store documents/);
  });

  it('413 and 415 name the limit and the types; anything else asks to try again', () => {
    expect(documentUploadMessage({ statusCode: 413, message: 'Payload too large' })).toBe('The file was not stored. Crew documents can be up to 50 MB.');
    expect(documentUploadMessage({ statusCode: '415', message: 'mime type text/plain is not supported' })).toBe(
      'The file was not stored. Upload a PDF, JPG, PNG, WebP, HEIC, GIF, Word or Excel file.',
    );
    expect(documentUploadMessage(new TypeError('Failed to fetch'))).toBe('The file was not stored. Check your connection and try again.');
    expect(documentUploadMessage(null)).toBe('The file was not stored. Check your connection and try again.');
  });
});

describe('saveDocumentWithFile', () => {
  it('without a file: saves the row only', async () => {
    const save = vi.fn().mockResolvedValue('doc-1');
    const upload = vi.fn();
    await expect(saveDocumentWithFile({ companyId: COMPANY, profileId: PROFILE, file: null, save, upload })).resolves.toEqual({ id: 'doc-1', file: null });
    expect(save).toHaveBeenCalledWith(null);
    expect(upload).not.toHaveBeenCalled();
  });

  it('a refused check never uploads and never saves', async () => {
    const save = vi.fn();
    const upload = vi.fn();
    const err = await saveDocumentWithFile({ companyId: COMPANY, profileId: PROFILE, file: fileOf('big.pdf', 'application/pdf', 51 * MB), save, upload }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DocumentUploadError);
    expect((err as DocumentUploadError).stage).toBe('check');
    expect((err as DocumentUploadError).message).toBe('"big.pdf" is 51 MB. Crew documents can be up to 50 MB.');
    expect(upload).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('a failed upload never saves the row, and leaves nothing to remove', async () => {
    const save = vi.fn();
    const remove = vi.fn();
    const upload = vi.fn().mockRejectedValue({ statusCode: '403', message: 'new row violates row-level security policy' });
    const err = await saveDocumentWithFile({ companyId: COMPANY, profileId: PROFILE, file: fileOf('p.pdf', 'application/pdf'), save, upload, remove }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DocumentUploadError);
    expect((err as DocumentUploadError).stage).toBe('upload');
    expect((err as DocumentUploadError).message).toBe('The file was not stored. You may not store documents for this person.');
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('an upload that answers no path is a failed upload', async () => {
    const save = vi.fn();
    const err = await saveDocumentWithFile({
      companyId: COMPANY,
      profileId: PROFILE,
      file: fileOf('p.pdf', 'application/pdf'),
      save,
      upload: vi.fn().mockResolvedValue(''),
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DocumentUploadError);
    expect(save).not.toHaveBeenCalled();
  });

  it('a stored file goes to the row as its path, name, size and type', async () => {
    const save = vi.fn().mockResolvedValue('doc-2');
    const remove = vi.fn();
    const file = fileOf('scan.heic', '');
    const result = await saveDocumentWithFile({
      companyId: COMPANY,
      profileId: PROFILE,
      file,
      save,
      upload: vi.fn().mockResolvedValue(`${COMPANY}/crew/${PROFILE}/documents/u-scan.heic`),
      remove,
    });
    const stored = { path: `${COMPANY}/crew/${PROFILE}/documents/u-scan.heic`, name: 'scan.heic', size: file.size, mime: 'image/heic' };
    expect(save).toHaveBeenCalledWith(stored);
    expect(result).toEqual({ id: 'doc-2', file: stored });
    expect(remove).not.toHaveBeenCalled();
  });

  it('a failed save removes the uploaded object and rethrows the save\'s own error', async () => {
    const refusal = { code: '22023', message: 'field_invalid', details: 'Check the expiry date.', hint: 'expiry_date' };
    const remove = vi.fn().mockResolvedValue(undefined);
    const err = await saveDocumentWithFile({
      companyId: COMPANY,
      profileId: PROFILE,
      file: fileOf('p.pdf', 'application/pdf'),
      save: vi.fn().mockRejectedValue(refusal),
      upload: vi.fn().mockResolvedValue('the/path.pdf'),
      remove,
    }).catch((e: unknown) => e);
    expect(err).toBe(refusal);
    expect(remove).toHaveBeenCalledWith('the/path.pdf');
  });

  it('a removal that fails too is reported; the save error still wins', async () => {
    const refusal = new Error('not saved');
    const cleanup = new Error('storage down');
    const onCleanupFailed = vi.fn();
    const err = await saveDocumentWithFile({
      companyId: COMPANY,
      profileId: PROFILE,
      file: fileOf('p.pdf', 'application/pdf'),
      save: vi.fn().mockRejectedValue(refusal),
      upload: vi.fn().mockResolvedValue('the/path.pdf'),
      remove: vi.fn().mockRejectedValue(cleanup),
      onCleanupFailed,
    }).catch((e: unknown) => e);
    expect(err).toBe(refusal);
    expect(onCleanupFailed).toHaveBeenCalledWith('the/path.pdf', cleanup);
  });

  it('by default: PR-X1-F\'s upload to the person\'s documents prefix, and its removal after a failed save', async () => {
    const save = vi.fn().mockRejectedValue(new Error('refused'));
    await saveDocumentWithFile({ companyId: COMPANY, profileId: PROFILE, file: fileOf('My Passport (scan).pdf', 'application/pdf'), save }).catch(() => undefined);
    expect(h.uploads).toHaveLength(1);
    const { bucket, path, options } = h.uploads[0];
    expect(bucket).toBe('documents');
    expect(path).toMatch(new RegExp(`^${COMPANY}/crew/${PROFILE}/documents/[0-9a-f-]{36}-My_Passport_scan.pdf$`));
    expect(options).toEqual({ contentType: 'application/pdf', upsert: false });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ path, name: 'My Passport (scan).pdf', mime: 'application/pdf' }));
    expect(h.removes).toEqual([{ bucket: 'documents', paths: [path] }]);
  });

  it('by default: a storage refusal saves nothing', async () => {
    h.uploadError = { statusCode: '403', message: 'new row violates row-level security policy' };
    const save = vi.fn();
    const err = await saveDocumentWithFile({ companyId: COMPANY, profileId: PROFILE, file: fileOf('p.pdf', 'application/pdf'), save }).catch((e: unknown) => e);
    expect((err as DocumentUploadError).message).toMatch(/You may not store documents/);
    expect(save).not.toHaveBeenCalled();
    expect(h.removes).toEqual([]);
  });

  it('by default: a missing company or person is refused by the helper with its sentence', async () => {
    const save = vi.fn();
    const err = await saveDocumentWithFile({ companyId: '', profileId: PROFILE, file: fileOf('p.pdf', 'application/pdf'), save }).catch((e: unknown) => e);
    expect((err as DocumentUploadError).message).toBe('Cannot upload a crew document without a company.');
    expect(save).not.toHaveBeenCalled();
    expect(h.uploads).toEqual([]);
  });
});

describe('D-01: the storage helper', () => {
  it('is ready in this build, and not ready when the helper is missing', () => {
    expect(crewDocumentUploadsReady()).toBe(true);
    expect(crewDocumentUploadsReady({})).toBe(false);
    expect(crewDocumentUploadsReady({ uploadCrewDocumentFile: undefined })).toBe(false);
    expect(UPLOADS_UNAVAILABLE_NOTICE).toBe('Uploads become available once the storage update is applied.');
  });
});
