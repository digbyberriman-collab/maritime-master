import { describe, expect, it } from 'vitest';
import { attachmentBelongsToRequest, buildAttachmentPath, errorMessage, isAllowedAttachmentType, isInlineViewable } from './storage';

describe('storage helpers', () => {
  it('builds company-scoped paths with a safe extension', () => {
    expect(buildAttachmentPath({ companyId: 'co', kind: 'requests', recordId: 'r1', fileName: 'Charter Party.PDF', now: 1, random: 'abc' })).toBe('co/requests/r1/1-abc.pdf');
    expect(buildAttachmentPath({ companyId: 'co', kind: 'submissions', recordId: 's1', fileName: 'noext', now: 1, random: 'abc' })).toBe('co/submissions/s1/1-abc.bin');
    expect(buildAttachmentPath({ companyId: 'co', kind: 'requests', recordId: 'r1', fileName: 'x.t@r!', now: 1, random: 'abc' })).toBe('co/requests/r1/1-abc.tr');
  });

  it('surfaces the real error message', () => {
    expect(errorMessage(new Error('row-level security'))).toBe('row-level security');
    expect(errorMessage({ message: 'duplicate key', code: '23505' })).toBe('duplicate key');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage({ message: '' })).toBe('Unexpected error');
  });

  it('recognises allowed types and which ones open inline', () => {
    expect(isAllowedAttachmentType('application/pdf')).toBe(true);
    expect(isAllowedAttachmentType('text/html')).toBe(false);
    expect(isAllowedAttachmentType('image/svg+xml')).toBe(false);
    expect(isInlineViewable('application/pdf')).toBe(true);
    expect(isInlineViewable('image/png')).toBe(true);
    expect(isInlineViewable('application/zip')).toBe(false);
  });

  it('only accepts paths inside the request folder', () => {
    expect(attachmentBelongsToRequest('co/requests/r1/1-abc.pdf', 'co', 'r1')).toBe(true);
    expect(attachmentBelongsToRequest('co/requests/r2/1-abc.pdf', 'co', 'r1')).toBe(false);
    expect(attachmentBelongsToRequest('other/requests/r1/1-abc.pdf', 'co', 'r1')).toBe(false);
    expect(attachmentBelongsToRequest('co/requests/r1/../r2/x.pdf', 'co', 'r1')).toBe(false);
  });
});
