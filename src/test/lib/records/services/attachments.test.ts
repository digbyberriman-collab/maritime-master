/**
 * Uploads (Phase 2 spec §A.13, §B.6; gap/08 UP1–UP3; DECISIONS C7):
 * - the limits equal `supabase/tests/fixtures/upload-policy.json` (the SQL
 *   test of the bucket and `file_objects` reads the same file);
 * - every `safeFileName` output matches `safeNamePattern`, over a corpus of
 *   awkward names (leading `_` `.` `-`, accents, scripts with no Latin
 *   letters, long names, control characters);
 * - `uploadRecordFile` sends the bytes with an XHR to the storage endpoint
 *   with the session token, reports only real progress, can be aborted, then
 *   registers and attaches the file; every failure is `refused` with its
 *   storage or SQL code, or `missing` when the bucket or RPCs are not live.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Reply = { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  replies: new Map<string, Reply>(),
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  session: { access_token: 'session-token' } as { access_token: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.rpcs.push({ name, args });
      return Promise.resolve(h.replies.get(name) ?? { data: null, error: null });
    },
    auth: { getSession: () => Promise.resolve({ data: { session: h.session }, error: null }) },
  },
}));

import {
  ACCEPTED_RECORD_MIME_TYPES,
  MAX_RECORD_FILE_BYTES,
  RECORD_FILES_BUCKET,
  UPLOAD_REFUSAL_MESSAGES,
  buildRecordFilePath,
  classifyStorageAnswer,
  recordFileUploadUrl,
  safeFileName,
  uploadRecordFile,
  validateRecordFile,
  type RecordFileScope,
} from '@/lib/records/services/attachments';

interface Policy {
  bucket: string;
  maxBytes: number;
  mimeTypes: string[];
  safeNamePattern: string;
  segmentPattern: string;
  pathPattern: string;
}
const policy = JSON.parse(readFileSync(join(process.cwd(), 'supabase/tests/fixtures/upload-policy.json'), 'utf8')) as Policy;
const SAFE_NAME = new RegExp(policy.safeNamePattern);
const SEGMENT = new RegExp(policy.segmentPattern);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ─── A fake XMLHttpRequest ────────────────────────────────────────────────

type Behaviour =
  | { kind: 'ok'; status?: number }
  | { kind: 'http'; status: number; body: string }
  | { kind: 'network' }
  | { kind: 'hang' };

class FakeXhr {
  static last: FakeXhr | null = null;
  static behaviour: Behaviour = { kind: 'ok' };
  static progress: [number, number][] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  responseText = '';
  aborted = false;
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    FakeXhr.last = this;
    this.body = body;
    const b = FakeXhr.behaviour;
    if (b.kind === 'hang') return;
    queueMicrotask(() => {
      for (const [loaded, total] of FakeXhr.progress) this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
      if (b.kind === 'network') return this.onerror?.();
      this.status = b.kind === 'ok' ? b.status ?? 200 : b.status;
      this.responseText = b.kind === 'http' ? b.body : '{"Key":"records/x"}';
      this.onload?.();
    });
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

const scope: RecordFileScope = {
  companyId: '11111111-1111-4111-8111-111111111111',
  vesselId: '22222222-2222-4222-8222-222222222222',
  moduleKey: 'safety',
  entityType: 'incident',
  entityId: '33333333-3333-4333-8333-333333333333',
};
const pdf = (size = 2048, name = 'Damage report.pdf') => new File([new Uint8Array(size)], name, { type: 'application/pdf' });
const fileRow = { id: 'f-1', storage_path: 'x' };
const attachmentRow = { id: 'a-1', file_id: 'f-1' };

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.example.test/');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key');
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  FakeXhr.last = null;
  FakeXhr.behaviour = { kind: 'ok' };
  FakeXhr.progress = [];
  h.session = { access_token: 'session-token' };
  h.replies.set('register_file_object', { data: fileRow, error: null });
  h.replies.set('attach_record_file', { data: attachmentRow, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  h.replies.clear();
  h.rpcs.length = 0;
});

// ─── Policy ───────────────────────────────────────────────────────────────

describe('the upload policy equals upload-policy.json', () => {
  it('bucket, size limit and MIME allow-list', () => {
    expect(RECORD_FILES_BUCKET).toBe(policy.bucket);
    expect(MAX_RECORD_FILE_BYTES).toBe(policy.maxBytes);
    expect([...ACCEPTED_RECORD_MIME_TYPES]).toEqual(policy.mimeTypes);
  });

  it('validateRecordFile: empty, at the limit, over it, and every listed type', () => {
    expect(validateRecordFile({ size: 0, type: 'application/pdf' })).toBe('empty');
    expect(validateRecordFile({ size: policy.maxBytes, type: 'application/pdf' })).toBeNull();
    expect(validateRecordFile({ size: policy.maxBytes + 1, type: 'application/pdf' })).toBe('too_large');
    for (const type of policy.mimeTypes) expect(validateRecordFile({ size: 1, type })).toBeNull();
    for (const type of ['', 'text/html', 'application/x-msdownload', 'image/svg+xml', 'application/zip']) expect(validateRecordFile({ size: 1, type })).toBe('type_not_allowed');
  });
});

describe('safeFileName (CC-21)', () => {
  const corpus = [
    'Damage report.pdf',
    '_draft.pdf',
    '__init__.docx',
    '.hidden',
    '..',
    '...pdf',
    '-dash.png',
    '-._-.pdf',
    'Ångström Überprüfung.pdf',
    'café crème.jpg',
    'naïve résumé.docx',
    'Ærø.png',
    'ﬁnal ﬂow.pdf',
    'ＦＵＬＬ ＷＩＤＴＨ.pdf',
    'Фото повреждения.jpg',
    '船舶检查.pdf',
    '😀😀.png',
    '',
    ' ',
    '\u0000\u0007\u001f.pdf',
    'line\nbreak\r\n.pdf',
    'tab\tname.pdf',
    'a/b\\c:d*e?f"g<h>i|j.pdf',
    '%2e%2e%2fetc.pdf',
    'x'.repeat(300) + '.pdf',
    '_'.repeat(250),
    'é'.repeat(250),
    'IMG_0001.HEIC',
    'scan (2).pdf',
    '​​zero width.pdf',
  ];
  // Seeded random names over a mixed alphabet, so the property holds beyond the hand-picked list.
  let seed = 20261123;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const ALPHABET = ['a', 'Z', '0', '.', '_', '-', ' ', 'é', 'ß', 'ñ', 'Ø', '/', '\\', '%', '́', '😀', '中', '\n', '#'];
  for (let i = 0; i < 500; i += 1) {
    const len = 1 + Math.floor(rnd() * 260);
    corpus.push(Array.from({ length: len }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)]).join(''));
  }

  it('every output matches safeNamePattern', () => {
    const bad = corpus.map((name) => [name, safeFileName(name)] as const).filter(([, out]) => !SAFE_NAME.test(out));
    expect(bad).toEqual([]);
  });

  it('keeps readable names readable', () => {
    expect(safeFileName('Damage report.pdf')).toBe('Damage-report.pdf');
    expect(safeFileName('café crème.jpg')).toBe('cafe-creme.jpg');
    expect(safeFileName('_draft.pdf')).toBe('draft.pdf');
    expect(safeFileName('.hidden')).toBe('hidden');
    expect(safeFileName('船舶检查.pdf')).toBe('pdf');
    expect(safeFileName('')).toBe('file');
    expect(safeFileName('x'.repeat(300))).toHaveLength(200);
  });
});

describe('buildRecordFilePath (C7)', () => {
  it('six segments, snake_case module and entity, the uuid-prefixed safe name', () => {
    const path = buildRecordFilePath(scope, '00000000-0000-4000-8000-000000000001', '_Damage report.pdf');
    const parts = path.split('/');
    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 5)).toEqual([scope.companyId, scope.vesselId, 'safety', 'incident', scope.entityId]);
    expect(SEGMENT.test(parts[2]) && SEGMENT.test(parts[3])).toBe(true);
    expect(parts[5]).toBe('00000000-0000-4000-8000-000000000001-Damage-report.pdf');
    expect(SAFE_NAME.test(parts[5].slice(37))).toBe(true);
  });

  it('a fleet record uses the `fleet` segment', () => {
    expect(buildRecordFilePath({ ...scope, vesselId: null }, 'id', 'a.pdf').split('/')[1]).toBe('fleet');
  });
});

// ─── uploadRecordFile ─────────────────────────────────────────────────────

describe('uploadRecordFile', () => {
  it('stores, registers and attaches; real progress only', async () => {
    FakeXhr.progress = [
      [512, 2048],
      [2048, 2048],
    ];
    const progress: { loaded: number; total: number }[] = [];
    const result = await uploadRecordFile({ file: pdf(), scope, envelopeId: 'e1', sectionKey: 'evidence', caption: 'Hull', onProgress: (p) => progress.push(p) });

    expect(result).toEqual({ status: 'ok', value: { file: fileRow, attachment: attachmentRow } });
    expect(progress).toEqual([
      { loaded: 512, total: 2048 },
      { loaded: 2048, total: 2048 },
    ]);
    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.method).toBe('POST');
    const prefix = `https://project.example.test/storage/v1/object/records/${scope.companyId}/${scope.vesselId}/safety/incident/${scope.entityId}/`;
    expect(xhr.url.startsWith(prefix)).toBe(true);
    const fileSegment = xhr.url.slice(prefix.length);
    expect(UUID.test(fileSegment.slice(0, 36))).toBe(true);
    expect(fileSegment.slice(36)).toBe('-Damage-report.pdf');
    expect(xhr.headers).toEqual({ Authorization: 'Bearer session-token', apikey: 'publishable-key', 'Content-Type': 'application/pdf', 'x-upsert': 'false' });
    expect(xhr.body).toBeInstanceOf(File);

    const path = xhr.url.slice('https://project.example.test/storage/v1/object/records/'.length);
    expect(h.rpcs).toEqual([
      { name: 'register_file_object', args: { p_bucket: 'records', p_path: path, p_original_name: 'Damage report.pdf', p_mime_type: 'application/pdf', p_size_bytes: 2048 } },
      { name: 'attach_record_file', args: { p_file_id: 'f-1', p_envelope_id: 'e1', p_section_key: 'evidence', p_caption: 'Hull' } },
    ]);
  });

  it('no progress event without real bytes: a server that never reports progress reports none', async () => {
    const progress: unknown[] = [];
    await uploadRecordFile({ file: pdf(), scope, onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([]);
  });

  it.each([
    ['empty', new File([], 'a.pdf', { type: 'application/pdf' })],
    ['too_large', new File([new Uint8Array(1)], 'a.pdf', { type: 'application/pdf' })],
    ['type_not_allowed', new File([new Uint8Array(4)], 'a.html', { type: 'text/html' })],
  ])('a file that fails validation (%s) is refused before anything is sent', async (code, file) => {
    if (code === 'too_large') Object.defineProperty(file, 'size', { value: MAX_RECORD_FILE_BYTES + 1 });
    await expect(uploadRecordFile({ file, scope })).resolves.toEqual({ status: 'refused', code, message: UPLOAD_REFUSAL_MESSAGES[code] });
    expect(FakeXhr.last).toBeNull();
    expect(h.rpcs).toEqual([]);
  });

  it('abort during the transfer: the XHR is aborted and nothing is registered', async () => {
    FakeXhr.behaviour = { kind: 'hang' };
    const controller = new AbortController();
    const pending = uploadRecordFile({ file: pdf(), scope, signal: controller.signal });
    await vi.waitFor(() => expect(FakeXhr.last).not.toBeNull());
    controller.abort();
    await expect(pending).resolves.toMatchObject({ status: 'refused', code: 'aborted' });
    expect(FakeXhr.last?.aborted).toBe(true);
    expect(h.rpcs).toEqual([]);
  });

  it('an already-aborted signal sends nothing', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(uploadRecordFile({ file: pdf(), scope, signal: controller.signal })).resolves.toMatchObject({ status: 'refused', code: 'aborted' });
    expect(FakeXhr.last).toBeNull();
  });

  it.each([
    [403, '{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}', 'storage_forbidden'],
    [409, '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}', 'storage_conflict'],
    [413, '{"statusCode":"413","error":"Payload too large","message":"The object exceeded the maximum allowed size"}', 'storage_too_large'],
    [400, '{"statusCode":"415","error":"invalid_mime_type","message":"mime type text/html is not supported"}', 'storage_type_not_allowed'],
    [500, 'not json', 'storage_error'],
  ])('a storage %i is refused with its code and STORM copy (never the provider text)', async (status, body, code) => {
    FakeXhr.behaviour = { kind: 'http', status, body };
    const result = await uploadRecordFile({ file: pdf(), scope });
    expect(result).toEqual({ status: 'refused', code, message: UPLOAD_REFUSAL_MESSAGES[code] });
    expect(JSON.stringify(result)).not.toMatch(/row-level|resource already exists/);
    expect(h.rpcs).toEqual([]);
  });

  it('bucket not live (Bucket not found) → missing (D-01)', async () => {
    FakeXhr.behaviour = { kind: 'http', status: 400, body: '{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}' };
    await expect(uploadRecordFile({ file: pdf(), scope })).resolves.toEqual({ status: 'missing' });
  });

  it('a network failure is refused, not reported as sent', async () => {
    FakeXhr.behaviour = { kind: 'network' };
    await expect(uploadRecordFile({ file: pdf(), scope })).resolves.toMatchObject({ status: 'refused', code: 'network_error' });
  });

  it('no session: refused before sending', async () => {
    h.session = null;
    await expect(uploadRecordFile({ file: pdf(), scope })).resolves.toMatchObject({ status: 'refused', code: 'not_signed_in' });
    expect(FakeXhr.last).toBeNull();
  });

  it('no Supabase URL in the app: refused as not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(recordFileUploadUrl('a/b')).toBeNull();
    await expect(uploadRecordFile({ file: pdf(), scope })).resolves.toMatchObject({ status: 'refused', code: 'not_configured' });
  });

  it('register refused with the SQL code; nothing is attached', async () => {
    h.replies.set('register_file_object', { data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(uploadRecordFile({ file: pdf(), scope })).resolves.toEqual({ status: 'refused', code: '42501', message: UPLOAD_REFUSAL_MESSAGES.register_failed });
    expect(h.rpcs.map((r) => r.name)).toEqual(['register_file_object']);
  });

  it('register not live → missing', async () => {
    h.replies.set('register_file_object', { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.register_file_object' } });
    await expect(uploadRecordFile({ file: pdf(), scope })).resolves.toEqual({ status: 'missing' });
  });

  it('attach refused by a rule (22023 record_closed) carries the stable code', async () => {
    h.replies.set('attach_record_file', { data: null, error: { code: '22023', message: 'record_closed' } });
    await expect(uploadRecordFile({ file: pdf(), scope, envelopeId: 'e1' })).resolves.toEqual({ status: 'refused', code: 'record_closed', message: UPLOAD_REFUSAL_MESSAGES.attach_failed });
  });

  it('classifyStorageAnswer reads the status from the body when present', () => {
    expect(classifyStorageAnswer(400, { statusCode: '403', error: 'Unauthorized' })).toEqual({ kind: 'refused', code: 'storage_forbidden' });
    expect(classifyStorageAnswer(404, null)).toEqual({ kind: 'refused', code: 'storage_error' });
  });
});
