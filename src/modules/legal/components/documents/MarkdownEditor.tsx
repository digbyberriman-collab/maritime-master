import React, { useRef, useState } from 'react';
import { Bold, Columns2, Eye, Heading1, Heading2, Italic, Link2, List, ListOrdered, Minus, PenLine, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { wordCount } from '@/modules/legal/lib/markdown';
import { applyMarkdownAction, type MarkdownAction } from '@/modules/legal/lib/editor';
import { MarkdownView } from './MarkdownView';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  minRows?: number;
  className?: string;
}

type Mode = 'write' | 'preview' | 'split';

const ACTIONS: { id: Action; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'h1', label: 'Heading 1', icon: Heading1 },
  { id: 'h2', label: 'Heading 2', icon: Heading2 },
  { id: 'bold', label: 'Bold', icon: Bold },
  { id: 'italic', label: 'Italic', icon: Italic },
  { id: 'ul', label: 'Bulleted list', icon: List },
  { id: 'ol', label: 'Numbered list', icon: ListOrdered },
  { id: 'quote', label: 'Quote', icon: Quote },
  { id: 'link', label: 'Link', icon: Link2 },
  { id: 'hr', label: 'Rule', icon: Minus },
];

/** Plain-text Markdown editor with a formatting toolbar and a safe preview. */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange, readOnly, minRows = 18, className }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>(readOnly ? 'preview' : 'write');
  const showEditor = !readOnly && mode !== 'preview';
  const showPreview = mode !== 'write' || readOnly;

  const run = (action: MarkdownAction) => {
    const el = ref.current;
    if (!el) return;
    const result = applyMarkdownAction(value, el.selectionStart, el.selectionEnd, action);
    onChange(result.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.start, result.end);
    });
  };

  return (
    <div className={cn('flex flex-col rounded-lg border border-border bg-card', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
        {!readOnly &&
          ACTIONS.map((a) => (
            <Tooltip key={a.id}>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => run(a.id)} disabled={mode === 'preview'} aria-label={a.label}>
                  <a.icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{a.label}</TooltipContent>
            </Tooltip>
          ))}
        <span className="ml-auto flex items-center gap-1">
          <span className="mr-2 text-xs tabular-nums text-muted-foreground">{wordCount(value)} words</span>
          {!readOnly && (
            <>
              <Button type="button" variant={mode === 'write' ? 'secondary' : 'ghost'} size="sm" className="h-8" onClick={() => setMode('write')}>
                <PenLine className="mr-1 h-4 w-4" /> Write
              </Button>
              <Button type="button" variant={mode === 'split' ? 'secondary' : 'ghost'} size="sm" className="hidden h-8 md:inline-flex" onClick={() => setMode('split')}>
                <Columns2 className="mr-1 h-4 w-4" /> Split
              </Button>
              <Button type="button" variant={mode === 'preview' ? 'secondary' : 'ghost'} size="sm" className="h-8" onClick={() => setMode('preview')}>
                <Eye className="mr-1 h-4 w-4" /> Preview
              </Button>
            </>
          )}
        </span>
      </div>
      <div className={cn('grid', showEditor && showPreview ? 'md:grid-cols-2 md:divide-x md:divide-border' : 'grid-cols-1')}>
        {showEditor && (
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={minRows}
            spellCheck
            className="min-h-[360px] resize-y rounded-none border-0 font-mono text-sm focus-visible:ring-0"
            placeholder={'# Title\n\nWrite the document in Markdown. Use **bold**, lists, and headings.'}
            aria-label="Document content"
          />
        )}
        {showPreview && (
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <MarkdownView markdown={value} />
          </div>
        )}
      </div>
    </div>
  );
};

export default MarkdownEditor;
