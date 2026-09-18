import { describe, expect, it } from 'vitest';
import { applyMarkdownAction } from './editor';

describe('applyMarkdownAction', () => {
  it('wraps a selection in bold and italic markers', () => {
    expect(applyMarkdownAction('hello world', 6, 11, 'bold')).toEqual({ text: 'hello **world**', start: 8, end: 13 });
    expect(applyMarkdownAction('hello world', 0, 5, 'italic').text).toBe('*hello* world');
  });

  it('inserts placeholder text when nothing is selected', () => {
    const r = applyMarkdownAction('', 0, 0, 'bold');
    expect(r.text).toBe('**bold text**');
    expect(r.text.slice(r.start, r.end)).toBe('bold text');
  });

  it('turns the current line into a heading', () => {
    expect(applyMarkdownAction('intro\nClause', 6, 12, 'h2').text).toBe('intro\n## Clause');
    expect(applyMarkdownAction('Clause', 0, 6, 'h1').text).toBe('# Clause');
  });

  it('prefixes list, numbered list and quote lines', () => {
    expect(applyMarkdownAction('a\nb', 0, 3, 'ul').text).toBe('- a\n- b');
    expect(applyMarkdownAction('a\nb', 0, 3, 'ol').text).toBe('1. a\n2. b');
    expect(applyMarkdownAction('text', 0, 4, 'quote').text).toBe('> text');
    expect(applyMarkdownAction('before ', 7, 7, 'ul').text).toBe('before \n- Item');
  });

  it('builds links and rules', () => {
    const link = applyMarkdownAction('see flag', 4, 8, 'link');
    expect(link.text).toBe('see [flag](https://)');
    expect(link.text.slice(link.start, link.end)).toBe('https://');
    expect(applyMarkdownAction('end', 3, 3, 'hr').text).toBe('end\n\n---\n');
  });
});
