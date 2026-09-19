/** Markdown formatting actions for the document editor toolbar (pure, testable). */
export type MarkdownAction = 'h1' | 'h2' | 'bold' | 'italic' | 'ul' | 'ol' | 'quote' | 'link' | 'hr';

export interface MarkdownEdit {
  text: string;
  start: number;
  end: number;
}

/** Applies a Markdown formatting action to the current selection. */
export function applyMarkdownAction(text: string, start: number, end: number, action: MarkdownAction): MarkdownEdit {
  const selected = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);
  const linePrefix = (prefix: string, numbered = false) => {
    const lines = (selected || 'Item').split('\n');
    const out = lines.map((l, i) => `${numbered ? `${i + 1}.` : prefix} ${l}`).join('\n');
    const needsNewline = before.length > 0 && !before.endsWith('\n');
    const inserted = `${needsNewline ? '\n' : ''}${out}`;
    return { text: `${before}${inserted}${after}`, start: start + (needsNewline ? 1 : 0), end: start + inserted.length };
  };
  switch (action) {
    case 'h1':
    case 'h2': {
      const hashes = action === 'h1' ? '# ' : '## ';
      const lineStart = before.lastIndexOf('\n') + 1;
      const content = selected || 'Heading';
      const inserted = `${hashes}${content}`;
      return { text: `${text.slice(0, lineStart)}${inserted}${after}`, start: lineStart + hashes.length, end: lineStart + inserted.length };
    }
    case 'bold':
    case 'italic': {
      const mark = action === 'bold' ? '**' : '*';
      const content = selected || (action === 'bold' ? 'bold text' : 'italic text');
      return { text: `${before}${mark}${content}${mark}${after}`, start: start + mark.length, end: start + mark.length + content.length };
    }
    case 'ul':
      return linePrefix('-');
    case 'ol':
      return linePrefix('', true);
    case 'quote':
      return linePrefix('>');
    case 'link': {
      const label = selected || 'link text';
      const inserted = `[${label}](https://)`;
      return { text: `${before}${inserted}${after}`, start: start + label.length + 3, end: start + inserted.length - 1 };
    }
    case 'hr': {
      const needsNewline = before.length > 0 && !before.endsWith('\n');
      const inserted = `${needsNewline ? '\n' : ''}\n---\n`;
      return { text: `${before}${inserted}${after}`, start: start + inserted.length, end: start + inserted.length };
    }
  }
}

