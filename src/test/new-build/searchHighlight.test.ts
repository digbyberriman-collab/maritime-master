import { describe, expect, it } from 'vitest';
import { highlightParts } from '@/modules/new-build/components/SearchHighlight';

describe('highlightParts', () => {
  it('splits a headline into matched and unmatched runs', () => {
    expect(highlightParts('rules about [[hl]]fire[[/hl]] safety')).toEqual([
      { text: 'rules about ', match: false },
      { text: 'fire', match: true },
      { text: ' safety', match: false },
    ]);
  });

  it('handles several matches and a leading match', () => {
    expect(highlightParts('[[hl]]fire[[/hl]] and [[hl]]smoke[[/hl]]')).toEqual([
      { text: 'fire', match: true },
      { text: ' and ', match: false },
      { text: 'smoke', match: true },
    ]);
  });

  it('treats HTML in the source as text, which is the point of the sentinels', () => {
    const parts = highlightParts('<script>alert(1)</script> [[hl]]SOLAS[[/hl]]');
    expect(parts[0]).toEqual({ text: '<script>alert(1)</script> ', match: false });
    expect(parts[1]).toEqual({ text: 'SOLAS', match: true });
  });

  it('degrades to plain text when there are no markers or one is unterminated', () => {
    expect(highlightParts('nothing highlighted')).toEqual([{ text: 'nothing highlighted', match: false }]);
    expect(highlightParts('dangling [[hl]]tail')).toEqual([
      { text: 'dangling ', match: false },
      { text: 'tail', match: false },
    ]);
  });

  it('returns nothing for an empty headline', () => {
    expect(highlightParts('')).toEqual([]);
  });
});
