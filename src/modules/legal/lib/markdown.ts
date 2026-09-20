/**
 * Minimal Markdown parser for legal document content. Produces an AST that
 * the MarkdownView component renders as React elements, so stored content
 * is never injected as HTML.
 *
 * Supported: headings (# to ######), paragraphs, **bold**, *italic* / _italic_,
 * `code`, [links](https://…), unordered / ordered lists, > quotes, --- rules,
 * ``` fenced code blocks.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'hr' };

export const isSafeHref = (href: string): boolean => /^(https?:\/\/|mailto:)/i.test(href.trim());

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length) {
    const m = INLINE_TOKEN.exec(rest);
    if (!m || m.index === undefined) {
      out.push({ type: 'text', text: rest });
      break;
    }
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ type: 'strong', children: parseInline(tok.slice(2, -2)) });
    else if (tok.startsWith('`')) out.push({ type: 'code', text: tok.slice(1, -1) });
    else if (tok.startsWith('[')) {
      const close = tok.indexOf('](');
      const label = tok.slice(1, close);
      const href = tok.slice(close + 2, -1);
      if (isSafeHref(href)) out.push({ type: 'link', href, children: parseInline(label) });
      else out.push({ type: 'text', text: label });
    } else out.push({ type: 'em', children: parseInline(tok.slice(1, -1)) });
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^```/;

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ type: 'quote', children: parseInline(quote.join(' ')) });
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    if (code) {
      if (FENCE.test(raw)) {
        blocks.push({ type: 'code', text: code.join('\n') });
        code = null;
      } else code.push(raw);
      continue;
    }
    if (FENCE.test(raw)) {
      flushAll();
      code = [];
      continue;
    }
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flushAll();
      continue;
    }
    if (HR.test(line)) {
      flushAll();
      blocks.push({ type: 'hr' });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flushAll();
      blocks.push({ type: 'heading', level: h[1].length as Block extends { level: infer L } ? L : never, children: parseInline(h[2].trim()) });
      continue;
    }
    const ul = UL.exec(line);
    const ol = ul ? null : OL.exec(line);
    if (ul || ol) {
      flushParagraph();
      flushQuote();
      const ordered = Boolean(ol);
      const text = (ul ?? ol)![1];
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(text);
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      flushParagraph();
      flushList();
      quote.push(q[1]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) {
      // Indented continuation of the previous list item.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }
  if (code) blocks.push({ type: 'code', text: code.join('\n') });
  flushAll();
  return blocks;
}

const inlineText = (nodes: Inline[]): string =>
  nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : inlineText(n.children))).join('');

/** Plain text rendering for PDFs, previews and search snippets. */
export function markdownToPlainText(markdown: string): string {
  return parseMarkdown(markdown)
    .map((b) => {
      switch (b.type) {
        case 'heading':
        case 'paragraph':
        case 'quote':
          return inlineText(b.children);
        case 'list':
          return b.items.map((item, i) => `${b.ordered ? `${i + 1}.` : '•'} ${inlineText(item)}`).join('\n');
        case 'code':
          return b.text;
        case 'hr':
          return '';
      }
    })
    .filter((s) => s !== '')
    .join('\n\n');
}

/** Word count of the readable text. */
export const wordCount = (markdown: string): number => {
  const text = markdownToPlainText(markdown).trim();
  return text ? text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length : 0;
};
