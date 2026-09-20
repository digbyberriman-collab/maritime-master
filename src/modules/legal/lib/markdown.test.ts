import { describe, expect, it } from 'vitest';
import { isSafeHref, markdownToPlainText, parseInline, parseMarkdown, wordCount } from './markdown';

describe('parseInline', () => {
  it('handles bold, italic, code and links', () => {
    expect(parseInline('plain **bold** and *it* and _it2_ and `x`')).toEqual([
      { type: 'text', text: 'plain ' },
      { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
      { type: 'text', text: ' and ' },
      { type: 'em', children: [{ type: 'text', text: 'it' }] },
      { type: 'text', text: ' and ' },
      { type: 'em', children: [{ type: 'text', text: 'it2' }] },
      { type: 'text', text: ' and ' },
      { type: 'code', text: 'x' },
    ]);
    expect(parseInline('see [the flag site](https://cishipping.com)')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', href: 'https://cishipping.com', children: [{ type: 'text', text: 'the flag site' }] },
    ]);
  });

  it('drops unsafe link targets but keeps the label', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('mailto:legal@example.com')).toBe(true);
    const unsafe = parseInline('[click](javascript:alert(1))');
    expect(unsafe.some((n) => n.type === 'link')).toBe(false);
    expect(unsafe[0]).toEqual({ type: 'text', text: 'click' });
  });
});

describe('parseMarkdown', () => {
  it('parses headings, paragraphs, lists, quotes, rules and code', () => {
    const blocks = parseMarkdown(['# Title', '', 'Para one', 'continues here', '', '- a', '- b', '', '1. one', '2. two', '', '> quoted', '', '---', '', '```', 'raw <b>html</b>', '```'].join('\n'));
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'hr', 'code']);
    expect(blocks[0]).toMatchObject({ level: 1 });
    expect(blocks[1]).toMatchObject({ children: [{ type: 'text', text: 'Para one continues here' }] });
    expect(blocks[2]).toMatchObject({ ordered: false });
    expect(blocks[3]).toMatchObject({ ordered: true });
    expect(blocks[6]).toEqual({ type: 'code', text: 'raw <b>html</b>' });
  });

  it('keeps html as literal text', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>');
    expect(blocks).toEqual([{ type: 'paragraph', children: [{ type: 'text', text: '<script>alert(1)</script>' }] }]);
  });

  it('renders plain text and counts words', () => {
    const md = '## Clause 1\n\nThe **Owner** agrees.\n\n- first\n- second';
    expect(markdownToPlainText(md)).toBe('Clause 1\n\nThe Owner agrees.\n\n• first\n• second');
    expect(wordCount(md)).toBe(7);
    expect(wordCount('')).toBe(0);
  });
});
