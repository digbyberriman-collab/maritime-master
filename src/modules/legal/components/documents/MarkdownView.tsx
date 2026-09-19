import React from 'react';
import { cn } from '@/lib/utils';
import { parseMarkdown, type Block, type Inline } from '@/modules/legal/lib/markdown';

const renderInline = (nodes: Inline[]): React.ReactNode =>
  nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return <React.Fragment key={i}>{n.text}</React.Fragment>;
      case 'strong':
        return <strong key={i}>{renderInline(n.children)}</strong>;
      case 'em':
        return <em key={i}>{renderInline(n.children)}</em>;
      case 'code':
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
            {n.text}
          </code>
        );
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
            {renderInline(n.children)}
          </a>
        );
    }
  });

const HEADING_CLASS: Record<number, string> = {
  1: 'text-2xl font-semibold mt-6 mb-3',
  2: 'text-xl font-semibold mt-5 mb-2',
  3: 'text-lg font-semibold mt-4 mb-2',
  4: 'text-base font-semibold mt-3 mb-1',
  5: 'text-sm font-semibold mt-3 mb-1 uppercase tracking-wide',
  6: 'text-sm font-semibold mt-2 mb-1 text-muted-foreground',
};

const renderBlock = (b: Block, i: number): React.ReactNode => {
  switch (b.type) {
    case 'heading': {
      const Tag = `h${b.level}` as keyof JSX.IntrinsicElements;
      return (
        <Tag key={i} className={cn('text-foreground', HEADING_CLASS[b.level])}>
          {renderInline(b.children)}
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p key={i} className="my-2 leading-relaxed text-foreground">
          {renderInline(b.children)}
        </p>
      );
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul';
      return (
        <Tag key={i} className={cn('my-2 space-y-1 pl-6 text-foreground', b.ordered ? 'list-decimal' : 'list-disc')}>
          {b.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }
    case 'quote':
      return (
        <blockquote key={i} className="my-3 border-l-2 border-primary/40 pl-4 italic text-muted-foreground">
          {renderInline(b.children)}
        </blockquote>
      );
    case 'code':
      return (
        <pre key={i} className="my-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
          {b.text}
        </pre>
      );
    case 'hr':
      return <hr key={i} className="my-4 border-border" />;
  }
};

/** Renders stored Markdown as React elements; never injects HTML. */
export const MarkdownView: React.FC<{ markdown: string; className?: string; emptyText?: string }> = ({ markdown, className, emptyText = 'Nothing written yet.' }) => {
  const blocks = React.useMemo(() => parseMarkdown(markdown), [markdown]);
  if (blocks.length === 0) return <p className={cn('text-sm text-muted-foreground', className)}>{emptyText}</p>;
  return <div className={cn('text-sm', className)}>{blocks.map(renderBlock)}</div>;
};

export default MarkdownView;
