import React from 'react';
import { cn } from '@/lib/utils';
import type { TemplateSection } from '../lib/templates';

interface Props {
  sections: TemplateSection[];
  activeId: string;
  onSelect: (id: string) => void;
}

const SectionTabs: React.FC<Props> = ({ sections, activeId, onSelect }) => (
  <nav aria-label="Section index" className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:thin]">
    {sections.map((section) => (
      <button
        key={section.id}
        type="button"
        aria-current={section.id === activeId ? 'true' : undefined}
        onClick={() => onSelect(section.id)}
        title={section.title}
        className={cn(
          'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
          section.id === activeId ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
        )}
      >
        {section.operationCode ? <span className="font-mono font-semibold">{section.operationCode}</span> : section.title}
      </button>
    ))}
  </nav>
);

export default SectionTabs;
