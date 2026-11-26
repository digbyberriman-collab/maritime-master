/**
 * The publish and withdraw forms and the publish plan
 * (src/modules/documents/lib/fleetDocumentSchema.ts; gap/02 FD3, FD4, W1;
 * X5 spec X5-04B):
 *
 * - the schema checks, before any request, the server's limits and the
 *   records bucket's upload rules (50 MB, the allow-list);
 * - the defaults for a new document, a draft to finish and a new version;
 * - the plan runs create → upload → add the version → set the vessels →
 *   publish, never repeats a step that already succeeded, and has nothing
 *   to publish without a file or a draft version;
 * - the sentences for progress, failures and what is left after one.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  CHANGE_SUMMARY_MAX,
  EMPTY_PUBLISH_STATE,
  FILE_REQUIRED,
  PUBLISH_STEPS,
  PUBLISH_STEP_FAILED,
  PUBLISH_STEP_RUNNING,
  TARGETS_REQUIRED,
  TITLE_MAX,
  TITLE_REQUIRED,
  TYPE_REQUIRED,
  VERSION_LABEL_MAX,
  WITHDRAW_REASON_MAX,
  failureAftermath,
  fileRefusal,
  formatFileSize,
  planPublish,
  publishDocumentSchema,
  publishFormDefaults,
  requestedTargets,
  sameTargets,
  targetsSummary,
  toPublishInput,
  toWithdrawReason,
  uploadPercent,
  uploadProgressLabel,
  versionDetailsChanged,
  withdrawSchema,
  type PublishDocumentFormValues,
  type PublishFlowRequest,
  type PublishFlowState,
  type PublishFlowVersion,
} from '@/modules/documents/lib/fleetDocumentSchema';
import { MAX_RECORD_FILE_BYTES } from '@/lib/records/services/attachments';

const pdf = (name = 'Safety manual.pdf', size = 2048, type = 'application/pdf') => new File([new Uint8Array(size)], name, { type });

const values = (extra: Partial<PublishDocumentFormValues> = {}): PublishDocumentFormValues => ({
  typeId: 't-manual',
  title: 'Safety Management Manual',
  description: '',
  file: pdf(),
  versionLabel: '',
  versionKind: 'major',
  effectiveDate: '2026-11-26',
  changeSummary: '',
  targetMode: 'all_including_future',
  vesselIds: [],
  ...extra,
});

const issues = (v: PublishDocumentFormValues, fileRequired = true) => {
  const parsed = publishDocumentSchema({ fileRequired }).safeParse(v);
  return parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message]));
};

const draft = (extra: Partial<PublishFlowVersion> = {}): PublishFlowVersion => ({
  id: 'ver-3',
  versionNo: 3,
  fileObjectId: 'file-3',
  fileName: 'Rev 3.pdf',
  label: 'v3',
  kind: 'major',
  effectiveDate: '2026-11-20',
  changeSummary: null,
  ...extra,
});

const request = (extra: Partial<PublishFlowRequest> = {}): PublishFlowRequest => ({
  intent: 'publish',
  file: null,
  version: { label: null, kind: 'major', effectiveDate: '2026-11-20', changeSummary: null },
  targetMode: 'all_including_future',
  vesselIds: [],
  ...extra,
});

describe('the publish form schema', () => {
  it('passes a complete form and returns the trimmed input', () => {
    expect(issues(values())).toEqual({});
    const input = toPublishInput(values({ title: '  Safety Management Manual ', versionLabel: ' Rev 4 ', description: '   ', changeSummary: ' Section 5 ' }), { fileRequired: true });
    expect(input).toMatchObject({
      typeId: 't-manual',
      title: 'Safety Management Manual',
      description: null,
      versionLabel: 'Rev 4',
      changeSummary: 'Section 5',
      effectiveDate: '2026-11-26',
      targetMode: 'all_including_future',
      vesselIds: [],
    });
  });

  it('needs a type and a title crew see, within the server limits', () => {
    expect(issues(values({ typeId: '' }))).toEqual({ typeId: TYPE_REQUIRED });
    expect(issues(values({ title: '   ' }))).toEqual({ title: TITLE_REQUIRED });
    expect(issues(values({ title: 'x'.repeat(TITLE_MAX + 1) })).title).toMatch(/160 characters or fewer/);
    expect(issues(values({ title: 'x'.repeat(TITLE_MAX) }))).toEqual({});
    expect(issues(values({ versionLabel: 'x'.repeat(VERSION_LABEL_MAX + 1) })).versionLabel).toMatch(/40 characters or fewer/);
    expect(issues(values({ changeSummary: 'x'.repeat(CHANGE_SUMMARY_MAX + 1) })).changeSummary).toMatch(/1,000 characters or fewer/);
    expect(issues(values({ description: 'x'.repeat(2001) })).description).toMatch(/2,000 characters or fewer/);
  });

  it('needs a real date-only effective date', () => {
    expect(issues(values({ effectiveDate: '' })).effectiveDate).toBe('Enter the date this version takes effect');
    expect(issues(values({ effectiveDate: '2026-02-30' })).effectiveDate).toBe('Enter a valid date');
  });

  it('needs a file unless a draft version already holds one, and refuses what the bucket would refuse', () => {
    expect(issues(values({ file: null }))).toEqual({ file: FILE_REQUIRED });
    expect(issues(values({ file: null }), false)).toEqual({});
    expect(issues(values({ file: pdf('empty.pdf', 0) })).file).toBe('This file is empty.');
    expect(issues(values({ file: pdf('notes.txt', 10, 'text/plain') })).file).toBe('This file type cannot be attached. Use a PDF, an image or an Office document.');
    expect(fileRefusal({ size: MAX_RECORD_FILE_BYTES + 1, type: 'application/pdf' })).toBe('This file is larger than 50 MB.');
    expect(fileRefusal({ size: MAX_RECORD_FILE_BYTES, type: 'application/pdf' })).toBeNull();
    expect(fileRefusal(null)).toBeNull();
  });

  it('needs at least one ticked vessel in selected mode; all vessels sends none', () => {
    expect(issues(values({ targetMode: 'selected', vesselIds: [] }))).toEqual({ vesselIds: TARGETS_REQUIRED });
    expect(toPublishInput(values({ targetMode: 'selected', vesselIds: ['v-2', 'v-1', 'v-2'] }), { fileRequired: true })?.vesselIds).toEqual(['v-2', 'v-1']);
    expect(toPublishInput(values({ targetMode: 'all_including_future', vesselIds: ['v-1'] }), { fileRequired: true })?.vesselIds).toEqual([]);
    expect(toPublishInput(values({ title: '' }), { fileRequired: true })).toBeNull();
  });
});

describe('the form defaults', () => {
  it('a new document: the type preselected with its kind, today, all vessels', () => {
    expect(publishFormDefaults({ mode: 'new', today: '2026-11-26', typeId: 't-proc', typeVersionKind: 'minor' })).toEqual({
      typeId: 't-proc',
      title: '',
      description: '',
      file: null,
      versionLabel: '',
      versionKind: 'minor',
      effectiveDate: '2026-11-26',
      changeSummary: '',
      targetMode: 'all_including_future',
      vesselIds: [],
    });
  });

  it('a draft to finish: its saved version details and vessels', () => {
    const doc = { typeId: 't-proc', title: 'Mooring procedure', description: null, targetMode: 'selected' as const, targetVesselIds: ['v-1'] };
    expect(
      publishFormDefaults({ mode: 'resume', today: '2026-11-26', typeVersionKind: 'major', document: doc, draftVersion: draft({ label: 'Rev 3', kind: 'minor', changeSummary: 'Typos' }) }),
    ).toMatchObject({ typeId: 't-proc', title: 'Mooring procedure', versionLabel: 'Rev 3', versionKind: 'minor', effectiveDate: '2026-11-20', changeSummary: 'Typos', targetMode: 'selected', vesselIds: ['v-1'] });
  });

  it("a new version: a blank label, today and the type's kind, the document's vessels", () => {
    const doc = { typeId: 't-proc', title: 'Bunkering', description: 'Fuel', targetMode: 'all_including_future' as const, targetVesselIds: [] };
    expect(publishFormDefaults({ mode: 'new_version', today: '2026-11-26', typeVersionKind: 'minor', document: doc, draftVersion: draft() })).toMatchObject({
      versionLabel: '',
      versionKind: 'minor',
      effectiveDate: '2026-11-26',
      targetMode: 'all_including_future',
      description: 'Fuel',
    });
  });
});

describe('the publish plan', () => {
  const file = pdf();

  it('a new document runs every step in the one order, and a draft save stops before publishing', () => {
    expect(PUBLISH_STEPS).toEqual(['create', 'upload', 'add_version', 'set_targets', 'publish']);
    expect(planPublish(EMPTY_PUBLISH_STATE, request({ file }))).toEqual({ ok: true, steps: ['create', 'upload', 'add_version', 'set_targets', 'publish'] });
    expect(planPublish(EMPTY_PUBLISH_STATE, request({ file, intent: 'draft' }))).toEqual({ ok: true, steps: ['create', 'upload', 'add_version', 'set_targets'] });
  });

  it('never repeats a step that already succeeded', () => {
    const created: PublishFlowState = { ...EMPTY_PUBLISH_STATE, documentId: 'd-1', expectedUpdatedAt: 'u1', targets: { mode: 'selected', vesselIds: [] } };
    expect(planPublish(created, request({ file }))).toEqual({ ok: true, steps: ['upload', 'add_version', 'set_targets', 'publish'] });
    const uploaded = { ...created, uploaded: { file, fileObjectId: 'file-9' } };
    expect(planPublish(uploaded, request({ file }))).toEqual({ ok: true, steps: ['add_version', 'set_targets', 'publish'] });
    const versioned = { ...uploaded, draftVersion: draft({ fileObjectId: 'file-9', label: 'v1', versionNo: 1 }) };
    expect(planPublish(versioned, request({ file }))).toEqual({ ok: true, steps: ['set_targets', 'publish'] });
  });

  it('a draft keeps its file: only changed details replace the draft version; another file is uploaded', () => {
    const resume: PublishFlowState = { documentId: 'd-1', expectedUpdatedAt: 'u1', targets: { mode: 'all_including_future', vesselIds: [] }, uploaded: null, draftVersion: draft() };
    expect(planPublish(resume, request())).toEqual({ ok: true, steps: ['set_targets', 'publish'] });
    expect(planPublish(resume, request({ version: { label: 'Rev 3', kind: 'major', effectiveDate: '2026-11-20', changeSummary: null } }))).toEqual({
      ok: true,
      steps: ['add_version', 'set_targets', 'publish'],
    });
    expect(planPublish(resume, request({ file }))).toEqual({ ok: true, steps: ['upload', 'add_version', 'set_targets', 'publish'] });
  });

  it('has nothing to publish without a file or a draft version', () => {
    expect(planPublish(EMPTY_PUBLISH_STATE, request())).toEqual({ ok: false, refusal: 'file_required' });
  });

  it('compares the version details as the server stores them (a blank label is the automatic one)', () => {
    const v = { label: null, kind: 'major' as const, effectiveDate: '2026-11-20', changeSummary: null };
    expect(versionDetailsChanged(draft(), v)).toBe(false);
    expect(versionDetailsChanged(draft(), { ...v, label: ' v3 ' })).toBe(false);
    expect(versionDetailsChanged(draft({ label: 'Rev 3' }), v)).toBe(true);
    expect(versionDetailsChanged(draft(), { ...v, kind: 'minor' })).toBe(true);
    expect(versionDetailsChanged(draft(), { ...v, effectiveDate: '2026-11-21' })).toBe(true);
    expect(versionDetailsChanged(draft(), { ...v, changeSummary: '  ' })).toBe(false);
    expect(versionDetailsChanged(draft(), { ...v, changeSummary: 'New annex' })).toBe(true);
  });

  it('normalises and compares targets', () => {
    expect(requestedTargets({ targetMode: 'selected', vesselIds: ['v-2', 'v-1', 'v-2'] })).toEqual({ mode: 'selected', vesselIds: ['v-1', 'v-2'] });
    expect(requestedTargets({ targetMode: 'all_including_future', vesselIds: ['v-1'] })).toEqual({ mode: 'all_including_future', vesselIds: [] });
    expect(sameTargets({ mode: 'selected', vesselIds: ['v-2', 'v-1'] }, { mode: 'selected', vesselIds: ['v-1', 'v-2'] })).toBe(true);
    expect(sameTargets({ mode: 'selected', vesselIds: ['v-1'] }, { mode: 'all_including_future', vesselIds: [] })).toBe(false);
    expect(sameTargets(null, { mode: 'selected', vesselIds: [] })).toBe(false);
  });
});

describe('sentences', () => {
  it('names each step while it runs and when it failed', () => {
    for (const step of PUBLISH_STEPS) {
      expect(PUBLISH_STEP_RUNNING[step].length).toBeGreaterThan(5);
      expect(PUBLISH_STEP_FAILED[step]).toMatch(/^The .* not /);
    }
  });

  it('says what is left after a failure: nothing, a draft crew do not see, or the published version unchanged', () => {
    expect(failureAftermath({ step: 'create', documentExists: false, documentPublished: false })).toBe('Nothing was saved.');
    expect(failureAftermath({ step: 'upload', documentExists: true, documentPublished: false })).toMatch(/draft is saved in the library and crew do not see it/);
    expect(failureAftermath({ step: 'publish', documentExists: true, documentPublished: true })).toMatch(/still see the version published before/);
  });

  it('summarises the targets and the upload honestly', () => {
    expect(targetsSummary('all_including_future', 0, 6, 7)).toBe('All vessels: 6 now, and any added later');
    expect(targetsSummary('selected', 3, 6, 7)).toBe('3 of 7 vessels ticked');
    expect(targetsSummary('selected', 1, 1, 1)).toBe('1 of 1 vessel ticked');
    expect(formatFileSize(820 * 1024)).toBe('820 KB');
    expect(formatFileSize(10)).toBe('1 KB');
    expect(formatFileSize(3.25 * 1024 * 1024)).toBe('3.3 MB');
    expect(uploadPercent(null)).toBe(0);
    expect(uploadPercent({ loaded: 50, total: 200 })).toBe(25);
    expect(uploadPercent({ loaded: 300, total: 200 })).toBe(100);
    expect(uploadProgressLabel(null)).toBe('Starting the upload');
    expect(uploadProgressLabel({ loaded: 1024 * 1024, total: 4 * 1024 * 1024 })).toBe('1.0 MB of 4.0 MB sent');
  });
});

describe('the withdraw form', () => {
  it('needs a reason of 1 to 500 characters, trimmed', () => {
    expect(withdrawSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(toWithdrawReason({ reason: '  Replaced by the new procedure ' })).toBe('Replaced by the new procedure');
    expect(toWithdrawReason({ reason: 'x'.repeat(WITHDRAW_REASON_MAX) })).toHaveLength(WITHDRAW_REASON_MAX);
    expect(toWithdrawReason({ reason: 'x'.repeat(WITHDRAW_REASON_MAX + 1) })).toBeNull();
  });
});
