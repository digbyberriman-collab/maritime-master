import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AccessPreset } from '../lib/presets';

const STYLES: Record<AccessPreset, string> = {
  view_only: 'bg-muted text-muted-foreground border-transparent',
  department_head: 'bg-success/15 text-success border-transparent',
  full_access: 'bg-primary/15 text-primary border-transparent',
  custom: 'bg-warning/15 text-warning border-transparent',
};

const LABELS: Record<AccessPreset, string> = {
  view_only: 'View Only',
  department_head: 'Department Head',
  full_access: 'Full Access',
  custom: 'Custom',
};

export const PresetBadge: React.FC<{ preset: AccessPreset; className?: string }> = ({ preset, className }) => (
  <Badge variant="outline" className={cn('rounded-full font-medium', STYLES[preset], className)}>
    {LABELS[preset]}
  </Badge>
);