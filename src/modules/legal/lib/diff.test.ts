import { describe, expect, it } from 'vitest';
import { diffLines, diffStats, withContext } from './diff';

describe('diffLines', () => {
  it('reports identical text as all equal', () => {
    const d = diffLines('a\nb', 'a\nb');
    expect(d.map((l) => l.op)).toEqual(['equal', 'equal']);
    expect(diffLines('', '')).toEqual([]);
  });

  it('finds inserts, deletes and replacements with line numbers', () => {
    const d = diffLines('one\ntwo\nthree\nfour', 'one\n2\nthree\nfour\nfive');
    expect(d.map((l) => `${l.op}:${l.text}`)).toEqual(['equal:one', 'remove:two', 'add:2', 'equal:three', 'equal:four', 'add:five']);
    expect(d[1]).toMatchObject({ oldLine: 2 });
    expect(d[2]).toMatchObject({ newLine: 2 });
    expect(d[5]).toMatchObject({ newLine: 5 });
    expect(diffStats(d)).toEqual({ added: 2, removed: 1, unchanged: 3 });
  });

  it('handles empty sides and CRLF input', () => {
    expect(diffLines('', 'a\r\nb').map((l) => l.op)).toEqual(['add', 'add']);
    expect(diffLines('a\nb', '').map((l) => l.op)).toEqual(['remove', 'remove']);
  });

  it('prefers the longest common subsequence', () => {
    const d = diffLines('a\nb\nc\nd\ne', 'a\nc\ne\nb\nd');
    expect(diffStats(d).unchanged).toBe(3);
  });
});

describe('withContext', () => {
  it('collapses unchanged runs around changes', () => {
    const lines = diffLines(Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n'), Array.from({ length: 20 }, (_, i) => (i === 10 ? 'changed' : `l${i}`)).join('\n'));
    const rows = withContext(lines, 2);
    expect(rows[0]).toEqual({ op: 'skip', count: 8 });
    expect(rows.filter((r) => r.op !== 'skip')).toHaveLength(6);
    expect(rows[rows.length - 1]).toEqual({ op: 'skip', count: 7 });
  });

  it('returns unchanged diffs untouched', () => {
    const lines = diffLines('a\nb', 'a\nb');
    expect(withContext(lines)).toBe(lines);
  });
});
