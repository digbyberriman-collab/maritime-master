import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChipLevel } from '../lib/presets';

const STYLES: Record<Exclude<ChipLevel, 'none'>, string> = {
  rw: 'bg-success/15 text-success border-transparent',
  ro: 'bg-primary/15 text-primary border-transparent',
};

export const ModulePermChip: React.FC<{ label: string; level: ChipLevel }> = ({ label, level }) => {
  if (level === 'none') return null;
  return (
    <Badge variant="outline" className={cn('rounded text-[10px] px-1.5 py-0 font-medium', STYLES[level])}>
      {label}: {level === 'rw' ? 'R/W' : 'RO'}
    </Badge>
  );
};